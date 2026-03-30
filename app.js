/* =========================================================
   D&D 5e SRD-Safe Character Builder + Optimizer
   Vanilla JS – no frameworks, no external dependencies
   
   VERSION: 2.1 - Improved with better validation and error handling
   ========================================================= */

import {
  ABILITIES, CLASSES,
  POINT_BUY_MAX_POINTS, POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE,
  ABILITY_SCORE_MIN, ABILITY_SCORE_MAX,
  MAX_MAGIC_BONUS, BASE_AC,
  EHP_AC_BASELINE, EHP_AC_SCALAR,
  clamp, validateLevel, validateMagicBonus, validateClassKey, validateAbilityKey,
  escHtml,
  modFromScore, proficiencyBonus, pointBuyCost,
  getClassData, getEstimatedHP, getArmorClassEstimate, getCasterAbility,
  estimateAttacksPerRound, effectiveHitChance, saveFailChance,
  weaponAtkBonus, weaponAvgDamage,
  estimateSpellSlots,
} from "./dnd-engine.js";

import { normalizeState, validateState } from "./validation.js";

import { CancelToken, runOptimizerAsync } from "./optimizer-runner.js";

import {
  BASE_SPELL_DC,
  CONTROL_SPELL_LEVEL_WEIGHTS,
  SKILL_ROGUE_BONUS_MULT, SKILL_BARD_BONUS_MULT,
  STRENGTH_THRESHOLD_SUSTAINED_DPR, STRENGTH_THRESHOLD_BURST_DPR,
  STRENGTH_THRESHOLD_EFFECTIVE_HP, STRENGTH_THRESHOLD_CONTROL, STRENGTH_THRESHOLD_SKILL,
  OBJECTIVE_WEIGHTS, OBJECTIVE_WEIGHTS_DEFAULT,
} from "./optimizer-constants.js";

import {
  computeSustainedDpr,
  computeBurstDprRound1,
  alertInitiativeBonus,
} from "./damage-model.js";

import { buildFromCharacter } from "./effect-system.js";
import { computeDprFromState } from "./combat-engine.js";
import { computeControlPressure } from "./spell-evaluator.js";

// =========================================================
// CONSTANTS - App-specific magic numbers
// =========================================================
const MAX_SPELL_LEVEL = 9;

// ASI/Feat breakpoint levels
const ASI_LEVELS = [4, 8, 12, 16, 19];
const MILESTONE_LEVELS = [1, 3, 5, 8, 11, 17, 20];
// Sentinel used when a class never gains Extra Attack (ensures the condition is never true)
const EXTRA_ATTACK_NEVER = 99;

// DPR bar visualization scale (DPR value that maps to 100% bar width)
const DPR_BAR_MAX = 50;

// =========================================================
// 1. Data / Constants
// =========================================================
const CLASS_OPTIONS = Object.keys(CLASSES);

// D&D 5e multiclass ability score prerequisites (PHB p.163)
const MULTICLASS_PREREQS = {
  barbarian: { str: 13 },
  bard:      { cha: 13 },
  cleric:    { wis: 13 },
  druid:     { wis: 13 },
  fighter:   { str: 13 },
  monk:      { dex: 13, wis: 13 },
  paladin:   { str: 13, cha: 13 },
  ranger:    { dex: 13, wis: 13 },
  rogue:     { dex: 13 },
  sorcerer:  { cha: 13 },
  warlock:   { cha: 13 },
  wizard:    { int: 13 },
};

// Curated list of popular 2-class multiclass combinations (primary, secondary)
// Primary class determines armor type, primary attack style, and snapshot.class
const MULTICLASS_COMBOS = [
  { primary: "paladin",   secondary: "sorcerer"  }, // Sorcadin – CHA smites + Metamagic
  { primary: "paladin",   secondary: "warlock"   }, // Padlock – short-rest smite slots
  { primary: "fighter",   secondary: "warlock"   }, // Hexblade dip – CHA attacks + EB
  { primary: "fighter",   secondary: "rogue"     }, // Action Surge + Sneak Attack
  { primary: "sorcerer",  secondary: "warlock"   }, // Sorlock – EB + Quickened Spell
  { primary: "warlock",   secondary: "fighter"   }, // EB machine + Action Surge
  { primary: "barbarian", secondary: "rogue"     }, // Reckless Attack + Sneak Attack
  { primary: "cleric",    secondary: "fighter"   }, // Armor + martial + healing
  { primary: "paladin",   secondary: "bard"      }, // Full-caster smite slots
  { primary: "fighter",   secondary: "wizard"    }, // War Magic / Bladesinger
  { primary: "ranger",    secondary: "rogue"     }, // Skills + combat versatility
  { primary: "rogue",     secondary: "ranger"    }, // SA + Ranger utility spells
  { primary: "monk",      secondary: "rogue"     }, // Unarmed + Sneak Attack
  { primary: "cleric",    secondary: "paladin"   }, // Divine champion
  { primary: "barbarian", secondary: "fighter"   }, // Reckless + Action Surge
];

// Optimal ability-score priority orders for each multiclass combo.
// Key: "primary+secondary".  Value: ABILITIES sorted from highest to lowest priority.
const COMBO_ABILITY_PRIORITIES = {
  "paladin+sorcerer":  ["cha", "con", "str", "dex", "wis", "int"],
  "paladin+warlock":   ["cha", "con", "str", "dex", "wis", "int"],
  "fighter+warlock":   ["cha", "con", "str", "dex", "wis", "int"], // Hexblade uses CHA
  "fighter+rogue":     ["dex", "con", "str", "wis", "int", "cha"],
  "sorcerer+warlock":  ["cha", "con", "dex", "wis", "int", "str"],
  "warlock+fighter":   ["cha", "con", "str", "dex", "wis", "int"], // needs STR 13 for fighter entry
  "barbarian+rogue":   ["dex", "con", "str", "wis", "int", "cha"],
  "cleric+fighter":    ["str", "con", "wis", "dex", "int", "cha"],
  "paladin+bard":      ["cha", "con", "str", "dex", "wis", "int"],
  "fighter+wizard":    ["int", "con", "str", "dex", "wis", "cha"],
  "ranger+rogue":      ["dex", "con", "wis", "str", "int", "cha"],
  "rogue+ranger":      ["dex", "con", "wis", "str", "int", "cha"],
  "monk+rogue":        ["dex", "wis", "con", "str", "int", "cha"],
  "cleric+paladin":    ["cha", "str", "wis", "con", "dex", "int"], // needs STR 13 + CHA 13 for paladin
  "barbarian+fighter": ["str", "con", "dex", "wis", "int", "cha"],
};

const ABILITY_LABELS = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
];

const SKILLS = [
  { key: "acrobatics",    label: "Acrobatics",      ability: "dex" },
  { key: "animalHandling",label: "Animal Handling",  ability: "wis" },
  { key: "arcana",        label: "Arcana",           ability: "int" },
  { key: "athletics",     label: "Athletics",        ability: "str" },
  { key: "deception",     label: "Deception",        ability: "cha" },
  { key: "history",       label: "History",          ability: "int" },
  { key: "insight",       label: "Insight",          ability: "wis" },
  { key: "intimidation",  label: "Intimidation",     ability: "cha" },
  { key: "investigation", label: "Investigation",    ability: "int" },
  { key: "medicine",      label: "Medicine",         ability: "wis" },
  { key: "nature",        label: "Nature",           ability: "int" },
  { key: "perception",    label: "Perception",       ability: "wis" },
  { key: "performance",   label: "Performance",      ability: "cha" },
  { key: "persuasion",    label: "Persuasion",       ability: "cha" },
  { key: "religion",      label: "Religion",         ability: "int" },
  { key: "sleightOfHand", label: "Sleight of Hand",  ability: "dex" },
  { key: "stealth",       label: "Stealth",          ability: "dex" },
  { key: "survival",      label: "Survival",         ability: "wis" },
];

const RACES = ["Human","Dwarf","Elf","Halfling","Dragonborn","Gnome","Half-Elf","Half-Orc","Tiefling","Custom / Lineage"];
const BACKGROUNDS = ["Acolyte","Criminal","Folk Hero","Noble","Sage","Soldier","Artisan","Entertainer","Hermit","Custom"];

const OPTIMIZER_OBJECTIVES = [
  { key: "sustained_dpr", label: "Sustained DPR" },
  { key: "nova_dpr",      label: "Nova / Burst DPR" },
  { key: "tank",          label: "Tank / Effective HP" },
  { key: "controller",    label: "Control / Save Pressure" },
  { key: "skill",         label: "Skill Specialist" },
  { key: "balanced",      label: "Balanced All-Rounder" },
];

const RULE_PRESETS = {
  strict_srd: {
    label: "Strict SRD",
    feats: false, multiclass: false,
    weaponMagicBonus: 0, armorMagicBonus: 0, spellFocusBonus: 0,
    shortRests: 1, roundsPerEncounter: 3, encountersPerDay: 4,
    targetAC: 15, targetSaveBonus: 3, advantageRate: 0.1,
  },
  common_optimized: {
    label: "Common Optimized",
    feats: true, multiclass: true,
    weaponMagicBonus: 1, armorMagicBonus: 1, spellFocusBonus: 1,
    shortRests: 2, roundsPerEncounter: 4, encountersPerDay: 4,
    targetAC: 15, targetSaveBonus: 4, advantageRate: 0.25,
  },
  no_multiclass: {
    label: "Feats / No Multiclass",
    feats: true, multiclass: false,
    weaponMagicBonus: 0, armorMagicBonus: 0, spellFocusBonus: 0,
    shortRests: 2, roundsPerEncounter: 3, encountersPerDay: 5,
    targetAC: 16, targetSaveBonus: 5, advantageRate: 0.15,
  },
};

const DEFAULT_SKILLS_STATE = () => SKILLS.reduce((acc, s) => { acc[s.key] = { proficient: false, expertise: false }; return acc; }, {});
const DEFAULT_SPELL_SLOTS = () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 });
const STORAGE_KEY = "dnd5e_srd_safe_builder_v2_optimizer";

// =========================================================
// 2. Input Validation & Sanitization (app-specific)
// =========================================================

/**
 * Validates and clamps an ability score based on mode
 */
