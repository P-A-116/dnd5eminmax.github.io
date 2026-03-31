// @ts-nocheck
/* =========================================================
   Optimizer / Scoring Constants
   Centralizes tuning knobs for the build evaluator and
   optimizer so they are easy to find, review, and change.
   ========================================================= */

// -------------------------------------------------------
// Weapon-style average die assumptions
// Used in evaluateBuildSnapshot when no specific weapon is
// attached to a build.  Finesse/ranged weapons default to a
// d8 (avg 4.5); heavy two-handed weapons default to a d10
// (avg 5.5).
// -------------------------------------------------------
/** Average damage roll assumed for finesse / ranged weapons (d8). */
export const AVG_DIE_FINESSE = 4.5;
/** Average damage roll assumed for heavy / two-handed weapons (d10). */
export const AVG_DIE_HEAVY   = 5.5;

// -------------------------------------------------------
// Feat mechanic constants
// Model the real D&D 5e feat trade-offs used in damage
// and initiative calculations.
// -------------------------------------------------------
/** Attack-roll penalty for Great Weapon Master / Sharpshooter optional feature. */
export const GWM_HIT_PENALTY   = 5;
/** Flat damage bonus for Great Weapon Master / Sharpshooter optional feature. */
export const GWM_DAMAGE_BONUS  = 10;
/** Average die damage for the Polearm Master bonus action attack (d4 → 2.5). */
export const PAM_BONUS_DIE_AVG = 2.5;
/** Initiative bonus granted by the Alert feat. */
export const ALERT_INITIATIVE_BONUS = 5;

// -------------------------------------------------------
// Burst / resource model constants
// Used by computeBurstDprRound1 in damage-model.js.
// -------------------------------------------------------
/** Average damage of a 2nd-level Divine Smite (2d8 = 9). */
export const DIVINE_SMITE_AVG_DICE = 9;
/** Extra attacks granted by Flurry of Blows (1 Ki → 2 bonus attacks). */
export const FLURRY_EXTRA_ATTACKS  = 2;

// -------------------------------------------------------
// Spellcasting / control pressure formula constants
// -------------------------------------------------------
/**
 * Base value added to spell DC before ability mod and proficiency bonus.
 * PHB rule: spell save DC = 8 + proficiency bonus + spellcasting mod.
 */
export const BASE_SPELL_DC = 8;

/**
 * Tunable per-slot-level weights for control-pressure scoring.
 * Higher spell levels exert more meaningful control in combat.
 */
export const CONTROL_SPELL_LEVEL_WEIGHTS = {
  1: 0.5,
  2: 0.8,
  3: 1.0,
  4: 1.2,
  5: 1.5,
  6: 1.8,
  7: 2.0,
  8: 2.3,
  9: 2.5,
};

// -------------------------------------------------------
// Skill score bonus constants
// -------------------------------------------------------
/** Extra skill-score multiplier for Rogues (Expertise on all chosen skills). */
export const SKILL_ROGUE_BONUS_MULT = 1.5;
/** Extra flat PB added to Bard skill score (Jack of All Trades / wide expertise). */
export const SKILL_BARD_BONUS_MULT  = 1;

// -------------------------------------------------------
// Candidate-build strength / weakness thresholds
// Used by generateCandidateBuilds to label notable metrics.
// -------------------------------------------------------
export const STRENGTH_THRESHOLD_SUSTAINED_DPR  = 12;
export const STRENGTH_THRESHOLD_BURST_DPR       = 18;
export const STRENGTH_THRESHOLD_EFFECTIVE_HP    = 70;
export const STRENGTH_THRESHOLD_CONTROL         = 6;
export const STRENGTH_THRESHOLD_SKILL           = 15;

// -------------------------------------------------------
// Objective weight presets
// Each entry defines how heavily each metric is weighted
// in the final build score for a given optimizer objective.
// Weights are relative; higher = more important.
// The key "burstDprRound1" replaces the old "novaDpr" to
// reflect the explicit resource-budget burst model.
// -------------------------------------------------------
export const OBJECTIVE_WEIGHTS = {
  sustained_dpr: {
    sustainedDpr:       1.4,
    burstDprRound1:     0.4,
    effectiveHp:        0.35,
    controlPressure:    0.15,
    skillScore:         0.1,
    concentrationScore: 0.1,
    initiative:         0.15,
  },
  nova_dpr: {
    sustainedDpr:       0.7,
    burstDprRound1:     1.5,
    effectiveHp:        0.2,
    controlPressure:    0.1,
    skillScore:         0.05,
    concentrationScore: 0.05,
    initiative:         0.2,
  },
  tank: {
    sustainedDpr:       0.35,
    burstDprRound1:     0.15,
    effectiveHp:        1.5,
    controlPressure:    0.2,
    skillScore:         0.05,
    concentrationScore: 0.2,
    initiative:         0.05,
  },
  controller: {
    sustainedDpr:       0.25,
    burstDprRound1:     0.25,
    effectiveHp:        0.25,
    controlPressure:    1.5,
    skillScore:         0.15,
    concentrationScore: 0.4,
    initiative:         0.2,
  },
  skill: {
    sustainedDpr:       0.25,
    burstDprRound1:     0.15,
    effectiveHp:        0.2,
    controlPressure:    0.2,
    skillScore:         1.6,
    concentrationScore: 0.1,
    initiative:         0.2,
  },
  balanced: {
    sustainedDpr:       0.8,
    burstDprRound1:     0.5,
    effectiveHp:        0.6,
    controlPressure:    0.6,
    skillScore:         0.4,
    concentrationScore: 0.2,
    initiative:         0.2,
  },
};

/** Fallback weight set when the requested objective is not in OBJECTIVE_WEIGHTS. */
export const OBJECTIVE_WEIGHTS_DEFAULT = {
  sustainedDpr:       1,
  burstDprRound1:     1,
  effectiveHp:        1,
  controlPressure:    1,
  skillScore:         1,
  concentrationScore: 1,
  initiative:         1,
};

// -------------------------------------------------------
// Async optimizer execution tuning
// -------------------------------------------------------
/**
 * Number of classes to process per chunk before yielding
 * control back to the browser event loop.
 * Smaller values → more responsive UI; larger values → slightly
 * faster total wall time.  2 is a good balance for ~12 classes.
 */
export const ASYNC_CHUNK_SIZE = 2;

/**
 * Minimum milliseconds between throttled progress UI updates
 * during the optimizer loop.  Keeps rendering overhead low
 * while still giving visible feedback.
 */
export const PROGRESS_THROTTLE_MS = 100;

// -------------------------------------------------------
// Default optimizer assumption values
// Used by validation.js defaultOptimizerAssumptions() and
// as the baseline for rule presets.
// weaponMagicBonus / armorMagicBonus / spellFocusBonus
// replace the old single magicBonus field so each budget
// can be tuned independently.
// -------------------------------------------------------
export const DEFAULT_ASSUMPTIONS = {
  feats:              true,
  multiclass:         true,
  weaponMagicBonus:   1,
  armorMagicBonus:    1,
  spellFocusBonus:    1,
  shortRests:         2,
  roundsPerEncounter: 4,
  encountersPerDay:   4,
  targetAC:           15,
  targetSaveBonus:    4,
  advantageRate:      0.25,
  analysisLevel:      8,
};
