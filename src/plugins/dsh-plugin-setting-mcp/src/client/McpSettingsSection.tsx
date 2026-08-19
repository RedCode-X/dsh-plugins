/**
 * MCP settings page UI. Mounted into the `settings.section` slot; lists the
 * managed MCP servers with live status, stages edits locally (add / edit /
 * remove / enable-disable), and commits them through `remote.mcp.save` —
 * the host reconciles the loader tree and each change hot-reloads the affected
 * `dsh-mcp-client` entry.
 *
 * Styling uses the DSH design tokens (`--dsw-alias-*`); the stylesheet is
 * injected once by the client plugin body.
 *
 * @module @opendsh/dsh-plugin-setting-mcp
 */

import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { useCallback, useEffect, useState } from "react";
import { type McpServerInput, type McpServerView, SERVER_NAME_PATTERN } from "../schemas.js";
import type { McpRemote } from "./remote.js";
import { C } from "./styles.js";

/** The translate seat of this plugin's `setting-mcp` locale namespace. */
export type PanelTranslate = TranslateNS<"setting-mcp">;

/** Owner + injected + framework standard props for the settings section entry. */
export interface McpSettingsSectionProps {
	/** Close the settings panel (shell-owned affordance). */
	close: () => void;
	/** Injected `remote.mcp` handle. */
	mcp: McpRemote;
	/** Framework-injected translate seat (namespace `setting-mcp`). */
	t: PanelTranslate;
}

/** Editable editor form state (text fields, parsed on commit). */
interface EditorDraft {
	/** Empty for a new server. */
	id: string;
	serverName: string;
	transport: "stdio" | "streamable-http";
	command: string;
	argsText: string;
	cwd: string;
	envText: string;
	url: string;
	headersText: string;
	timeoutText: string;
	failOnStartup: boolean;
	enabled: boolean;
}

const layout = {
	row: { display: "flex", alignItems: "center", gap: 8 },
	spacer: { flex: 1 },
} as const;

/** Page intro line: the `desc` copy followed by a "contact the developer" link. */
function SectionDesc({ t }: { t: PanelTranslate }) {
	return (
		<p className={C.desc}>
			{t("desc")}
			<a className={C.contact} href="https://paiban.md/qrcode.png" target="_blank" rel="noreferrer">
				{t("contact")}
			</a>
		</p>
	);
}

// ── helpers ────────────────────────────────────────────────────────────────

let tempIdCounter = 0;
function tempId(): string {
	tempIdCounter += 1;
	return `new-${Date.now().toString(36)}-${tempIdCounter}`;
}

function formatKV(record: Record<string, string> | undefined): string {
	if (record === undefined) return "";
	return Object.entries(record)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
}

/** Parse `KEY=VALUE` lines; returns null on a malformed line. */
function parseKV(text: string): Record<string, string> | null {
	const out: Record<string, string> = {};
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (line === "") continue;
		const eq = line.indexOf("=");
		if (eq <= 0) return null;
		out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
	}
	return out;
}

function formatArgs(args: string[] | undefined): string {
	return (args ?? []).join("\n");
}

