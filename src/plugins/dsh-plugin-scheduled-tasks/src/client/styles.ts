/**
 * Theme-aware stylesheet for the scheduled-tasks panel.
 *
 * Uses the same `--dsw-alias-*` design tokens as the shipped Cordis panel so
 * the UI follows the active light/dark theme. The CSS is injected once by the
 * client plugin body (`injectStyles`) using the same `data-plugin-css`
 * mechanism the official client bundles use.
 *
 * @module @opendsh/dsh-plugin-scheduled-tasks
 */

/** Scoped class names referenced by the panel components. */
export const C = {
	trigger: "dshst-trigger",
	triggerRail: "dshst-trigger-rail",
	triggerLabel: "dshst-trigger-label",
	overlay: "dshst-overlay",
	card: "dshst-card",
	header: "dshst-header",
	title: "dshst-title",
	contact: "dshst-contact",
	body: "dshst-body",
	footer: "dshst-footer",
	note: "dshst-note",
	row: "dshst-row",
	name: "dshst-name",
	meta: "dshst-meta",
	badge: "dshst-badge",
	badgeWarn: "dshst-badge-warn",
	badgeError: "dshst-badge-error",
	badgeSuccess: "dshst-badge-success",
	badgeDim: "dshst-badge-dim",
	btn: "dshst-btn",
	btnPrimary: "dshst-btn-primary",
	btnDanger: "dshst-btn-danger",
	input: "dshst-input",
	select: "dshst-select",
	textarea: "dshst-textarea",
	label: "dshst-label",
	error: "dshst-error",
	empty: "dshst-empty",
	output: "dshst-output",
	tabs: "dshst-tabs",
	tab: "dshst-tab",
	tabActive: "dshst-tab-active",
	tabCount: "dshst-tab-count",
} as const;

const css = `
body{--dshst-surface:#fff;--dshst-scrim:rgba(0,0,0,.32)}
body[data-ds-dark-theme]{--dshst-surface:rgb(21,21,23);--dshst-scrim:rgba(0,0,0,.55)}
.dshst-trigger{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 2px 6px 10px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}
.dshst-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshst-trigger-rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}
.dshst-trigger-label{white-space:nowrap;overflow:hidden}
.dshst-overlay{position:fixed;inset:0;z-index:120;background:var(--dshst-scrim);display:flex;align-items:center;justify-content:center}
.dshst-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dshst-surface);width:min(680px,calc(100vw - 24px));max-height:min(640px,calc(100vh - 48px));box-shadow:var(--dsw-shadow-lv2);border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
.dshst-header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dshst-surface);flex:none;justify-content:space-between;align-items:center;min-height:44px;padding:10px 12px;display:flex;gap:8px}
.dshst-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;margin:0;flex:1}
.dshst-contact{color:var(--dsw-alias-state-info-primary,var(--dsw-alias-label-secondary));font-size:11px;font-weight:400;line-height:16px;text-decoration:underline;margin-left:8px;cursor:pointer;white-space:nowrap}
.dshst-contact:hover{text-decoration:underline;opacity:.8}
.dshst-body{flex:1;min-height:0;padding:12px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dshst-footer{box-sizing:border-box;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dshst-surface);flex:none;padding:8px 12px}
.dshst-note{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dshst-row{border:1px solid var(--dsw-alias-border-l2);background:var(--dshst-surface);border-radius:12px;align-items:center;gap:8px;padding:8px 10px;display:flex}
.dshst-name{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}
.dshst-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dshst-badge{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-caption);height:20px;border-radius:10px;flex:none;align-items:center;padding:0 6px;font-size:11px;line-height:20px;display:inline-flex}
.dshst-badge-warn{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}
.dshst-badge-error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.dshst-badge-success{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}
.dshst-badge-dim{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-caption)}
.dshst-btn{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;line-height:24px;cursor:pointer;background:0 0;border-radius:999px;flex:none;padding:0 8px}
.dshst-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshst-btn:disabled{opacity:.4;cursor:default}
.dshst-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-button-primary-dimmed)}
.dshst-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dshst-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dshst-input,.dshst-select,.dshst-textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dshst-surface);color:var(--dsw-alias-label-secondary);font:inherit;border-radius:7px;padding:4px 8px;width:100%;font-size:12px;line-height:20px}
.dshst-textarea{min-height:96px;resize:vertical;font-family:var(--dsh-font-mono,monospace)}
.dshst-label{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.dshst-error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger);border-radius:8px;padding:6px 10px;font-size:11px;line-height:16px}
.dshst-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;padding:24px 12px}
.dshst-output{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-word;margin:4px 0 0;font-family:var(--dsh-font-mono,monospace)}
.dshst-tabs{box-sizing:border-box;display:flex;gap:6px;flex:none;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none}
.dshst-tabs::-webkit-scrollbar{display:none}
.dshst-tab{border:1px solid var(--dsw-alias-border-l2);background:var(--dshst-surface);color:var(--dsw-alias-label-secondary);border-radius:999px;cursor:pointer;flex:none;align-items:center;gap:4px;padding:2px 10px;font-family:inherit;font-size:12px;line-height:20px;display:inline-flex;white-space:nowrap}
.dshst-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshst-tab-active{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-button-primary-dimmed)}
.dshst-tab-active:hover{background:var(--dsw-alias-button-primary-hover)}
.dshst-tab-count{opacity:.62}
.dshst-tab-active .dshst-tab-count{opacity:.78}
`;

/** Inject the stylesheet once (idempotent), mirroring the official CSS-module mechanism. */
export function injectStyles(): void {
	if (typeof document === "undefined") return;
	const tagId = "@opendsh/dsh-plugin-scheduled-tasks/panel.css";
	if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return;
	const tag = document.createElement("style");
	tag.dataset.plugin = "@opendsh/dsh-plugin-scheduled-tasks";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