function validateAbilityScore(score, mode) {
  const num = Number(score);
  if (isNaN(num)) return mode === "pointbuy" ? POINT_BUY_MIN_SCORE : 10;
  
  if (mode === "pointbuy") {
    return clamp(num, POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE);
  }
  return clamp(num, ABILITY_SCORE_MIN, ABILITY_SCORE_MAX);
}

/**
 * Validates a spell slot level
 */
function validateSpellSlot(slot) {
  const num = Number(slot);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(num, MAX_SPELL_LEVEL);
}

// =========================================================
// 3. Optimizer Logic
// =========================================================

/**
 * Determine the primary ability score for a given class and objective
 */
function getPrimaryAbilityForObjective(classKey, objective) {
  const cls = getClassData(classKey);
  
  if (objective === "controller") {
    return cls.defaultCastingAbility || "int";
  }
  
  if (objective === "skill") {
    if (classKey === "rogue") return "dex";
    if (classKey === "bard") return "cha";
    return cls.defaultCastingAbility || cls.weaponStyle || "dex";
  }
  
  // For casters in balanced mode, prioritize casting stat
  if (cls.spellcasting && ["bard","cleric","druid","sorcerer","warlock","wizard"].includes(classKey)) {
    if (objective === "balanced") {
      return cls.defaultCastingAbility || "int";
    }
  }
  
  return cls.weaponStyle || "str";
}

/**
 * Auto-assign ability scores using point buy optimization
 * Intelligently distributes 27 points based on class and objective
 */
function autoAssignPointBuy(classKey, objective) {
  const primary = getPrimaryAbilityForObjective(classKey, objective);
  const cls = getClassData(classKey);
  
  // Determine secondary and tertiary stats
  const secondary = objective === "tank" ? "con" 
    : cls.spellcasting ? "con" 
    : primary === "dex" ? "con" 
    : "dex";
    
  const tertiary = objective === "controller" ? "con"
    : objective === "skill" ? "wis"
    : cls.defaultCastingAbility && cls.defaultCastingAbility !== primary ? cls.defaultCastingAbility
    : "wis";
  
  const priorities = [primary, secondary, tertiary,
    ...ABILITIES.filter(a => ![primary, secondary, tertiary].includes(a))];

  // Greedy allocation: start all scores at minimum, spend budget on
  // highest-priority stats first.
  const scores = Object.fromEntries(ABILITIES.map(a => [a, POINT_BUY_MIN_SCORE]));
  let remaining = POINT_BUY_MAX_POINTS;

  for (const ab of priorities) {
    while (scores[ab] < POINT_BUY_MAX_SCORE && remaining > 0) {
      const cost = pointBuyCost(scores[ab] + 1) - pointBuyCost(scores[ab]);
      if (cost > remaining) break;
      scores[ab]++;
      remaining -= cost;
    }
  }
  
  return scores;
}

// =========================================================
// 3a. Multiclass helpers
// =========================================================

/**
 * Allocate 27 point-buy points in the given priority order.
 * @param {string[]} priorityOrder - Ability keys from highest to lowest priority.
 * @returns {object} Map of ability key → score.
 */
function allocatePointBuy(priorityOrder) {
  const scores = Object.fromEntries(ABILITIES.map(a => [a, POINT_BUY_MIN_SCORE]));
  let remaining = POINT_BUY_MAX_POINTS;
  for (const ab of priorityOrder) {
    while (scores[ab] < POINT_BUY_MAX_SCORE && remaining > 0) {
      const cost = pointBuyCost(scores[ab] + 1) - pointBuyCost(scores[ab]);
      if (cost > remaining) break;
      scores[ab]++;
      remaining -= cost;
    }
  }
  return scores;
}

/**
 * Return true if the given ability scores meet the D&D 5e multiclass prerequisites
 * for the specified class key.
 */
function meetsMulticlassPrereqs(classKey, abilityScores) {
  const prereqs = MULTICLASS_PREREQS[classKey] || {};
  return Object.entries(prereqs).every(([ab, min]) => (abilityScores[ab] || 0) >= min);
}

/**
 * Compute multiclass spell slots using the combined-caster-level rule.
 * Full casters contribute their full class level; half-casters contribute
 * half (rounded down); pact casters add their slots separately.
 *
 * @returns {object} Map of slot level (1-9) → count.
 */
function computeMulticlassSpellSlots(primaryClass, primaryLevel, secondaryClass, secondaryLevel) {
  const primaryCls   = getClassData(primaryClass);
  const secondaryCls = getClassData(secondaryClass);

  let combinedCasterLevel = 0;
  if (primaryCls.spellcasting === "full")  combinedCasterLevel += primaryLevel;
  else if (primaryCls.spellcasting === "half") combinedCasterLevel += Math.floor(primaryLevel / 2);

  if (secondaryCls.spellcasting === "full")  combinedCasterLevel += secondaryLevel;
  else if (secondaryCls.spellcasting === "half") combinedCasterLevel += Math.floor(secondaryLevel / 2);

  // Regular slots from the full-caster table (use wizard as proxy)
  const regular = combinedCasterLevel > 0 ? estimateSpellSlots("wizard", combinedCasterLevel) : {};
  const result = { ...regular };

  // Pact magic slots added on top
  for (const [cls, lvl] of [[primaryClass, primaryLevel], [secondaryClass, secondaryLevel]]) {
    if (getClassData(cls).spellcasting === "pact") {
      const pact = estimateSpellSlots(cls, lvl);
      Object.entries(pact).forEach(([lv, ct]) => {
        const k = Number(lv);
        result[k] = (result[k] || 0) + ct;
      });
    }
  }

  return result;
}

/**
 * Generate all multiclass candidate entries for the given analysis level.
 * Each entry encodes the two classes and their level split.
 * @param {number} analysisLevel
 * @returns {Array<{primary, secondary, primaryLevel, secondaryLevel}>}
 */
function generateMulticlassCandidates(analysisLevel) {
  const level = validateLevel(analysisLevel);
  const candidates = [];

  // Secondary dip sizes to try; always includes 1, 2, 3, and a few larger splits
  const secLevels = new Set([1, 2, 3, Math.floor(level / 3), Math.floor(level / 2)].filter(n => n >= 1 && n <= level - 1));

  for (const combo of MULTICLASS_COMBOS) {
    for (const secLvl of secLevels) {
      const primLvl = level - secLvl;
      if (primLvl < 1) continue;
      candidates.push({
        primary: combo.primary,
        secondary: combo.secondary,
        primaryLevel: primLvl,
        secondaryLevel: secLvl,
      });
    }
  }
  return candidates;
}

/**
 * Get suggested skill proficiencies based on class and objective
 */
