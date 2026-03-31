// @ts-nocheck
/* =========================================================
   D&D 5e Validation + Normalization Module
   Provides:
     - normalizeState(raw)  → canonical, safe character state
     - validateState(state) → { ok: boolean, issues: Array<{path,message,severity}> }

   Usable as ESM:
     import { normalizeState, validateState } from './validation.js';
   ========================================================= */

import {
  ABILITIES, CLASSES,
  POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE,
  ABILITY_SCORE_MIN, ABILITY_SCORE_MAX,
  MAX_LEVEL, MIN_LEVEL, MAX_MAGIC_BONUS,
  clamp, validateLevel, validateMagicBonus, validateClassKey, validateAbilityKey,
} from "../engine/dnd-engine";

import { DEFAULT_ASSUMPTIONS } from "./optimizer-constants";

// =========================================================
// Small helpers
// =========================================================

/** Safely coerce a value to a Number; returns fallback if the result is NaN. */
export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}

/**
 * Coerce to an integer and clamp between min and max.
 * Returns fallback (defaults to min) when the value is not numeric.
 */
export function clampInt(value, min, max, fallback = min) {
  const raw = toNumber(value, NaN);
  if (isNaN(raw)) return fallback;
  return clamp(Math.round(raw), min, max);
}

/** Return the value if it is a plain (non-array) object, otherwise return {}. */
export function ensureObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

/** Return the value if it is an array, otherwise return []. */
export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Coerce to a string; returns fallback when value is null/undefined. */
export function ensureString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return typeof value === "string" ? value : String(value);
}

/** Coerce to a boolean. */
export function ensureBoolean(value) {
  return Boolean(value);
}

// =========================================================
// Module-level constants (not exported from dnd-engine)
// =========================================================

const ABILITY_SCORE_DEFAULT = 10;
const MAX_SPELL_LEVEL       = 9;
const MAX_SPELL_SLOTS       = 9;

const VALID_ABILITY_MODES  = ["standard", "pointbuy", "manual"];
const VALID_OBJECTIVES     = ["sustained_dpr", "nova_dpr", "tank", "controller", "skill", "balanced"];
const VALID_RULE_PRESETS   = ["strict_srd", "common_optimized", "no_multiclass"];

// =========================================================
// Default sub-object factories
// =========================================================

const DEFAULT_SKILL_KEYS = [
  "acrobatics", "animalHandling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleightOfHand", "stealth", "survival",
];

function defaultSkillsState() {
  return DEFAULT_SKILL_KEYS.reduce((acc, k) => {
    acc[k] = { proficient: false, expertise: false };
    return acc;
  }, {});
}

function defaultSpellSlots() {
  const s = {};
  for (let i = 1; i <= MAX_SPELL_LEVEL; i++) s[i] = 0;
  return s;
}

function defaultOptimizerAssumptions() {
  // Spread to return a mutable copy of the shared defaults
  return { ...DEFAULT_ASSUMPTIONS };
}

// =========================================================
// normalizeState
// =========================================================

/**
 * Normalize raw (possibly malformed) data into a valid, fully-populated
 * character state object.  Never throws.  Unknown extra fields are preserved.
 *
 * @param {*} raw  - Any value from JSON.parse, localStorage, or user input.
 * @returns {object} A canonical character state safe for persistence and rendering.
 */
