// @ts-nocheck
/* =========================================================
   D&D 5e Combat Engine
   ─────────────────────────────────────────────────────────
   Implements the simulation layer:

   A. Core math  – hit chance, advantage, crits, expected damage
   B. Attack resolution  – multi-attack, crit scaling, EV or stochastic
   C. Turn engine  – per-round action selection + accumulation
   D. Monte Carlo mode  – dice-rolling repeated simulation

   Integrates with:
     effect-system.js   → CharacterState
     dnd-engine.js      → effectiveHitChance, clamp, …
     damage-model.js    → computeSustainedDpr, warlockBeamCount, sneakAttackAvg
     optimizer-constants.js → constants

   ESM module.  No build tools required.
   ========================================================= */

import {
  clamp,
  effectiveHitChance,
  saveFailChance,
  MIN_HIT_CHANCE,
  MAX_HIT_CHANCE,
  D20_SIDES,
} from "./dnd-engine";

import {
  sneakAttackAvg,
  warlockBeamCount,
  atLeastOneHitChance,
} from "./damage-model";

import {
  AVG_DIE_FINESSE,
  AVG_DIE_HEAVY,
  GWM_HIT_PENALTY,
  GWM_DAMAGE_BONUS,
  PAM_BONUS_DIE_AVG,
  DIVINE_SMITE_AVG_DICE,
  FLURRY_EXTRA_ATTACKS,
} from "../utils/optimizer-constants";

import { conditionMet } from "./effect-system";

// =========================================================
// A. CORE MATH
// =========================================================

/**
 * Expected damage per die for a given dice expression.
 * Accepts "1d6", "2d8", "1d4+3" – returns average numeric value.
 *
 * @param {string|number} diceExpr
 * @returns {number}
 */
export function avgDiceExpr(diceExpr) {
  if (typeof diceExpr === "number") return diceExpr;
  const str = String(diceExpr);
  const m = str.match(/(\d+)d(\d+)/i);
  if (!m) return 0;
  const diceAvg = Number(m[1]) * (Number(m[2]) + 1) / 2;
  // Parse optional flat bonus/penalty (e.g. "+3" or "-2")
  const bonusMatch = str.match(/([+-])\s*(\d+)\s*$/);
  const flatBonus = bonusMatch ? (bonusMatch[1] === "+" ? 1 : -1) * Number(bonusMatch[2]) : 0;
  return diceAvg + flatBonus;
}

/**
 * Hit probability for a single d20 attack roll.
 *
 * @param {number} attackBonus    – total attack bonus
 * @param {number} targetAC       – target Armor Class
 * @param {number} [advantageRate=0] – fraction of attacks made with advantage
 * @returns {number} probability in [MIN_HIT_CHANCE, MAX_HIT_CHANCE]
 */
export function hitChance(attackBonus, targetAC, advantageRate = 0) {
  return effectiveHitChance(attackBonus, targetAC, advantageRate);
}

/**
 * Critical hit probability on a single attack (nat-20 rule).
 * Extended crit range (e.g. Champion Fighter 19-20) can be passed as critThreshold.
 *
 * @param {number} [critThreshold=20]
 * @param {number} [advantageRate=0]
 * @returns {number}
 */
export function critChance(critThreshold = 20, advantageRate = 0) {
  const basePCrit = (21 - critThreshold) / D20_SIDES;        // P(crit no adv)
  const pAdvCrit  = 1 - Math.pow(1 - basePCrit, 2);          // 1−(1−p)²
  return clamp(basePCrit + advantageRate * (pAdvCrit - basePCrit), 0, 1);
}

/**
 * Expected damage from a single attack, accounting for crits.
 *
 * Normal hit: addedDamage (non-crit dice) + fixedBonus
 * Crit hit:   addedDamage * 2 + fixedBonus   (PHB: double dice only)
 *
 * E[dmg] = pHit * (avgDice + fixedBonus) + pCrit * avgDice
 *         where pCrit is the additional expected value from the crit dice
 *
 * @param {number} pHit        – total hit probability (includes crits)
 * @param {number} pCrit       – crit probability
 * @param {number} avgDice     – average weapon dice (without modifier / fixed)
 * @param {number} fixedBonus  – modifier + magic + flat bonuses
 * @returns {number}
 */
export function expectedDamagePerAttack(pHit, pCrit, avgDice, fixedBonus) {
  // On a normal hit: avgDice + fixedBonus
  // On a crit:       avgDice * 2 + fixedBonus  (extra avgDice from second roll)
  // E[dmg] = pHit*(avgDice + fixedBonus) + pCrit*avgDice
  return pHit * (avgDice + fixedBonus) + pCrit * avgDice;
}

