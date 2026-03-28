/* =========================================================
   state.js – Single source of truth for the character state.
   Exports a stable singleton reference plus helpers.
   ========================================================= */

import { normalizeState }    from "./validation.js";
import { loadRawFromStorage, scheduleSave } from "./persistence.js";
import { setStatus, reportIssue }           from "./diagnostics.js";
import { RULE_PRESETS, SKILLS }             from "./dnd-data.js";

// =========================================================
// Helpers
// =========================================================

function safeId() {
  try   { return crypto.randomUUID(); }
  catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

export const DEFAULT_SKILLS_STATE = () =>
  SKILLS.reduce((acc, s) => { acc[s.key] = { proficient: false, expertise: false }; return acc; }, {});

export const DEFAULT_SPELL_SLOTS = () =>
  ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 });

// =========================================================
// Default character factory
// =========================================================

/**
 * Create a fresh default character state object.
 */
export function createDefaultCharacter() {
  return {
    identity:    { name: "", player: "", subclass: "", race: "Human", background: "Soldier", alignment: "True Neutral" },
    class:       "fighter",
    level:       1,
    abilityMode: "standard",
    abilities:   { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    skills:      DEFAULT_SKILLS_STATE(),
    weapons: [
      { id: safeId(), name: "Longsword", ability: "str", proficient: true, magicBonus: 0, damage: "1d8+STR" },
    ],
    spellcasting: {
      castingAbility: "int",
      slots:          DEFAULT_SPELL_SLOTS(),
      knownSpells:    "",
      preparedSpells: "",
    },
    features:      "",
    traits:        "",
    notes:         "",
    equipment:     ["Backpack","Bedroll","Rations"],
    hasShield:     false,
    armorMagicBonus: 0,
    optimizer: {
      objective:   "balanced",
      rulePreset:  "common_optimized",
      assumptions: { ...RULE_PRESETS.common_optimized, analysisLevel: 8 },
      results:     [],
    },
  };
}

// =========================================================
// Hydration
// =========================================================

/**
 * Hydrate and validate character data from storage or import.
 * Delegates to normalizeState() for canonical normalisation, then ensures
 * app-specific defaults (e.g. default weapon) are in place.
 *
 * @param {Object} raw - Raw / partially-formed character data
 * @returns {Object}   - Safe, normalised character state
 */
export function hydrateCharacter(raw) {
  const def = createDefaultCharacter();
  try {
    const normalized = normalizeState(raw);
    if (normalized.weapons.length === 0) normalized.weapons = def.weapons;
    // Preserve existing optimizer results (normalizeState clears them)
    if (raw && raw.optimizer && Array.isArray(raw.optimizer.results)) {
      normalized.optimizer.results = raw.optimizer.results;
    }
    return normalized;
  } catch (error) {
    console.error("Error hydrating character:", error);
    setStatus("⚠ Character data partially corrupted, using defaults", true);
    reportIssue({
      severity: "error",
      path:     "hydration",
      message:  "Character data partially corrupted; defaults were applied.",
    });
    return def;
  }
}

// =========================================================
// Singleton state
// =========================================================

/** @type {Object} */
let _state = null;

/** Return the current application state. */
export function getState()   { return _state; }

/** Replace the entire application state. */
export function setState(s)  { _state = s; }

/**
 * Load state from localStorage (with migration) and set the singleton.
 * Falls back to createDefaultCharacter() on any error.
 */
export function initState() {
  try {
    const raw = loadRawFromStorage(err => {
      setStatus("⚠ Could not load saved character", true);
      reportIssue({ severity: "warning", path: "persistence", message: "Could not load saved character: " + err.message });
    });
    _state = raw ? hydrateCharacter(raw) : createDefaultCharacter();
  } catch (error) {
    console.error("initState failed:", error);
    _state = createDefaultCharacter();
  }
}

/**
 * Convenience wrapper: save the current singleton state.
 * @param {Function} [onError]
 */
export function saveState(onError) {
  scheduleSave(getState, onError);
}
