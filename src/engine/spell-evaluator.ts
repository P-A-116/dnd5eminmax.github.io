// @ts-nocheck
/* =========================================================
   D&D 5e Spell Evaluation Framework
   ─────────────────────────────────────────────────────────
   Converts every spell into a comparable numeric value:

     SpellValue = ExpectedDamageEquivalent (EDE)

   Supported categories:
     1. Damage spells   – expected damage, accounting for saves
     2. Control spells  – prevented enemy DPR × duration × success P
     3. Buff spells     – added ally DPR + prevented damage
     4. Healing spells  – HP restored × effective-HP multiplier

   Context awareness:
     - Number of enemies
     - Enemy AC, save bonus, DPR
     - Fight duration (rounds)
     - Party DPR (for buff scaling)

   Designed to slot into the optimizer's evaluateBuildSnapshot
   and the combat engine's action selector.

   ESM module.  No build tools required.
   ========================================================= */

import {
  clamp,
  saveFailChance,
  MIN_HIT_CHANCE,
  MAX_HIT_CHANCE,
  D20_SIDES,
} from "./dnd-engine";

import {
  BASE_SPELL_DC,
  CONTROL_SPELL_LEVEL_WEIGHTS,
} from "../utils/optimizer-constants";

// =========================================================
// SPELL DATABASE
// SRD-safe spell definitions expressed as plain data objects.
// All mechanical fields are kept separate from flavour text.
// =========================================================

/**
 * @typedef {object} SpellDef
 * @property {string}   key            – canonical identifier ("fireball", "hold_person" …)
 * @property {string}   name
 * @property {number}   level          – spell level (0 = cantrip)
 * @property {string}   school
 * @property {string}   category       – "damage" | "control" | "buff" | "heal" | "utility"
 * @property {string}   [saveType]     – ability key required for save (e.g. "dex", "wis")
 * @property {boolean}  [halfOnSave]   – true if target takes half damage on successful save
 * @property {string}   [attackRoll]   – "spell_attack" if the spell uses an attack roll instead of save
 * @property {string}   [diceExpr]     – base damage dice (e.g. "8d6")
 * @property {number}   [fixedDamage]  – flat damage added to dice
 * @property {number}   [upcastDicePerLevel] – extra dice per slot level above base
 * @property {boolean}  [concentration]
 * @property {number}   [controlDuration]  – expected rounds of control (geometric baseline)
 * @property {string}   [controlType]   – "incapacitated" | "restrained" | "frightened" | …
 * @property {number}   [buffedAttacks]  – extra attacks granted (Haste)
 * @property {number}   [acBonus]        – AC bonus granted (Shield, Blur …)
 * @property {string}   [buffTarget]     – "self" | "ally" | "party"
 * @property {string}   [healDice]       – healing dice (Cure Wounds: "1d8")
 * @property {number}   [targets]        – AoE target count (default 1)
 */