function getSuggestedSkills(classKey, objective) {
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
 * Evaluate a character build snapshot with comprehensive metrics
 * Returns score and detailed breakdown of performance
 */
function evaluateBuildSnapshot(snapshot, assumptions, objective) {
  try {
    const pb = proficiencyBonus(snapshot.level);
    const primary = getPrimaryAbilityForObjective(snapshot.class, objective);
    const primaryMod = modFromScore(snapshot.abilities[primary]);
    const dexMod = modFromScore(snapshot.abilities.dex);
    const conMod = modFromScore(snapshot.abilities.con);
    const cls = getClassData(snapshot.class);

    // Split magic bonuses from assumptions
    const weaponMagic = validateMagicBonus(assumptions.weaponMagicBonus ?? assumptions.magicBonus ?? 0);
    const armorMagic  = validateMagicBonus(assumptions.armorMagicBonus  ?? assumptions.magicBonus ?? 0);
    const spellMagic  = validateMagicBonus(assumptions.spellFocusBonus  ?? assumptions.magicBonus ?? 0);

    // Offensive capabilities
    const attackBonus = pb + primaryMod + weaponMagic;
    // Use _primaryLevel when set (multiclass builds) so Extra Attack is checked
    // against the primary-class level, not the total character level.
    const attacksLevel = snapshot._primaryLevel ?? snapshot.level;
    const attacks = estimateAttacksPerRound(snapshot.class, attacksLevel);
    const hitChance = effectiveHitChance(attackBonus, assumptions.targetAC, assumptions.advantageRate);

    // Spell slots: use snapshot's actual slots, falling back to level-based estimate
    const spellSlots = (snapshot.spellcasting?.slots
      && Object.values(snapshot.spellcasting.slots).some(v => v > 0))
      ? snapshot.spellcasting.slots
      : estimateSpellSlots(snapshot.class, snapshot.level);

    // DPR: try the new combat engine first; fall back to damage-model.js
    let sustainedDpr, burstDprRound1;
    try {
      const engineState = buildFromCharacter(
        snapshot,
        snapshot.featPlan || [],
        { weaponMagicBonus: weaponMagic, armorMagicBonus: armorMagic },
      );
      const dprResult = computeDprFromState(engineState, {
        targetAC:           assumptions.targetAC,
        targetSaveBonus:    assumptions.targetSaveBonus,
        advantageRate:      assumptions.advantageRate,
        roundsPerEncounter: assumptions.roundsPerEncounter || 4,
      });
      sustainedDpr  = dprResult.sustainedDpr;
      // burstRound1 from the engine is extra over the average; combine with sustained
      burstDprRound1 = dprResult.sustainedDpr + dprResult.burstDprRound1;
    } catch (_engineError) {
      // Fallback: legacy damage-model.js path
      sustainedDpr = computeSustainedDpr({
        classKey:         snapshot.class,
        level:            snapshot.level,
        attackBonus,
        targetAC:         assumptions.targetAC,
        advantageRate:    assumptions.advantageRate,
        primaryMod,
        weaponMagicBonus: weaponMagic,
        attacks,
        featPlan:         snapshot.featPlan,
      });
      const burstExtra = computeBurstDprRound1({
        classKey:         snapshot.class,
        level:            snapshot.level,
        hitChance,
        primaryMod,
        weaponMagicBonus: weaponMagic,
        attacks,
        spellSlots,
        assumptions,
      });
      burstDprRound1 = sustainedDpr + burstExtra;
    }

    // Defensive capabilities
    const hp = getEstimatedHP(snapshot.level, snapshot.class, conMod);
    const ac = getArmorClassEstimate({ 
      ...snapshot, 
      hasShield: objective === "tank", 
      armorMagicBonus: armorMagic,
    }, dexMod);
    const acDelta = Math.min(ac - EHP_AC_BASELINE, 10);
    const effectiveHp = hp * (1 + acDelta * EHP_AC_SCALAR);

    // Spellcasting metrics
    const casterAbility = cls.defaultCastingAbility || "int";
    const spellDc = BASE_SPELL_DC + pb + modFromScore(snapshot.abilities[casterAbility]);
    const spellAttack = pb + modFromScore(snapshot.abilities[casterAbility]) + spellMagic;
    const failChance = saveFailChance(spellDc, assumptions.targetSaveBonus);

    // Control pressure: use spell-evaluator engine when available, with slot-budget fallback
    let controlPressure = 0;
    if (cls.spellcasting) {
      try {
        const spellCtx = {
          spellDC:         spellDc,
          spellAttack,
          castingMod:      modFromScore(snapshot.abilities[casterAbility]),
          casterLevel:     snapshot.level,
          targetAC:        assumptions.targetAC,
          targetSaveBonus: assumptions.targetSaveBonus,
          targetDPR:       12,
          partyDPR:        25,
          enemyCount:      1,
          roundsLeft:      assumptions.roundsPerEncounter || 4,
        };
        controlPressure = computeControlPressure(spellSlots, spellCtx);
      } catch (_cpError) {
        // Fallback: legacy slot-budget model
        const weightedSlots = Object.entries(spellSlots).reduce((sum, [lv, count]) => {
          const weight = CONTROL_SPELL_LEVEL_WEIGHTS[Number(lv)] || 1;
          return sum + (Number(count) || 0) * weight;
        }, 0);
        const attemptsPerEncounter = weightedSlots / Math.max(1, assumptions.encountersPerDay || 4);
        controlPressure = failChance * attemptsPerEncounter;
      }
    }
    // Non-casters: no save-forcing control in base model (near zero)

    // Skill proficiency score
    const skillKeys = getSuggestedSkills(snapshot.class, objective);
    const skillScore = skillKeys.reduce((sum, k) => {
      const skill = SKILLS.find(s => s.key === k);
      if (!skill) return sum;
      return sum + modFromScore(snapshot.abilities[skill.ability]) + pb;
    }, 0) + (snapshot.class === "rogue" ? pb * SKILL_ROGUE_BONUS_MULT : 0) + (snapshot.class === "bard" ? pb * SKILL_BARD_BONUS_MULT : 0);

    // Concentration and initiative
    const concentrationScore = cls.spellcasting
      ? (conMod + (cls.saveProficiencies.includes("con") ? pb : 0))
      : conMod;
    const initiative = dexMod + alertInitiativeBonus(snapshot.featPlan);

    // Calculate weighted score based on objective
    const W = OBJECTIVE_WEIGHTS[objective] || OBJECTIVE_WEIGHTS_DEFAULT;

    const score = sustainedDpr*W.sustainedDpr + burstDprRound1*W.burstDprRound1 + effectiveHp*W.effectiveHp +
      controlPressure*W.controlPressure + skillScore*W.skillScore + concentrationScore*W.concentrationScore + initiative*W.initiative;

    return { 
      score, sustainedDpr, burstDprRound1, effectiveHp, ac, hp, 
      spellDc, spellAttack, controlPressure, skillScore, 
      concentrationScore, initiative, hitChance, primary 
    };
  } catch (error) {
    console.error("Error evaluating build snapshot:", error, snapshot);
    // Return safe defaults
    return {
      score: 0, sustainedDpr: 0, burstDprRound1: 0, effectiveHp: 30, ac: 10, hp: 30,
      spellDc: 10, spellAttack: 0, controlPressure: 0, skillScore: 0,
      concentrationScore: 0, initiative: 0, hitChance: 0.5, primary: "str"
    };
  }
}

/**
 * Build a milestone progression plan showing character growth
 * Returns array of level snapshots with metrics
 */
function buildMilestonePlan(baseClass, objective, assumptions) {
  try {
    const analysisLevel = validateLevel(assumptions.analysisLevel);
    const milestones = MILESTONE_LEVELS.filter(n => n <= analysisLevel);
    const primary = getPrimaryAbilityForObjective(baseClass, objective);
    const caster = getClassData(baseClass).defaultCastingAbility;
    const weaponStyle = getClassData(baseClass).weaponStyle;

    // Compute base scores once — not per-milestone
    const baseAbilities = autoAssignPointBuy(baseClass, objective);

    return milestones.map(level => {
      const abilities = { ...baseAbilities };
      const featPlan = [];
      const asiLevels = ASI_LEVELS.filter(n => n <= level);
      
      // Simulate ASI/feat choices
      asiLevels.forEach((_, idx) => {
        const canTakeFeat = assumptions.feats;

        // Pick the most appropriate feat for this class/objective/slot
        const wantsDmgFeat  = canTakeFeat && ["sustained_dpr","nova_dpr"].includes(objective) && idx === 0;
        // Alert at ASI 2 (level 8) so the primary casting stat is boosted first at ASI 1.
        const wantsInitFeat = canTakeFeat && objective === "controller" && idx === 1;
        // PAM at ASI 2 for str melee sustained-DPR builds (GWM taken first at ASI 1).
        const wantsPamFeat  = (canTakeFeat && objective === "sustained_dpr" && weaponStyle === "str"
                               && idx === 1 && featPlan.includes("gwm"));

        if (wantsInitFeat) {
          featPlan.push("alert");
        } else if (wantsPamFeat) {
          featPlan.push("pam");
        } else if (wantsDmgFeat) {
          // Choose the damage feat appropriate for this weapon style
          if (weaponStyle === "str") {
            featPlan.push("gwm");
          } else if (weaponStyle === "dex") {
            featPlan.push("sharpshooter");
          } else {
            // Casters or unsupported: skip feat, take ASI instead
            if (abilities[primary] < ABILITY_SCORE_MAX) {
              abilities[primary] = Math.min(ABILITY_SCORE_MAX, abilities[primary] + 2);
            }
          }
        } else {
          // Take ASI to boost primary, then con, then caster stat
          if (abilities[primary] < ABILITY_SCORE_MAX) {
            abilities[primary] = Math.min(ABILITY_SCORE_MAX, abilities[primary] + 2);
          } else if (abilities.con < 18) {
            abilities.con = Math.min(ABILITY_SCORE_MAX, abilities.con + 2);
          } else if (caster && abilities[caster] < ABILITY_SCORE_MAX) {
            abilities[caster] = Math.min(ABILITY_SCORE_MAX, abilities[caster] + 2);
          }
        }
        
        // Allow catching up primary stat after taking a feat
        if (featPlan.length && abilities[primary] < 18 && idx > 0) {
          abilities[primary] = Math.min(ABILITY_SCORE_MAX, abilities[primary] + 2);
        }
      });

      // Include estimated spell slots so control pressure and burst compute correctly
      const estimatedSlots = estimateSpellSlots(baseClass, level);
      const castAbility = caster || "int";
      const snapshot = {
        class: baseClass,
        level,
        abilities,
        featPlan,
        spellcasting: { slots: estimatedSlots, castingAbility: castAbility },
      };
      const metrics = evaluateBuildSnapshot(snapshot, assumptions, objective);
      return { level, snapshot, metrics };
    });
  } catch (error) {
    console.error("Error building milestone plan:", error);
    return [];
  }
}

/**
 * Build a single class result entry (sync).
 * Called for each class key by both the synchronous
 * generateCandidateBuilds helper and the async runner.
 *
 * @param {string} classKey
 * @param {string} objective
 * @param {Object} assumptions
 * @returns {Object|null}
 */
function buildOneClassResult(classKey, objective, assumptions) {
  try {
    const plan = buildMilestonePlan(classKey, objective, assumptions);
    if (!plan || plan.length === 0) return null;

    const finalStep = plan[plan.length - 1] || plan[0];
    if (!finalStep || !finalStep.metrics) return null;

    const score = finalStep.metrics.score || 0;
    const cls = getClassData(classKey);

    // Identify strengths
    const strengths = [];
    if (finalStep.metrics.sustainedDpr >= STRENGTH_THRESHOLD_SUSTAINED_DPR) strengths.push("Strong sustained offense");
    if (finalStep.metrics.burstDprRound1 >= STRENGTH_THRESHOLD_BURST_DPR)   strengths.push("Strong burst potential");
    if (finalStep.metrics.effectiveHp >= STRENGTH_THRESHOLD_EFFECTIVE_HP)    strengths.push("High durability");
    if (finalStep.metrics.controlPressure >= STRENGTH_THRESHOLD_CONTROL)     strengths.push("Strong control");
    if (finalStep.metrics.skillScore >= STRENGTH_THRESHOLD_SKILL)            strengths.push("High utility");
    if (cls.tags.includes("short_rest"))                                      strengths.push("Short-rest efficient");

    // Identify tradeoffs
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
        primaryStat: finalStep.metrics.primary,
        sustainedDpr: finalStep.metrics.sustainedDpr,
        burstDprRound1: finalStep.metrics.burstDprRound1,
        effectiveHp: finalStep.metrics.effectiveHp,
        spellDc: finalStep.metrics.spellDc,
        initiative: finalStep.metrics.initiative,
        ac: finalStep.metrics.ac,
      },
    };
  } catch (error) {
    console.error(`Error generating build for ${classKey}:`, error);
    return null;
  }
}

/**
 * Build a single multiclass result entry (sync).
 * Called for each multiclass combo entry by the async runner.
 *
 * @param {{primary, secondary, primaryLevel, secondaryLevel}} combo
 * @param {string} objective
 * @param {Object} assumptions
 * @returns {Object|null}
 */
