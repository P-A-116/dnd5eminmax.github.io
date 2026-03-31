// @ts-nocheck
/* =========================================================
   D&D 5e Effect System
   ─────────────────────────────────────────────────────────
   Implements the Architecture layers:
     A. State Layer   – cheap-to-clone character state objects
     B. Effect System – data-driven, composable rule effects
     C. Build Pipeline – deterministic apply → derive → resolve

   ESM module.  No build tools required.
   Designed to integrate with dnd-engine.js and damage-model.js.
   ========================================================= */

import {
  ABILITIES,
  modFromScore,
  proficiencyBonus,
  clamp,
  validateLevel,
  validateMagicBonus,
  getClassData,
  getEstimatedHP,
  getArmorClassEstimate,
  estimateAttacksPerRound,
  BASE_AC,
  EHP_AC_BASELINE,
  EHP_AC_SCALAR,
  DEFAULT_ABILITY_SCORE,
} from "./dnd-engine";

// =========================================================
// A. STATE LAYER
// =========================================================

/**
 * Canonical character state.
 * All numeric fields default to sensible zero-values so the
 * object is always complete and safe to read without guards.
 *
 * State is intentionally kept shallow so Object.assign / spread
 * produces a cheap shallow clone that is correct for most uses.
 * Sub-objects (abilities, resources, etc.) are one level deep
 * and can be spread individually when a deep clone is needed.
 *
 * @typedef {object} CharacterState
 * @property {string}   classKey
 * @property {number}   level
 * @property {object}   abilities      – { str, dex, con, int, wis, cha } raw scores
 * @property {object}   mods           – derived ability modifiers
 * @property {number}   profBonus
 * @property {number}   ac
 * @property {number}   hp
 * @property {number}   speed
 * @property {number}   initiative
 * @property {number}   attackBonus    – primary weapon attack bonus (total)
 * @property {number}   spellAttack    – spell attack bonus
 * @property {number}   spellDC        – spell save DC
 * @property {object}   resources      – { spellSlots:{1..9}, ki, rageDie, ... }
 * @property {string[]} tags           – e.g. ["concentrating", "advantage_attack"]
 * @property {string[]} conditions     – e.g. ["paralyzed", "frightened"]
 * @property {object[]} actions        – available action descriptors this turn
 * @property {number}   effectiveHp    – effective HP after AC multiplier (raw number)
 * @property {object}   _raw           – reference to source character data (read-only)
 */

/**
 * Build a fresh CharacterState from a normalised character object
 * (as produced by validation.normalizeState).
 *
 * @param {object} character  – normalised character
 * @param {object} [overrides] – partial state overrides (e.g. from an optimizer candidate)
 * @returns {CharacterState}
 */