/** @type {Record<string, SpellDef>} */
export const SPELL_DATABASE = {
  // ── Cantrips ─────────────────────────────────────────
  fire_bolt: {
    key: "fire_bolt", name: "Fire Bolt", level: 0, school: "evocation",
    category: "damage", attackRoll: "spell_attack",
    diceExpr: "1d10", targets: 1,
  },
  eldritch_blast: {
    key: "eldritch_blast", name: "Eldritch Blast", level: 0, school: "evocation",
    category: "damage", attackRoll: "spell_attack",
    diceExpr: "1d10", targets: 1, // beams handled separately by warlockBeamCount
  },
  sacred_flame: {
    key: "sacred_flame", name: "Sacred Flame", level: 0, school: "evocation",
    category: "damage", saveType: "dex", halfOnSave: false,
    diceExpr: "1d8", targets: 1,
  },
  vicious_mockery: {
    key: "vicious_mockery", name: "Vicious Mockery", level: 0, school: "enchantment",
    category: "control", saveType: "wis", halfOnSave: false,
    diceExpr: "1d4",          // psychic damage if failed
    controlDuration: 1,       // disadvantage on next attack
    controlType: "disadvantaged_attack",
    targets: 1,
  },

  // ── 1st level ─────────────────────────────────────────
  magic_missile: {
    key: "magic_missile", name: "Magic Missile", level: 1, school: "evocation",
    category: "damage", diceExpr: "1d4", fixedDamage: 1,
    targets: 3, upcastDicePerLevel: 1,
    attackRoll: null, saveType: null, // auto-hit
    autoHit: true,
  },
  thunderwave: {
    key: "thunderwave", name: "Thunderwave", level: 1, school: "evocation",
    category: "damage", saveType: "con", halfOnSave: true,
    diceExpr: "2d8", targets: 3, upcastDicePerLevel: 1,  // cone/cube AoE
    controlType: "pushed",
  },
  cure_wounds: {
    key: "cure_wounds", name: "Cure Wounds", level: 1, school: "evocation",
    category: "heal", healDice: "1d8", upcastDicePerLevel: 1,
    buffTarget: "ally", targets: 1,
  },
  shield: {
    key: "shield", name: "Shield", level: 1, school: "abjuration",
    category: "buff", acBonus: 5, buffTarget: "self",
    concentration: false, // reaction, 1 round
    controlDuration: 1,
  },
  sleep: {
    key: "sleep", name: "Sleep", level: 1, school: "enchantment",
    category: "control", saveType: null, concentration: false,
    controlType: "unconscious", controlDuration: 10,
    targets: 2, // rough AoE (HP-budget)
  },

  // ── 2nd level ─────────────────────────────────────────
  scorching_ray: {
    key: "scorching_ray", name: "Scorching Ray", level: 2, school: "evocation",
    category: "damage", attackRoll: "spell_attack",
    diceExpr: "2d6", targets: 3, upcastDicePerLevel: 1,
  },
  hold_person: {
    key: "hold_person", name: "Hold Person", level: 2, school: "enchantment",
    category: "control", saveType: "wis", halfOnSave: false,
    concentration: true, controlType: "paralyzed",
    controlDuration: 4, targets: 1, upcastDicePerLevel: 0,
  },
  misty_step: {
    key: "misty_step", name: "Misty Step", level: 2, school: "conjuration",
    category: "utility", targets: 1,
  },
  spiritual_weapon: {
    key: "spiritual_weapon", name: "Spiritual Weapon", level: 2, school: "evocation",
    category: "buff", attackRoll: "spell_attack",
    diceExpr: "1d8", concentration: false, upcastDicePerLevel: 1,
    buffTarget: "self", controlDuration: 10,
  },

  // ── 3rd level ─────────────────────────────────────────
  fireball: {
    key: "fireball", name: "Fireball", level: 3, school: "evocation",
    category: "damage", saveType: "dex", halfOnSave: true,
    diceExpr: "8d6", targets: 4, upcastDicePerLevel: 1,
  },
  hypnotic_pattern: {
    key: "hypnotic_pattern", name: "Hypnotic Pattern", level: 3, school: "illusion",
    category: "control", saveType: "wis", halfOnSave: false,
    concentration: true, controlType: "incapacitated",
    controlDuration: 4, targets: 3,
  },
  haste: {
    key: "haste", name: "Haste", level: 3, school: "transmutation",
    category: "buff", concentration: true,
    buffedAttacks: 1,  // one extra attack action per round
    acBonus: 2,
    buffTarget: "ally", controlDuration: 10,
  },
  counterspell: {
    key: "counterspell", name: "Counterspell", level: 3, school: "abjuration",
    category: "utility", targets: 1,
  },
  bestow_curse: {
    key: "bestow_curse", name: "Bestow Curse", level: 3, school: "necromancy",
    category: "control", saveType: "wis", halfOnSave: false,
    concentration: true, controlType: "cursed",
    controlDuration: 3, targets: 1,
  },

  // ── 4th level ─────────────────────────────────────────
  banishment: {
    key: "banishment", name: "Banishment", level: 4, school: "abjuration",
    category: "control", saveType: "cha", halfOnSave: false,
    concentration: true, controlType: "banished",
    controlDuration: 10, targets: 1,
  },
  polymorph: {
    key: "polymorph", name: "Polymorph", level: 4, school: "transmutation",
    category: "control", saveType: "wis", halfOnSave: false,
    concentration: true, controlType: "transformed",
    controlDuration: 10, targets: 1,
  },
  ice_storm: {
    key: "ice_storm", name: "Ice Storm", level: 4, school: "evocation",
    category: "damage", saveType: "dex", halfOnSave: true,
    // 2d8 bludgeoning + 4d6 cold (avg 4×3.5=14 expressed as fixedDamage)
    diceExpr: "2d8", fixedDamage: 14, targets: 5, upcastDicePerLevel: 0,
    controlType: "difficult_terrain",
  },

  // ── 5th level ─────────────────────────────────────────
  cone_of_cold: {
    key: "cone_of_cold", name: "Cone of Cold", level: 5, school: "evocation",
    category: "damage", saveType: "con", halfOnSave: true,
    diceExpr: "8d8", targets: 4, upcastDicePerLevel: 1,
  },
  hold_monster: {
    key: "hold_monster", name: "Hold Monster", level: 5, school: "enchantment",
    category: "control", saveType: "wis", halfOnSave: false,
    concentration: true, controlType: "paralyzed",
    controlDuration: 4, targets: 1,
  },
  wall_of_force: {
    key: "wall_of_force", name: "Wall of Force", level: 5, school: "evocation",
    category: "control", concentration: true,
    controlType: "enclosed", controlDuration: 10,
    targets: 1,
  },

  // ── 6th level ─────────────────────────────────────────
  chain_lightning: {
    key: "chain_lightning", name: "Chain Lightning", level: 6, school: "evocation",
    category: "damage", saveType: "dex", halfOnSave: true,
    diceExpr: "10d8", targets: 4,
  },
  disintegrate: {
    key: "disintegrate", name: "Disintegrate", level: 6, school: "transmutation",
    category: "damage", saveType: "dex", halfOnSave: false,
    diceExpr: "10d6", fixedDamage: 40, targets: 1,
  },

  // ── 7th level ─────────────────────────────────────────
  finger_of_death: {
    key: "finger_of_death", name: "Finger of Death", level: 7, school: "necromancy",
    category: "damage", saveType: "con", halfOnSave: true,
    diceExpr: "7d8", fixedDamage: 30, targets: 1,
  },

  // ── 8th level ─────────────────────────────────────────
  sunburst: {
    key: "sunburst", name: "Sunburst", level: 8, school: "evocation",
    category: "damage", saveType: "con", halfOnSave: true,
    diceExpr: "12d6", targets: 5,
    controlType: "blinded", controlDuration: 1,
  },

  // ── 9th level ─────────────────────────────────────────
  meteor_swarm: {
    key: "meteor_swarm", name: "Meteor Swarm", level: 9, school: "evocation",
    category: "damage", saveType: "dex", halfOnSave: true,
    diceExpr: "20d6", targets: 6,
  },
  wish: {
    key: "wish", name: "Wish", level: 9, school: "conjuration",
    category: "utility", targets: 1,
  },
};

