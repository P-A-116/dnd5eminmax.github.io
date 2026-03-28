/* =========================================================
   optimizer-ui.js – Orchestrates optimizer execution.
   Uses a Web Worker when available; falls back to the
   async chunked runner on browsers that do not support
   module workers (e.g. Firefox < 114, file:// origins).
   ========================================================= */

import { CLASSES }                         from "./dnd-engine.js";
import { CancelToken, runOptimizerAsync }  from "./optimizer-runner.js";
import { buildOneClassResult }             from "./optimizer-engine.js";
import { getSuggestedSkills }              from "./optimizer-engine.js";
import { getState, setState, saveState,
         DEFAULT_SKILLS_STATE, hydrateCharacter } from "./state.js";
import { validateState }                   from "./validation.js";
import { setStatus, reportIssue,
         clearRuntimeIssues, setValidationIssues } from "./diagnostics.js";
import { renderResults, renderMetrics, render }    from "./render.js";
import { getClassData }                    from "./dnd-engine.js";

const CLASS_OPTIONS = Object.keys(CLASSES);

// =========================================================
// Cancel token for the async (fallback) runner
// =========================================================
let _currentCancelToken = null;

// Active Web Worker reference (or null when idle)
let _currentWorker = null;

// =========================================================
// Web Worker detection
// =========================================================

/**
 * Returns true when the browser can load module workers.
 * Feature-detected once and cached.
 */
let _workerSupported = null;
function supportsModuleWorker() {
  if (_workerSupported !== null) return _workerSupported;
  try {
    // Safari < 15 throws on new Worker(url, {type:'module'}) or silently fails.
    // We create a tiny data-URL worker purely to test support.
    const blob = new Blob([""], { type: "application/javascript" });
    const url  = URL.createObjectURL(blob);
    const w    = new Worker(url, { type: "module" });
    w.terminate();
    URL.revokeObjectURL(url);
    _workerSupported = true;
  } catch {
    _workerSupported = false;
  }
  return _workerSupported;
}

// =========================================================
// Run optimizer
// =========================================================

/**
 * Run the optimizer.  Automatically chooses the Web Worker path
 * (preferred) or the async chunked fallback.
 */
export async function runOptimizer() {
  const state = getState();
  // Pre-flight validation
  const { issues } = validateState(state);
  const hasErrors  = issues.some(i => i.severity === "error");
  if (hasErrors) {
    setValidationIssues(issues);
    setStatus("⚠ Fix errors before optimizing.", true);
    return;
  }

  clearRuntimeIssues();
  setValidationIssues(issues); // show any warnings

  const btnOptimize = document.getElementById("btn-optimize");
  const btnCancel   = document.getElementById("btn-cancel");
  const btnApplyTop = document.getElementById("btn-apply-top");

  btnOptimize.disabled = true;
  btnApplyTop.disabled = true;
  btnCancel.classList.remove("hidden");

  const pool = CLASS_OPTIONS;
  setStatus(`Generating builds… 0 / ${pool.length}`);

  const { objective, assumptions } = state.optimizer;

  try {
    let sorted = null;

    if (supportsModuleWorker()) {
      sorted = await _runWithWorker(pool, objective, assumptions);
    }

    // Fallback (or if worker returned null due to termination)
    if (sorted === null) {
      sorted = await _runWithFallback(pool, objective, assumptions);
    }

    if (sorted === null) {
      setStatus("Optimization cancelled.");
    } else {
      getState().optimizer.results = sorted.slice(0, 5);
      renderResults();
      renderMetrics();
      saveState();
      setStatus(`Top ${getState().optimizer.results.length} builds generated.`);
    }
  } catch (error) {
    console.error("Optimization failed:", error);
    setStatus("⚠ Optimization failed", true);
    reportIssue({
      severity: "error",
      path:     "optimize",
      message:  "Optimization failed: " + (error.message || String(error)),
    });
  } finally {
    btnOptimize.disabled = false;
    btnApplyTop.disabled = false;
    btnCancel.classList.add("hidden");
    _currentCancelToken = null;
    _currentWorker      = null;
  }
}

// ─── Worker-based path ────────────────────────────────────