export function createState(character, overrides = {}) {
  const classKey = character.class || "fighter";
  const level    = validateLevel(character.level);
  const pb       = proficiencyBonus(level);
  const cls      = getClassData(classKey);

  // Abilities – accept overrides per-ability
  const abilities = {};
  for (const ab of ABILITIES) {
    abilities[ab] = Number(
      (overrides.abilities && overrides.abilities[ab] !== undefined)
        ? overrides.abilities[ab]
        : (character.abilities && character.abilities[ab] !== undefined)
          ? character.abilities[ab]
          : DEFAULT_ABILITY_SCORE
    );
  }

  // Derived mods
  const mods = {};
  for (const ab of ABILITIES) mods[ab] = modFromScore(abilities[ab]);

  // Primary mod for the class weapon style
  const primaryAbility = cls.weaponStyle === "dex" ? "dex" : "str";
  const primaryMod     = mods[primaryAbility];
  const castingAbility = cls.defaultCastingAbility;
  const castingMod     = castingAbility ? mods[castingAbility] : 0;

  // Weapon magic bonus (from assumptions or character)
  const weaponMagic = validateMagicBonus(
    overrides.weaponMagicBonus ??
    character?.optimizer?.assumptions?.weaponMagicBonus ??
    0
  );
  const armorMagic = validateMagicBonus(
    overrides.armorMagicBonus ??
    character?.optimizer?.assumptions?.armorMagicBonus ??
    0
  );

  const ac  = _computeAC(character, mods, armorMagic);
  const hp  = getEstimatedHP(level, classKey, mods.con);
  const ehp = hp * (1 + (ac - EHP_AC_BASELINE) * EHP_AC_SCALAR);

  const attackBonus = primaryMod + pb + weaponMagic;
  const spellAttack = castingMod + pb + (overrides.spellFocusBonus ?? 0);
  const spellDC     = 8 + castingMod + pb + (overrides.spellFocusBonus ?? 0);

  // Resources
  const spellSlots = _buildSpellSlots(character, classKey, level);
  const resources  = {
    spellSlots,
    ki:           cls.features?.burstUsesPerShortRest ? level : 0,
    surges:       classKey === "fighter" ? (level >= 17 ? 2 : 1) : 0,
    rageDie:      classKey === "barbarian" ? _barbarianRageDie(level) : 0,
    smiteSlots:   classKey === "paladin"
      ? Object.entries(spellSlots)
          .filter(([lv]) => Number(lv) >= 2)
          .reduce((s, [, n]) => s + n, 0)
      : 0,
  };

  const tags = [
    ...(cls.tags || []),
    ...(overrides.tags || []),
  ];

  const state = {
    classKey,
    level,
    abilities,
    mods,
    profBonus: pb,
    ac,
    hp,
    effectiveHp: Math.max(0, ehp),
    speed: 30,
    initiative: mods.dex,
    attackBonus,
    spellAttack,
    spellDC,
    primaryMod,
    castingMod,
    weaponMagic,
    armorMagic,
    resources,
    tags:       [...tags],
    conditions: [],
    actions:    [],
    _raw:       character,
    // Effect-system book-keeping
    _effects:   [],
    _derived:   false,
  };

  return state;
}

/**
 * Produce a shallow clone of a CharacterState.
 * Sub-objects are one-level-deep spread so mutations don't leak.
 * Actions are deep-ish cloned (map with spread) because action objects may
 * contain nested descriptors that the combat engine reads but does not mutate;
 * a shallow spread is sufficient and cheaper than a full deep clone.
 *
 * @param {CharacterState} state
 * @returns {CharacterState}
 */
export function cloneState(state) {
  return {
    ...state,
    abilities:   { ...state.abilities },
    mods:        { ...state.mods },
    resources:   {
      ...state.resources,
      spellSlots: { ...state.resources.spellSlots },
    },
    tags:       [...state.tags],
    conditions: [...state.conditions],
    actions:    state.actions.map(a => ({ ...a })),
    _effects:   [...state._effects],
  };
}

// =========================================================
// B. EFFECT SYSTEM
// =========================================================

/**
 * Effect descriptor.
 * All rule modifications are expressed as one of these objects.
 *
 * @typedef {object} Effect
 * @property {string}   id            – unique identifier (for debugging)
 * @property {string}   target        – stat being modified: "ac", "attack_bonus",
 *                                      "spell_dc", "hp", "speed", "initiative",
 *                                      "primary_mod", "primary_ability",
 *                                      "damage_bonus", "crit_threshold" …
 * @property {string}   operation     – "add" | "multiply" | "override" |
 *                                      "add_tag" | "remove_tag" |
 *                                      "grant_action" | "advantage" | "disadvantage"
 * @property {*}        value         – number, string, or a Value Resolver key
 *                                      (e.g. "DEX_mod", "proficiency_bonus", "level")
 * @property {string}   trigger       – "passive" | "on_hit" | "on_cast" | "on_turn_start"
 * @property {object}   [condition]   – structured Condition (see conditionMet())
 * @property {string}   [stackGroup]  – only the highest value in a group applies
 * @property {string}   [source]      – human label (feat, spell, class feature…)
 */

// ── Value resolver ────────────────────────────────────────

const VALUE_RESOLVER_KEYS = new Set([
  "DEX_mod", "STR_mod", "CON_mod", "INT_mod", "WIS_mod", "CHA_mod",
  "proficiency_bonus", "level", "half_proficiency_bonus",
]);

/**
 * Resolve an effect value against a state.
 * Numeric values pass through; symbolic strings are resolved.
 *
 * @param {*}            value
 * @param {CharacterState} state
 * @returns {number}
 */