// Precompute average dice values for all SPELL_DATABASE entries at module load
// time so repeated spell evaluations don't reparse the same dice strings.
for (const spell of Object.values(SPELL_DATABASE)) {
  if (spell.diceExpr) spell._cachedAvg = _avgDiceExpr(spell.diceExpr);
  if (spell.healDice) spell._cachedHealAvg = _avgDiceExpr(spell.healDice);
}

// =========================================================
// EVALUATION CONTEXT
// =========================================================

/**
 * @typedef {object} SpellContext
 * @property {number}   spellDC
 * @property {number}   spellAttack
 * @property {number}   castingMod
 * @property {number}   casterLevel
 * @property {number}   targetAC        – enemy AC
 * @property {number}   targetSaveBonus – enemy average saving throw bonus
 * @property {number}   targetDPR       – enemy damage per round (for control EV)
 * @property {number}   partyDPR        – party total DPR (for buff scaling)
 * @property {number}   enemyCount      – number of enemies
 * @property {number}   roundsLeft      – expected rounds remaining in encounter
 * @property {number}   [slotLevel]     – spell slot level used (for upcasting)
 */

// =========================================================
// CORE EVALUATION
// =========================================================

/**
 * Evaluate any spell and return its damage-equivalent value (EDE).
 *
 * @param {SpellDef|string} spellOrKey – spell definition or key into SPELL_DATABASE
 * @param {SpellContext}    context
 * @returns {{ value: number, breakdown: object }}
 */