function buildOneMulticlassResult(combo, objective, assumptions) {
  try {
    const { primary, secondary, primaryLevel, secondaryLevel } = combo;
    const totalLevel = primaryLevel + secondaryLevel;
    const primaryCls   = getClassData(primary);
    const secondaryCls = getClassData(secondary);

    // Ability score allocation using combo-specific priority order
    const comboKey = `${primary}+${secondary}`;
    const priorityOrder = COMBO_ABILITY_PRIORITIES[comboKey] ||
      [primaryCls.weaponStyle || "str", "con", "dex", "wis", "int", "cha"];
    const abilities = allocatePointBuy(priorityOrder);

    // Both classes' prerequisites must be satisfied
    if (!meetsMulticlassPrereqs(primary,   abilities)) return null;
    if (!meetsMulticlassPrereqs(secondary, abilities)) return null;

    // Simulate ASI upgrades for the primary stat
    const primaryAbility = priorityOrder[0];
    const asiCount = ASI_LEVELS.filter(n => n <= totalLevel).length;
    for (let i = 0; i < asiCount; i++) {
      if (abilities[primaryAbility] < ABILITY_SCORE_MAX) {
        abilities[primaryAbility] = Math.min(ABILITY_SCORE_MAX, abilities[primaryAbility] + 2);
      }
    }

    // Compute multiclass spell slots
    const spellSlots = computeMulticlassSpellSlots(primary, primaryLevel, secondary, secondaryLevel);

    // Casting ability: prefer primary's, fall back to secondary's
    const castingAbility = primaryCls.defaultCastingAbility || secondaryCls.defaultCastingAbility || "int";

    // Snapshot: class = primary (determines armor, feat lists, base proficiencies)
    // _primaryLevel allows evaluateBuildSnapshot to use the correct level for Extra Attack
    const snapshot = {
      class: primary,
      level: totalLevel,
      _primaryLevel: primaryLevel,
      abilities,
      featPlan: [],
      spellcasting: { slots: spellSlots, castingAbility },
      multiclassData: { secondary, secondaryLevel },
    };

    const metrics = evaluateBuildSnapshot(snapshot, assumptions, objective);
    const score   = metrics.score || 0;

    const classLabel = `${primaryCls.label} ${primaryLevel} / ${secondaryCls.label} ${secondaryLevel}`;

    // Strengths
    const strengths = [];
    if (metrics.sustainedDpr  >= STRENGTH_THRESHOLD_SUSTAINED_DPR) strengths.push("Strong sustained offense");
    if (metrics.burstDprRound1 >= STRENGTH_THRESHOLD_BURST_DPR)    strengths.push("Strong burst potential");
    if (metrics.effectiveHp   >= STRENGTH_THRESHOLD_EFFECTIVE_HP)  strengths.push("High durability");
    if (metrics.controlPressure >= STRENGTH_THRESHOLD_CONTROL)     strengths.push("Strong control");
    if (metrics.skillScore    >= STRENGTH_THRESHOLD_SKILL)         strengths.push("High utility");

    // Multiclass-specific strengths
    const hasNewCasting = !primaryCls.spellcasting && secondaryCls.spellcasting;
    if (hasNewCasting) strengths.push("Gained spellcasting");
    const bothMartial = !primaryCls.spellcasting && !secondaryCls.spellcasting;
    if (bothMartial) strengths.push("Full martial progression");

    // Tradeoffs
    const tradeoffs = [];
    const avgHitDie = (primaryCls.hitDie * primaryLevel + secondaryCls.hitDie * secondaryLevel) / totalLevel;
    if (avgHitDie < 8)  tradeoffs.push("Reduced hit points");
    if (primaryCls.armorType === "light" && objective === "tank") tradeoffs.push("Weaker armor");
    const hasExtraAttackPrimary   = primaryCls.features?.extraAttackLevel   !== null &&
                                     primaryLevel   >= (primaryCls.features?.extraAttackLevel   || EXTRA_ATTACK_NEVER);
    const hasExtraAttackSecondary = secondaryCls.features?.extraAttackLevel !== null &&
                                     secondaryLevel >= (secondaryCls.features?.extraAttackLevel || EXTRA_ATTACK_NEVER);
    if (!hasExtraAttackPrimary && !hasExtraAttackSecondary &&
        (primaryCls.features?.extraAttackLevel || secondaryCls.features?.extraAttackLevel)) {
      tradeoffs.push("No Extra Attack at this split");
    }

    // Build a minimal plan array (compatible with applyBuildResult)
    const plan = [{ level: totalLevel, snapshot, metrics }];

    return {
      classKey:       primary,
      classLabel,
      isMulticlass:   true,
      multiclassData: { primary, secondary, primaryLevel, secondaryLevel },
      score,
      plan,
      strengths,
      tradeoffs,
      summary: {
        primaryStat:    metrics.primary,
        sustainedDpr:   metrics.sustainedDpr,
        burstDprRound1: metrics.burstDprRound1,
        effectiveHp:    metrics.effectiveHp,
        spellDc:        metrics.spellDc,
        initiative:     metrics.initiative,
        ac:             metrics.ac,
      },
    };
  } catch (error) {
    console.error(`Error generating multiclass build ${combo.primary}/${combo.secondary}:`, error);
    return null;
  }
}

// =========================================================
// 4. State Model
// =========================================================

// Active cancel token; null when no optimization is running.
let _currentCancelToken = null;

/**
 * Generate a unique ID with crypto fallback
 */
function safeId() {
  try { 
    return crypto.randomUUID(); 
  } catch { 
    return Math.random().toString(36).slice(2) + Date.now().toString(36); 
  }
}


/**
 * Create a default character state object
 */
function createDefaultCharacter() {
  return {
    identity: { name: "", player: "", subclass: "", race: "Human", background: "Soldier", alignment: "True Neutral" },
    class: "fighter",
    level: 1,
    abilityMode: "standard",
    abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    skills: DEFAULT_SKILLS_STATE(),
    weapons: [{ id: safeId(), name: "Longsword", ability: "str", proficient: true, magicBonus: 0, damage: "1d8+STR" }],
    spellcasting: { castingAbility: "int", slots: DEFAULT_SPELL_SLOTS(), knownSpells: "", preparedSpells: "" },
    features: "", traits: "", notes: "",
    equipment: ["Backpack","Bedroll","Rations"],
    hasShield: false,
    armorMagicBonus: 0,
    optimizer: {
      objective: "balanced",
      rulePreset: "common_optimized",
      assumptions: { ...RULE_PRESETS.common_optimized, analysisLevel: 8 },      results: [],
    },
  };
}

/**
 * Hydrate and validate character data from storage or import.
 * Delegates to normalizeState() for canonical normalization, then ensures
 * app-specific defaults (e.g. default weapon) are in place.
 */
function hydrateCharacter(raw) {
  const def = createDefaultCharacter();
  try {
    const normalized = normalizeState(raw);
    // App-specific default: ensure at least one weapon exists
    if (normalized.weapons.length === 0) {
      normalized.weapons = def.weapons;
    }
    // Preserve existing optimizer results (normalizeState clears them)
    if (raw && raw.optimizer && Array.isArray(raw.optimizer.results)) {
      normalized.optimizer.results = raw.optimizer.results;
    }
    return normalized;
  } catch (error) {
    console.error("Error hydrating character:", error);
    setStatus("⚠ Character data partially corrupted, using defaults", true);
    return def;
  }
}

// =========================================================
// 5. Persistence (with error handling)
// =========================================================

let _saveTimer = null;

/**
 * Schedule a delayed save to localStorage.
 * Debounced to avoid excessive writes; normalizes before persisting.
 */
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const normalized = normalizeState(state);
      // Preserve optimizer results (normalizeState clears them)
      normalized.optimizer.results = state.optimizer.results;
      const json = JSON.stringify(normalized);
      localStorage.setItem(STORAGE_KEY, json);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        // Save without optimizer results to fit within quota
        try {
          const minimal = normalizeState(state);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        } catch { /* ignore secondary failure */ }
        setStatus("⚠ Storage full — results not saved", true);
      } else {
        console.error("Save failed:", e);
        setStatus("⚠ Save failed: " + e.message, true);
      }
    }
  }, 400);
}

/**
 * Load character from localStorage with error handling
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return hydrateCharacter(parsed);
    }
  } catch (error) {
    console.error("Load failed:", error);
    setStatus("⚠ Could not load saved character", true);
  }
  return createDefaultCharacter();
}

// =========================================================
// 6. App State
// =========================================================
let state = loadFromStorage();

/**
 * Update status bar with message
 */
function setStatus(msg, warn) {
  const el = document.getElementById("status-msg");
  if (el) { 
    el.textContent = msg; 
    el.style.color = warn ? "#f85149" : ""; 
  }
}

/**
 * Show validation issues in the diagnostics panel.
 * Pass an empty array (or nothing) to clear/hide the panel.
 */
function showValidationIssues(issues) {
  const panel = document.getElementById("validation-panel");
  if (!panel) return;

  if (!issues || issues.length === 0) {
    panel.className = "hidden";
    panel.innerHTML = "";
    return;
  }

  const errors   = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const hasErrors = errors.length > 0;

  panel.className = hasErrors ? "vp-has-errors" : "vp-has-warnings";

  const summaryClass = hasErrors ? "vp-error-label" : "vp-warning-label";
  const summaryText  = hasErrors
    ? `⛔ ${errors.length} error(s)${warnings.length ? `, ${warnings.length} warning(s)` : ""} — some fields were corrected or defaulted.`
    : `⚠ ${warnings.length} warning(s) — data was imported with minor corrections.`;

  panel.innerHTML = `
    <span class="vp-summary ${summaryClass}">${summaryText}</span>
    <button class="vp-toggle" id="vp-toggle-btn" aria-expanded="false" aria-controls="vp-details">▼ Details</button>
    <div id="vp-details" class="vp-details hidden" role="list">
      ${issues.map(i => `<div class="vp-issue ${i.severity}" role="listitem"><strong>${escHtml(i.path)}:</strong> ${escHtml(i.message)}</div>`).join("")}
    </div>
  `;

  document.getElementById("vp-toggle-btn").addEventListener("click", function () {
    const det = document.getElementById("vp-details");
    const expanded = !det.classList.contains("hidden");
    det.classList.toggle("hidden", expanded);
    this.setAttribute("aria-expanded", String(!expanded));
    this.textContent = expanded ? "▼ Details" : "▲ Hide";
  });
}

// =========================================================
// 7. DOM Helpers
// =========================================================
function qs(sel) { return document.querySelector(sel); }

/**
 * Populate a select element with options
 */
function populateSelect(id, options, current) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = "";
  options.forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function fmtMod(n) { return n >= 0 ? "+" + n : String(n); }
function fmtFixed(n, d=1) { return Number(n).toFixed(d); }

// =========================================================
// 8. Render Functions
// =========================================================