export function resolveValue(value, state) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    if (value.endsWith("_mod")) {
      const ab = value.replace("_mod", "").toLowerCase();
      return state.mods[ab] ?? 0;
    }
    switch (value) {
      case "proficiency_bonus":       return state.profBonus;
      case "half_proficiency_bonus":  return Math.floor(state.profBonus / 2);
      case "level":                   return state.level;
    }
  }
  return 0;
}

// ── Condition evaluator ───────────────────────────────────

/**
 * Evaluate a structured condition against a CharacterState.
 *
 * Supported condition shapes:
 *   { and: [cond, …] }
 *   { or:  [cond, …] }
 *   { not: cond }
 *   { has_tag:      "tag_name" }
 *   { has_condition:"condition_name" }
 *   { class_is:     "classKey" }
 *   { level_gte:    number }
 *   { stat_gte:     { stat: "ac"|"hp"|…, value: number } }
 *   { stat_lte:     { stat: "ac"|"hp"|…, value: number } }
 *   { weapon_style: "str"|"dex" }
 *
 * An undefined or null condition is always true (unconditional).
 *
 * @param {object|null}    condition
 * @param {CharacterState} state
 * @returns {boolean}
 */
export function conditionMet(condition, state) {
  if (!condition) return true;

  if (condition.and) return condition.and.every(c => conditionMet(c, state));
  if (condition.or)  return condition.or.some(c  => conditionMet(c, state));
  if (condition.not) return !conditionMet(condition.not, state);

  if (condition.has_tag)       return state.tags.includes(condition.has_tag);
  if (condition.has_condition) return state.conditions.includes(condition.has_condition);
  if (condition.class_is)      return state.classKey === condition.class_is;
  if (condition.level_gte !== undefined) return state.level >= condition.level_gte;

  if (condition.weapon_style) {
    const cls = getClassData(state.classKey);
    return cls.weaponStyle === condition.weapon_style;
  }

  if (condition.stat_gte) {
    const { stat, value } = condition.stat_gte;
    return (state[stat] ?? 0) >= value;
  }
  if (condition.stat_lte) {
    const { stat, value } = condition.stat_lte;
    return (state[stat] ?? 0) <= value;
  }

  // Unknown condition key – fail safe (don't apply)
  console.warn("[EffectSystem] Unknown condition key:", Object.keys(condition)[0]);
  return false;
}

// ── Effect interpreter / dispatcher ──────────────────────

/**
 * Apply a single Effect to a mutable CharacterState.
 * Passive effects only; on_hit / on_cast effects are flagged
 * but not immediately applied to stat numbers.
 *
 * @param {Effect}         effect
 * @param {CharacterState} state   – mutated in place
 */
export function applyEffect(effect, state) {
  if (!conditionMet(effect.condition, state)) return;
  if (effect.trigger !== "passive") {
    // Non-passive effects are stored for later query by the combat engine
    state._effects.push(effect);
    return;
  }

  const val = resolveValue(effect.value, state);

  switch (effect.operation) {
    case "add":
      _statAdd(state, effect.target, val);
      break;
    case "multiply":
      _statMul(state, effect.target, val);
      break;
    case "override":
      _statSet(state, effect.target, val);
      break;
    case "add_tag":
      if (!state.tags.includes(effect.value)) state.tags.push(effect.value);
      break;
    case "remove_tag":
      state.tags = state.tags.filter(t => t !== effect.value);
      break;
    case "grant_action":
      state.actions.push({ type: "granted", descriptor: effect.value, source: effect.source });
      break;
    case "advantage":
      if (!state.tags.includes("advantage_attack")) state.tags.push("advantage_attack");
      break;
    case "disadvantage":
      if (!state.tags.includes("disadvantage_attack")) state.tags.push("disadvantage_attack");
      break;
    default:
      console.warn("[EffectSystem] Unknown operation:", effect.operation);
  }
}

// ── Internal stat mutators ────────────────────────────────

const STAT_MAP = {
  ac:             "ac",
  attack_bonus:   "attackBonus",
  spell_dc:       "spellDC",
  spell_attack:   "spellAttack",
  hp:             "hp",
  speed:          "speed",
  initiative:     "initiative",
  primary_mod:    "primaryMod",
  damage_bonus:   "_damageBonus",
  crit_threshold: "_critThreshold",
};

function _statKey(target) {
  return STAT_MAP[target] ?? target;
}

function _statAdd(state, target, val) {
  const k = _statKey(target);
  if (k in state) { state[k] += val; return; }
  state[k] = val;
}