export function evaluateSpell(spellOrKey, context) {
  const spell = typeof spellOrKey === "string"
    ? SPELL_DATABASE[spellOrKey]
    : spellOrKey;

  if (!spell) {
    return { value: 0, breakdown: { error: "Unknown spell" } };
  }

  const ctx = _normalizeContext(context);
  const slotLevel = Math.max(spell.level, ctx.slotLevel || spell.level);
  const upcastLevels = slotLevel - spell.level;

  switch (spell.category) {
    case "damage":  return _evalDamageSpell(spell, ctx, upcastLevels);
    case "control": return _evalControlSpell(spell, ctx, upcastLevels);
    case "buff":    return _evalBuffSpell(spell, ctx, upcastLevels);
    case "heal":    return _evalHealSpell(spell, ctx, upcastLevels);
    case "utility": return _evalUtilitySpell(spell, ctx, upcastLevels);
    default:        return { value: 0, breakdown: { category: "unknown" } };
  }
}

// =========================================================
// 1. DAMAGE SPELLS
// =========================================================

function _evalDamageSpell(spell, ctx, upcastLevels) {
  const baseDice   = spell._cachedAvg ?? _avgDiceExpr(spell.diceExpr || "1d8");
  const upcastDice = (spell.upcastDicePerLevel || 0) * upcastLevels * _avgDiceExpr("1d6");
  const fixedBonus = spell.fixedDamage || 0;
  const totalAvgDmg = baseDice + upcastDice + fixedBonus;

  const targets   = Math.min(spell.targets || 1, ctx.enemyCount);
  let   perTarget = 0;

  if (spell.autoHit) {
    // Magic Missile etc.
    perTarget = totalAvgDmg;
  } else if (spell.attackRoll === "spell_attack") {
    const pHit = clamp(
      _hitChanceVsAC(ctx.spellAttack, ctx.targetAC),
      MIN_HIT_CHANCE,
      MAX_HIT_CHANCE
    );
    perTarget = pHit * totalAvgDmg;
  } else if (spell.saveType) {
    const pFail = saveFailChance(ctx.spellDC, ctx.targetSaveBonus);
    if (spell.halfOnSave) {
      perTarget = pFail * totalAvgDmg + (1 - pFail) * totalAvgDmg * 0.5;
    } else {
      perTarget = pFail * totalAvgDmg;
    }
  } else {
    perTarget = totalAvgDmg; // auto-hit
  }

  const value = perTarget * targets;

  return {
    value,
    breakdown: {
      category:    "damage",
      avgDice:     totalAvgDmg,
      targets,
      perTarget,
      hitMode:     spell.autoHit ? "autoHit" : (spell.attackRoll || "save"),
    },
  };
}

// =========================================================
// 2. CONTROL SPELLS
// =========================================================

/**
 * Control Value = prevented_enemy_DPR × expected_duration × success_probability
 *
 * Paralyzed additionally grants crits to allies → bonus DPR.
 */