// --- Identity ---
function renderIdentity() {
  const s = state;
  document.getElementById("f-name").value = s.identity.name;
  document.getElementById("f-player").value = s.identity.player;
  document.getElementById("f-subclass").value = s.identity.subclass;
  document.getElementById("f-level").value = s.level;
  populateSelect("f-class", CLASS_OPTIONS.map(k => [k, CLASSES[k].label]), s.class);
  populateSelect("f-race", RACES.map(r => [r, r]), s.identity.race);
  populateSelect("f-background", BACKGROUNDS.map(b => [b, b]), s.identity.background);
  populateSelect("f-alignment", ALIGNMENTS.map(a => [a, a]), s.identity.alignment);
}

// --- Abilities ---
function renderAbilities() {
  const pb = proficiencyBonus(state.level);
  const cls = getClassData(state.class);
  const grid = document.getElementById("ability-grid");
  if (!grid) return;
  grid.innerHTML = "";
  ABILITIES.forEach(ab => {
    const score = state.abilities[ab];
    const mod = modFromScore(score);
    const saveProf = cls.saveProficiencies.includes(ab);
    const saveMod = mod + (saveProf ? pb : 0);
    const block = document.createElement("div");
    block.className = "ability-block";
    block.innerHTML = `
      <span class="ability-key">${ab.toUpperCase()}</span>
      <input class="ability-score" type="number" min="${state.abilityMode === 'pointbuy' ? POINT_BUY_MIN_SCORE : ABILITY_SCORE_MIN}" max="${state.abilityMode === 'pointbuy' ? POINT_BUY_MAX_SCORE : ABILITY_SCORE_MAX}" value="${score}" data-ab="${ab}">
      <span class="ability-mod">${fmtMod(mod)}</span>
      <span class="ability-save ${saveProf ? 'prof' : ''}">${saveProf ? '●' : '○'} ${fmtMod(saveMod)}</span>
    `;
    grid.appendChild(block);
  });

  // Point buy info
  const pbInfo = document.getElementById("pb-info");
  if (state.abilityMode === "pointbuy") {
    const spent = ABILITIES.reduce((s, a) => s + pointBuyCost(state.abilities[a]), 0);
    const rem = POINT_BUY_MAX_POINTS - spent;
    const overBudget = spent > POINT_BUY_MAX_POINTS;
    pbInfo.textContent = overBudget
      ? `Over budget — Points: ${spent} / ${POINT_BUY_MAX_POINTS} (${Math.abs(rem)} over limit)`
      : `Points: ${spent} / ${POINT_BUY_MAX_POINTS}  (${rem} remaining)`;
    pbInfo.className = overBudget ? "pb-info over" : "pb-info";
    pbInfo.style.display = "block";
  } else {
    pbInfo.className = "pb-info";
    pbInfo.style.display = "none";
  }
}

// --- Derived stats ---
function renderDerived() {
  const pb = proficiencyBonus(state.level);
  const mods = {};
  ABILITIES.forEach(a => mods[a] = modFromScore(state.abilities[a]));
  const cls = getClassData(state.class);
  const hp = getEstimatedHP(state.level, state.class, mods.con);
  const ac = getArmorClassEstimate(state, mods.dex);
  const spellDc = BASE_SPELL_DC + pb + mods[getCasterAbility(state)];
  const spellAtk = pb + mods[getCasterAbility(state)];
  const pp = BASE_AC + mods.wis; // Passive Perception

  const row = document.getElementById("derived-row");
  if (!row) return;
  const chips = [
    ["HP",    hp,             "var(--ok0)"],
    ["AC",    ac,             "var(--tank)"],
    ["Prof",  fmtMod(pb),     "var(--ac1)"],
    ["Init",  fmtMod(mods.dex), "var(--ac1)"],
    ["PP",    pp,             "var(--tx1)"],
    ["SpAtk", fmtMod(spellAtk), "var(--nova)"],
    ["SpDC",  spellDc,        "var(--nova)"],
  ];
  row.innerHTML = chips.map(([lbl, val, color]) =>
    `<div class="stat-chip"><span class="sv" style="color:${color}">${val}</span><span class="sl">${lbl}</span></div>`
  ).join("");

  // Update status bar
  document.getElementById("status-pb").textContent = `PB: ${fmtMod(pb)}`;
  document.getElementById("status-pp").textContent = `PP: ${pp}`;
  document.getElementById("status-init").textContent = `Init: ${fmtMod(mods.dex)}`;

  // spell section derived
  const sa = document.getElementById("d-spell-atk");
  const sd = document.getElementById("d-spell-dc");
  if (sa) sa.textContent = fmtMod(spellAtk);
  if (sd) sd.textContent = spellDc;
}