export function normalizeState(raw) {
  const r = ensureObject(raw);

  // --- Identity -------------------------------------------------------
  const ri = ensureObject(r.identity);
  const identity = {
    name:       ensureString(ri.name),
    player:     ensureString(ri.player),
    subclass:   ensureString(ri.subclass),
    race:       ensureString(ri.race, "Human"),
    background: ensureString(ri.background, "Soldier"),
    alignment:  ensureString(ri.alignment, "True Neutral"),
  };

  // --- Class + level --------------------------------------------------
  const characterClass = validateClassKey(r.class);
  const level          = validateLevel(r.level);

  // --- Ability mode ---------------------------------------------------
  const rawMode    = ensureString(r.abilityMode);
  const abilityMode = VALID_ABILITY_MODES.includes(rawMode) ? rawMode : "standard";

  // --- Ability scores -------------------------------------------------
  const ra       = ensureObject(r.abilities);
  const abilities = {};
  ABILITIES.forEach(ab => {
    const raw_score = ra[ab];
    if (raw_score === undefined || raw_score === null) {
      abilities[ab] = ABILITY_SCORE_DEFAULT;
    } else {
      const n = toNumber(raw_score, NaN);
      if (isNaN(n)) {
        abilities[ab] = ABILITY_SCORE_DEFAULT;
      } else if (abilityMode === "pointbuy") {
        abilities[ab] = clamp(Math.round(n), POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE);
      } else {
        abilities[ab] = clamp(Math.round(n), ABILITY_SCORE_MIN, ABILITY_SCORE_MAX);
      }
    }
  });

  // --- Skills ---------------------------------------------------------
  const rs           = ensureObject(r.skills);
  const defaultSkills = defaultSkillsState();
  const skills       = {};
  Object.keys(defaultSkills).forEach(key => {
    const rawSkill = ensureObject(rs[key]);
    skills[key] = {
      proficient: ensureBoolean(rawSkill.proficient),
      expertise:  ensureBoolean(rawSkill.expertise),
    };
  });

  // --- Weapons --------------------------------------------------------
  const rawWeapons = ensureArray(r.weapons);
  const weapons = rawWeapons
    .filter(w => w && typeof w === "object")
    .map(w => {
      const id = ensureString(w.id).trim();
      const safeId = id || (() => {
        try { return crypto.randomUUID(); }
        catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
      })();
      return {
        id:         safeId,
        name:       ensureString(w.name, "Weapon"),
        ability:    validateAbilityKey(w.ability),
        proficient: ensureBoolean(w.proficient),
        magicBonus: validateMagicBonus(w.magicBonus),
        damage:     ensureString(w.damage, "1d8+MOD"),
      };
    });

  // --- Spellcasting ---------------------------------------------------
  const rsp      = ensureObject(r.spellcasting);
  const rawSlots = ensureObject(rsp.slots);
  const slots    = defaultSpellSlots();
  for (let i = 1; i <= MAX_SPELL_LEVEL; i++) {
    const v = toNumber(rawSlots[i], NaN);
    slots[i] = isNaN(v) ? 0 : clampInt(v, 0, MAX_SPELL_SLOTS);
  }
  const spellcasting = {
    castingAbility: validateAbilityKey(rsp.castingAbility),
    slots,
    knownSpells:    ensureString(rsp.knownSpells),
    preparedSpells: ensureString(rsp.preparedSpells),
  };

  // --- Equipment ------------------------------------------------------
  const rawEquipment = ensureArray(r.equipment);
  const equipment = rawEquipment.filter(e => typeof e === "string" && e.trim());

  // --- Optimizer settings ---------------------------------------------
  const ro     = ensureObject(r.optimizer);
  const defAss = defaultOptimizerAssumptions();
  const ra2    = ensureObject(ro.assumptions);

  const objective  = VALID_OBJECTIVES.includes(ro.objective)   ? ro.objective   : "balanced";
  const rulePreset = VALID_RULE_PRESETS.includes(ro.rulePreset) ? ro.rulePreset  : "common_optimized";

  const assumptions = {
    feats:              ra2.feats !== undefined        ? ensureBoolean(ra2.feats)        : defAss.feats,
    multiclass:         ra2.multiclass !== undefined   ? ensureBoolean(ra2.multiclass)   : defAss.multiclass,
    // Backward-compatibility: if old magicBonus exists and new split fields do not,
    // migrate: weaponMagicBonus ← magicBonus, armor/spellFocus ← 0.
    weaponMagicBonus: (() => {
      if (ra2.weaponMagicBonus !== undefined) return clampInt(ra2.weaponMagicBonus, 0, MAX_MAGIC_BONUS);
      if (ra2.magicBonus       !== undefined) return clampInt(ra2.magicBonus, 0, MAX_MAGIC_BONUS);
      return clampInt(defAss.weaponMagicBonus ?? 1, 0, MAX_MAGIC_BONUS);
    })(),
    armorMagicBonus: (() => {
      if (ra2.armorMagicBonus  !== undefined) return clampInt(ra2.armorMagicBonus,  0, MAX_MAGIC_BONUS);
      if (ra2.magicBonus       !== undefined) return 0; // migration: old data gets 0
      return clampInt(defAss.armorMagicBonus ?? 1, 0, MAX_MAGIC_BONUS);
    })(),
    spellFocusBonus: (() => {
      if (ra2.spellFocusBonus  !== undefined) return clampInt(ra2.spellFocusBonus,  0, MAX_MAGIC_BONUS);
      if (ra2.magicBonus       !== undefined) return 0; // migration: old data gets 0
      return clampInt(defAss.spellFocusBonus ?? 1, 0, MAX_MAGIC_BONUS);
    })(),
    shortRests:         clampInt(ra2.shortRests         ?? defAss.shortRests,         0, 6),
    roundsPerEncounter: clampInt(ra2.roundsPerEncounter ?? defAss.roundsPerEncounter, 1, 10),
    encountersPerDay:   clampInt(ra2.encountersPerDay   ?? defAss.encountersPerDay,   1, 8),
    targetAC:           clampInt(ra2.targetAC           ?? defAss.targetAC,           1, 30),
    targetSaveBonus:    clampInt(ra2.targetSaveBonus    ?? defAss.targetSaveBonus,    0, 30),
    advantageRate:      clamp(toNumber(ra2.advantageRate ?? defAss.advantageRate, defAss.advantageRate), 0, 1),
    analysisLevel:      validateLevel(ra2.analysisLevel ?? defAss.analysisLevel),
  };

  const optimizer = { objective, rulePreset, assumptions, results: [] };

  return {
    identity,
    class:          characterClass,
    level,
    abilityMode,
    abilities,
    skills,
    weapons,
    spellcasting,
    features:       ensureString(r.features),
    traits:         ensureString(r.traits),
    notes:          ensureString(r.notes),
    equipment,
    hasShield:      ensureBoolean(r.hasShield),
    armorMagicBonus: validateMagicBonus(r.armorMagicBonus),
    optimizer,
  };
}