function _evalControlSpell(spell, ctx, upcastLevels) {
  const pSuccess      = spell.saveType
    ? saveFailChance(ctx.spellDC, ctx.targetSaveBonus)
    : 1.0;

  // Expected duration using geometric model: each round enemy re-saves.
  // If no repeated save: duration = controlDuration.
  // If concentration with repeated saves: E[dur] = 1 / pFail (round repeat save).
  let expectedDuration;
  if (spell.concentration && spell.saveType) {
    // P(end each round) = 1 - pSuccess (enemy succeeds → breaks)
    // Geometric mean rounds = 1 / (1-pSuccess)  [capped at controlDuration]
    const pEnd = 1 - pSuccess;
    expectedDuration = pEnd > 0
      ? Math.min(spell.controlDuration || 4, 1 / pEnd)
      : (spell.controlDuration || 4);
  } else {
    expectedDuration = spell.controlDuration || 1;
  }

  // Cap to remaining rounds
  expectedDuration = Math.min(expectedDuration, ctx.roundsLeft);

  const targets    = Math.min(spell.targets || 1, ctx.enemyCount);
  const targetDPR  = ctx.targetDPR;

  // Base prevented DPR
  const preventedDpr = pSuccess * expectedDuration * targetDPR * targets;

  // Bonus for paralysis: all attacks against paralyzed target crit
  // Crit adds ~50% more damage from the party (rough estimate)
  let critBonus = 0;
  if (spell.controlType === "paralyzed") {
    const allyDprIncrease = ctx.partyDPR * 0.5 * pSuccess * expectedDuration;
    critBonus = allyDprIncrease;
  }

  // Incapacitated: ally attacks have advantage → ~15% more hits
  let advBonus = 0;
  if (spell.controlType === "incapacitated") {
    advBonus = ctx.partyDPR * 0.15 * pSuccess * expectedDuration;
  }

  // Any damage component of a control spell (e.g. Vicious Mockery)
  let damageComponent = 0;
  if (spell.diceExpr) {
    const dmg = spell._cachedAvg ?? _avgDiceExpr(spell.diceExpr);
    damageComponent = pSuccess * dmg * targets;
  }

  const value = preventedDpr + critBonus + advBonus + damageComponent;

  return {
    value,
    breakdown: {
      category:         "control",
      controlType:      spell.controlType,
      pSuccess,
      expectedDuration,
      preventedDpr,
      critBonus,
      advBonus,
      damageComponent,
      targets,
    },
  };
}

// =========================================================
// 3. BUFF SPELLS
// =========================================================

/**
 * Buff Value = added_ally_DPR + prevented_damage
 *
 * Duration is treated as the expected encounter length remaining.
 */
function _evalBuffSpell(spell, ctx, upcastLevels) {
  let value = 0;
  const dur = Math.min(spell.controlDuration || ctx.roundsLeft, ctx.roundsLeft);
  const breakdown = { category: "buff" };

  // Extra attacks for an ally (Haste)
  if (spell.buffedAttacks) {
    // Assume the buffed ally has party-average DPR/attack-count
    const perAttackDpr = ctx.partyDPR / 2; // rough single-ally with 2 attacks
    const addedDpr     = spell.buffedAttacks * perAttackDpr * dur;
    value += addedDpr;
    breakdown.addedAttackDpr = addedDpr;
  }

  // AC bonus (Shield, Blur, etc.)
  if (spell.acBonus) {
    // Prevented damage = P(hit without buff) - P(hit with AC bonus)  × enemy DPR × dur
    const pHitBefore = _hitChanceVsAC(
      _estimateEnemyAttackBonus(ctx),
      _estimateAllyAC(ctx)
    );
    const pHitAfter  = _hitChanceVsAC(
      _estimateEnemyAttackBonus(ctx),
      _estimateAllyAC(ctx) + spell.acBonus
    );
    const prevented  = (pHitBefore - pHitAfter) * ctx.targetDPR * dur;
    value += prevented;
    breakdown.preventedDamage = prevented;
  }

  // Spiritual Weapon: independent spell attack each round
  if (spell.attackRoll === "spell_attack" && spell.diceExpr) {
    const pHit   = _hitChanceVsAC(ctx.spellAttack, ctx.targetAC);
    const avgDmg = (spell._cachedAvg ?? _avgDiceExpr(spell.diceExpr)) + (ctx.castingMod || 0)
                   + (spell.upcastDicePerLevel || 0) * upcastLevels * 3.5;
    const dpr    = pHit * avgDmg;
    value += dpr * dur;
    breakdown.spiritWeaponDpr = dpr;
  }

  // Healing: treated here if category override
  if (spell.healDice) {
    const healed = _avgDiceExpr(spell.healDice) + (ctx.castingMod || 0);
    // Healing value ≈ HP restored; weight at 0.5 (prevention > cure)
    value += healed * 0.5;
    breakdown.healing = healed;
  }

  return { value, breakdown };
}

// =========================================================
// 4. HEALING SPELLS
// =========================================================

