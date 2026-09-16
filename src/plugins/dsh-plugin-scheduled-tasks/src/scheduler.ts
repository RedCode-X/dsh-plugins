/**
 * Task scheduler: folds all active tasks, arms a bounded timer at the earliest
 * target, and dispatches due tasks through the executor. Wakes re-read the
 * wall clock so a clock rollback cannot fire early and a forward jump makes
 * records overdue. Missed `every` intervals are never enumerated; the latest
 * due occurrence runs and the record advances to the next anchor-aligned
 * target. One-shot `at` tasks finish after their single run.
 *
 * @module @opendsh/dsh-plugin-scheduled-tasks
 */
import type { Context } from "@deepseek-ai/cordis";
import { resolveRunModel, type TaskExecutor } from "./executor.js";
import { TaskNotFoundError, type TasksStore } from "./store.js";
import { resolveCronOccurrences, resolveEveryOccurrence } from "./time.js";
import type { RunRecord, Task } from "./types.js";

/** Largest delay a Node timer represents without clamping. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Dispatch is marked overdue only when the target is more than this far in the past. */
const OVERDUE_GRACE_MS = 5_000;

/**
 * Safety re-drive interval. Bounds the delay of any missed wake — a cleared or
 * never-armed timer, a rejected run, or a mutation the store hook did not
 * observe — to this window instead of stalling the schedule indefinitely.
 */
const HEARTBEAT_MS = 30_000;

/** Scheduler configuration derived from plugin config. */
export interface TaskSchedulerConfig {
	/** Wall clock source, replaceable in tests. */
	now?: () => number;
}