// =========================================================
// B. ATTACK RESOLUTION
// =========================================================

/**
 * Resolve a full round of weapon/spell attacks and return
 * total expected damage (deterministic, expected-value mode).
 *
 * @param {object} params
 * @param {number} params.attackBonus
 * @param {number} params.targetAC
 * @param {number} params.advantageRate
 * @param {number} params.attacks          – number of attacks this round
 * @param {number} params.avgDice          – average weapon dice (e.g. 4.5)
 * @param {number} params.fixedBonus       – flat per-hit bonus (mod + magic + feats)
 * @param {number} [params.critThreshold=20]
 * @param {number} [params.damageBonus=0]  – extra flat damage from feats/effects
 * @returns {{ totalDamage: number, pHit: number, pCrit: number }}
 */
export function resolveAttacks({
  attackBonus,
  targetAC,
  advantageRate = 0,
  attacks = 1,
  avgDice,
  fixedBonus,
  critThreshold = 20,
  damageBonus = 0,
}) {
  const pHit  = hitChance(attackBonus, targetAC, advantageRate);
  const pCrit = critChance(critThreshold, advantageRate);
  const edpa  = expectedDamagePerAttack(pHit, pCrit, avgDice, fixedBonus + damageBonus);

  return {
    totalDamage: edpa * attacks,
    pHit,
    pCrit,
  };
}

/**
 * Stochastic single-attack resolver (Monte Carlo mode).
 * Rolls a d20 and computes actual damage (not expected value).
 *
 * @param {object} params – same shape as resolveAttacks
 * @returns {number} actual damage rolled
 */
export function resolveAttackStochastic({
  attackBonus,
  targetAC,
  attacks = 1,
  avgDice,     // replaced by die size for MC
  diceExpr,    // e.g. "1d8"
  fixedBonus,
  critThreshold = 20,
  damageBonus = 0,
}) {
  let total = 0;
  const dieSides = _parseDieSides(diceExpr || "1d8");
  const numDice  = _parseDiceCount(diceExpr || "1d8");

  for (let i = 0; i < attacks; i++) {
    const roll = _d20();
    const isCrit = roll >= critThreshold;
    const isHit  = isCrit || (roll + attackBonus >= targetAC && roll >= 1);
    if (!isHit) continue;

    let dmg = fixedBonus + damageBonus;
    const diceRolls = isCrit ? numDice * 2 : numDice;
    for (let d = 0; d < diceRolls; d++) {
      dmg += _die(dieSides);
    }
    total += Math.max(0, dmg);
  }
  return total;
}

// =========================================================
// C. TURN ENGINE
// =========================================================

/**
 * Simulate N rounds of combat and return per-round damage averages.
 *
 * The turn engine works in deterministic (expected-value) mode by default.
 * Set mode = "montecarlo" for stochastic simulation.
 *
 * @param {object} params
 * @param {import('./effect-system').CharacterState} params.state
 * @param {object} params.encounter
 * @param {number} params.encounter.targetAC
 * @param {number} params.encounter.targetSaveBonus
 * @param {number} params.encounter.targetDPR        – enemy DPR (for control value)
 * @param {number} params.encounter.enemyCount
 * @param {number} [params.rounds=4]
 * @param {string} [params.mode="deterministic"]     – "deterministic"|"montecarlo"
 * @param {number} [params.iterations=200]           – MC iterations (ignored in det. mode)
 * @returns {TurnResult}
 *
 * @typedef {object} TurnResult
 * @property {number[]} roundDamage  – expected or mean damage per round
 * @property {number}   averageDpr   – mean across rounds
 * @property {number}   burstRound1  – extra burst damage in round 1
 * @property {string[]} log          – human-readable action log
 */
export function simulateCombat({
  state,
  encounter,
  rounds = 4,
  mode = "deterministic",
  iterations = 200,
}) {
  if (mode === "montecarlo") {
    return _runMonteCarlo({ state, encounter, rounds, iterations });
  }
  return _runDeterministic({ state, encounter, rounds });
}

// ── Deterministic path ─────────────────────────────────