function _evalHealSpell(spell, ctx, upcastLevels) {
  const base    = spell._cachedHealAvg ?? _avgDiceExpr(spell.healDice || "1d8");
  const upcDice = (spell.upcastDicePerLevel || 1) * upcastLevels * 4.5;
  const healed  = (base + upcDice + (ctx.castingMod || 0)) * (spell.targets || 1);

  // Healing is worth less in combat than dealing damage (opportunity cost).
  // Weight 0.6 × healed HP as EDE.
  const value = healed * 0.6;

  return {
    value,
    breakdown: { category: "heal", healed, weight: 0.6 },
  };
}

// =========================================================
// 5. UTILITY SPELLS
// =========================================================

function _evalUtilitySpell(spell, ctx, upcastLevels) {
  // Utility spells (teleportation, detection, Wish) are hard to generalize.
  // Return a small slot-level baseline so they don't score zero.
  const baseline = spell.level * 1.5;
  return {
    value: baseline,
    breakdown: { category: "utility", baseline },
  };
}

// =========================================================
// SPELL SLOT OPTIMIZER
// =========================================================

/**
 * Given available spell slots and a list of known spell keys,
 * return the optimal slot→spell assignment that maximises EDE.
 *
 * @param {Record<number,number>} spellSlots  – available slots by level
 * @param {string[]}              knownSpells – spell keys
 * @param {SpellContext}          context
 * @returns {Array<{spell: string, slotLevel: number, value: number}>}
 */
export function optimizeSpellLoadout(spellSlots, knownSpells, context) {
  const ctx       = _normalizeContext(context);
  const available = Object.entries(spellSlots)
    .flatMap(([lv, count]) => Array.from({ length: count }, () => Number(lv)))
    .sort((a, b) => b - a);  // highest first

  const results = [];
  const usedSlots = { ...spellSlots };

  // Greedy: for each slot (highest first), pick the best spell
  for (const slotLevel of available) {
    if ((usedSlots[slotLevel] || 0) <= 0) continue;

    let bestVal   = -Infinity;
    let bestSpell = null;

    for (const key of knownSpells) {
      const def = SPELL_DATABASE[key];
      if (!def || def.level > slotLevel) continue;

      const { value } = evaluateSpell(def, { ...ctx, slotLevel });
      if (value > bestVal) {
        bestVal   = value;
        bestSpell = key;
      }
    }

    if (bestSpell) {
      results.push({ spell: bestSpell, slotLevel, value: bestVal });
      usedSlots[slotLevel]--;
    }
  }

  return results.sort((a, b) => b.value - a.value);
}

/**
 * Evaluate the total spell contribution of a spellcaster build.
 * Sums optimal slot usage across the full encounter.
 *
 * @param {Record<number,number>} spellSlots
 * @param {string[]}              knownSpells
 * @param {SpellContext}          context
 * @returns {{ total: number, perRound: number, loadout: Array }}
 */
export function evaluateSpellContribution(spellSlots, knownSpells, context) {
  const ctx      = _normalizeContext(context);
  const loadout  = optimizeSpellLoadout(spellSlots, knownSpells, ctx);
  const total    = loadout.reduce((s, e) => s + e.value, 0);
  const perRound = total / Math.max(1, ctx.roundsLeft);

  return { total, perRound, loadout };
}

// =========================================================
// CONTROL PRESSURE SCORE (optimizer metric)
// =========================================================

/**
 * Compute the control-pressure score for a spellcaster,
 * compatible with the existing optimizer metric.
 *
 * Re-uses the existing CONTROL_SPELL_LEVEL_WEIGHTS from optimizer-constants.js
 * but layers the full spell evaluation on top.
 *
 * @param {Record<number,number>} spellSlots
 * @param {SpellContext}          context
 * @param {string[]}              [knownSpells] – specific spells; falls back to level estimate
 * @returns {number}
 */
