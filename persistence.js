/* =========================================================
   persistence.js – localStorage save/load with versioning
   and forward-compatible migrations.
   ========================================================= */

import { normalizeState } from "./validation.js";
import { reportIssue, setStatus } from "./diagnostics.js";

// =========================================================
// Version & storage key
// =========================================================

/** Bump this whenever the persisted schema changes. */
export const STATE_VERSION = 2;

/**
 * Storage key used for localStorage.
 * Includes a version marker so old payloads are not loaded silently.
 */
export const STORAGE_KEY = "dnd5e_srd_safe_builder_v2_optimizer";

// =========================================================
// Migration
// =========================================================

/**
 * Migrate an older persisted payload up to STATE_VERSION.
 * Returns the migrated object (may still be partial; caller must normalise).
 *
 * @param {Object} raw  - Raw parsed JSON from localStorage
 * @returns {Object}    - Object at the current version
 */
export function migrateState(raw) {
  if (!raw || typeof raw !== "object") return raw;

  const from = raw._stateVersion || 1;

  if (from === STATE_VERSION) return raw;  // Nothing to do

  let state = { ...raw };

  // v1 → v2: `optimizer.assumptions.analysisLevel` may be missing; fill it in.
  if (from < 2) {
    if (state.optimizer && !state.optimizer.assumptions?.analysisLevel) {
      state.optimizer = {
        ...state.optimizer,
        assumptions: { ...(state.optimizer.assumptions || {}), analysisLevel: 8 },
      };
    }
    // v1 persisted saves used the same STORAGE_KEY but without _stateVersion.
    state._stateVersion = 2;
  }

  // Future migrations would follow the same pattern:
  // if (from < 3) { /* v2 → v3 changes */ state._stateVersion = 3; }

  if (from > STATE_VERSION) {
    // Unknown future version – drop everything and return empty so callers
    // fall back to defaults rather than crashing.
    reportIssue({
      severity: "warning",
      path:     "persistence",
      message:  `Unknown save version ${from}; using defaults.`,
    });
    return {};
  }

  return state;
}

// =========================================================
// Debounced save
// =========================================================

let _saveTimer = null;

/**
 * Schedule a delayed (debounced) save of the given state to localStorage.
 * Normalises state before persisting.
 *
 * @param {Function} getStateFn   - Zero-arg function returning the current state
 * @param {Function} [onError]    - Optional error callback (receives Error)
 */
export function scheduleSave(getStateFn, onError) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const current    = getStateFn();
      const normalized = normalizeState(current);
      // Preserve optimizer results (normalizeState always clears them)
      normalized.optimizer.results = current.optimizer?.results || [];
      // Stamp version
      normalized._stateVersion = STATE_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (e) {
      console.error("Save failed:", e);
      setStatus("⚠ Save failed: " + e.message, true);
      if (typeof onError === "function") onError(e);
    }
  }, 400);
}

// =========================================================
// Load
// =========================================================

/**
 * Load and migrate a character from localStorage.
 * Returns the raw (pre-normalised) object, or null if nothing is stored.
 *
 * @param {Function} [onError] - Optional error callback
 * @returns {Object|null}
 */
export function loadRawFromStorage(onError) {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    const parsed   = JSON.parse(json);
    const migrated = migrateState(parsed);
    return migrated;
  } catch (e) {
    console.error("Load failed:", e);
    if (typeof onError === "function") onError(e);
    return null;
  }
}
