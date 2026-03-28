/* =========================================================
   optimizer-engine.js – Pure D&D 5e optimizer logic
   No DOM, no side-effects.  Safe to import from both the
   main thread and an optimizer Web Worker.
   ========================================================= */

import {
  ABILITIES,
  POINT_BUY_MAX_POINTS, POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE,
  MAX_MAGIC_BONUS,
  EHP_AC_BASELINE, EHP_AC_SCALAR,
  clamp, validateLevel, validateMagicBonus, validateClassKey,
  modFromScore, proficiencyBonus, pointBuyCost,
  getClassData, getEstimatedHP, getArmorClassEstimate, getCasterAbility,
  estimateAttacksPerRound, effectiveHitChance, saveFailChance,
} from "./dnd-engine.js";

import {
  SKILLS,
  ASI_LEVELS,
  MILESTONE_LEVELS,
  ABILITY_SCORE_MAX,
} from "./dnd-data.js";

import {
  AVG_DIE_FINESSE, AVG_DIE_HEAVY,
  NOVA_BURST_BONUS_FACTOR, BURST_FACTOR_CAP, BURST_FACTOR_PER_REST,
  DAMAGE_FEAT_BONUS, INITIATIVE_FEAT_BONUS,
  BASE_SPELL_DC,
  CONTROL_PRESSURE_PB_MULT, CONTROL_PRESSURE_BASE,
  CONTROL_CON_WEIGHT, CONTROL_NON_CASTER_FACTOR,
  SKILL_ROGUE_BONUS_MULT, SKILL_BARD_BONUS_MULT,
  STRENGTH_THRESHOLD_SUSTAINED_DPR, STRENGTH_THRESHOLD_NOVA_DPR,
  STRENGTH_THRESHOLD_EFFECTIVE_HP, STRENGTH_THRESHOLD_CONTROL, STRENGTH_THRESHOLD_SKILL,
  OBJECTIVE_WEIGHTS, OBJECTIVE_WEIGHTS_DEFAULT,
} from "./optimizer-constants.js";

// =========================================================
// Helpers
// =========================================================

/**
 * Determine the primary ability score for a given class and objective.
 */
export function getPrimaryAbilityForObjective(classKey, objective) {
  const cls = getClassData(classKey);

  if (objective === "controller") {
    return cls.defaultCastingAbility || "int";
  }

  if (objective === "skill") {
    if (classKey === "rogue") return "dex";
    if (classKey === "bard") return "cha";
    return cls.defaultCastingAbility || cls.weaponStyle || "dex";
  }

  // For full-casters in balanced mode, prioritise casting stat
  if (cls.spellcasting &&
      ["bard","cleric","druid","sorcerer","warlock","wizard"].includes(classKey)) {
    if (objective === "balanced") {
      return cls.defaultCastingAbility || "int";
    }
  }

  return cls.weaponStyle || "str";
}

/**
 * Auto-assign ability scores using point-buy optimisation.
 * Intelligently distributes 27 points based on class and objective.
 */
export function autoAssignPointBuy(classKey, objective) {
  const primary = getPrimaryAbilityForObjective(classKey, objective);
  const cls = getClassData(classKey);

  const secondary = objective === "tank" ? "con"
    : cls.spellcasting ? "con"
    : primary === "dex" ? "con"
    : "dex";

  const tertiary = objective === "controller" ? "con"
    : objective === "skill" ? "wis"
    : cls.defaultCastingAbility && cls.defaultCastingAbility !== primary
      ? cls.defaultCastingAbility
    : "wis";

  const scores    = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  const priorities = [
    primary, secondary, tertiary,
    ...ABILITIES.filter(a => ![primary, secondary, tertiary].includes(a)),
  ];
  const targets = [15, 14, 13, 12, 10, 8];

  priorities.forEach((ab, i) => { scores[ab] = targets[i] !== undefined ? targets[i] : 8; });

  let cost = ABILITIES.reduce((s, a) => s + pointBuyCost(scores[a]), 0);

  while (cost > POINT_BUY_MAX_POINTS) {
    const reducible = priorities.slice().reverse().find(
      a => scores[a] > POINT_BUY_MIN_SCORE && a !== primary
    );
    if (!reducible) break;
    scores[reducible]--;
    cost = ABILITIES.reduce((s, a) => s + pointBuyCost(scores[a]), 0);
  }

  while (cost < POINT_BUY_MAX_POINTS) {
    const upgradable = priorities.find(a => {
      if (scores[a] >= POINT_BUY_MAX_SCORE) return false;
      return (pointBuyCost(scores[a] + 1) - pointBuyCost(scores[a])) <= (POINT_BUY_MAX_POINTS - cost);
    });
    if (!upgradable) break;
    cost += pointBuyCost(scores[upgradable] + 1) - pointBuyCost(scores[upgradable]);
    scores[upgradable]++;
  }

  return scores;
}