// =========================================================
// validateState
// =========================================================

/**
 * Validate a character state (already normalized or raw) and return a
 * structured list of issues.  Never throws.
 *
 * @param {*} state - Character state to validate.
 * @returns {{ ok: boolean, issues: Array<{path:string, message:string, severity:'error'|'warning'}> }}
 */
export function validateState(state) {
  const issues = [];
  const s = ensureObject(state);

  function issue(path, message, severity = "error") {
    issues.push({ path, message, severity });
  }

  // --- Level ----------------------------------------------------------
  if (s.level === undefined || s.level === null) {
    issue("level", "Level is missing; defaulted to 1.", "warning");
  } else if (isNaN(Number(s.level)) || !Number.isInteger(Number(s.level))) {
    issue("level", `Level "${s.level}" is not a valid integer.`, "error");
  } else if (Number(s.level) < MIN_LEVEL || Number(s.level) > MAX_LEVEL) {
    issue("level", `Level ${s.level} is outside the valid range [${MIN_LEVEL}–${MAX_LEVEL}].`, "error");
  }

  // --- Class ----------------------------------------------------------
  if (!s.class || !Object.keys(CLASSES).includes(s.class)) {
    issue("class", `Class "${s.class}" is not a recognised SRD class.`, "error");
  }

  // --- Ability mode ---------------------------------------------------
  if (s.abilityMode && !VALID_ABILITY_MODES.includes(s.abilityMode)) {
    issue("abilityMode", `Ability mode "${s.abilityMode}" is invalid; expected one of: ${VALID_ABILITY_MODES.join(", ")}.`, "warning");
  }

  // --- Ability scores -------------------------------------------------
  const abilities = ensureObject(s.abilities);
  const missingAbilities = ABILITIES.filter(ab => abilities[ab] === undefined || abilities[ab] === null);
  if (missingAbilities.length > 0) {
    issue("abilities", `Missing ability score(s): ${missingAbilities.join(", ")}.`, "warning");
  }
  ABILITIES.forEach(ab => {
    const val = abilities[ab];
    if (val !== undefined && val !== null) {
      if (isNaN(Number(val))) {
        issue(`abilities.${ab}`, `Ability score "${ab}" is not a number (got: ${val}).`, "error");
      } else {
        const n = Number(val);
        if (n < ABILITY_SCORE_MIN || n > ABILITY_SCORE_MAX) {
          issue(`abilities.${ab}`, `Ability score "${ab}" (${n}) is outside the valid range ${ABILITY_SCORE_MIN}–${ABILITY_SCORE_MAX}.`, "warning");
        }
        if (s.abilityMode === "pointbuy" && (n < POINT_BUY_MIN_SCORE || n > POINT_BUY_MAX_SCORE)) {
          issue(`abilities.${ab}`, `In point-buy mode, "${ab}" (${n}) should be ${POINT_BUY_MIN_SCORE}–${POINT_BUY_MAX_SCORE}.`, "warning");
        }
      }
    }
  });

  // --- Weapons --------------------------------------------------------
  if (!Array.isArray(s.weapons)) {
    issue("weapons", "Weapons must be an array; got a non-array value.", "error");
  } else {
    s.weapons.forEach((w, i) => {
      if (!w || typeof w !== "object") {
        issue(`weapons[${i}]`, "Weapon entry is not an object.", "error");
      } else {
        if (!w.name || !String(w.name).trim()) {
          issue(`weapons[${i}].name`, "Weapon name is empty.", "warning");
        }
        if (!ABILITIES.includes(w.ability)) {
          issue(`weapons[${i}].ability`, `Weapon ability "${w.ability}" is not a valid ability key.`, "error");
        }
        const mb = Number(w.magicBonus);
        if (isNaN(mb) || mb < 0 || mb > MAX_MAGIC_BONUS) {
          issue(`weapons[${i}].magicBonus`, `Magic bonus "${w.magicBonus}" is outside [0–${MAX_MAGIC_BONUS}].`, "warning");
        }
      }
    });
  }

  // --- Spellcasting ---------------------------------------------------
  const sp = ensureObject(s.spellcasting);
  if (!ABILITIES.includes(sp.castingAbility)) {
    issue("spellcasting.castingAbility", `Casting ability "${sp.castingAbility}" is not a valid ability key.`, "error");
  }
  if (!sp.slots || typeof sp.slots !== "object" || Array.isArray(sp.slots)) {
    issue("spellcasting.slots", "Spell slots must be a plain object keyed 1–9.", "error");
  } else {
    for (let i = 1; i <= MAX_SPELL_LEVEL; i++) {
      const v = sp.slots[i];
      if (v === undefined || v === null) {
        issue(`spellcasting.slots[${i}]`, `Spell slot level ${i} is missing.`, "warning");
      } else if (isNaN(Number(v)) || Number(v) < 0) {
        issue(`spellcasting.slots[${i}]`, `Spell slot level ${i} has an invalid value: "${v}".`, "error");
      }
    }
  }

  // --- Optimizer settings ---------------------------------------------
  const opt = ensureObject(s.optimizer);
  if (opt.objective && !VALID_OBJECTIVES.includes(opt.objective)) {
    issue("optimizer.objective", `Optimizer objective "${opt.objective}" is not recognised.`, "warning");
  }
  if (opt.rulePreset && !VALID_RULE_PRESETS.includes(opt.rulePreset)) {
    issue("optimizer.rulePreset", `Rule preset "${opt.rulePreset}" is not recognised.`, "warning");
  }
  const ass = ensureObject(opt.assumptions);
  const al = ass.analysisLevel;
  if (al !== undefined && (isNaN(Number(al)) || Number(al) < MIN_LEVEL || Number(al) > MAX_LEVEL)) {
    issue("optimizer.assumptions.analysisLevel", `Analysis level "${al}" is outside the valid range [${MIN_LEVEL}–${MAX_LEVEL}].`, "warning");
  }
  for (const key of ["weaponMagicBonus", "armorMagicBonus", "spellFocusBonus"]) {
    const v = ass[key];
    if (v !== undefined && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > MAX_MAGIC_BONUS)) {
      issue(`optimizer.assumptions.${key}`, `"${key}" (${v}) is outside [0–${MAX_MAGIC_BONUS}].`, "warning");
    }
  }

  return {
    ok: issues.every(i => i.severity !== "error"),
    issues,
  };
}

// =========================================================
// Browser global – attach to globalThis.DndValidation
// =========================================================
if (typeof globalThis !== "undefined") {
  globalThis.DndValidation = {
    toNumber,
    clampInt,
    ensureObject,
    ensureArray,
    ensureString,
    ensureBoolean,
    normalizeState,
    validateState,
  };
}