function _statMul(state, target, val) {
  const k = _statKey(target);
  if (k in state) { state[k] *= val; return; }
  state[k] = val;
}

function _statSet(state, target, val) {
  state[_statKey(target)] = val;
}

// =========================================================
// C. EFFECT STACKING RULES
// =========================================================

/**
 * Filter an array of effects so that within each stackGroup
 * only the effect with the highest resolved value is kept.
 * Effects without a stackGroup are always kept.
 *
 * @param {Effect[]}       effects
 * @param {CharacterState} state
 * @returns {Effect[]}
 */
export function deduplicateEffects(effects, state) {
  const groups = new Map(); // groupName → best effect so far
  const ungrouped = [];

  for (const eff of effects) {
    if (!eff.stackGroup) {
      ungrouped.push(eff);
      continue;
    }
    const val = resolveValue(eff.value, state);
    const existing = groups.get(eff.stackGroup);
    if (!existing || val > resolveValue(existing.value, state)) {
      groups.set(eff.stackGroup, eff);
    }
  }

  return [...ungrouped, ...groups.values()];
}

// =========================================================
// C. BUILD PIPELINE
// =========================================================

/**
 * Apply a list of Effects to a state using the full pipeline:
 *   1. Clone base state
 *   2. Deduplicate stacking groups
 *   3. Apply all passive effects
 *   4. Recompute derived stats
 *   5. (Scaling / conditional second-pass omitted here – extend as needed)
 *
 * @param {CharacterState} baseState
 * @param {Effect[]}       effects
 * @returns {CharacterState}  new state (base is not mutated)
 */
export function applyEffectPipeline(baseState, effects) {
  const state = cloneState(baseState);
  state._effects = [];

  const deduped = deduplicateEffects(effects, state);
  for (const eff of deduped) {
    applyEffect(eff, state);
  }

  // Recompute derived stats after passive effects
  _recomputeDerived(state);
  state._derived = true;
  return state;
}

/**
 * Recompute derived numeric stats from current primary stats.
 * Called at the end of the pipeline to keep everything consistent.
 *
 * @param {CharacterState} state – mutated in place
 */
function _recomputeDerived(state) {
  // Recalculate mods in case ability scores were changed by effects
  for (const ab of ABILITIES) {
    state.mods[ab] = modFromScore(state.abilities[ab] ?? DEFAULT_ABILITY_SCORE);
  }

  const cls = getClassData(state.classKey);
  const primaryAb = cls.weaponStyle === "dex" ? "dex" : "str";
  state.primaryMod = state.mods[primaryAb];

  const castAb = cls.defaultCastingAbility;
  state.castingMod = castAb ? state.mods[castAb] : 0;

  // Effective HP
  state.effectiveHp = Math.max(0,
    state.hp * (1 + (state.ac - EHP_AC_BASELINE) * EHP_AC_SCALAR)
  );

  // Initiative (base = DEX mod, Alert feat adds 5 via effect)
  // Only reset if not already modified by an effect
}

// =========================================================
// BUILT-IN EFFECT LIBRARIES
// =========================================================

/**
 * Standard D&D 5e feat effects expressed as Effect objects.
 * Each entry is an array of Effects for that feat key.
 *
 * Consumers can import FEAT_EFFECTS["gwm"] and pass to applyEffectPipeline.
 *
 * @type {Record<string, Effect[]>}
 */