/**
 * Get suggested skill proficiencies based on class and objective.
 */
export function getSuggestedSkills(classKey, objective) {
  const byObjective = {
    sustained_dpr: ["athletics","perception","stealth"],
    nova_dpr:      ["stealth","perception","acrobatics"],
    tank:          ["athletics","perception","insight"],
    controller:    ["arcana","insight","perception"],
    skill:         ["stealth","perception","persuasion"],
    balanced:      ["perception","insight","athletics"],
  };

  const byClass = {
    rogue:   ["stealth","perception","acrobatics","investigation"],
    bard:    ["persuasion","insight","perception","deception"],
    ranger:  ["perception","stealth","survival","athletics"],
    wizard:  ["arcana","investigation","history","insight"],
  };

  return byClass[classKey] || byObjective[objective] || ["perception","insight","athletics"];
}

/**
 * Evaluate a character build snapshot with comprehensive metrics.
 * Returns score and detailed breakdown of performance.
 */
export function evaluateBuildSnapshot(snapshot, assumptions, objective) {
  try {
    const pb         = proficiencyBonus(snapshot.level);
    const primary    = getPrimaryAbilityForObjective(snapshot.class, objective);
    const primaryMod = modFromScore(snapshot.abilities[primary]);
    const dexMod     = modFromScore(snapshot.abilities.dex);
    const conMod     = modFromScore(snapshot.abilities.con);
    const cls        = getClassData(snapshot.class);

    // Offensive
    const attackBonus   = pb + primaryMod + validateMagicBonus(assumptions.magicBonus);
    const avgDie        = cls.weaponStyle === "dex" ? AVG_DIE_FINESSE : AVG_DIE_HEAVY;
    const attacks       = estimateAttacksPerRound(snapshot.class, snapshot.level);
    const hitChance     = effectiveHitChance(attackBonus, assumptions.targetAC, assumptions.advantageRate);
    const bonusDamage   = cls.features?.bonusDamagePerAttack || 0;
    const perHitDamage  = avgDie + primaryMod + validateMagicBonus(assumptions.magicBonus) + bonusDamage;
    const sustainedDpr  = Math.max(0, hitChance * perHitDamage * attacks);

    // Nova / burst
    const hasShortRest  = (cls.features?.burstUsesPerShortRest || 0) > 0;
    const burstFactor   = hasShortRest
      ? 1 + Math.min(BURST_FACTOR_CAP, assumptions.shortRests * BURST_FACTOR_PER_REST)
      : 1;
    const burstBonus    = hasShortRest ? NOVA_BURST_BONUS_FACTOR : 0;
    const featBonus     = snapshot.featPlan?.includes("damage_feat") ? DAMAGE_FEAT_BONUS : 0;
    const novaDpr       = sustainedDpr * (1 + burstBonus) * burstFactor + featBonus;

    // Defensive
    const hp        = getEstimatedHP(snapshot.level, snapshot.class, conMod);
    const ac        = getArmorClassEstimate({
      ...snapshot,
      hasShield:      objective === "tank",
      armorMagicBonus: assumptions.magicBonus,
    }, dexMod);
    const effectiveHp = hp * (1 + (ac - EHP_AC_BASELINE) * EHP_AC_SCALAR);

    // Spellcasting
    const casterAbility  = cls.defaultCastingAbility || "int";
    const spellDc        = BASE_SPELL_DC + pb + modFromScore(snapshot.abilities[casterAbility]);
    const spellAttack    = pb + modFromScore(snapshot.abilities[casterAbility]) + validateMagicBonus(assumptions.magicBonus);
    const failChance     = saveFailChance(spellDc, assumptions.targetSaveBonus);
    const controlPressure = cls.spellcasting
      ? failChance * (CONTROL_PRESSURE_BASE + pb * CONTROL_PRESSURE_PB_MULT) +
        (modFromScore(snapshot.abilities.con) * CONTROL_CON_WEIGHT)
      : failChance * CONTROL_NON_CASTER_FACTOR;

    // Skills
    const skillKeys  = getSuggestedSkills(snapshot.class, objective);
    const skillScore = skillKeys.reduce((sum, k) => {
      const skill = SKILLS.find(s => s.key === k);
      if (!skill) return sum;
      return sum + modFromScore(snapshot.abilities[skill.ability]) + pb;
    }, 0)
      + (snapshot.class === "rogue" ? pb * SKILL_ROGUE_BONUS_MULT : 0)
      + (snapshot.class === "bard"  ? pb * SKILL_BARD_BONUS_MULT  : 0);

    // Misc
    const concentrationScore = cls.spellcasting
      ? (conMod + (cls.saveProficiencies.includes("con") ? pb : 0))
      : conMod;
    const initiativeBonus = snapshot.featPlan?.includes("initiative_feat") ? INITIATIVE_FEAT_BONUS : 0;
    const initiative      = dexMod + initiativeBonus;

    // Weighted score
    const W = OBJECTIVE_WEIGHTS[objective] || OBJECTIVE_WEIGHTS_DEFAULT;
    const score =
      sustainedDpr       * W.sustainedDpr +
      novaDpr            * W.novaDpr +
      effectiveHp        * W.effectiveHp +
      controlPressure    * W.controlPressure +
      skillScore         * W.skillScore +
      concentrationScore * W.concentrationScore +
      initiative         * W.initiative;

    return {
      score, sustainedDpr, novaDpr, effectiveHp, ac, hp,
      spellDc, spellAttack, controlPressure, skillScore,
      concentrationScore, initiative, hitChance, primary,
    };
  } catch (error) {
    console.error("Error evaluating build snapshot:", error, snapshot);
    return {
      score: 0, sustainedDpr: 0, novaDpr: 0, effectiveHp: 30, ac: 10, hp: 30,
      spellDc: 10, spellAttack: 0, controlPressure: 0, skillScore: 0,
      concentrationScore: 0, initiative: 0, hitChance: 0.5, primary: "str",
    };
  }
}

