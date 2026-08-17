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
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogResult, CreateInput, RunView, TaskView, UpdateInput } from "../schemas.js";
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
								{run.model !== undefined &&
									` · ${t("model.used", { provider: run.model.provider, model: run.model.model })}`}
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

/** One selectable model option (provider route + provider-owned model id). */
interface ModelOption {
	/** Stable select value: provider and model joined by a separator that cannot appear in either. */
	key: string;
	provider: string;
	model: string;
	label: string;
	/** Provider display name, used as the optgroup label. */
	group: string;
}

/** Join a provider/model pair into a select value. */
function modelKeyOf(provider: string, model: string): string {
	return `${provider}\u0000${model}`;
}

/** Group a flat option list into optgroup runs, preserving provider order. */
function groupModelOptions(options: ModelOption[]): { label: string; options: ModelOption[] }[] {
	const groups: { label: string; options: ModelOption[] }[] = [];
	for (const option of options) {
		let group = groups[groups.length - 1];
		if (group === undefined || group.label !== option.group) {
			group = { label: option.group, options: [] };
			groups.push(group);
		}
		group.options.push(option);
	}
	return groups;
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
	// Model selection: "" means "use the deployment default".
	const [modelKey, setModelKey] = useState(() =>
		initial?.model === undefined ? "" : modelKeyOf(initial.model.provider, initial.model.model),
	);
	const [catalog, setCatalog] = useState<CatalogResult | undefined>();
	const [catalogError, setCatalogError] = useState("");
	const [catalogBusy, setCatalogBusy] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	/** Load the grouped provider catalog when the form mounts. */
	const loadCatalog = useCallback(async () => {
		setCatalogBusy(true);
		setCatalogError("");
		const result = await tasks.catalog();
		if (result.ok) setCatalog(result.value);
		else setCatalogError(errorText(result));
		setCatalogBusy(false);
	}, [tasks]);

	useEffect(() => {
		void loadCatalog();
	}, [loadCatalog]);

	/** Flat option list; a stored selection missing from the catalog is kept as a fallback. */
	const modelOptions = useMemo<ModelOption[]>(() => {
		const options: ModelOption[] = [];
		for (const group of catalog?.groups ?? []) {
			for (const model of group.models) {
				options.push({
					key: modelKeyOf(group.id, model.id),
					provider: group.id,
					model: model.id,
					label: model.name,
					group: group.name,
				});
			}
		}
		const stored = initial?.model;
		if (
			stored !== undefined &&
			!options.some((option) => option.provider === stored.provider && option.model === stored.model)
		) {
			options.push({
				key: modelKeyOf(stored.provider, stored.model),
				provider: stored.provider,
				model: stored.model,
				label: `${stored.provider} / ${stored.model}`,
				group: t("form.modelOther"),
			});
		}
		return options;
	}, [catalog, initial?.model, t]);

	const groupedModelOptions = useMemo(() => groupModelOptions(modelOptions), [modelOptions]);

	const defaultLabel =
		catalog === undefined || catalog.default === null
			? t("form.modelDefault")
			: t("form.modelDefaultWith", { provider: catalog.default.provider, model: catalog.default.model });

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
		if (modelKey !== "") {
			const selected = modelOptions.find((option) => option.key === modelKey);
			if (selected !== undefined) {
				input = { ...input, model: { provider: selected.provider, model: selected.model } };
			}
		}
		setBusy(true);
		setError("");
		try {
			const result =
				initial === undefined
					? await tasks.create(input)
					: await tasks.update(
							initial.id,
							// An empty picker clears a stored override back to the default.
							{ ...input, ...(modelKey === "" ? { model: null } : {}) } as unknown as UpdateInput,
						);
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
			<div style={layout.field}>
				<div className={C.label}>{t("form.model")}</div>
				{catalogError !== "" && (
					<div style={layout.row}>
						<span className={C.error}>{catalogError}</span>
						<button type="button" className={C.btn} disabled={catalogBusy} onClick={() => void loadCatalog()}>
							{t("form.modelReload")}
						</button>
					</div>
				)}
				{catalogError === "" && groupedModelOptions.length === 0 && (
					<div className={C.meta}>{catalogBusy ? t("form.modelLoading") : t("form.modelEmpty")}</div>
				)}
				{groupedModelOptions.length > 0 && (
					<select className={C.select} value={modelKey} onChange={(event) => setModelKey(event.target.value)}>
						<option value="">{defaultLabel}</option>
						{groupedModelOptions.map((group) => (
							<optgroup key={group.label} label={group.label}>
								{group.options.map((option) => (
									<option key={option.key} value={option.key}>
										{option.label}
									</option>
								))}
							</optgroup>
						))}
					</select>
				)}
			</div>
			<label style={{ cursor: "pointer", ...layout.row, gap: 6 }}>
				<input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{" "}
				{t("form.enabled")}
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
	// Active filter tab: `undefined` selects the All tab (every project).
	const [selectedPath, setSelectedPath] = useState<string | undefined>();
	const [taskList, setTaskList] = useState<TaskView[]>([]);
	const [view, setView] = useState<View>({ kind: "list" });
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const tabsRef = useRef<HTMLDivElement>(null);

	// Fallback project used as the create target while the All tab is active.
	const fallbackPath = useMemo(() => {
		const recent = workspaceItems.find((item) => item.workspaceId === recentWorkspaceId);
		return recent?.path ?? workspaceItems[0]?.path;
	}, [workspaceItems, recentWorkspaceId]);

	// One remote call returns every task; the per-project tabs and counts are
	// derived client-side so the tab badges stay in sync with a single fetch.
	// The argument is passed explicitly (even though it is optional) because
	// the typert client enforces the declared parameter count on the wire.
	const refresh = useCallback(async () => {
		const result = await tasks.list(undefined);
		if (result.ok) setTaskList(result.value);
		else setError(errorText(result));
	}, [tasks]);

	// Per-project task counts (projectPath → count) backing the tab badges.
	const counts = useMemo(() => {
		const map = new Map<string, number>();
		for (const task of taskList) {
			map.set(task.projectPath, (map.get(task.projectPath) ?? 0) + 1);
		}
		return map;
	}, [taskList]);

	// Tasks shown for the active tab: everything on All, else one project.
	const visibleTasks = useMemo(
		() => (selectedPath === undefined ? taskList : taskList.filter((task) => task.projectPath === selectedPath)),
		[taskList, selectedPath],
	);

	// Create target: the active project tab, or the fallback project on All.
	const newTaskPath = selectedPath ?? fallbackPath;

	// Drop the selection back to All when its project leaves the registry or
	// its task count falls to zero (empty-project tabs are hidden).
	useEffect(() => {
		if (selectedPath === undefined) return;
		const stillListed = workspaceItems.some((item) => item.path === selectedPath);
		const stillCounted = (counts.get(selectedPath) ?? 0) > 0;
		if (!stillListed || !stillCounted) setSelectedPath(undefined);
	}, [workspaceItems, selectedPath, counts]);

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

	// Vertical wheel over the pill row sweeps it horizontally (non-passive so
	// the page does not also scroll while the row is being swept).
	useEffect(() => {
		if (!open || view.kind !== "list") return;
		const el = tabsRef.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			if (event.deltaY === 0) return;
			const max = el.scrollWidth - el.clientWidth;
			if (max <= 0) return;
			const before = el.scrollLeft;
			el.scrollLeft += event.deltaY;
			if (el.scrollLeft !== before) event.preventDefault();
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [open, view.kind]);

	// Arrow keys move the active filter tab (wrapping at both ends).
	const onTablistKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		if (tabs.length === 0) return;
		const current = document.activeElement;
		let index = tabs.indexOf(current as HTMLButtonElement);
		if (index === -1) index = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
		if (index === -1) return;
		const delta = event.key === "ArrowRight" ? 1 : -1;
		const next = tabs[(index + delta + tabs.length) % tabs.length];
		if (next === undefined) return;
		event.preventDefault();
		next.focus();
		next.click();
	};

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
									projectPath={newTaskPath ?? ""}
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
									<div
										ref={tabsRef}
										className={C.tabs}
										role="tablist"
										aria-label={t("tabs.label")}
										onKeyDown={onTablistKeyDown}
									>
										<button
											type="button"
											role="tab"
											aria-selected={selectedPath === undefined}
											className={selectedPath === undefined ? `${C.tab} ${C.tabActive}` : C.tab}
											onClick={() => setSelectedPath(undefined)}
										>
											{t("tabs.all")}
											<span className={C.tabCount}>({taskList.length})</span>
										</button>
										{workspaceItems.map((item) => {
											// Only projects that actually own tasks get a tab.
											if ((counts.get(item.path) ?? 0) === 0) return null;
											const active = selectedPath === item.path;
											return (
												<button
													key={item.workspaceId}
													type="button"
													role="tab"
													aria-selected={active}
													className={active ? `${C.tab} ${C.tabActive}` : C.tab}
													title={item.path}
													onClick={() => setSelectedPath(item.path)}
												>
													{item.title}
													<span className={C.tabCount}>({counts.get(item.path) ?? 0})</span>
												</button>
											);
										})}
									</div>
									<div style={layout.row}>
										<span className={C.note}>
											{selectedPath === undefined
												? t("list.allNote", { count: taskList.length })
												: t("list.projectNote", { path: selectedPath })}
										</span>
										<span style={layout.spacer} />
										<button
											type="button"
											className={`${C.btn} ${C.btnPrimary}`}
											disabled={newTaskPath === undefined}
											onClick={() => setView({ kind: "form" })}
										>
											+ {t("list.newTask")}
										</button>
									</div>
									{visibleTasks.length === 0 && (
										<div className={C.empty}>{selectedPath === undefined ? t("list.emptyAll") : t("list.empty")}</div>
									)}
									{visibleTasks.map((task) => {
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
														{task.model !== undefined &&
															` · ${t("model.used", { provider: task.model.provider, model: task.model.model })}`}
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