// --- Skills ---
function renderSkills() {
  const pb = proficiencyBonus(state.level);
  const mods = {};
  ABILITIES.forEach(a => mods[a] = modFromScore(state.abilities[a]));
  const tbody = document.getElementById("skills-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  SKILLS.forEach(sk => {
    const prof = state.skills[sk.key]?.proficient || false;
    const exp  = state.skills[sk.key]?.expertise  || false;
    const bonus = mods[sk.ability] + (prof ? pb : 0) + (exp ? pb : 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sk.label}</td>
      <td>${sk.ability.toUpperCase()}</td>
      <td>${fmtMod(bonus)}</td>
      <td><input type="checkbox" ${prof ? "checked" : ""} data-skill="${sk.key}" data-field="proficient"></td>
      <td><input type="checkbox" ${exp ? "checked" : ""} data-skill="${sk.key}" data-field="expertise"></td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Weapons ---
function renderWeapons() {
  const pb = proficiencyBonus(state.level);
  const tbody = document.getElementById("weapons-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  state.weapons.forEach(w => {
    const atk = weaponAtkBonus(w, state.abilities, pb);
    const avg = weaponAvgDamage(w, state.abilities, pb);
    const tr = document.createElement("tr");
    tr.dataset.wid = w.id;
    tr.innerHTML = `
      <td><input type="text" value="${escHtml(w.name)}" data-wfield="name"></td>
      <td><select data-wfield="ability">${ABILITIES.map(a => `<option value="${a}" ${w.ability===a?"selected":""}>${a.toUpperCase()}</option>`).join("")}</select></td>
      <td><input type="text" value="${escHtml(w.damage)}" data-wfield="damage" style="width:5rem"></td>
      <td><input type="number" min="0" max="${MAX_MAGIC_BONUS}" value="${w.magicBonus}" data-wfield="magicBonus" style="width:2.8rem"></td>
      <td><input type="checkbox" ${w.proficient?"checked":""} data-wfield="proficient"></td>
      <td>${fmtMod(atk)}</td>
      <td>${avg}</td>
      <td><button class="del-btn" data-del-weapon="${w.id}" title="Remove ${escHtml(w.name)}" aria-label="Remove ${escHtml(w.name)}">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Spell slots ---
function renderSpellSlots() {
  const headRow = document.getElementById("slots-head-row");
  const bodyRow = document.getElementById("slots-body-row");
  if (!headRow || !bodyRow) return;
  headRow.innerHTML = "";
  bodyRow.innerHTML = "";
  for (let lvl = 1; lvl <= MAX_SPELL_LEVEL; lvl++) {
    const th = document.createElement("th");
    th.textContent = lvl;
    headRow.appendChild(th);
    const td = document.createElement("td");
    td.innerHTML = `<input type="number" min="0" max="9" value="${state.spellcasting.slots[lvl]||0}" data-slot="${lvl}">`;
    bodyRow.appendChild(td);
  }
  // casting ability selector
  populateSelect("f-cast-ability", ABILITIES.map(a => [a, ABILITY_LABELS[a]]), getCasterAbility(state));
  document.getElementById("f-has-shield").checked = state.hasShield;
  document.getElementById("f-armor-bonus").value = state.armorMagicBonus;
}

// --- Notes ---
function renderNotes() {
  document.getElementById("f-features").value = state.features;
  document.getElementById("f-traits").value = state.traits;
  document.getElementById("f-notes").value = state.notes;
  document.getElementById("f-equipment").value = (state.equipment || []).join(", ");
}

// --- Optimizer section ---
const ASSUMPTION_FIELDS = [
  { key: "targetAC",           label: "Target AC",           type: "number", min: 10, max: 25 },
  { key: "targetSaveBonus",   label: "Target Save",          type: "number", min: 0,  max: 12 },
  { key: "advantageRate",     label: "Adv Rate (0–1)",       type: "number", min: 0,  max: 1, step: 0.05 },
  { key: "weaponMagicBonus",  label: "Weapon Magic Bonus",   type: "number", min: 0,  max: MAX_MAGIC_BONUS },
  { key: "armorMagicBonus",   label: "Armor Magic Bonus",    type: "number", min: 0,  max: MAX_MAGIC_BONUS },
  { key: "spellFocusBonus",   label: "Spell Focus Bonus",    type: "number", min: 0,  max: MAX_MAGIC_BONUS },
  { key: "shortRests",        label: "Short Rests/Day",      type: "number", min: 0,  max: 6 },
  { key: "roundsPerEncounter",label: "Rounds/Encounter",     type: "number", min: 1,  max: 10 },
  { key: "encountersPerDay",  label: "Enc/Day",              type: "number", min: 1,  max: 8 },
  { key: "feats",             label: "Feats Allowed",        type: "checkbox" },
  { key: "multiclass",        label: "Multiclass",           type: "checkbox" },
];

function renderOptimizer() {
  populateSelect("f-objective", OPTIMIZER_OBJECTIVES.map(o => [o.key, o.label]), state.optimizer.objective);
  populateSelect("f-rule-preset", Object.entries(RULE_PRESETS).map(([k,v]) => [k, v.label]), state.optimizer.rulePreset);
  document.getElementById("f-analysis-level").value = state.optimizer.assumptions.analysisLevel;

  const grid = document.getElementById("assumptions-grid");
  if (!grid) return;
  grid.innerHTML = "";
  ASSUMPTION_FIELDS.forEach(f => {
    const label = document.createElement("label");
    if (f.type === "checkbox") {
      label.innerHTML = `<input type="checkbox" data-assumption="${f.key}" ${state.optimizer.assumptions[f.key] ? "checked" : ""}> ${f.label}`;
    } else {
      const step = f.step ? `step="${f.step}"` : "";
      label.innerHTML = `${f.label}<input type="number" min="${f.min}" max="${f.max}" ${step} value="${state.optimizer.assumptions[f.key]}" data-assumption="${f.key}">`;
    }
    grid.appendChild(label);
  });
}

// --- Current build metrics ---
let _metricsTimer = null;
function scheduleMetricsUpdate() {
  clearTimeout(_metricsTimer);
  _metricsTimer = setTimeout(renderMetrics, 60);
}

function renderMetrics() {
  try {
    const snapshot = { class: state.class, level: Number(state.level), abilities: state.abilities, featPlan: [] };
    const metrics = evaluateBuildSnapshot(snapshot, state.optimizer.assumptions, state.optimizer.objective);
    const grid = document.getElementById("metrics-grid");
    if (!grid) return;
    const items = [
      ["Sust DPR",       fmtFixed(metrics.sustainedDpr),   "var(--ok0)"],
      ["Burst DPR R1",   fmtFixed(metrics.burstDprRound1), "var(--nova)"],
      ["Eff HP",         Math.round(metrics.effectiveHp),  "var(--tank)"],
      ["AC",             metrics.ac,                        "var(--tx0)"],
      ["Spell DC",       metrics.spellDc,                  "var(--nova)"],
      ["Control",        fmtFixed(metrics.controlPressure),"var(--ctrl)"],
      ["Skills",         fmtFixed(metrics.skillScore),     "var(--skl)"],
      ["Score",          fmtFixed(metrics.score),          "var(--ac1)"],
    ];
    grid.innerHTML = items.map(([lbl, val, color]) =>
      `<div class="metric-cell"><div class="mv" style="color:${color}">${val}</div><div class="ml">${lbl}</div></div>`
    ).join("");

    // Update DPR bars
    const susW   = Math.min(100, (metrics.sustainedDpr / DPR_BAR_MAX) * 100);
    const burstW = Math.min(100, ((metrics.burstDprRound1 - metrics.sustainedDpr) / DPR_BAR_MAX) * 100);
    const susBar   = document.getElementById("dpr-sus-bar");
    const burstBar = document.getElementById("dpr-burst-bar");
    const susVal   = document.getElementById("d-sus-val");
    const burstVal = document.getElementById("d-burst-val");
    if (susBar)   susBar.style.width  = susW + "%";
    if (burstBar) { burstBar.style.left = susW + "%"; burstBar.style.width = Math.max(0, burstW) + "%"; }
    if (susVal)   susVal.textContent   = fmtFixed(metrics.sustainedDpr);
    if (burstVal) burstVal.textContent = fmtFixed(metrics.burstDprRound1);

    // Render radar chart
    renderRadar(metrics);
  } catch (error) {
    console.error("Error rendering metrics:", error);
    setStatus("⚠ Error calculating metrics", true);
  }
}

// --- Optimizer results ---
function renderResults() {
  const list = document.getElementById("results-list");
  const note = document.getElementById("results-note");
  if (!list) return;
  const results = state.optimizer.results || [];
  if (!results.length) {
    list.innerHTML = `<div class="results-empty">Click ⚡ Optimize to generate builds.</div>`;
    if (note) note.textContent = "";
    return;
  }
  if (note) note.textContent = `${results.length} results`;
  list.innerHTML = "";
  results.forEach((r, idx) => {
    const card = document.createElement("div");
    card.className = "result-card" + (idx === 0 ? " rank-1" : "") + (r.isMulticlass ? " multiclass" : "");
    const s = r.summary;
    const rankColors = ["var(--wa0)", "#aaa", "#cd7f32", "var(--tx2)", "var(--tx2)"];
    const multiclassBadge = r.isMulticlass
      ? `<span class="badge multi">Multiclass</span>`
      : "";
    const susW   = Math.min(100, (s.sustainedDpr / DPR_BAR_MAX) * 100);
    const burstW = Math.min(100, ((s.burstDprRound1 - s.sustainedDpr) / DPR_BAR_MAX) * 100);
    card.innerHTML = `
      <div class="result-header">
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span class="result-rank" style="color:${rankColors[idx] || 'var(--tx2)'}">#${idx+1}</span>
            <span class="result-name">${escHtml(r.classLabel)}</span>
            ${multiclassBadge}
          </div>
          <div class="result-tags">
            ${r.strengths.map(t => `<span class="badge good">${escHtml(t)}</span>`).join("")}
            ${r.tradeoffs.map(t => `<span class="badge warn">⚠ ${escHtml(t)}</span>`).join("")}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="result-score">${fmtFixed(r.score)}</span>
          <button class="result-apply-btn" data-apply-idx="${idx}">Apply</button>
        </div>
      </div>
      <div class="dpr-bar-wrap">
        <div class="dpr-bar-labels">
          <span></span>
          <span>
            <span style="color:var(--ok0);font-family:var(--mono)">${fmtFixed(s.sustainedDpr)}</span>
            <span style="color:var(--tx2)"> sus </span>
            <span style="color:var(--nova);font-family:var(--mono)">${fmtFixed(s.burstDprRound1)}</span>
            <span style="color:var(--tx2)"> burst</span>
          </span>
        </div>
        <div class="dpr-bar-track">
          <div class="dpr-bar-sus" style="width:${susW}%"></div>
          <div class="dpr-bar-burst" style="left:${susW}%;width:${Math.max(0,burstW)}%"></div>
        </div>
      </div>
      <div class="result-stats">
        <span>EHP: <span style="color:var(--tank);font-family:var(--mono)">${Math.round(s.effectiveHp)}</span></span>
        <span>AC: <span style="color:var(--tx0);font-family:var(--mono)">${s.ac}</span></span>
        <span>SpDC: <span style="color:var(--nova);font-family:var(--mono)">${s.spellDc}</span></span>
        <span>Init: <span style="color:var(--ac1);font-family:var(--mono)">${fmtMod(s.initiative)}</span></span>
        <span>Pri: <span style="color:var(--tx1);font-family:var(--mono)">${s.primaryStat?.toUpperCase()}</span></span>
      </div>
    `;
    list.appendChild(card);
  });
}

// --- Level timeline ---
const _TIMELINE_MILESTONES = {1:'Base',3:'Subclass',4:'ASI',5:'Xtra Atk',8:'ASI',10:'Feature',12:'ASI',19:'ASI',20:'Capstone'};

function renderTimeline() {
  const wrap = document.getElementById("level-timeline");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (let lv = 1; lv <= 20; lv++) {
    const isCur  = lv === state.level;
    const isPast = lv < state.level;
    const ms = _TIMELINE_MILESTONES[lv];
    const sz = isCur ? "large" : ms ? "medium" : "small";
    const dot = document.createElement("div");
    dot.className = "lv-dot";
    dot.addEventListener("click", () => {
      state.level = lv;
      const levelInput = document.getElementById("f-level");
      if (levelInput) levelInput.value = lv;
      renderTimeline();
      renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); scheduleMetricsUpdate();
      scheduleSave();
    });
    const pip = document.createElement("div");
    pip.className = `lv-pip ${sz} ${isCur ? "current" : isPast ? "past" : ""}`;
    pip.textContent = lv;
    dot.appendChild(pip);
    if (ms || isCur) {
      const lbl = document.createElement("div");
      lbl.className = `lv-label ${isCur ? "current" : ""}`;
      lbl.textContent = isCur ? `Lv ${lv}` : ms;
      dot.appendChild(lbl);
    }
    wrap.appendChild(dot);
  }
  const pbEl = document.getElementById("d-pb");
  if (pbEl) pbEl.textContent = fmtMod(proficiencyBonus(state.level));
  const lvLbl = document.getElementById("d-level-label");
  if (lvLbl) lvLbl.textContent = state.level;
}

// --- Radar chart ---
function renderRadar(metrics) {
  const svg = document.getElementById("radar-svg");
  if (!svg) return;
  const keys   = ["sustainedDpr", "burstDprRound1", "effectiveHp", "controlPressure", "skillScore", "initiative"];
  const labels = ["Sustained",    "Burst",           "Tank",         "Control",          "Skill",      "Init"];
  const colors = ["var(--ok0)",   "var(--nova)",     "var(--tank)", "var(--ctrl)",      "var(--skl)", "var(--ac1)"];
  const maxV   = {sustainedDpr:40, burstDprRound1:60, effectiveHp:150, controlPressure:20, skillScore:30, initiative:10};
  const cx = 110, cy = 110, r = 75;
  const step = (Math.PI * 2) / keys.length;
  const pts = keys.map((k, i) => {
    const a = i * step - Math.PI / 2;
    const raw = metrics[k] || 0;
    const frac = Math.min(1, Math.abs(raw) / (maxV[k] || 1));
    return {
      x: cx + Math.cos(a) * r * frac, y: cy + Math.sin(a) * r * frac,
      lx: cx + Math.cos(a) * (r + 22), ly: cy + Math.sin(a) * (r + 22),
      c: colors[i], label: labels[i],
    };
  });
  const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  let html = "";
  [0.25, 0.5, 0.75, 1].forEach(f => {
    html += `<circle cx="${cx}" cy="${cy}" r="${r*f}" fill="none" stroke="var(--bd0)" stroke-width="0.5"/>`;
  });
  for (let i = 0; i < 6; i++) {
    const a = i * step - Math.PI / 2;
    html += `<line x1="${cx}" y1="${cy}" x2="${(cx+Math.cos(a)*r).toFixed(1)}" y2="${(cy+Math.sin(a)*r).toFixed(1)}" stroke="var(--bd0)" stroke-width="0.5"/>`;
  }
  html += `<polygon points="${poly}" fill="rgba(79,110,247,0.2)" stroke="var(--ac0)" stroke-width="1.5"/>`;
  pts.forEach((p, i) => {
    html += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${p.c}" stroke="var(--bg2)" stroke-width="1"/>`;
  });
  pts.forEach((p) => {
    const anchor = p.lx < cx - 10 ? "end" : p.lx > cx + 10 ? "start" : "middle";
    html += `<text x="${p.lx.toFixed(1)}" y="${(p.ly+4).toFixed(1)}" text-anchor="${anchor}" font-size="8" fill="var(--tx2)" font-family="var(--sans)">${p.label}</text>`;
  });
  svg.innerHTML = html;
}

// --- Tab switching ---
function switchTab(id) {
  ["builder", "analysis", "compare"].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.toggle("hidden", t !== id);
  });
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === id);
  });
}