/**
 * Build a milestone progression plan showing character growth.
 * Returns array of level snapshots with metrics.
 */
export function buildMilestonePlan(baseClass, objective, assumptions) {
  try {
    const analysisLevel = validateLevel(assumptions.analysisLevel);
    const milestones    = MILESTONE_LEVELS.filter(n => n <= analysisLevel);

    return milestones.map(level => {
      const abilities  = autoAssignPointBuy(baseClass, objective);
      const featPlan   = [];
      const asiLevels  = ASI_LEVELS.filter(n => n <= level);
      const primary    = getPrimaryAbilityForObjective(baseClass, objective);
      const caster     = getClassData(baseClass).defaultCastingAbility;

      asiLevels.forEach((_, idx) => {
        const canTakeFeat        = assumptions.feats;
        const preferInitiative   = canTakeFeat && objective === "controller" && idx === 0;
        const preferDamage       = canTakeFeat && ["sustained_dpr","nova_dpr"].includes(objective) && idx === 0;

        if (preferInitiative) {
          featPlan.push("initiative_feat");
        } else if (preferDamage) {
          featPlan.push("damage_feat");
        } else {
          if (abilities[primary] < ABILITY_SCORE_MAX) {
            abilities[primary] = Math.min(ABILITY_SCORE_MAX, abilities[primary] + 2);
          } else if (abilities.con < 18) {
            abilities.con = Math.min(ABILITY_SCORE_MAX, abilities.con + 2);
          } else if (caster && abilities[caster] < ABILITY_SCORE_MAX) {
            abilities[caster] = Math.min(ABILITY_SCORE_MAX, abilities[caster] + 2);
          }
        }

        if (featPlan.length && abilities[primary] < 18 && idx > 0) {
          abilities[primary] = Math.min(ABILITY_SCORE_MAX, abilities[primary] + 2);
        }
      });

      const snapshot = { class: baseClass, level, abilities, featPlan };
      const metrics  = evaluateBuildSnapshot(snapshot, assumptions, objective);
      return { level, snapshot, metrics };
    });
  } catch (error) {
    console.error("Error building milestone plan:", error);
    return [];
  }
}