function _runDeterministic({ state, encounter, rounds }) {
  const { targetAC, targetSaveBonus, targetDPR = 10, enemyCount = 1 } = encounter;
  const log = [];
  const roundDamage = [];

  const ctx = _buildCombatContext(state, encounter);

  for (let round = 1; round <= rounds; round++) {
    const { damage, actions } = _deterministic_turn(ctx, round, targetAC, targetSaveBonus, targetDPR, enemyCount);
    roundDamage.push(damage);
    log.push(`Round ${round}: ${actions.join(", ")} → ${damage.toFixed(2)} dmg`);
  }

  const averageDpr   = roundDamage.reduce((s, d) => s + d, 0) / rounds;
  const burstRound1  = roundDamage[0] - (roundDamage.slice(1).reduce((s, d) => s + d, 0) / Math.max(1, rounds - 1));

  return {
    roundDamage,
    averageDpr,
    burstRound1: Math.max(0, burstRound1),
    log,
  };
}

function _deterministic_turn(ctx, round, targetAC, targetSaveBonus, targetDPR, enemyCount) {
  const actions = [];
  let damage = 0;

  // Evaluate all available actions and pick the best
  const available = _buildAvailableActions(ctx, round);
  const evaluated = available.map(a => ({
    action: a,
    ev: _evaluateActionEV(a, ctx, targetAC, targetSaveBonus, targetDPR, enemyCount),
  }));

  // Sort by EV descending; pick the best action for the main action slot
  evaluated.sort((a, b) => b.ev - a.ev);

  // Main action
  if (evaluated.length > 0) {
    const best = evaluated[0];
    damage += best.ev;
    actions.push(best.action.label);
  }

  // Bonus action (pick the best available bonus action if any)
  const bonusActions = evaluated.filter(e => e.action.slot === "bonus");
  if (bonusActions.length > 0) {
    damage += bonusActions[0].ev;
    actions.push(bonusActions[0].action.label + " [BA]");
  }

  // Resource tracking (consume per round)
  _consumeResources(ctx, round);

  return { damage, actions };
}

// ── Monte Carlo path ───────────────────────────────────

function _runMonteCarlo({ state, encounter, rounds, iterations }) {
  const { targetAC, targetSaveBonus = 4 } = encounter;
  const allRoundDamages = Array.from({ length: rounds }, () => 0);

  const ctx = _buildCombatContext(state, encounter);

  for (let iter = 0; iter < iterations; iter++) {
    const ctx_iter = _cloneCombatContext(ctx);
    for (let r = 0; r < rounds; r++) {
      const dmg = _montecarlo_turn(ctx_iter, r + 1, targetAC, targetSaveBonus);
      allRoundDamages[r] += dmg;
    }
  }

  const roundDamage = allRoundDamages.map(d => d / iterations);
  const averageDpr  = roundDamage.reduce((s, d) => s + d, 0) / rounds;
  const burstRound1 = roundDamage[0] - (roundDamage.slice(1).reduce((s, d) => s + d, 0) / Math.max(1, rounds - 1));

  return {
    roundDamage,
    averageDpr,
    burstRound1: Math.max(0, burstRound1),
    log: [`Monte Carlo: ${iterations} iterations, ${rounds} rounds`],
  };
}

function _montecarlo_turn(ctx, round, targetAC, targetSaveBonus) {
  const { state } = ctx;
  const cls = state.classKey;
  let damage = 0;

  const attacks = _effectiveAttacks(state);
  const avgDice = _avgDie(state);
  const fixedBonus = state.primaryMod + state.weaponMagic;
  const damageBonus = state._damageBonus || 0;
  const diceExpr = avgDice === AVG_DIE_FINESSE ? "1d8" : "1d10";

  // Weapon attacks
  damage += resolveAttackStochastic({
    attackBonus: state.attackBonus,
    targetAC,
    attacks,
    diceExpr,
    fixedBonus,
    damageBonus,
  });

  // Rogue sneak attack (once per turn, if we hit)
  if (cls === "rogue" && damage > 0) {
    const pHit = hitChance(state.attackBonus, targetAC, 0);
    // In MC mode: did we hit at least once?
    const hitOnce = _d20() + state.attackBonus >= targetAC;
    if (hitOnce) damage += _rollDice(Math.ceil(state.level / 2), 6);
  }

  // Action Surge round 1
  if (cls === "fighter" && round === 1 && ctx.resources.surges > 0) {
    damage += resolveAttackStochastic({ attackBonus: state.attackBonus, targetAC, attacks, diceExpr, fixedBonus, damageBonus });
    ctx.resources.surges--;
  }

  return damage;
}

// ── Combat context ─────────────────────────────────────

function _buildCombatContext(state, encounter) {
  return {
    state,
    encounter,
    resources: { ...state.resources },
    round: 0,
    // _baseActions is populated lazily by _buildAvailableActions on the first
    // round and reused in subsequent rounds for the resource-independent actions.
    _baseActions: null,
  };
}

