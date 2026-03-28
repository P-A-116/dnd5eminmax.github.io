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
// Nova / burst damage multipliers
// Applied when a class has short-rest burst abilities that
// let it spike damage above its sustained baseline.
// -------------------------------------------------------
/**
 * Additive fraction of sustained DPR added as burst bonus.
 * A value of 0.6 means nova DPR = sustained × (1 + 0.6) × burstFactor.
 */
export const NOVA_BURST_BONUS_FACTOR = 0.6;
/**
 * Cap on the short-rest burst scaling factor.
 * Prevents runaway nova scores when shortRests is very high.
 */
export const BURST_FACTOR_CAP = 0.75;
/**
 * Per-short-rest contribution to the burst factor.
 * burstFactor = 1 + min(BURST_FACTOR_CAP, shortRests × BURST_FACTOR_PER_REST)
 */
export const BURST_FACTOR_PER_REST = 0.2;

// -------------------------------------------------------
// Feat bonus constants
// -------------------------------------------------------
/** Flat DPR added when a damage-boosting feat (e.g. Great Weapon Master) is taken. */
export const DAMAGE_FEAT_BONUS     = 1.5;
/** Flat initiative bonus granted by an initiative-boosting feat. */
export const INITIATIVE_FEAT_BONUS = 3;

// -------------------------------------------------------
// Spellcasting / control pressure formula constants
// -------------------------------------------------------
/**
 * Base value added to spell DC before ability mod and proficiency bonus.
 * PHB rule: spell save DC = 8 + proficiency bonus + spellcasting mod.
 */
export const BASE_SPELL_DC = 8;
/**
 * Proficiency multiplier used when estimating control pressure from spells.
 * Scales how much PB contributes to the raw "control pressure" metric.
 */
export const CONTROL_PRESSURE_PB_MULT  = 1.2;
/** Flat base added to the level-scaled part of spell control pressure. */
export const CONTROL_PRESSURE_BASE     = 10;
/**
 * CON mod weight in the control pressure score for non-concentration casters
 * (proxy for how well they maintain concentration on powerful spells).
 */
export const CONTROL_CON_WEIGHT        = 0.6;
/** Control pressure weight for non-casters (low but not zero). */
export const CONTROL_NON_CASTER_FACTOR = 2;

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
export const STRENGTH_THRESHOLD_NOVA_DPR        = 18;
export const STRENGTH_THRESHOLD_EFFECTIVE_HP    = 70;
export const STRENGTH_THRESHOLD_CONTROL         = 6;
export const STRENGTH_THRESHOLD_SKILL           = 15;

// -------------------------------------------------------
// Objective weight presets
// Each entry defines how heavily each metric is weighted
// in the final build score for a given optimizer objective.
// Weights are relative; higher = more important.
// -------------------------------------------------------
export const OBJECTIVE_WEIGHTS = {
  sustained_dpr: {
    sustainedDpr:       1.4,
    novaDpr:            0.4,
    effectiveHp:        0.35,
    controlPressure:    0.15,
    skillScore:         0.1,
    concentrationScore: 0.1,
    initiative:         0.15,
  },
  nova_dpr: {
    sustainedDpr:       0.7,
    novaDpr:            1.5,
    effectiveHp:        0.2,
    controlPressure:    0.1,
    skillScore:         0.05,
    concentrationScore: 0.05,
    initiative:         0.2,
  },
  tank: {
    sustainedDpr:       0.35,
    novaDpr:            0.15,
    effectiveHp:        1.5,
    controlPressure:    0.2,
    skillScore:         0.05,
    concentrationScore: 0.2,
    initiative:         0.05,
  },
  controller: {
    sustainedDpr:       0.25,
    novaDpr:            0.25,
    effectiveHp:        0.25,
    controlPressure:    1.5,
    skillScore:         0.15,
    concentrationScore: 0.4,
    initiative:         0.2,
  },
  skill: {
    sustainedDpr:       0.25,
    novaDpr:            0.15,
    effectiveHp:        0.2,
    controlPressure:    0.2,
    skillScore:         1.6,
    concentrationScore: 0.1,
    initiative:         0.2,
  },
  balanced: {
    sustainedDpr:       0.8,
    novaDpr:            0.5,
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
  novaDpr:            1,
  effectiveHp:        1,
  controlPressure:    1,
  skillScore:         1,
  concentrationScore: 1,
  initiative:         1,
};

// -------------------------------------------------------
// Default optimizer assumption values
// Used by validation.js defaultOptimizerAssumptions() and
// as the baseline for rule presets.
// -------------------------------------------------------
export const DEFAULT_ASSUMPTIONS = {
  feats:              true,
  multiclass:         true,
  magicBonus:         1,
  shortRests:         2,
  roundsPerEncounter: 4,
  encountersPerDay:   4,
  targetAC:           15,
  targetSaveBonus:    4,
  advantageRate:      0.25,
  analysisLevel:      8,
};