// --- Command Palette ---
const CMD_ACTIONS = [
  { id: "optimize", icon: "⚡", label: "Run optimizer",        key: "⌘↵" },
  { id: "apply",    icon: "✔",  label: "Apply top build",       key: "⌘⇧A" },
  { id: "export",   icon: "⬇",  label: "Export JSON",           key: "⌘E" },
  { id: "reset",    icon: "↺",  label: "Reset character",       key: "⌘⇧R" },
  { id: "std",      icon: "🎲", label: "Apply standard array",  key: "" },
  { id: "autopb",   icon: "📊", label: "Auto point buy",        key: "" },
  { id: "builder",  icon: "⚔",  label: "Go to Builder tab",     key: "⌘1" },
  { id: "analysis", icon: "📊", label: "Go to Analysis tab",    key: "⌘2" },
  { id: "compare",  icon: "⚖",  label: "Go to Compare tab",     key: "⌘3" },
];
let _cmdSel = 0, _cmdFiltered = [...CMD_ACTIONS];

function openCmdPalette() {
  const overlay = document.getElementById("cmd-overlay");
  const input   = document.getElementById("cmd-input");
  if (!overlay || !input) return;
  overlay.classList.add("open");
  input.value = "";
  _cmdFiltered = [...CMD_ACTIONS]; _cmdSel = 0;
  renderCmdList();
  input.focus();
}

function closeCmdPalette(e) {
  if (!e || e.target === document.getElementById("cmd-overlay")) {
    const overlay = document.getElementById("cmd-overlay");
    if (overlay) overlay.classList.remove("open");
  }
}

function filterCmdList() {
  const q = (document.getElementById("cmd-input")?.value || "").toLowerCase();
  _cmdFiltered = CMD_ACTIONS.filter(c => c.label.toLowerCase().includes(q));
  _cmdSel = 0; renderCmdList();
}

function renderCmdList() {
  const listEl = document.getElementById("cmd-list");
  if (!listEl) return;
  listEl.innerHTML = _cmdFiltered.map((c, i) =>
    `<div class="cmd-item${i === _cmdSel ? " selected" : ""}" data-cmd="${c.id}">
      <span class="cmd-icon">${c.icon}</span>
      <span class="cmd-label">${c.label}</span>
      <span class="cmd-key">${c.key}</span>
    </div>`
  ).join("") || `<div style="padding:14px;text-align:center;color:var(--tx2);font-size:13px">No commands found</div>`;
}

function cmdKeyNav(e) {
  if (e.key === "Escape") { closeCmdPalette(); return; }
  if (e.key === "ArrowDown") { _cmdSel = Math.min(_cmdSel + 1, _cmdFiltered.length - 1); renderCmdList(); }
  if (e.key === "ArrowUp")   { _cmdSel = Math.max(_cmdSel - 1, 0); renderCmdList(); }
  if (e.key === "Enter" && _cmdFiltered[_cmdSel]) { execCmd(_cmdFiltered[_cmdSel].id); }
}

function execCmd(id) {
  closeCmdPalette();
  if (id === "optimize") { document.getElementById("btn-optimize")?.click(); }
  else if (id === "apply")    { document.getElementById("btn-apply-top")?.click(); }
  else if (id === "export")   { document.getElementById("btn-export")?.click(); }
  else if (id === "reset")    { document.getElementById("btn-reset")?.click(); }
  else if (id === "std")      { document.getElementById("btn-std-array")?.click(); }
  else if (id === "autopb")   { document.getElementById("btn-auto-pb")?.click(); }
  else if (id === "builder" || id === "analysis" || id === "compare") { switchTab(id); }
}

// --- Full render ---
function render() {
  renderIdentity();
  renderTimeline();
  renderAbilities();
  renderDerived();
  renderSkills();
  renderWeapons();
  renderSpellSlots();
  renderNotes();
  renderOptimizer();
  renderMetrics();
  renderResults();
}