/**
 * Build a single class result entry (sync).
 * @param {string} classKey
 * @param {string} objective
 * @param {Object} assumptions
 * @returns {Object|null}
 */
export function buildOneClassResult(classKey, objective, assumptions) {
  try {
    const plan = buildMilestonePlan(classKey, objective, assumptions);
    if (!plan || plan.length === 0) return null;

    const finalStep = plan[plan.length - 1] || plan[0];
    if (!finalStep || !finalStep.metrics) return null;

    const score = finalStep.metrics.score || 0;
    const cls   = getClassData(classKey);

    const strengths = [];
    if (finalStep.metrics.sustainedDpr  >= STRENGTH_THRESHOLD_SUSTAINED_DPR) strengths.push("Strong sustained offense");
    if (finalStep.metrics.novaDpr       >= STRENGTH_THRESHOLD_NOVA_DPR)       strengths.push("Strong burst potential");
    if (finalStep.metrics.effectiveHp   >= STRENGTH_THRESHOLD_EFFECTIVE_HP)   strengths.push("High durability");
    if (finalStep.metrics.controlPressure >= STRENGTH_THRESHOLD_CONTROL)      strengths.push("Strong control");
    if (finalStep.metrics.skillScore    >= STRENGTH_THRESHOLD_SKILL)          strengths.push("High utility");
    if (cls.tags.includes("short_rest"))                                       strengths.push("Short-rest efficient");

    const tradeoffs = [];
    if (cls.hitDie <= 6) tradeoffs.push("Lower durability");
    if (!cls.spellcasting && objective === "controller") tradeoffs.push("Limited magical control");
    if (cls.armorType === "light" && objective === "tank") tradeoffs.push("Weaker armor scaling");
    if (cls.tags.includes("nova_dpr") && assumptions.roundsPerEncounter >= 5) {
      tradeoffs.push("Value dips in long fights");
    }

    return {
      classKey,
      classLabel: cls.label,
      score,
      plan,
      strengths,
      tradeoffs,
      summary: {
        primaryStat:  finalStep.metrics.primary,
        sustainedDpr: finalStep.metrics.sustainedDpr,
        novaDpr:      finalStep.metrics.novaDpr,
        effectiveHp:  finalStep.metrics.effectiveHp,
        spellDc:      finalStep.metrics.spellDc,
        initiative:   finalStep.metrics.initiative,
        ac:           finalStep.metrics.ac,
      },
    };
  } catch (error) {
    console.error(`Error generating build for ${classKey}:`, error);
    return null;
  }
}

/**
 * Generate optimised candidate builds for a given class pool (synchronous).
 * classPool must be a non-empty array of class key strings.
 * Returns sorted array of build recommendations.
 */
export function generateCandidateBuilds(classPool, objective, assumptions) {
  try {
    return classPool
      .map(k => buildOneClassResult(k, objective, assumptions))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Error generating candidate builds:", error);
    return [];
  }
}