function _cloneCombatContext(ctx) {
  return {
    ...ctx,
    resources: {
      ...ctx.resources,
      spellSlots: { ...ctx.resources.spellSlots },
    },
    // _baseActions is shared (read-only) between clones – no deep copy needed
    _baseActions: ctx._baseActions,
  };
}

// ── Action builder / evaluator ──────────────────────────

/**
 * Build the set of actions available to this character this round.
 * Each action is a descriptor object consumed by _evaluateActionEV.
 *
 * Resource-independent (static) actions are built once and cached on
 * the combat context to avoid redundant work in later rounds.
 */
function _buildAvailableActions(ctx, round) {
  const { state, resources } = ctx;
  const cls = state.classKey;

  // Build the static (resource-independent) action list once per combat.
  if (!ctx._baseActions) {
    ctx._baseActions = _buildStaticActions(state);
  }

  // Start from the cached static actions; add resource/round-gated actions.
  const actions = [...ctx._baseActions];

  // Action Surge (Fighter) – only available round 1 with a surge remaining
  if (cls === "fighter" && round === 1 && resources.surges > 0) {
    actions.push({
      label: "Action Surge (Extra Attacks)",
      slot:  "bonus_action_upgrade",
      type:  "weapon_attack",
      attacks: _estimateAttacks(cls, state.level),
    });
  }

  // Flurry of Blows (Monk bonus action) – consumes ki
  if (cls === "monk" && resources.ki > 0) {
    actions.push({
      label: "Flurry of Blows",
      slot:  "bonus",
      type:  "weapon_attack",
      attacks: FLURRY_EXTRA_ATTACKS,
    });
  }

  // Paladin smite (resource-spending bonus on hit)
  if (cls === "paladin" && resources.smiteSlots > 0) {
    actions.push({
      label:    "Divine Smite",
      slot:     "on_hit_bonus",
      type:     "smite",
      avgDamage: DIVINE_SMITE_AVG_DICE,
    });
  }

  // Spellcasting (simplified — best slot attack or control)
  if (state.resources.spellSlots) {
    const bestSlot = _bestSpellSlot(resources.spellSlots);
    if (bestSlot > 0) {
      actions.push({
        label:    `Spell Slot L${bestSlot}`,
        slot:     "action",
        type:     "spell_attack",
        slotLevel: bestSlot,
        spellDC:   state.spellDC,
        castingMod: state.castingMod,
      });
    }
  }

  return actions;
}

/**
 * Build the resource-independent base actions for a character.
 * These actions are the same every round regardless of remaining resources.
 *
 * @param {import('./effect-system').CharacterState} state
 * @returns {object[]}
 */
function _buildStaticActions(state) {
  const cls = state.classKey;
  const actions = [];

  // Standard attack action
  const attacks = _effectiveAttacks(state);
  actions.push({
    label:    "Attack",
    slot:     "action",
    type:     "weapon_attack",
    attacks,
  });

  // Warlock: Eldritch Blast (always available – no resource cost)
  if (cls === "warlock") {
    actions.push({
      label:  "Eldritch Blast",
      slot:   "action",
      type:   "weapon_attack",
      attacks: warlockBeamCount(state.level),
    });
  }

  // PAM bonus attack (passive, granted by feat – always available)
  const pamAction = state.actions.find(a => a.descriptor?.label === "PAM Bonus Attack");
  if (pamAction) {
    actions.push({
      label: "PAM Bonus Attack",
      slot:  "bonus",
      type:  "weapon_attack",
      attacks: 1,
      avgDice:  PAM_BONUS_DIE_AVG,
    });
  }

  return actions;
}

/**
 * Compute the expected-value output of a given action.
 *
 * @param {object} action
 * @param {object} ctx
 * @param {number} targetAC
 * @param {number} targetSaveBonus
 * @param {number} targetDPR
 * @param {number} enemyCount
 * @returns {number} EV in damage-equivalent units
 */
function _evaluateActionEV(action, ctx, targetAC, targetSaveBonus, targetDPR, enemyCount) {
  const { state } = ctx;

  switch (action.type) {
    case "weapon_attack": {
      const avgDice    = action.avgDice ?? _avgDie(state);
      const fixedBonus = state.primaryMod + state.weaponMagic;
      const pHit       = hitChance(state.attackBonus, targetAC, 0);
      const pCrit      = critChance(state._critThreshold ?? 20, 0);
      const damageBonus = state._damageBonus || 0;
      let ev = expectedDamagePerAttack(pHit, pCrit, avgDice, fixedBonus + damageBonus) * action.attacks;

      // Rogue once-per-turn sneak
      if (state.classKey === "rogue") {
        const otpChance = atLeastOneHitChance(pHit, action.attacks);
        ev += otpChance * sneakAttackAvg(state.level);
      }
      return ev;
    }

    case "smite": {
      const pHit = hitChance(state.attackBonus, targetAC, 0);
      return pHit * action.avgDamage;
    }

    case "spell_attack": {
      // Simplified: model as a mid-power damage spell
      const slotDmg = action.slotLevel * 3.5 + state.castingMod;
      const pHit    = hitChance(state.spellAttack, targetAC, 0);
      return pHit * slotDmg;
    }

    default:
      return 0;
  }
}