export const FEAT_EFFECTS = {
  gwm: [
    {
      id:        "gwm_damage",
      target:    "damage_bonus",
      operation: "add",
      value:     10,
      trigger:   "passive",
      condition: { weapon_style: "str" },
      source:    "Great Weapon Master",
    },
    {
      id:        "gwm_hit_penalty",
      target:    "attack_bonus",
      operation: "add",
      value:     -5,
      trigger:   "passive",
      condition: { weapon_style: "str" },
      source:    "Great Weapon Master",
    },
  ],

  sharpshooter: [
    {
      id:        "ss_damage",
      target:    "damage_bonus",
      operation: "add",
      value:     10,
      trigger:   "passive",
      condition: { weapon_style: "dex" },
      source:    "Sharpshooter",
    },
    {
      id:        "ss_hit_penalty",
      target:    "attack_bonus",
      operation: "add",
      value:     -5,
      trigger:   "passive",
      condition: { weapon_style: "dex" },
      source:    "Sharpshooter",
    },
  ],

  alert: [
    {
      id:        "alert_initiative",
      target:    "initiative",
      operation: "add",
      value:     5,
      trigger:   "passive",
      condition: null,
      source:    "Alert",
    },
    {
      id:        "alert_no_surprised",
      target:    "advantage",
      operation: "add_tag",
      value:     "cant_be_surprised",
      trigger:   "passive",
      condition: null,
      source:    "Alert",
    },
  ],

  pam: [
    {
      id:        "pam_bonus_attack",
      target:    "actions",
      operation: "grant_action",
      value:     { type: "attack", die: "d4", avgDie: 2.5, label: "PAM Bonus Attack" },
      trigger:   "passive",
      condition: { weapon_style: "str" },
      source:    "Polearm Master",
    },
  ],

  warcaster: [
    {
      id:        "warcaster_conc",
      target:    "concentration_advantage",
      operation: "add_tag",
      value:     "advantage_concentration",
      trigger:   "passive",
      condition: null,
      source:    "War Caster",
    },
  ],

  lucky: [
    {
      id:        "lucky_reroll",
      target:    "attack_bonus",
      operation: "add",
      value:     0.05,           // ≈ +1 on expected hit chance per PHB luck math
      trigger:   "passive",
      condition: null,
      stackGroup: "luck",
      source:    "Lucky",
    },
  ],

  resilient_con: [
    {
      id:        "resilient_con_save",
      target:    "concentration_save",
      operation: "add",
      value:     "proficiency_bonus",
      trigger:   "passive",
      condition: null,
      source:    "Resilient (CON)",
    },
  ],

  /**
   * Sentinel — reaction attack on target attempting to leave reach
   */
  sentinel: [
    {
      id:        "sentinel_reaction",
      target:    "actions",
      operation: "grant_action",
      value:     { type: "reaction_attack", label: "Sentinel Reaction" },
      trigger:   "passive",
      condition: null,
      source:    "Sentinel",
    },
  ],
};

/**
 * Resolve an array of feat keys into a flat array of Effects.
 *
 * @param {string[]} featPlan
 * @returns {Effect[]}
 */
export function featsToEffects(featPlan) {
  const out = [];
  for (const feat of (featPlan || [])) {
    const effs = FEAT_EFFECTS[feat];
    if (effs) out.push(...effs);
    else if (feat) {
      // Unknown feat — emit a generic +2 to a primary stat assumption
      // so optimizer candidates with unknown feats aren't silently broken.
      console.warn("[EffectSystem] Unknown feat, skipping:", feat);
    }
  }
  return out;
}

/**
 * Class-feature passive Effects keyed by classKey.
 * Applied automatically in buildFromClass().
 *
 * @type {Record<string, Effect[]>}
 */
export const CLASS_FEATURE_EFFECTS = {
  barbarian: [
    {
      id: "barbarian_rage_damage", target: "damage_bonus",
      operation: "add", value: 2,
      trigger: "passive", condition: null, source: "Rage",
    },
    {
      id: "barbarian_unarmored_bonus", target: "ac",
      operation: "add", value: "CON_mod",
      trigger: "passive",
      condition: { and: [{ has_tag: "unarmored" }] },
      source: "Unarmored Defense",
    },
  ],
  rogue: [
    {
      id: "rogue_cunning_action", target: "actions",
      operation: "grant_action",
      value: { type: "bonus_action", label: "Cunning Action (Dash/Disengage/Hide)" },
      trigger: "passive", condition: null, source: "Cunning Action",
    },
  ],
  monk: [
    {
      id: "monk_unarmored_defense", target: "ac",
      operation: "add", value: "WIS_mod",
      trigger: "passive",
      condition: { has_tag: "unarmored" },
      source: "Unarmored Defense (Monk)",
    },
    {
      id: "monk_martial_arts_bonus_attack", target: "actions",
      operation: "grant_action",
      value: { type: "bonus_action_attack", label: "Martial Arts Bonus Attack" },
      trigger: "passive", condition: null, source: "Martial Arts",
    },
  ],
  fighter: [
    {
      id: "fighter_second_wind", target: "actions",
      operation: "grant_action",
      value: { type: "bonus_action", label: "Second Wind" },
      trigger: "passive", condition: null, source: "Second Wind",
    },
  ],
  paladin: [
    {
      id: "paladin_aura_saves", target: "saving_throw_bonus",
      operation: "add", value: "CHA_mod",
      trigger: "passive",
      condition: { level_gte: 6 },
      source: "Aura of Protection",
    },
  ],
};