function parseArgs(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

function toEditorDraft(server?: McpServerView): EditorDraft {
	if (server === undefined) {
		return {
			id: "",
			serverName: "",
			transport: "stdio",
			command: "",
			argsText: "",
			cwd: "",
			envText: "",
			url: "",
			headersText: "",
			timeoutText: "",
			failOnStartup: false,
			enabled: true,
		};
	}
	return {
		id: server.id,
		serverName: server.serverName,
		transport: server.transport,
		command: server.command ?? "",
		argsText: formatArgs(server.args),
		cwd: server.cwd ?? "",
		envText: formatKV(server.env),
		url: server.url ?? "",
		headersText: formatKV(server.headers),
		timeoutText: server.toolCallTimeoutMs === undefined ? "" : String(server.toolCallTimeoutMs),
		failOnStartup: server.failOnStartupError ?? false,
		enabled: server.enabled,
	};
}

/** Drop the live `phase` field and produce an editable input projection (no `undefined` keys). */
function viewToInput(server: McpServerView): McpServerInput {
	const input: Record<string, unknown> = { id: server.id, serverName: server.serverName, enabled: server.enabled };
	if (server.toolCallTimeoutMs !== undefined) input.toolCallTimeoutMs = server.toolCallTimeoutMs;
	if (server.failOnStartupError !== undefined) input.failOnStartupError = server.failOnStartupError;
	if (server.transport === "stdio") {
		input.transport = "stdio";
		input.command = server.command ?? "";
		if (server.args !== undefined) input.args = server.args;
		if (server.env !== undefined) input.env = server.env;
		if (server.cwd !== undefined) input.cwd = server.cwd;
	} else {
		input.transport = "streamable-http";
		input.url = server.url ?? "";
		if (server.headers !== undefined) input.headers = server.headers;
	}
	return input as unknown as McpServerInput;
}

function parseTimeout(text: string): number | null | undefined {
	if (text.trim() === "") return undefined;
	const value = Number(text);
	if (!Number.isInteger(value) || value <= 0) return null;
	return value;
}

function toInput(draft: EditorDraft): McpServerInput {
	const base: Record<string, unknown> = {
		id: draft.id === "" ? tempId() : draft.id,
		serverName: draft.serverName.trim(),
		enabled: draft.enabled,
	};
	const timeout = parseTimeout(draft.timeoutText);
	if (timeout !== undefined && timeout !== null) base.toolCallTimeoutMs = timeout;
	if (draft.failOnStartup) base.failOnStartupError = true;
	if (draft.transport === "stdio") {
		base.transport = "stdio";
		base.command = draft.command.trim();
		base.args = parseArgs(draft.argsText);
		const env = parseKV(draft.envText);
		if (env !== null && Object.keys(env).length > 0) base.env = env;
		if (draft.cwd.trim() !== "") base.cwd = draft.cwd.trim();
	} else {
		base.transport = "streamable-http";
		base.url = draft.url.trim();
		const headers = parseKV(draft.headersText);
		if (headers !== null && Object.keys(headers).length > 0) base.headers = headers;
	}
	return base as unknown as McpServerInput;
}

/** A user-facing commit error for the editor form. */
function validateEditor(t: PanelTranslate, draft: EditorDraft): string | undefined {
	if (draft.serverName.trim() === "") return t("form.error.name");
	if (!SERVER_NAME_PATTERN.test(draft.serverName.trim())) return t("form.error.nameInvalid");
	if (parseTimeout(draft.timeoutText) === null) return t("form.error.timeout");
	if (draft.transport === "stdio") {
		if (draft.command.trim() === "") return t("form.error.command");
		if (parseKV(draft.envText) === null) return t("form.error.env");
	} else {
		if (draft.url.trim() === "") return t("form.error.url");
		if (parseKV(draft.headersText) === null) return t("form.error.headers");
	}
	return undefined;
}

function transportLabel(t: PanelTranslate, transport: "stdio" | "streamable-http"): string {
	return transport === "stdio" ? t("form.transport.stdio") : t("form.transport.http");
}

function phaseBadge(t: PanelTranslate, server: McpServerView): { cls: string; text: string } {
	if (!server.enabled) return { cls: C.badgeOff, text: t("status.disabled") };
	switch (server.phase) {
		case "active":
			return { cls: C.badgeOk, text: t("status.active") };
		case "failed":
			return { cls: C.badgeError, text: t("status.failed") };
		case "loading":
		case "pending":
		case "unloading":
			return { cls: C.badgeInfo, text: t("status.loading") };
		default:
			return { cls: C.badgeOk, text: t("status.enabled") };
	}
}

// ── editor form ────────────────────────────────────────────────────────────

interface EditorProps {
	draft: EditorDraft;
	onDraft: (draft: EditorDraft) => void;
	onCancel: () => void;
	onCommit: (draft: EditorDraft) => void;
	t: PanelTranslate;
}

function ServerEditor({ draft, onDraft, onCancel, onCommit, t }: EditorProps) {
	const [error, setError] = useState<string | undefined>();
	const set = (patch: Partial<EditorDraft>) => onDraft({ ...draft, ...patch });

	const commit = () => {
		const validation = validateEditor(t, draft);
		if (validation !== undefined) {
			setError(validation);
			return;
		}
		onCommit(draft);
	};

	return (
		<div className={C.editor}>
			<div className={C.editorHeader}>
				{draft.id === "" ? t("form.new") : t("form.edit", { name: draft.serverName })}
			</div>
			<div className={C.editorBody}>
				<div className={C.field}>
					<div className={C.label}>{t("form.serverName")}</div>
					<input
						className={C.input}
						value={draft.serverName}
						onChange={(event) => set({ serverName: event.target.value })}
						placeholder="github"
					/>
					<span className={C.hint}>{t("form.serverNameHint")}</span>
				</div>
				<div className={C.field}>
					<div className={C.label}>{t("form.transport")}</div>
					<select
						className={C.select}
						value={draft.transport}
						onChange={(event) => set({ transport: event.target.value as EditorDraft["transport"] })}
					>
						<option value="stdio">{t("form.transport.stdio")}</option>
						<option value="streamable-http">{t("form.transport.http")}</option>
					</select>
				</div>
				{draft.transport === "stdio" ? (
					<>
						<div className={C.field}>
							<div className={C.label}>{t("form.command")}</div>
							<input
								className={C.input}
								value={draft.command}
								onChange={(event) => set({ command: event.target.value })}
								placeholder="npx -y @modelcontextprotocol/server-github"
							/>
							<span className={C.hint}>{t("form.commandHint")}</span>
						</div>
						<div className={C.field}>
							<div className={C.label}>{t("form.args")}</div>
							<textarea
								className={C.textarea}
								value={draft.argsText}
								onChange={(event) => set({ argsText: event.target.value })}
							/>
						</div>
						<div className={C.field}>
							<div className={C.label}>{t("form.cwd")}</div>
							<input className={C.input} value={draft.cwd} onChange={(event) => set({ cwd: event.target.value })} />
						</div>
						<div className={C.field}>
							<div className={C.label}>{t("form.env")}</div>
							<textarea
								className={C.textarea}
								value={draft.envText}
								onChange={(event) => set({ envText: event.target.value })}
								placeholder="GITHUB_TOKEN=xxx"
							/>
						</div>
					</>
				) : (
					<>
						<div className={C.field}>
							<div className={C.label}>{t("form.url")}</div>
							<input
								className={C.input}
								value={draft.url}
								onChange={(event) => set({ url: event.target.value })}
								placeholder="http://localhost:3000/mcp"
							/>
						</div>
						<div className={C.field}>
							<div className={C.label}>{t("form.headers")}</div>
							<textarea
								className={C.textarea}
								value={draft.headersText}
								onChange={(event) => set({ headersText: event.target.value })}
								placeholder="Authorization=Bearer xxx"
							/>
						</div>
					</>
				)}
				<div className={C.field}>
					<div className={C.label}>{t("form.timeout")}</div>
					<input
						className={C.input}
						value={draft.timeoutText}
						onChange={(event) => set({ timeoutText: event.target.value })}
						placeholder="60000"
					/>
				</div>
				<label className={C.checkbox}>
					<input
						type="checkbox"
						checked={draft.failOnStartup}
						onChange={(event) => set({ failOnStartup: event.target.checked })}
					/>
					{t("form.failOnStartup")}
				</label>
				{error !== undefined ? <div className={C.error}>{error}</div> : null}
			</div>
			<div className={C.editorFooter}>
				<button type="button" className={C.btn} onClick={onCancel}>
					{t("form.cancel")}
				</button>
				<button type="button" className={`${C.btn} ${C.btnPrimary}`} onClick={commit}>
					{t("form.save")}
				</button>
			</div>
		</div>
	);
}

// ── page ───────────────────────────────────────────────────────────────────

export function McpSettingsSection({ mcp, t }: McpSettingsSectionProps) {
	const [servers, setServers] = useState<McpServerView[]>([]);
	const [drafts, setDrafts] = useState<McpServerInput[]>([]);
	const [editor, setEditor] = useState<EditorDraft | null>(null);
	const [busy, setBusy] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [dirty, setDirty] = useState(false);

	const applyList = useCallback((list: McpServerView[]) => {
		setServers(list);
		setDrafts(list.map(viewToInput));
	}, []);

	const load = useCallback(async () => {
		setBusy(true);
		setError("");
		const result = await mcp.list();
		if (result.ok) {
			applyList(result.value);
		} else {
			setError(t("error.load", { message: result.error.message }));
		}
		setBusy(false);
	}, [mcp, applyList, t]);

	useEffect(() => {
		void load();
	}, [load]);

	const commitEditor = (draft: EditorDraft) => {
		const input = toInput(draft);
		setDrafts((prev) => {
			const index = prev.findIndex((server) => server.id === input.id);
			return index === -1 ? [...prev, input] : prev.map((server) => (server.id === input.id ? input : server));
		});
		setEditor(null);
		setDirty(true);
		setNotice("");
	};

	const removeServer = (id: string) => {
		setDrafts((prev) => prev.filter((server) => server.id !== id));
		setDirty(true);
		setNotice("");
	};

	const toggleServer = (id: string) => {
		setDrafts((prev) => prev.map((server) => (server.id === id ? { ...server, enabled: !server.enabled } : server)));
		setDirty(true);
		setNotice("");
	};

	const save = async () => {
		setSaving(true);
		setError("");
		setNotice("");
		const result = await mcp.save({ servers: drafts });
		if (result.ok) {
			applyList(result.value);
			setDirty(false);
			setNotice(t("footer.saved"));
		} else {
			setError(t("error.save", { message: result.error.message }));
		}
		setSaving(false);
	};

	const discard = async () => {
		setError("");
		setNotice("");
		await load();
		setDirty(false);
		setEditor(null);
	};

	if (busy) {
		return (
			<div className={C.wrap}>
				<SectionDesc t={t} />
				<div className={C.empty}>{t("status.loading")}</div>
			</div>
		);
	}

	return (
		<div className={C.wrap}>
			<SectionDesc t={t} />
			{error !== "" ? <div className={C.error}>{error}</div> : null}
			<div style={layout.row}>
				<button
					type="button"
					className={`${C.btn} ${C.btnPrimary}`}
					onClick={() => setEditor(toEditorDraft())}
					disabled={saving}
				>
					{t("list.add")}
				</button>
				<div style={layout.spacer} />
				{dirty ? <span className={C.hint}>{t("footer.dirty")}</span> : null}
			</div>
			{drafts.length === 0 ? (
				<div className={C.empty}>
					<span>{t("list.empty")}</span>
					<span>{t("list.emptyHint")}</span>
				</div>
			) : (
				drafts.map((server) => {
					const view = servers.find((entry) => entry.id === server.id);
					const badge = view === undefined ? { cls: C.badgeOff, text: "" } : phaseBadge(t, view);
					const target = server.transport === "stdio" ? server.command : server.url;
					return (
						<div className={C.row} key={server.id}>
							<div className={C.rowMain}>
								<div className={C.name}>{server.serverName}</div>
								<div className={C.meta}>
									{transportLabel(t, server.transport)} · {target ?? ""}
								</div>
							</div>
							<span className={`${C.badge} ${badge.cls}`}>{badge.text}</span>
							<div className={C.rowActions}>
								<button type="button" className={C.btn} onClick={() => toggleServer(server.id)} disabled={saving}>
									{server.enabled ? t("action.disable") : t("action.enable")}
								</button>
								<button
									type="button"
									className={C.btn}
									onClick={() => setEditor(toEditorDraft(view))}
									disabled={saving}
								>
									{t("action.edit")}
								</button>
								<button
									type="button"
									className={`${C.btn} ${C.btnDanger}`}
									onClick={() => {
										if (window.confirm(t("confirm.remove", { name: server.serverName }))) removeServer(server.id);
									}}
									disabled={saving}
								>
									{t("action.remove")}
								</button>
							</div>
						</div>
					);
				})
			)}
			{editor !== null ? (
				<ServerEditor
					draft={editor}
					onDraft={setEditor}
					onCancel={() => setEditor(null)}
					onCommit={commitEditor}
					t={t}
				/>
			) : null}
			<div className={C.footer}>
				{notice !== "" ? <span className={C.notice}>{notice}</span> : <div style={layout.spacer} />}
				{dirty ? (
					<>
						<button type="button" className={C.btn} onClick={discard} disabled={saving}>
							{t("footer.discard")}
						</button>
						<button type="button" className={`${C.btn} ${C.btnPrimary}`} onClick={save} disabled={saving}>
							{saving ? t("footer.saving") : t("footer.save")}
						</button>
					</>
				) : null}
			</div>
		</div>
	);
}
