/* =========================================================
   D&D 5e Damage Model
   Provides class-aware sustained DPR and burst DPR (round 1)
   calculations that replace the oversimplified formulas
   previously embedded in evaluateBuildSnapshot.

   Sustained DPR correctly handles:
   - Per-attack weapon damage (scales with number of attacks)
   - Once-per-turn riders (Rogue Sneak Attack) using the
     "at least one hit" probability model:  1 − (1−p)^n
   - Warlock Eldritch Blast beam count scaling by level
   - Feat trade-offs: GWM / Sharpshooter (−5 hit / +10 dmg)
     and Polearm Master (bonus action d4 attack)

   Burst DPR (Round 1) uses explicit resource-budget models:
   - Fighter:  Action Surge (extra Attack action, short-rest)
   - Paladin:  Divine Smite (consumes spell slots)
   - Monk:     Flurry of Blows (consumes Ki, short-rest)
   - Others:   0 unless explicitly modeled

   ESM module – no build tools required.
   ========================================================= */

import {
  clamp,
  validateMagicBonus,
  getClassData,
  effectiveHitChance,
} from "./dnd-engine.js";

import {
  AVG_DIE_FINESSE,
  AVG_DIE_HEAVY,
  GWM_HIT_PENALTY,
  GWM_DAMAGE_BONUS,
  PAM_BONUS_DIE_AVG,
  ALERT_INITIATIVE_BONUS,
  DIVINE_SMITE_AVG_DICE,
  FLURRY_EXTRA_ATTACKS,
} from "./optimizer-constants.js";

// =========================================================
// Public helpers
// =========================================================

/**
 * Probability of landing at least one hit across N attacks.
 * Used to model once-per-turn effects (e.g. Rogue Sneak Attack).
 *
 * @param {number} hitChance  - Single-attack hit probability [0,1]
 * @param {number} attacks    - Number of attacks this turn (≥1)
 * @returns {number} Probability that at least one attack hits [0,1]
 */
export function atLeastOneHitChance(hitChance, attacks) {
  const p = clamp(Number(hitChance) || 0, 0, 1);
  const n = Math.max(1, Math.round(Number(attacks) || 1));
  return 1 - Math.pow(1 - p, n);
}

/**
 * Number of Eldritch Blast beams a Warlock fires at a given level.
 * Beams scale at levels 1, 5, 11, and 17.
 *
 * @param {number} level - Character level
 * @returns {number} Beam count (1–4)
 */
export function warlockBeamCount(level) {
  const lvl = Number(level) || 1;
  if (lvl >= 17) return 4;
  if (lvl >= 11) return 3;
  if (lvl >= 5)  return 2;
  return 1;
}

/**
 * Expected (average) Rogue Sneak Attack damage at a given level.
 * Sneak Attack = ⌈level/2⌉ d6.
 *
 * @param {number} level - Rogue level
 * @returns {number} Average Sneak Attack damage
 */
export function sneakAttackAvg(level) {
  const lvl = Math.max(1, Number(level) || 1);
  return Math.ceil(lvl / 2) * 3.5;
}

// =========================================================
// Sustained DPR
// =========================================================

/**
 * Compute sustained DPR with class-specific mechanics.
 *
 * @param {object} params
 * @param {string} params.classKey          - Class identifier (e.g. "rogue")
 * @param {number} params.level             - Character level
 * @param {number} params.attackBonus       - Total attack roll bonus (pb+mod+magic)
 * @param {number} params.targetAC          - Target Armor Class
 * @param {number} params.advantageRate     - Fraction of attacks with advantage [0,1]
 * @param {number} params.primaryMod        - Primary ability modifier
 * @param {number} params.weaponMagicBonus  - Magic bonus on the weapon
 * @param {number} params.attacks           - Base attacks per round
 * @param {Array}  params.featPlan          - Array of feat keys taken (e.g. ["gwm"])
 * @returns {number} Sustained DPR
 */
export function computeSustainedDpr({
  classKey,
  level,
  attackBonus,
  targetAC,
  advantageRate,
  primaryMod,
  weaponMagicBonus,
  attacks,
  featPlan,
}) {
  const feats       = featPlan || [];
  const cls         = getClassData(classKey);
  const weaponStyle = cls.weaponStyle;
  const magic       = validateMagicBonus(weaponMagicBonus);
  const avgDie      = (weaponStyle === "dex") ? AVG_DIE_FINESSE : AVG_DIE_HEAVY;
  const bonusDmg    = cls.features?.bonusDamagePerAttack || 0;

  // Warlock uses Eldritch Blast beam count instead of weapon attacks
  const effectiveAttacks = (classKey === "warlock")
    ? warlockBeamCount(level)
    : Math.max(1, Number(attacks) || 1);

  // Base hit chance
  let hitChance    = effectiveHitChance(attackBonus, targetAC, advantageRate);
  let perHitDamage = avgDie + primaryMod + magic + bonusDmg;

  // Great Weapon Master (heavy melee) / Sharpshooter (ranged):
  // optional −5 to hit, +10 damage — apply if it raises DPR.
  const hasGWM = feats.includes("gwm") && weaponStyle === "str";
  const hasSS  = feats.includes("sharpshooter") && weaponStyle === "dex";
  if (hasGWM || hasSS) {
    const penHitChance = effectiveHitChance(
      attackBonus - GWM_HIT_PENALTY, targetAC, advantageRate,
    );
    const normalDpr  = hitChance * perHitDamage;
    const penaltyDpr = penHitChance * (perHitDamage + GWM_DAMAGE_BONUS);
    if (penaltyDpr > normalDpr) {
      hitChance    = penHitChance;
      perHitDamage = perHitDamage + GWM_DAMAGE_BONUS;
    }
  }

  // Base per-attack damage for all attacks
  let sustainedDpr = Math.max(0, hitChance * perHitDamage * effectiveAttacks);

  // Polearm Master: bonus action d4 attack (str-based only)
  if (feats.includes("pam") && weaponStyle === "str") {
    const pamHit = effectiveHitChance(attackBonus, targetAC, advantageRate);
    sustainedDpr += pamHit * (PAM_BONUS_DIE_AVG + primaryMod + magic);
  }

  // Once-per-turn rider: Rogue Sneak Attack
  // Uses "at least one hit" probability so it does NOT multiply by attacks.
  if (classKey === "rogue") {
    const otpChance = atLeastOneHitChance(hitChance, effectiveAttacks);
    sustainedDpr += otpChance * sneakAttackAvg(level);
  }

  return sustainedDpr;
}

