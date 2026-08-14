/**
 * Scheduled-tasks panel UI. Mounted into the sidebar footer action seat; opens
 * a modal that manages per-project scheduled tasks (list, create, edit,
 * delete, run-now, history) through the `tasks` typert remote.
 *
 * Styling uses the DSH design tokens (`--dsw-alias-*`) exactly as the shipped
 * Cordis panel does, so the panel follows the active light/dark theme. The
 * stylesheet is injected once by the client plugin body (the same mechanism
 * the official client bundles use for CSS modules).
 *
 * @module @opendsh/dsh-plugin-scheduled-tasks
 */

import type { WorkspaceListState } from "@deepseek-ai/dsh-client-runtime/client";
import { IconChecklistOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SnapshotSelectorHook, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreateInput, RunView, TaskView, UpdateInput } from "../schemas.js";
import type { RpcResult, TasksRemote } from "./remote.js";
import { C } from "./styles.js";

/** The translate seat of this plugin's `scheduled-tasks` locale namespace. */
export type PanelTranslate = TranslateNS<"scheduled-tasks">;

/** Owner + injected + framework standard props for the footer action entry. */
export interface TasksFooterActionProps {
	/** Sidebar column state: wide row vs collapsed rail icon. */
	wide: boolean;
	/** Injected `remote.tasks` handle. */
	tasks: TasksRemote;
	/** Framework standard kit (scope `root`). */
	useWorkspaces: SnapshotSelectorHook<WorkspaceListState>;
	/** Framework-injected translate seat (namespace `scheduled-tasks`). */
	t: PanelTranslate;
}

// ── layout-only inline helpers (colors live in the stylesheet) ─────────────

const layout = {
	row: { display: "flex", alignItems: "center", gap: 8 },
	column: { display: "flex", flexDirection: "column", gap: 8 },
	spacer: { flex: 1 },
	field: { display: "flex", flexDirection: "column", gap: 4 },
} as const;

// ── helpers ────────────────────────────────────────────────────────────────

function taskBadge(t: PanelTranslate, task: TaskView): { cls: string; text: string } {
	if (task.state === "finished") return { cls: C.badgeDim, text: t("badge.finished") };
	if (!task.enabled) return { cls: C.badgeDim, text: t("badge.disabled") };
	const remaining = Date.parse(task.scheduledAt) - Date.now();
	if (remaining <= 0) return { cls: C.badgeWarn, text: t("badge.due") };
	return { cls: C.badgeSuccess, text: t("badge.enabled") };
}

function runBadge(t: PanelTranslate, status: RunView["status"]): { cls: string; text: string } {
	switch (status) {
		case "running":
			return { cls: C.badgeSuccess, text: t("badge.running") };
		case "completed":
			return { cls: C.badgeSuccess, text: t("badge.completed") };
		case "failed":
			return { cls: C.badgeError, text: t("badge.failed") };
	}
}

function scheduleText(t: PanelTranslate, task: TaskView): string {
	if (task.kind === "at") return t("schedule.at", { time: formatLocal(task.scheduledAt) });
	if (task.kind === "cron") return t("schedule.cron", { expr: task.cron ?? "?", zone: task.timeZone ?? "UTC" });
	return t("schedule.every", { seconds: task.everySeconds ?? "?" });
}