/**
 * Build a fully-resolved CharacterState from a normalised
 * character object plus an optional feat plan.
 *
 * This is the recommended entry point for the optimizer.
 *
 * @param {object}   character   – normalised character
 * @param {string[]} [featPlan]  – feat keys to apply
 * @param {object}   [overrides] – stat overrides (abilities, magic bonuses …)
 * @returns {CharacterState}
 */
export function buildFromCharacter(character, featPlan = [], overrides = {}) {
  const base   = createState(character, overrides);
  const feats  = featsToEffects(featPlan);
  const clsFts = CLASS_FEATURE_EFFECTS[base.classKey] || [];
  return applyEffectPipeline(base, [...clsFts, ...feats]);
}

// ── Build cache (memoises class/level/feat combinations) ──────────

const _buildCache = new Map();

/**
 * Cached version of buildFromCharacter.
 * Uses a composite key of class + level + feat plan so the optimizer
 * can avoid rebuilding identical configurations on repeated evaluations.
 *
 * Note: `overrides` are NOT part of the cache key, so this is best
 * used for builds where magic bonuses and ability scores come from
 * the character object itself.
 *
 * @param {object}   character  – normalised character
 * @param {string[]} [featPlan] – feat keys to apply
 * @param {object}   [overrides] – stat overrides forwarded to buildFromCharacter
 * @returns {CharacterState}
 */
export function cachedBuild(character, featPlan = [], overrides = {}) {
  const key = `${character.class}:${character.level}:${(featPlan || []).join(",")}`;
  if (!_buildCache.has(key)) {
    _buildCache.set(key, buildFromCharacter(character, featPlan, overrides));
  }
  return _buildCache.get(key);
}

// =========================================================
// DEBUGGING / EXPLAINABILITY
// =========================================================

/**
 * Return a human-readable explanation of how a stat was computed.
 * Useful for "why did the optimizer choose this?" output.
 *
 * @param {CharacterState} state
 * @param {string}         stat    – e.g. "ac", "attackBonus"
 * @returns {string[]}             – array of explanation strings
 */
export function explainStat(state, stat) {
  const lines = [];
  const key   = _statKey(stat) || stat;

  lines.push(`${stat} = ${state[key] ?? "(not found)"}`);
  for (const eff of state._effects) {
    if (_statKey(eff.target) === key && eff.trigger === "passive") {
      lines.push(
        `  ← ${eff.source || eff.id}: ${eff.operation}(${eff.value})`
      );
    }
  }
  return lines;
}

// =========================================================
// Internal helpers
// =========================================================

function _computeAC(character, mods, armorMagic) {
  try {
    return getArmorClassEstimate(character, mods.dex) + armorMagic;
  } catch {
    return BASE_AC + mods.dex + armorMagic;
  }
}

function _buildSpellSlots(character, classKey, level) {
  // Use character's stored slots when available; otherwise estimate
  const stored = character?.spellcasting?.slots;
  if (stored && typeof stored === "object") {
    const copy = {};
    for (let i = 1; i <= 9; i++) copy[i] = Number(stored[i]) || 0;
    return copy;
  }
  // Lazy import to avoid circular dep; fall through to zero
  return { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 };
}

function _barbarianRageDie(level) {
  if (level >= 20) return 4;
  if (level >= 17) return 4;
  if (level >= 11) return 3;
  if (level >= 9)  return 3;
  if (level >= 5)  return 2;
  return 2;
}

// =========================================================
// Browser global
// =========================================================
if (typeof globalThis !== "undefined") {
  globalThis.DndEffectSystem = {
    createState,
    cloneState,
    resolveValue,
    conditionMet,
    applyEffect,
    deduplicateEffects,
    applyEffectPipeline,
    buildFromCharacter,
    cachedBuild,
    featsToEffects,
    FEAT_EFFECTS,
    CLASS_FEATURE_EFFECTS,
    explainStat,
  };
}