function _runWithWorker(pool, objective, assumptions) {
  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(
        new URL("./optimizer.worker.js", import.meta.url),
        { type: "module" }
      );
      _currentWorker = worker;

      worker.onmessage = e => {
        const { type, payload } = e.data;
        if (type === "progress") {
          setStatus(`Generating builds… ${payload.processed} / ${payload.total}`);
        } else if (type === "result") {
          worker.terminate();
          _currentWorker = null;
          resolve(payload);
        } else if (type === "error") {
          worker.terminate();
          _currentWorker = null;
          // Fall back to async runner
          console.warn("Worker error; falling back to async runner:", payload.message);
          resolve(null);
        }
      };

      worker.onerror = err => {
        console.warn("Worker onerror; falling back:", err.message);
        worker.terminate();
        _currentWorker = null;
        resolve(null); // signal fallback
      };

      worker.postMessage({ type: "start", payload: { classPool: pool, objective, assumptions } });
    } catch (err) {
      // Worker creation failed (e.g. file:// origin) – fall back
      console.warn("Worker creation failed:", err.message);
      resolve(null);
    }
  });
}

// ─── Async chunked fallback ───────────────────────────────

async function _runWithFallback(pool, objective, assumptions) {
  _currentCancelToken = new CancelToken();
  const token = _currentCancelToken;

  return runOptimizerAsync(
    pool,
    classKey => buildOneClassResult(classKey, objective, assumptions),
    token,
    ({ processed, total, phase }) => {
      if (phase === "generating") {
        setStatus(`Generating builds… ${processed} / ${total}`);
      } else if (phase === "sorting") {
        setStatus("Sorting results…");
      } else {
        setStatus(`Optimizing… (${phase})`);
      }
    },
  );
}

// =========================================================
// Cancel
// =========================================================

export function cancelOptimizer() {
  // Cancel worker if running
  if (_currentWorker) {
    _currentWorker.terminate();
    _currentWorker = null;
  }
  // Cancel async fallback runner
  if (_currentCancelToken) {
    _currentCancelToken.cancel();
  }
  setStatus("Cancelling…");
}

// =========================================================
// Apply build result to character
// =========================================================

export function applyBuildResult(idx) {
  try {
    const state  = getState();
    const result = (state.optimizer.results || [])[idx];
    if (!result) {
      setStatus("No result at index " + idx, true);
      return;
    }

    const finalStep      = result.plan[result.plan.length - 1];
    const suggestedSkills = getSuggestedSkills(result.classKey, state.optimizer.objective);
    const nextSkills     = DEFAULT_SKILLS_STATE();
    suggestedSkills.forEach((k, i) => {
      if (nextSkills[k]) {
        nextSkills[k].proficient = true;
        if (result.classKey === "rogue" && i < 2) nextSkills[k].expertise = true;
      }
    });

    state.class       = result.classKey;
    state.level       = state.optimizer.assumptions.analysisLevel;
    state.abilityMode = "pointbuy";
    state.abilities   = { ...finalStep.snapshot.abilities };
    state.skills      = nextSkills;
    const castAb = getClassData(result.classKey).defaultCastingAbility;
    if (castAb) state.spellcasting.castingAbility = castAb;

    const savedResults    = state.optimizer.results || [];
    const normalizedApplied = hydrateCharacter(state);
    const { issues }      = validateState(normalizedApplied);
    setState(normalizedApplied);
    getState().optimizer.results = savedResults;

    render();
    saveState();
    setValidationIssues(issues);
    setStatus(`Applied ${result.classLabel} build.`);
    window.scrollTo(0, 0);
  } catch (error) {
    console.error("Apply build failed:", error);
    setStatus("⚠ Failed to apply build", true);
    reportIssue({
      severity: "error",
      path:     "apply",
      message:  "Failed to apply build: " + (error.message || String(error)),
    });
  }
}

// =========================================================
// Export helpers
// =========================================================

export function exportJson() {
  try {
    const state = getState();
    const data  = JSON.stringify(state, null, 2);
    const blob  = new Blob([data], { type: "application/json" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href     = url;
    a.download = (state.identity.name || "character") + ".json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported.");
  } catch (error) {
    console.error("Export failed:", error);
    setStatus("⚠ Export failed", true);
    reportIssue({ severity: "error", path: "export", message: "Export failed: " + (error.message || String(error)) });
  }
}

export function exportToClipboard() {
  try {
    const json = JSON.stringify(getState(), null, 2);
    navigator.clipboard.writeText(json)
      .then(() => setStatus("Copied to clipboard."))
      .catch(() => {
        document.getElementById("f-import-text").value = json;
        setStatus("Paste from text area.");
  } catch (error) {
    console.error("Export failed:", error);
    setStatus("⚠ Export failed", true);
    reportIssue({ severity: "error", path: "export-clipboard", message: "Export failed: " + (error.message || String(error)) });
  }
}