function formatLocal(instant: string): string {
	const date = new Date(instant);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextRunText(t: PanelTranslate, task: TaskView): string {
	if (task.state === "finished") return t("nextRun.finished");
	if (!task.enabled) return t("nextRun.disabled");
	const remaining = Date.parse(task.scheduledAt) - Date.now();
	if (remaining <= 0) return t("nextRun.due");
	const minutes = Math.floor(remaining / 60_000);
	if (minutes < 1) return t("nextRun.soon");
	if (minutes < 60) return t("nextRun.minutes", { count: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t("nextRun.hours", { count: hours });
	return t("nextRun.days", { count: Math.floor(hours / 24) });
}

function errorText(result: RpcResult<unknown>): string {
	return result.ok ? "" : result.error.message;
}

function defaultTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
	} catch {
		return "UTC";
	}
}

// ── subviews ───────────────────────────────────────────────────────────────

interface RunHistoryProps {
	tasks: TasksRemote;
	task: TaskView;
	onBack: () => void;
	t: PanelTranslate;
}

function RunHistory({ tasks, task, onBack, t }: RunHistoryProps) {
	const [runs, setRuns] = useState<RunView[]>([]);
	const [error, setError] = useState("");
	const [expanded, setExpanded] = useState<string | undefined>();
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		const result = await tasks.history(task.id);
		if (result.ok) setRuns(result.value);
		else setError(errorText(result));
	}, [tasks, task.id]);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), 10_000);
		return () => clearInterval(timer);
	}, [refresh]);

	return (
		<div style={layout.column}>
			<div style={layout.row}>
				<button type="button" className={C.btn} onClick={onBack}>
					← {t("history.back")}
				</button>
				<span className={C.name}>{t("history.title", { name: task.name })}</span>
				<span style={layout.spacer} />
				<button
					type="button"
					className={C.btn}
					disabled={busy}
					onClick={() => {
						setBusy(true);
						void refresh().finally(() => setBusy(false));
					}}
				>
					{t("history.refresh")}
				</button>
			</div>
			{error !== "" && <div className={C.error}>{error}</div>}
			{runs.length === 0 && <div className={C.empty}>{t("history.empty")}</div>}
			{runs.map((run) => {
				const badge = runBadge(t, run.status);
				return (
					<div key={run.id} className={C.row}>
						<span className={`${C.badge} ${badge.cls}`}>{badge.text}</span>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div className={C.meta}>
								{formatLocal(run.startedAt)}
								{run.finishedAt !== undefined ? ` → ${formatLocal(run.finishedAt)}` : ""}
								{run.triggeredBy === "manual"
									? ` · ${t("history.trigger.manual")}`
									: run.overdue
										? ` · ${t("history.trigger.overdue")}`
										: ` · ${t("history.trigger.scheduled")}`}
							</div>
							{expanded === run.id && (
								<div style={{ marginTop: 4 }}>
									{run.error !== undefined && (
										<div className={C.error} style={{ margin: "4px 0" }}>
											{run.error}
										</div>
									)}
									{run.output !== undefined && <pre className={C.output}>{run.output}</pre>}
									{run.output === undefined && run.error === undefined && (
										<div className={C.meta}>{t("history.noOutput")}</div>
									)}
								</div>
							)}
						</div>
						<button
							type="button"
							className={C.btn}
							onClick={() => setExpanded(expanded === run.id ? undefined : run.id)}
						>
							{expanded === run.id ? t("history.collapse") : t("history.details")}
						</button>
					</div>
				);
			})}
		</div>
	);
}

interface TaskFormProps {
	tasks: TasksRemote;
	projectPath: string;
	initial?: TaskView;
	onSaved: () => void;
	onCancel: () => void;
	t: PanelTranslate;
}