export function computeControlPressure(spellSlots, context, knownSpells = []) {
  const ctx = _normalizeContext(context);

  // If we have a known spell list, evaluate it properly
  if (knownSpells.length > 0) {
    const controlSpells = knownSpells.filter(k => {
      const s = SPELL_DATABASE[k];
      return s && s.category === "control";
    });
    if (controlSpells.length > 0) {
      const { perRound } = evaluateSpellContribution(spellSlots, controlSpells, ctx);
      return perRound;
    }
  }

  // Fallback: weight-based estimate from slot levels (matches existing logic)
  let score = 0;
  for (const [lv, count] of Object.entries(spellSlots)) {
    const w = CONTROL_SPELL_LEVEL_WEIGHTS[Number(lv)] || 0;
    score += w * (Number(count) || 0);
  }
  // Multiply by save DC quality
  const pFail = saveFailChance(ctx.spellDC, ctx.targetSaveBonus);
  return score * pFail;
}

// =========================================================
// BEST ACTION (for combat engine integration)
// =========================================================

/**
 * Given a state and encounter context, determine the best spell
 * to cast and return its EDE.
 *
 * Can be called by the combat engine's action selector instead
 * of the simplified slot-level heuristic.
 *
 * @param {import('./effect-system').CharacterState} state
 * @param {string[]}   knownSpells
 * @param {SpellContext} context
 * @returns {{ spell: SpellDef|null, value: number }}
 */
export function bestSpellAction(state, knownSpells, context) {
  const ctx = _normalizeContext({
    ...context,
    spellDC:     state.spellDC,
    spellAttack: state.spellAttack,
    castingMod:  state.castingMod,
    casterLevel: state.level,
  });

  let bestVal   = 0;
  let bestSpell = null;

  const slots = state.resources.spellSlots || {};

  for (const key of knownSpells) {
    const def = SPELL_DATABASE[key];
    if (!def) continue;

    // Find the highest available slot for this spell
    for (let lv = 9; lv >= def.level; lv--) {
      if ((slots[lv] || 0) <= 0) continue;
      const { value } = evaluateSpell(def, { ...ctx, slotLevel: lv });
      if (value > bestVal) {
        bestVal   = value;
        bestSpell = def;
      }
      break; // use the best available slot only
    }
  }

  return { spell: bestSpell, value: bestVal };
}

// =========================================================
// Internal helpers
// =========================================================

function _normalizeContext(ctx) {
  return {
    spellDC:          ctx.spellDC          ?? 14,
    spellAttack:      ctx.spellAttack      ?? 6,
    castingMod:       ctx.castingMod       ?? 3,
    casterLevel:      ctx.casterLevel      ?? 8,
    targetAC:         ctx.targetAC         ?? 15,
    targetSaveBonus:  ctx.targetSaveBonus  ?? 4,
    targetDPR:        ctx.targetDPR        ?? 10,
    partyDPR:         ctx.partyDPR         ?? 25,
    enemyCount:       ctx.enemyCount       ?? 1,
    roundsLeft:       ctx.roundsLeft       ?? 4,
    slotLevel:        ctx.slotLevel        ?? 0,
  };
}

function _avgDiceExpr(expr) {
  if (typeof expr === "number") return expr;
  const str = String(expr);
  const m = str.match(/(\d+)d(\d+)/i);
  if (!m) return 0;
  const diceAvg = Number(m[1]) * (Number(m[2]) + 1) / 2;
  // Parse optional flat bonus/penalty (e.g. "+3" or "-2")
  const bonusMatch = str.match(/([+-])\s*(\d+)\s*$/);
  const flatBonus = bonusMatch ? (bonusMatch[1] === "+" ? 1 : -1) * Number(bonusMatch[2]) : 0;
  return diceAvg + flatBonus;
}

function _hitChanceVsAC(attackBonus, ac) {
  const needed = clamp(ac - attackBonus, 2, 19);
  return clamp((21 - needed) / 20, 0.05, 0.95);
}

function _estimateEnemyAttackBonus(ctx) {
  // Rough enemy attack bonus: 2 + half(target CR guess from AC)
  return 4;
}

function _estimateAllyAC(ctx) {
  // Rough: assume the buffed ally has AC 15 (typical heavy armor fighter)
  return 15;
}

// =========================================================
// Browser global
// =========================================================
if (typeof globalThis !== "undefined") {
  globalThis.DndSpellEvaluator = {
    SPELL_DATABASE,
    evaluateSpell,
    optimizeSpellLoadout,
    evaluateSpellContribution,
    computeControlPressure,
    bestSpellAction,
  };
}