function renderThrown(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

/** Live timer projection over the durable task tables. */
export class TaskScheduler {
	private timer: NodeJS.Timeout | undefined;
	private heartbeat: NodeJS.Timeout | undefined;
	private requested = false;
	private drivePromise: Promise<void> | undefined;
	private stopping = false;
	private faulted = false;
	private readonly inFlight = new Map<string, Promise<unknown>>();
	private readonly now: () => number;

	constructor(
		private readonly ctx: Context,
		private readonly store: TasksStore,
		private readonly executor: TaskExecutor,
		config: TaskSchedulerConfig = {},
	) {
		this.now = config.now ?? (() => Date.now());
	}

	/** Begin the first preflight, the safety heartbeat, and timer derivation. */
	start(): void {
		this.heartbeat ??= setInterval(() => {
			this.requestDrive();
		}, HEARTBEAT_MS);
		// The heartbeat is a fallback, never a reason to keep the process alive.
		this.heartbeat.unref?.();
		this.requestDrive();
	}

	/** Stop future work, cancel timers, and await outstanding runs. */
	async dispose(): Promise<void> {
		this.stopping = true;
		this.requested = false;
		if (this.heartbeat !== undefined) {
			clearInterval(this.heartbeat);
			this.heartbeat = undefined;
		}
		this.clearTimer();
		await this.flush();
	}

	/** Await the current drive cycle and every in-flight run. */
	async flush(): Promise<void> {
		await this.drivePromise;
		await Promise.allSettled([...this.inFlight.values()]);
	}

	/** Coalesced recompute of the live projection. */
	requestDrive(): void {
		if (this.stopping || this.faulted) return;
		this.clearTimer();
		this.requested = true;
		if (this.drivePromise !== undefined) return;
		this.drivePromise = this.runLoop().then(
			() => {
				this.drivePromise = undefined;
				if (this.requested && !this.stopping && !this.faulted) this.requestDrive();
			},
			(error) => {
				this.drivePromise = undefined;
				this.faulted = true;
				this.ctx.logger.warn(`scheduled-tasks: scheduler drive failed: ${renderThrown(error)}`);
			},
		);
	}

	/** Run one coalesced drive cycle. */
	private async runLoop(): Promise<void> {
		while (this.requested && !this.stopping && !this.faulted) {
			this.requested = false;
			await this.driveOnce();
		}
	}

	/** Fold, dispatch due tasks, and arm the next wake. */
	private async driveOnce(): Promise<void> {
		const now = this.now();
		const schedulable = this.store
			.list()
			.filter((task) => task.enabled && task.state === "active" && !this.inFlight.has(task.id));
		let nextTarget: number | undefined;
		for (const task of schedulable) {
			const target = Date.parse(task.scheduledAt);
			if (target <= now) {
				// Dispatch without awaiting: the executor serializes by its own
				// concurrency cap, and per-task in-flight guards prevent re-entry.
				void this.dispatch(task, now);
			} else if (nextTarget === undefined || target < nextTarget) {
				nextTarget = target;
			}
		}
		if (nextTarget !== undefined) this.arm(nextTarget, now);
	}

	/** Arm one bounded timer segment; every wake rechecks the wall clock. */
	private arm(target: number, now: number): void {
		const delay = Math.min(Math.max(target - now, 0), MAX_TIMER_DELAY_MS);
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.requestDrive();
		}, delay);
	}

	private clearTimer(): void {
		if (this.timer === undefined) return;
		clearTimeout(this.timer);
		this.timer = undefined;
	}

	/** Execute one due task and apply its schedule transition. */
	private async dispatch(task: Task, decisionNow: number): Promise<void> {
		const overdue = decisionNow - Date.parse(task.scheduledAt) > OVERDUE_GRACE_MS;
		const promise = this.executor
			.run(task, { triggeredBy: "schedule", overdue })
			.then(async (run) => {
				await this.transition(task, decisionNow);
				return run;
			})
			.catch(async (error) => {
				// A rejected drive (timeout, unexpected throw) must not stall the
				// schedule: consume the occurrence exactly like a settled run, then
				// let the re-drive below re-arm the timer for the next target.
				this.ctx.logger.warn(`scheduled-tasks: run for task "${task.id}" failed: ${renderThrown(error)}`);
				await this.transition(task, decisionNow);
			})
			.finally(() => {
				this.requestDrive();
			});
		this.inFlight.set(task.id, promise);
		try {
			await promise;
		} finally {
			this.inFlight.delete(task.id);
		}
	}

	/** Apply the post-run schedule transition (finish one-shots, advance intervals/cron). */
	private async transition(task: Task, decisionNow: number): Promise<void> {
		try {
			if (task.kind === "every" && task.everySeconds !== undefined) {
				const occurrence = resolveEveryOccurrence(task.scheduledAt, task.everySeconds, decisionNow);
				if (occurrence.nextScheduledAt === undefined) {
					await this.store.persistTaskTransition(task.id, { state: "finished", enabled: false });
				} else {
					await this.store.persistTaskTransition(task.id, { scheduledAt: occurrence.nextScheduledAt });
				}
			} else if (task.kind === "cron" && task.cron !== undefined && task.timeZone !== undefined) {
				const occurrence = resolveCronOccurrences(task.cron, task.timeZone, decisionNow);
				if (occurrence.occurrenceAt === undefined) {
					// The pattern never fires again: finish the task.
					await this.store.persistTaskTransition(task.id, { state: "finished", enabled: false });
				} else {
					// `occurrenceAt` is the first cron occurrence strictly after
					// `decisionNow`, which is already at/after the target that just
					// ran. It is the correct next scheduledAt. Storing
					// `nextScheduledAt` (the occurrence *after* that) skips a full
					// period on every run (e.g. a weekly Tuesday job advances to the
					// following Tuesday instead of the next one).
					await this.store.persistTaskTransition(task.id, { scheduledAt: occurrence.occurrenceAt });
				}
			} else {
				await this.store.persistTaskTransition(task.id, { state: "finished", enabled: false });
			}
		} catch (error) {
			this.ctx.logger.warn(`scheduled-tasks: schedule transition for task "${task.id}" failed: ${renderThrown(error)}`);
		}
	}

	/**
	 * Start one task immediately (the run-now gesture). The schedule is
	 * untouched; the returned record is the in-flight run, which the UI polls
	 * through `history`.
	 */
	async runNow(id: string): Promise<RunRecord> {
		const task = this.store.get(id);
		if (task === undefined) throw new TaskNotFoundError(id);
		if (this.inFlight.has(task.id)) {
			const busy = new Error(`task "${task.id}" already has a run in flight`);
			(busy as Error & { code?: string }).code = "task_busy";
			throw busy;
		}
		// Reserve the slot synchronously — before the first `await` — so a
		// concurrent scheduler drive cannot dispatch the same task while
		// `beginRun` is waiting on the storage write chain.
		let settle: () => void = () => {};
		const reserved = new Promise<void>((resolve) => {
			settle = resolve;
		});
		this.inFlight.set(task.id, reserved);
		try {
			const runModel = resolveRunModel(this.ctx, task);
			const run = await this.store.beginRun({
				taskId: task.id,
				projectPath: task.projectPath,
				triggeredBy: "manual",
				overdue: false,
				...(runModel === undefined ? {} : { model: runModel }),
			});
			const promise = this.executor.run(task, { triggeredBy: "manual", overdue: false }, run);
			this.inFlight.set(task.id, promise);
			void promise
				.catch(async (error) => {
					this.ctx.logger.warn(`scheduled-tasks: manual run for task "${task.id}" failed: ${renderThrown(error)}`);
				})
				.then(() => {
					this.inFlight.delete(task.id);
					this.requestDrive();
				})
				.finally(() => {
					settle();
				});
			return run;
		} catch (error) {
			this.inFlight.delete(task.id);
			settle();
			throw error;
		}
	}
}