// =========================================================
// Burst DPR (Round 1)
// =========================================================

/**
 * Compute expected extra damage in round 1 from limited resources.
 * This is added to sustained DPR to give "Burst DPR (Round 1)".
 *
 * @param {object} params
 * @param {string} params.classKey          - Class identifier
 * @param {number} params.level             - Character level
 * @param {number} params.hitChance         - Single-attack hit probability
 * @param {number} params.primaryMod        - Primary ability modifier
 * @param {number} params.weaponMagicBonus  - Magic bonus on the weapon
 * @param {number} params.attacks           - Base attacks per round
 * @param {object} params.spellSlots        - Spell slot counts keyed by level (1–9)
 * @param {object} params.assumptions       - Optimizer assumptions object
 * @returns {number} Extra DPR in round 1 (added on top of sustained)
 */
export function computeBurstDprRound1({
  classKey,
  level,
  hitChance,
  primaryMod,
  weaponMagicBonus,
  attacks,
  spellSlots,
  assumptions,
}) {
  const { shortRests = 2, encountersPerDay = 4 } = assumptions || {};
  const magic        = validateMagicBonus(weaponMagicBonus);
  const cls          = getClassData(classKey);
  const avgDie       = (cls.weaponStyle === "dex") ? AVG_DIE_FINESSE : AVG_DIE_HEAVY;
  const perHitDamage = avgDie + primaryMod + magic;
  const safeAttacks  = Math.max(1, Number(attacks) || 1);

  if (classKey === "fighter") {
    // Action Surge: 1 use at levels 1–16; 2 uses from level 17.
    // Each use is recovered on a short rest.
    // Uses per day = base uses + min(base uses, shortRests used for recovery)
    const baseUses   = level >= 17 ? 2 : 1;
    const usesPerDay = baseUses + Math.min(baseUses, shortRests);
    // Expected uses per encounter (capped at 1 because we model round 1 only)
    const expected   = Math.min(1, usesPerDay / Math.max(1, encountersPerDay));
    // Action Surge grants one full extra Attack action = safeAttacks extra attacks
    return expected * hitChance * perHitDamage * safeAttacks;
  }

  if (classKey === "paladin") {
    // Divine Smite: each hit can expend a spell slot.
    // Prefer 2nd-level slot (2d8 = avg 9).
    const slots     = spellSlots || {};
    const smiteSlots = Object.entries(slots)
      .filter(([lv]) => Number(lv) >= 2)
      .reduce((sum, [, n]) => sum + (Number(n) || 0), 0);
    const slotsPerEncounter = smiteSlots / Math.max(1, encountersPerDay);
    // Assume one smite on round 1 if available
    const expected = Math.min(1, slotsPerEncounter);
    return expected * hitChance * DIVINE_SMITE_AVG_DICE;
  }

  if (classKey === "monk") {
    // Flurry of Blows: 1 Ki → 2 bonus attacks.
    // Ki points = level; recovered on short rest.
    const kiPerDay       = level + shortRests * level;
    const kiPerEncounter = kiPerDay / Math.max(1, encountersPerDay);
    const expected       = Math.min(1, kiPerEncounter);
    return expected * hitChance * perHitDamage * FLURRY_EXTRA_ATTACKS;
  }

  // All other classes: no explicitly modeled burst resource
  return 0;
}

/**
 * Initiative bonus from the Alert feat.
 *
 * @param {Array} featPlan - Array of feat keys
 * @returns {number}
 */
export function alertInitiativeBonus(featPlan) {
  return (featPlan || []).includes("alert") ? ALERT_INITIATIVE_BONUS : 0;
}

// =========================================================
// Browser global – attach to globalThis.DndDamageModel
// =========================================================
if (typeof globalThis !== "undefined") {
  globalThis.DndDamageModel = {
    atLeastOneHitChance,
    warlockBeamCount,
    sneakAttackAvg,
    computeSustainedDpr,
    computeBurstDprRound1,
    alertInitiativeBonus,
  };
}
