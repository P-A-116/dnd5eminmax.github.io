/* =========================================================
   Diagnostics – unified error / warning reporting API
   Manages:
     • validation issues (from validateState / normalizeState)
     • runtime issues (from key operations: import, optimize, apply)
   ========================================================= */

// =========================================================
// Internal issue store
// =========================================================

/** @type {Array<{severity:string, message:string, context:string, path:string, source:string}>} */
let _validationIssues = [];

/** @type {Array<{severity:string, message:string, context:string, path:string, source:string}>} */
let _runtimeIssues = [];

// =========================================================
// Public API
// =========================================================

/**
 * Report a runtime issue (non-fatal warning or caught error).
 * Adds to the runtime issues list and re-renders the diagnostics panel.
 *
 * @param {{ severity: "error"|"warning"|"info", message: string, context?: string, path?: string }} issue
 */
export function reportIssue({ severity = "error", message, context = "", path = "runtime" }) {
  const entry = { severity, message, context, path, source: "runtime" };
  // Deduplicate: skip if an identical message+path is already present
  const isDup = _runtimeIssues.some(i => i.message === message && i.path === path);
  if (!isDup) {
    _runtimeIssues.push(entry);
    _renderDiagnosticsPanel();
  }
}

/**
 * Replace the current validation issues and re-render.
 * Pass an empty array to clear validation issues.
 *
 * @param {Array<{severity:string, message:string, path:string}>} issues
 */
export function setValidationIssues(issues) {
  _validationIssues = Array.isArray(issues) ? issues.map(i => ({ ...i, source: "validation" })) : [];
  _renderDiagnosticsPanel();
}

/** Convenience alias kept for backward-compat callsites. */
export const showValidationIssues = setValidationIssues;

/** Clear only runtime issues (e.g. after a successful operation). */
export function clearRuntimeIssues() {
  _runtimeIssues = [];
  _renderDiagnosticsPanel();
}

/** Clear all issues. */
export function clearAllIssues() {
  _validationIssues = [];
  _runtimeIssues = [];
  _renderDiagnosticsPanel();
}

// =========================================================
// Status bar helper
// =========================================================

/**
 * Update the status bar text.
 * @param {string}  msg  - Message to display
 * @param {boolean} warn - If true, display in error colour
 */
export function setStatus(msg, warn = false) {
  const el = document.getElementById("status-msg");
  if (el) {
    el.textContent = msg;
    el.style.color = warn ? "#f85149" : "";
  }
}

// =========================================================
// Internal renderer
// =========================================================

function _escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _renderDiagnosticsPanel() {
  const panel = document.getElementById("validation-panel");
  if (!panel) return;

  const all = [..._validationIssues, ..._runtimeIssues];

  if (all.length === 0) {
    panel.className = "hidden";
    panel.innerHTML = "";
    return;
  }

  const errors   = all.filter(i => i.severity === "error");
  const warnings = all.filter(i => i.severity === "warning");
  const infos    = all.filter(i => i.severity === "info");
  const hasErrors = errors.length > 0;

  panel.className = hasErrors ? "vp-has-errors" : "vp-has-warnings";

  let summaryText;
  if (hasErrors) {
    summaryText = `⛔ ${errors.length} error(s)`;
    if (warnings.length) summaryText += `, ${warnings.length} warning(s)`;
    summaryText += " — some fields were corrected or defaulted.";
  } else if (warnings.length) {
    summaryText = `⚠ ${warnings.length} warning(s)`;
    if (infos.length) summaryText += `, ${infos.length} note(s)`;
    summaryText += " — check details for more information.";
  } else {
    summaryText = `ℹ ${infos.length} note(s).`;
  }

  const summaryClass = hasErrors ? "vp-error-label" : "vp-warning-label";

  panel.innerHTML = `
    <span class="vp-summary ${summaryClass}">${summaryText}</span>
    <button class="vp-toggle" id="vp-toggle-btn" aria-expanded="false" aria-controls="vp-details">▼ Details</button>
    <div id="vp-details" class="vp-details hidden" role="list">
      ${all.map(i => {
        const srcBadge = i.source === "runtime"
          ? `<span class="vp-badge-runtime">runtime</span> `
          : "";
        return `<div class="vp-issue ${_escHtml(i.severity)}" role="listitem">${srcBadge}<strong>${_escHtml(i.path)}:</strong> ${_escHtml(i.message)}</div>`;
      }).join("")}
    </div>
  `;

  const toggleBtn = document.getElementById("vp-toggle-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      const det = document.getElementById("vp-details");
      if (!det) return;
      const expanded = !det.classList.contains("hidden");
      det.classList.toggle("hidden", expanded);
      this.setAttribute("aria-expanded", String(!expanded));
      this.textContent = expanded ? "▼ Details" : "▲ Hide";
    });
  }
}