function TaskForm({ tasks, projectPath, initial, onSaved, onCancel, t }: TaskFormProps) {
	const [name, setName] = useState(initial?.name ?? "");
	const [prompt, setPrompt] = useState(initial?.prompt ?? "");
	const [kind, setKind] = useState<"at" | "every" | "cron">(initial?.kind ?? "at");
	const [atDate, setAtDate] = useState(() => {
		if (initial?.kind === "at") return initial.scheduledAt.slice(0, 10);
		const next = new Date(Date.now() + 60 * 60_000);
		const pad = (value: number) => String(value).padStart(2, "0");
		return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
	});
	const [atTime, setAtTime] = useState(() => {
		if (initial?.kind === "at") return initial.scheduledAt.slice(11, 16);
		const next = new Date(Date.now() + 60 * 60_000);
		const pad = (value: number) => String(value).padStart(2, "0");
		return `${pad(next.getHours())}:${pad(next.getMinutes())}`;
	});
	const [timeZone, setTimeZone] = useState(() => initial?.timeZone ?? defaultTimeZone());
	const [cron, setCron] = useState(initial?.kind === "cron" ? (initial.cron ?? "") : "");
	const [everyMinutes, setEveryMinutes] = useState(() => String((initial?.everySeconds ?? 1800) / 60));
	const [enabled, setEnabled] = useState(initial?.enabled ?? true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const submit = async () => {
		if (name.trim() === "") {
			setError(t("form.error.nameRequired"));
			return;
		}
		if (prompt.trim() === "") {
			setError(t("form.error.promptRequired"));
			return;
		}
		const base: CreateInput = {
			projectPath,
			name: name.trim(),
			prompt: prompt.trim(),
			kind,
			enabled,
		};
		let input: CreateInput;
		if (kind === "at") {
			input = { ...base, at: { date: atDate, time: `${atTime}:00`, time_zone: timeZone } };
		} else if (kind === "cron") {
			if (cron.trim() === "") {
				setError(t("form.error.cronRequired"));
				return;
			}
			input = { ...base, cron: cron.trim(), timeZone };
		} else {
			const minutes = Number(everyMinutes);
			if (!Number.isSafeInteger(minutes) || minutes * 60 < 300) {
				setError(t("form.error.intervalTooShort"));
				return;
			}
			input = { ...base, everySeconds: minutes * 60 };
		}
		setBusy(true);
		setError("");
		try {
			const result =
				initial === undefined
					? await tasks.create(input)
					: await tasks.update(initial.id, input as unknown as UpdateInput);
			if (result.ok) {
				onSaved();
			} else {
				setError(errorText(result));
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={layout.column}>
			<div style={layout.row}>
				<button type="button" className={C.btn} onClick={onCancel}>
					← {t("form.back")}
				</button>
				<span className={C.name}>{initial === undefined ? t("form.new") : t("form.edit")}</span>
			</div>
			<div style={layout.field}>
				<div className={C.label}>{t("form.taskName")}</div>
				<input
					className={C.input}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder={t("form.taskNamePlaceholder")}
				/>
			</div>
			<div style={layout.field}>
				<div className={C.label}>{t("form.prompt")}</div>
				<textarea
					className={C.textarea}
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					placeholder={t("form.promptPlaceholder")}
				/>
			</div>
			<div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
				<div style={layout.field}>
					<div className={C.label}>{t("form.scheduleType")}</div>
					<div style={layout.row}>
						<label style={{ cursor: "pointer", ...layout.row, gap: 4 }}>
							<input type="radio" checked={kind === "at"} onChange={() => setKind("at")} /> {t("form.oneShot")}
						</label>
						<label style={{ cursor: "pointer", ...layout.row, gap: 4 }}>
							<input type="radio" checked={kind === "every"} onChange={() => setKind("every")} /> {t("form.interval")}
						</label>
						<label style={{ cursor: "pointer", ...layout.row, gap: 4 }}>
							<input type="radio" checked={kind === "cron"} onChange={() => setKind("cron")} /> Cron
						</label>
					</div>
				</div>
			</div>
			{kind === "at" ? (
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					<div style={{ ...layout.field, flex: 1, minWidth: 140 }}>
						<div className={C.label}>{t("form.date")}</div>
						<input className={C.input} type="date" value={atDate} onChange={(event) => setAtDate(event.target.value)} />
					</div>
					<div style={{ ...layout.field, flex: 1, minWidth: 100 }}>
						<div className={C.label}>{t("form.time")}</div>
						<input className={C.input} type="time" value={atTime} onChange={(event) => setAtTime(event.target.value)} />
					</div>
					<div style={{ ...layout.field, flex: 1, minWidth: 160 }}>
						<div className={C.label}>{t("form.timeZone")}</div>
						<input
							className={C.input}
							value={timeZone}
							onChange={(event) => setTimeZone(event.target.value)}
							placeholder="Asia/Shanghai"
						/>
					</div>
				</div>
			) : kind === "cron" ? (
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					<div style={{ ...layout.field, flex: 2, minWidth: 220 }}>
						<div className={C.label}>{t("form.cronExpression")}</div>
						<input
							className={C.input}
							value={cron}
							onChange={(event) => setCron(event.target.value)}
							placeholder="0 9 * * 1-5"
						/>
					</div>
					<div style={{ ...layout.field, flex: 1, minWidth: 160 }}>
						<div className={C.label}>{t("form.timeZone")}</div>
						<input
							className={C.input}
							value={timeZone}
							onChange={(event) => setTimeZone(event.target.value)}
							placeholder="Asia/Shanghai"
						/>
					</div>
				</div>
			) : (
				<div style={{ ...layout.field, maxWidth: 200 }}>
					<div className={C.label}>{t("form.intervalMinutes")}</div>
					<input
						className={C.input}
						type="number"
						min={5}
						step={5}
						value={everyMinutes}
						onChange={(event) => setEveryMinutes(event.target.value)}
					/>
				</div>
			)}
			<label style={{ cursor: "pointer", ...layout.row, gap: 6 }}>
				<input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> {t("form.enabled")}
			</label>
			{error !== "" && <div className={C.error}>{error}</div>}
			<div style={layout.row}>
				<button type="button" className={`${C.btn} ${C.btnPrimary}`} disabled={busy} onClick={() => void submit()}>
					{busy ? t("form.saving") : t("form.save")}
				</button>
				<button type="button" className={C.btn} onClick={onCancel}>
					{t("form.cancel")}
				</button>
			</div>
		</div>
	);
}

// ── root panel ─────────────────────────────────────────────────────────────

type View = { kind: "list" } | { kind: "form"; task?: TaskView } | { kind: "history"; task: TaskView };

export function TasksFooterAction(props: TasksFooterActionProps) {
	const { wide, tasks, t } = props;
	const workspaceItems = props.useWorkspaces((state) => state.items);
	const recentWorkspaceId = props.useWorkspaces((state) => state.recentWorkspaceId);
	const [open, setOpen] = useState(false);
	const [projectPath, setProjectPath] = useState<string | undefined>();
	const [taskList, setTaskList] = useState<TaskView[]>([]);
	const [view, setView] = useState<View>({ kind: "list" });
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const workspacePath = useMemo(() => {
		if (projectPath !== undefined) return projectPath;
		const recent = workspaceItems.find((item) => item.workspaceId === recentWorkspaceId);
		return recent?.path ?? workspaceItems[0]?.path;
	}, [projectPath, workspaceItems, recentWorkspaceId]);

	// Keep the selected path in sync when the workspace list settles.
	useEffect(() => {
		if (projectPath === undefined && workspacePath !== undefined) setProjectPath(workspacePath);
	}, [projectPath, workspacePath]);

	const refresh = useCallback(async () => {
		if (workspacePath === undefined) return;
		const result = await tasks.list(workspacePath);
		if (result.ok) setTaskList(result.value);
		else setError(errorText(result));
	}, [tasks, workspacePath]);

	// Refresh on open and every 10 seconds while open (runs settle asynchronously).
	useEffect(() => {
		if (!open) return;
		void refresh();
		const timer = setInterval(() => void refresh(), 10_000);
		return () => clearInterval(timer);
	}, [open, refresh]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	const toggle = (id: string, enabled: boolean) => {
		setBusy(true);
		void tasks
			.update(id, { enabled })
			.then((result) => {
				if (!result.ok) setError(errorText(result));
			})
			.finally(() => {
				setBusy(false);
				void refresh();
			});
	};

	const remove = (task: TaskView) => {
		if (!window.confirm(t("list.confirmDelete", { name: task.name }))) return;
		setBusy(true);
		void tasks
			.delete(task.id)
			.then((result) => {
				if (!result.ok) setError(errorText(result));
			})
			.finally(() => {
				setBusy(false);
				void refresh();
			});
	};

	const runNow = (task: TaskView) => {
		setBusy(true);
		void tasks
			.runNow(task.id)
			.then((result) => {
				if (!result.ok) setError(errorText(result));
			})
			.finally(() => {
				setBusy(false);
				void refresh();
			});
	};

	return (
		<>
			{wide ? (
				<button
					type="button"
					className={C.trigger}
					title={t("title")}
					aria-haspopup="dialog"
					aria-expanded={open}
					onClick={() => setOpen((current) => !current)}
				>
					<IconChecklistOutline14 size={16} />
					<span className={C.triggerLabel}>{t("title")}</span>
				</button>
			) : (
				<button
					type="button"
					className={`${C.trigger} ${C.triggerRail}`}
					title={t("title")}
					aria-haspopup="dialog"
					aria-expanded={open}
					onClick={() => setOpen((current) => !current)}
				>
					<IconChecklistOutline14 size={18} />
				</button>
			)}
			{open && (
				// biome-ignore lint/a11y/noStaticElementInteractions: click-outside-to-close on a modal backdrop is a pointer affordance; the dialog itself is keyboard-closeable via Escape.
				// biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click only closes; no keyboard semantics apply to the scrim itself.
				<div
					className={C.overlay}
					onClick={(event) => {
						if (event.target === event.currentTarget) setOpen(false);
					}}
				>
					<div className={C.card} role="dialog" aria-label={t("title")}>
						<div className={C.header}>
							<IconChecklistOutline14 size={16} />
							<h2 className={C.title}>{t("title")}</h2>
							<button type="button" className={C.btn} onClick={() => setOpen(false)}>
								{t("close")}
							</button>
						</div>
						<div className={C.body}>
							{error !== "" && (
								<div className={C.error}>
									{error}
									<button
										type="button"
										className={`${C.btn} ${C.btnDanger}`}
										style={{ marginLeft: 8 }}
										onClick={() => setError("")}
									>
										{t("dismiss")}
									</button>
								</div>
							)}
							{view.kind === "form" && (
								<TaskForm
									tasks={tasks}
									projectPath={workspacePath ?? ""}
									initial={view.task}
									onSaved={() => {
										setView({ kind: "list" });
										void refresh();
									}}
									onCancel={() => setView({ kind: "list" })}
									t={t}
								/>
							)}
							{view.kind === "history" && (
								<RunHistory tasks={tasks} task={view.task} onBack={() => setView({ kind: "list" })} t={t} />
							)}
							{view.kind === "list" && (
								<>
									<div style={layout.row}>
										<select
											className={C.select}
											style={{ flex: 1, minWidth: 0 }}
											value={workspacePath ?? ""}
											onChange={(event) => setProjectPath(event.target.value)}
										>
											{workspaceItems.map((item) => (
												<option key={item.workspaceId} value={item.path}>
													{item.title}
												</option>
											))}
										</select>
									</div>
									<div style={layout.row}>
										<span className={C.note}>
											{t("list.projectNote", { path: workspacePath ?? t("list.noProject") })}
										</span>
										<span style={layout.spacer} />
										<button
											type="button"
											className={`${C.btn} ${C.btnPrimary}`}
											disabled={workspacePath === undefined}
											onClick={() => setView({ kind: "form" })}
										>
											+ {t("list.newTask")}
										</button>
									</div>
									{taskList.length === 0 && <div className={C.empty}>{t("list.empty")}</div>}
									{taskList.map((task) => {
										const badge = taskBadge(t, task);
										return (
											<div key={task.id} className={C.row}>
												<span className={`${C.badge} ${badge.cls}`}>{badge.text}</span>
												<div style={{ flex: 1, minWidth: 0 }}>
													<div className={C.name}>{task.name}</div>
													<div className={C.meta}>
														{scheduleText(t, task)}
														{" · "}
														{nextRunText(t, task)}
													</div>
												</div>
												<button
													type="button"
													className={C.btn}
													disabled={busy}
													onClick={() => runNow(task)}
													title={t("list.runNowTitle")}
												>
													{t("list.run")}
												</button>
												<button type="button" className={C.btn} onClick={() => setView({ kind: "form", task })}>
													{t("list.edit")}
												</button>
												<button type="button" className={C.btn} onClick={() => setView({ kind: "history", task })}>
													{t("list.history")}
												</button>
												<button type="button" className={C.btn} onClick={() => toggle(task.id, !task.enabled)}>
													{task.enabled ? t("list.disable") : t("list.enable")}
												</button>
												<button type="button" className={`${C.btn} ${C.btnDanger}`} onClick={() => remove(task)}>
													{t("list.delete")}
												</button>
											</div>
										);
									})}
								</>
							)}
						</div>
						<div className={C.footer}>
							<span className={C.note}>{t("footer.note")}</span>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