// =========================================================
// 9. Event Wiring
// =========================================================
function wireEvents() {
  // Identity text inputs
  document.getElementById("f-name").addEventListener("input", e => { state.identity.name = e.target.value; scheduleSave(); setStatus("Saved."); });
  document.getElementById("f-player").addEventListener("input", e => { state.identity.player = e.target.value; scheduleSave(); });
  document.getElementById("f-subclass").addEventListener("input", e => { state.identity.subclass = e.target.value; scheduleSave(); });
  document.getElementById("f-level").addEventListener("change", e => {
    state.level = validateLevel(e.target.value);
    e.target.value = state.level; // Update display with validated value
    renderTimeline(); renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); scheduleMetricsUpdate();
    scheduleSave();
  });
  document.getElementById("f-class").addEventListener("change", e => {
    state.class = validateClassKey(e.target.value);
    // auto-update casting ability to class default
    const def = getClassData(state.class).defaultCastingAbility;
    if (def) state.spellcasting.castingAbility = def;
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderSpellSlots(); scheduleMetricsUpdate();
    scheduleSave();
  });
  document.getElementById("f-race").addEventListener("change", e => { state.identity.race = e.target.value; scheduleSave(); });
  document.getElementById("f-background").addEventListener("change", e => { state.identity.background = e.target.value; scheduleSave(); });
  document.getElementById("f-alignment").addEventListener("change", e => { state.identity.alignment = e.target.value; scheduleSave(); });

  // Ability mode
  document.getElementById("f-ability-mode").addEventListener("change", e => {
    state.abilityMode = e.target.value;
    renderAbilities(); scheduleSave();
  });

  // Ability table - delegate
  document.getElementById("ability-grid").addEventListener("change", e => {
    const ab = e.target.dataset.ab;
    if (!ab) return;
    state.abilities[ab] = validateAbilityScore(e.target.value, state.abilityMode);
    e.target.value = state.abilities[ab]; // Update display with validated value
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); scheduleMetricsUpdate();
    scheduleSave();
  });

  // Apply standard array
  document.getElementById("btn-std-array").addEventListener("click", () => {
    const arr = [...STANDARD_ARRAY];
    ABILITIES.forEach((a, i) => state.abilities[a] = arr[i]);
    state.abilityMode = "standard";
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); scheduleMetricsUpdate();
    scheduleSave();
  });

  // Auto point buy
  document.getElementById("btn-auto-pb").addEventListener("click", () => {
    try {
      const scores = autoAssignPointBuy(state.class, state.optimizer.objective);
      Object.assign(state.abilities, scores);
      state.abilityMode = "pointbuy";
      renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); scheduleMetricsUpdate();
      setStatus("Auto Point Buy applied.");
      scheduleSave();
    } catch (error) {
      console.error("Auto point buy failed:", error);
      setStatus("⚠ Auto point buy failed", true);
    }
  });

  // Skills - delegate
  document.getElementById("skills-tbody").addEventListener("change", e => {
    const key = e.target.dataset.skill;
    const field = e.target.dataset.field;
    if (!key || !field) return;
    if (!state.skills[key]) state.skills[key] = { proficient: false, expertise: false };
    state.skills[key][field] = e.target.checked;
    if (field === "expertise" && e.target.checked) state.skills[key].proficient = true;
    renderSkills(); renderDerived(); scheduleMetricsUpdate();
    scheduleSave();
  });

  document.getElementById("btn-clear-skills").addEventListener("click", () => {
    state.skills = DEFAULT_SKILLS_STATE();
    renderSkills(); renderDerived(); scheduleMetricsUpdate();
    scheduleSave();
  });

  // Add weapon
  document.getElementById("btn-add-weapon").addEventListener("click", () => {
    state.weapons.push({ id: safeId(), name: "New Weapon", ability: "str", proficient: true, magicBonus: 0, damage: "1d8+MOD" });
    renderWeapons(); scheduleSave();
  });

  // Weapons table - delegate
  document.getElementById("weapons-tbody").addEventListener("change", e => {
    const wid = e.target.closest("tr")?.dataset.wid;
    if (!wid) return;
    const field = e.target.dataset.wfield;
    if (!field) return;
    const w = state.weapons.find(x => x.id === wid);
    if (!w) return;
    if (field === "proficient") w[field] = e.target.checked;
    else if (field === "magicBonus") {
      w[field] = validateMagicBonus(e.target.value);
      e.target.value = w[field];
    }
    else if (field === "ability") w[field] = validateAbilityKey(e.target.value);
    else w[field] = e.target.value;
    renderWeapons(); scheduleSave();
  });

  document.getElementById("weapons-tbody").addEventListener("click", e => {
    const btn = e.target.closest("[data-del-weapon]");
    if (!btn) return;
    const id = btn.dataset.delWeapon;
    state.weapons = state.weapons.filter(w => w.id !== id);
    renderWeapons(); scheduleSave();
  });

  // Spell slots
  document.getElementById("slots-body-row").addEventListener("change", e => {
    const slot = e.target.dataset.slot;
    if (slot) { 
      state.spellcasting.slots[slot] = validateSpellSlot(e.target.value);
      e.target.value = state.spellcasting.slots[slot];
      scheduleSave(); 
    }
  });

  document.getElementById("f-cast-ability").addEventListener("change", e => {
    state.spellcasting.castingAbility = validateAbilityKey(e.target.value);
    renderDerived(); scheduleMetricsUpdate(); scheduleSave();
  });

  document.getElementById("f-has-shield").addEventListener("change", e => {
    state.hasShield = e.target.checked;
    renderDerived(); scheduleMetricsUpdate(); scheduleSave();
  });

  document.getElementById("f-armor-bonus").addEventListener("change", e => {
    state.armorMagicBonus = validateMagicBonus(e.target.value);
    e.target.value = state.armorMagicBonus;
    renderDerived(); scheduleMetricsUpdate(); scheduleSave();
  });

  // Known / prepared spells (textarea stored in spellcasting)
  document.getElementById("f-known-spells").addEventListener("input", e => { state.spellcasting.knownSpells = e.target.value; scheduleSave(); });
  document.getElementById("f-prep-spells").addEventListener("input", e => { state.spellcasting.preparedSpells = e.target.value; scheduleSave(); });
  // Restore textareas from state (not covered by renderSpellSlots)
  function restoreSpellTextareas() {
    document.getElementById("f-known-spells").value = state.spellcasting.knownSpells || "";
    document.getElementById("f-prep-spells").value = state.spellcasting.preparedSpells || "";
  }
  restoreSpellTextareas();

  // Notes
  document.getElementById("f-features").addEventListener("input", e => { state.features = e.target.value; scheduleSave(); });
  document.getElementById("f-traits").addEventListener("input", e => { state.traits = e.target.value; scheduleSave(); });
  document.getElementById("f-notes").addEventListener("input", e => { state.notes = e.target.value; scheduleSave(); });
  document.getElementById("f-equipment").addEventListener("input", e => {
    state.equipment = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
    scheduleSave();
  });

  // Optimizer controls
  document.getElementById("f-objective").addEventListener("change", e => {
    state.optimizer.objective = e.target.value;
    scheduleMetricsUpdate(); scheduleSave();
  });
  document.getElementById("f-rule-preset").addEventListener("change", e => {
    const key = e.target.value;
    const preset = RULE_PRESETS[key];
    if (preset) {
      state.optimizer.rulePreset = key;
      state.optimizer.assumptions = { ...state.optimizer.assumptions, ...preset, analysisLevel: state.optimizer.assumptions.analysisLevel };
      renderOptimizer(); scheduleMetricsUpdate(); scheduleSave();
    }
  });
  document.getElementById("f-analysis-level").addEventListener("change", e => {
    state.optimizer.assumptions.analysisLevel = validateLevel(e.target.value);
    e.target.value = state.optimizer.assumptions.analysisLevel;
    scheduleSave();
  });

  // Assumption fields - delegate
  document.getElementById("assumptions-grid").addEventListener("change", e => {
    const key = e.target.dataset.assumption;
    if (!key) return;
    if (e.target.type === "checkbox") state.optimizer.assumptions[key] = e.target.checked;
    else state.optimizer.assumptions[key] = Number(e.target.value);
    scheduleMetricsUpdate(); scheduleSave();
  });

  // Toolbar buttons
  document.getElementById("btn-optimize").addEventListener("click", async () => {
    // Validate state before starting; stop on errors
    const { issues } = validateState(state);
    const hasErrors = issues.some(i => i.severity === "error");
    if (hasErrors) {
      showValidationIssues(issues);
      setStatus("⚠ Fix errors before optimizing.", true);
      return;
    }

    const btnOptimize = document.getElementById("btn-optimize");
    const btnCancel   = document.getElementById("btn-cancel");
    const btnApplyTop = document.getElementById("btn-apply-top");
    const progressWrap = document.getElementById("progress-bar-wrap");
    const progressBar  = document.getElementById("progress-bar");

    // Disable optimize / apply; show cancel + progress bar
    btnOptimize.disabled = true;
    btnApplyTop.disabled = true;
    btnCancel.classList.remove("hidden");
    if (progressWrap) progressWrap.style.display = "block";
    if (progressBar)  progressBar.style.width = "0%";

    const { objective, assumptions } = state.optimizer;

    // Build pool: single-class entries (strings) + multiclass entries (objects) when enabled
    const pool = [...CLASS_OPTIONS];
    if (assumptions.multiclass) {
      pool.push(...generateMulticlassCandidates(assumptions.analysisLevel));
    }

    setStatus(`Generating builds… 0 / ${pool.length}`);

    _currentCancelToken = new CancelToken();
    const token = _currentCancelToken;

    try {
      const sorted = await runOptimizerAsync(
        pool,
        entry => typeof entry === "string"
          ? buildOneClassResult(entry, objective, assumptions)
          : buildOneMulticlassResult(entry, objective, assumptions),
        token,
        ({ processed, total, phase }) => {
          if (phase === "generating") {
            const pct = Math.round((processed / total) * 100);
            setStatus(`Generating builds… ${processed} / ${total}`);
            if (progressBar) progressBar.style.width = `${pct}%`;
          } else if (phase === "sorting") {
            setStatus("Sorting results…");
            if (progressBar) progressBar.style.width = "95%";
          } else {
            setStatus(`Optimizing… (${phase})`);
          }
        },
      );

      if (sorted === null) {
        // Run was cancelled
        setStatus("Optimization cancelled.");
      } else {
        state.optimizer.results = sorted.slice(0, 5);
        renderResults(); scheduleMetricsUpdate(); scheduleSave();
        if (progressBar) progressBar.style.width = "100%";
        setStatus(`Top ${state.optimizer.results.length} builds generated.`);
      }
    } catch (error) {
      console.error("Optimization failed:", error);
      setStatus("⚠ Optimization failed", true);
    } finally {
      btnOptimize.disabled = false;
      btnApplyTop.disabled = false;
      btnCancel.classList.add("hidden");
      if (progressWrap) progressWrap.style.display = "none";
      if (progressBar)  progressBar.style.width = "0%";
      _currentCancelToken = null;
    }
  });

  document.getElementById("btn-cancel").addEventListener("click", () => {
    if (_currentCancelToken) {
      _currentCancelToken.cancel();
      setStatus("Cancelling…");
    }
  });

  document.getElementById("btn-apply-top").addEventListener("click", () => applyBuildResult(0));

  document.getElementById("btn-export").addEventListener("click", exportJson);
  document.getElementById("btn-export2").addEventListener("click", () => {
    try {
      const json = JSON.stringify(state, null, 2);
      navigator.clipboard.writeText(json)
        .then(() => setStatus("Copied to clipboard."))
        .catch(() => { 
          document.getElementById("f-import-text").value = json; 
          setStatus("Paste from text area."); 
        });
    } catch (error) {
      console.error("Export failed:", error);
      setStatus("⚠ Export failed", true);
    }
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Reset all character and optimizer data?")) return;
    state = createDefaultCharacter();
    localStorage.removeItem(STORAGE_KEY);
    showValidationIssues([]);
    render();
    document.getElementById("f-known-spells").value = "";
    document.getElementById("f-prep-spells").value = "";
    setStatus("Reset.");
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    const txt = document.getElementById("f-import-text").value.trim();
    if (!txt) { setStatus("Paste JSON first.", true); return; }
    try {
      const parsed = JSON.parse(txt);
      // Validate the raw input to collect diagnostics about malformed fields,
      // then normalize to produce a safe, usable state.
      const { issues } = validateState(parsed);
      const normalized = hydrateCharacter(parsed);
      state = normalized;
      render();
      document.getElementById("f-known-spells").value = state.spellcasting.knownSpells || "";
      document.getElementById("f-prep-spells").value = state.spellcasting.preparedSpells || "";
      document.getElementById("f-import-text").value = "";
      scheduleSave();
      showValidationIssues(issues);
      const hasErrors   = issues.some(i => i.severity === "error");
      const hasWarnings = issues.length > 0;
      if (hasErrors) {
        setStatus("⚠ Import completed with errors — check diagnostics.");
      } else if (hasWarnings) {
        setStatus("Import completed with warnings — check diagnostics.");
      } else {
        setStatus("Import successful.");
      }
    } catch (error) {
      console.error("Import failed:", error);
      setStatus("⚠ Invalid JSON — could not parse.", true);
    }
  });

  // Apply build from results list
  document.getElementById("results-list").addEventListener("click", e => {
    const btn = e.target.closest("[data-apply-idx]");
    if (!btn) return;
    applyBuildResult(Number(btn.dataset.applyIdx));
  });

  // Tab switching
  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Command palette
  const cmdOverlay = document.getElementById("cmd-overlay");
  const cmdInput   = document.getElementById("cmd-input");
  const cmdList    = document.getElementById("cmd-list");
  const btnCmd     = document.getElementById("btn-cmd");
  if (btnCmd)     btnCmd.addEventListener("click", openCmdPalette);
  if (cmdOverlay) cmdOverlay.addEventListener("click", closeCmdPalette);
  if (cmdInput)   cmdInput.addEventListener("input", filterCmdList);
  if (cmdInput)   cmdInput.addEventListener("keydown", cmdKeyNav);
  if (cmdList)    cmdList.addEventListener("click", e => {
    const item = e.target.closest("[data-cmd]");
    if (item) execCmd(item.dataset.cmd);
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); openCmdPalette(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); document.getElementById("btn-optimize")?.click(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); switchTab("builder"); }
    if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); switchTab("analysis"); }
    if ((e.metaKey || e.ctrlKey) && e.key === "3") { e.preventDefault(); switchTab("compare"); }
  });
}

function applyBuildResult(idx) {
  try {
    const result = (state.optimizer.results || [])[idx];
    if (!result) { setStatus("No result at index " + idx, true); return; }
    const finalStep = result.plan[result.plan.length - 1];
    const suggestedSkills = getSuggestedSkills(result.classKey, state.optimizer.objective);
    const nextSkills = DEFAULT_SKILLS_STATE();
    suggestedSkills.forEach((k, i) => {
      if (nextSkills[k]) {
        nextSkills[k].proficient = true;
        if (result.classKey === "rogue" && i < 2) nextSkills[k].expertise = true;
      }
    });
    state.class = result.classKey;
    state.level = state.optimizer.assumptions.analysisLevel;
    state.abilityMode = "pointbuy";
    state.abilities = { ...finalStep.snapshot.abilities };
    state.skills = nextSkills;

    // For multiclass results, prefer the casting ability from the snapshot
    const castAb = finalStep.snapshot?.spellcasting?.castingAbility ||
                   getClassData(result.classKey).defaultCastingAbility;
    if (castAb) state.spellcasting.castingAbility = castAb;

    // Normalize + validate the applied state; preserve existing optimizer results
    const savedResults = state.optimizer.results || [];
    const normalizedApplied = hydrateCharacter(state);
    const { issues } = validateState(normalizedApplied);
    state = normalizedApplied;
    state.optimizer.results = savedResults;

    render();
    scheduleSave();
    showValidationIssues(issues);
    setStatus(`Applied ${escHtml(result.classLabel)} build.`);
    // scroll to top
    window.scrollTo(0, 0);
  } catch (error) {
    console.error("Apply build failed:", error);
    setStatus("⚠ Failed to apply build", true);
  }
}

function exportJson() {
  try {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (state.identity.name || "character") + ".json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported.");
  } catch (error) {
    console.error("Export failed:", error);
    setStatus("⚠ Export failed", true);
  }
}

// =========================================================
// 10. Boot
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  try {
    render();
    wireEvents();
    setStatus("Loaded.");
  } catch (error) {
    console.error("Initialization failed:", error);
    setStatus("⚠ App initialization failed", true);
  }
});