// ── Resource tracking ──────────────────────────────────

function _consumeResources(ctx, round) {
  const { state, resources } = ctx;

  if (state.classKey === "fighter" && round === 1 && resources.surges > 0) {
    resources.surges--;
  }
  if (state.classKey === "monk" && resources.ki > 0) {
    resources.ki--;
  }
  if (state.classKey === "paladin" && resources.smiteSlots > 0 && round === 1) {
    resources.smiteSlots--;
  }
}

// =========================================================
// D. MULTI-ROUND DPR SUMMARY
// =========================================================

/**
 * Compute a compact DPR summary (sustained + burst) suitable
 * for the optimizer's evaluateBuildSnapshot.
 *
 * @param {import('./effect-system').CharacterState} state
 * @param {object} assumptions
 * @param {number} assumptions.targetAC
 * @param {number} assumptions.targetSaveBonus
 * @param {number} assumptions.advantageRate
 * @param {number} assumptions.roundsPerEncounter
 * @returns {{ sustainedDpr: number, burstDprRound1: number }}
 */
export function computeDprFromState(state, assumptions) {
  const {
    targetAC          = 15,
    targetSaveBonus   = 4,
    advantageRate     = 0,
    roundsPerEncounter = 4,
  } = assumptions;

  const result = simulateCombat({
    state,
    encounter: {
      targetAC,
      targetSaveBonus,
      targetDPR: 12,
      enemyCount: 1,
    },
    rounds: roundsPerEncounter,
    mode: "deterministic",
  });

  return {
    sustainedDpr:   result.averageDpr,
    burstDprRound1: result.burstRound1,
  };
}

// =========================================================
// Internal helpers
// =========================================================

function _effectiveAttacks(state) {
  if (state.classKey === "warlock") return warlockBeamCount(state.level);
  return _estimateAttacks(state.classKey, state.level);
}

function _estimateAttacks(classKey, level) {
  const cls = _getClassData_local(classKey);
  if (!cls) return 1;
  if (!cls.features?.extraAttackLevel) return 1;
  if (level < cls.features.extraAttackLevel) return 1;
  if (classKey === "fighter" && level >= 20) return 4;
  if (classKey === "fighter" && level >= 11) return 3;
  return 2;
}

// Local shim to avoid circular import; mirrors getClassData logic
function _getClassData_local(classKey) {
  try {
    const { getClassData } = globalThis.DndEngine || {};
    return getClassData ? getClassData(classKey) : null;
  } catch {
    return null;
  }
}

function _avgDie(state) {
  try {
    const cls = _getClassData_local(state.classKey);
    return cls?.weaponStyle === "dex" ? AVG_DIE_FINESSE : AVG_DIE_HEAVY;
  } catch {
    return AVG_DIE_HEAVY;
  }
}

function _bestSpellSlot(slots) {
  for (let lv = 9; lv >= 1; lv--) {
    if ((slots[lv] || 0) > 0) return lv;
  }
  return 0;
}

// ── Dice helpers (Monte Carlo) ──────────────────────────

function _d20()         { return Math.floor(Math.random() * 20) + 1; }
function _die(sides)    { return Math.floor(Math.random() * sides) + 1; }

function _rollDice(count, sides) {
  let total = 0;
  for (let i = 0; i < count; i++) total += _die(sides);
  return total;
}

function _parseDieSides(expr) {
  const m = String(expr).match(/d(\d+)/i);
  return m ? Number(m[1]) : 8;
}

function _parseDiceCount(expr) {
  const m = String(expr).match(/^(\d+)d/i);
  return m ? Number(m[1]) : 1;
}

// =========================================================
// Browser global
// =========================================================
if (typeof globalThis !== "undefined") {
  globalThis.DndCombatEngine = {
    avgDiceExpr,
    hitChance,
    critChance,
    expectedDamagePerAttack,
    resolveAttacks,
    resolveAttackStochastic,
    simulateCombat,
    computeDprFromState,
  };
}
