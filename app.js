/* =========================================================
   D&D 5e SRD-Safe Character Builder + Optimizer
   Vanilla JS – no frameworks, no external dependencies
   
   VERSION: 2.1 - Improved with better validation and error handling
   ========================================================= */
"use strict";

// =========================================================
// CONSTANTS - Extracted magic numbers for maintainability
// =========================================================
const POINT_BUY_MAX_POINTS = 27;
const POINT_BUY_MIN_SCORE = 8;
const POINT_BUY_MAX_SCORE = 15;
const ABILITY_SCORE_MIN = 3;
const ABILITY_SCORE_MAX = 20;
const MAX_LEVEL = 20;
const MIN_LEVEL = 1;
const MAX_SPELL_LEVEL = 9;
const MAX_MAGIC_BONUS = 5;

// Combat calculation constants
const D20_SIDES = 20;
const BASE_AC = 10;
const BASE_SPELL_DC = 8;
const MIN_HIT_CHANCE = 0.05; // Natural 1 always misses
const MAX_HIT_CHANCE = 0.95; // Natural 20 always hits
const AC_TO_HP_MULTIPLIER = 0.07; // How much each AC point affects effective HP
const NOVA_BURST_BONUS = 0.6;
const DAMAGE_FEAT_BONUS = 1.5;
const INITIATIVE_FEAT_BONUS = 3;

// ASI/Feat breakpoint levels
const ASI_LEVELS = [4, 8, 12, 16, 19];
const MILESTONE_LEVELS = [1, 3, 5, 8, 11, 17, 20];

// =========================================================
// 1. Data / Constants
// =========================================================
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
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

const CLASSES = {
  barbarian: { label: "Barbarian", hitDie: 12, saveProficiencies: ["str","con"], armorType: "medium",   weaponStyle: "str", spellcasting: null,   defaultCastingAbility: null, tags: ["frontliner","durable","sustained_dpr"], features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 2 } },
  bard:      { label: "Bard",      hitDie:  8, saveProficiencies: ["dex","cha"], armorType: "light",    weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "cha", tags: ["support","control","utility"],              features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  cleric:    { label: "Cleric",    hitDie:  8, saveProficiencies: ["wis","cha"], armorType: "medium",   weaponStyle: "str", spellcasting: "full", defaultCastingAbility: "wis", tags: ["support","control","durable"],              features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  druid:     { label: "Druid",     hitDie:  8, saveProficiencies: ["int","wis"], armorType: "medium",   weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "wis", tags: ["control","support","utility"],              features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  fighter:   { label: "Fighter",   hitDie: 10, saveProficiencies: ["str","con"], armorType: "heavy",    weaponStyle: "str", spellcasting: null,   defaultCastingAbility: null, tags: ["frontliner","sustained_dpr","nova_dpr","tank"], features: { extraAttackLevel: 5, burstUsesPerShortRest: 1, bonusDamagePerAttack: 0 } },
  monk:      { label: "Monk",      hitDie:  8, saveProficiencies: ["str","dex"], armorType: "unarmored",weaponStyle: "dex", spellcasting: null,   defaultCastingAbility: null, tags: ["mobile","sustained_dpr","skirmisher"],      features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  paladin:   { label: "Paladin",   hitDie: 10, saveProficiencies: ["wis","cha"], armorType: "heavy",    weaponStyle: "str", spellcasting: "half", defaultCastingAbility: "cha", tags: ["nova_dpr","tank","support"],                features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  ranger:    { label: "Ranger",    hitDie: 10, saveProficiencies: ["str","dex"], armorType: "medium",   weaponStyle: "dex", spellcasting: "half", defaultCastingAbility: "wis", tags: ["sustained_dpr","utility","ranged"],         features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 1 } },
  rogue:     { label: "Rogue",     hitDie:  8, saveProficiencies: ["dex","int"], armorType: "light",    weaponStyle: "dex", spellcasting: null,   defaultCastingAbility: null, tags: ["nova_dpr","skills","initiative"],            features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 3 } },
  sorcerer:  { label: "Sorcerer",  hitDie:  6, saveProficiencies: ["con","cha"], armorType: "light",    weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "cha", tags: ["blaster","control","concentration"],        features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  warlock:   { label: "Warlock",   hitDie:  8, saveProficiencies: ["wis","cha"], armorType: "light",    weaponStyle: "dex", spellcasting: "pact", defaultCastingAbility: "cha", tags: ["sustained_dpr","blaster","short_rest"],     features: { extraAttackLevel: null, burstUsesPerShortRest: 1, bonusDamagePerAttack: 0 } },
  wizard:    { label: "Wizard",    hitDie:  6, saveProficiencies: ["int","wis"], armorType: "light",    weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "int", tags: ["control","blaster","utility"],              features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
};
const CLASS_OPTIONS = Object.keys(CLASSES);

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
    feats: false, multiclass: false, magicBonus: 0,
    shortRests: 1, roundsPerEncounter: 3, encountersPerDay: 4,
    targetAC: 15, targetSaveBonus: 3, advantageRate: 0.1,
  },
  common_optimized: {
    label: "Common Optimized",
    feats: true, multiclass: true, magicBonus: 1,
    shortRests: 2, roundsPerEncounter: 4, encountersPerDay: 4,
    targetAC: 15, targetSaveBonus: 4, advantageRate: 0.25,
  },
  no_multiclass: {
    label: "Feats / No Multiclass",
    feats: true, multiclass: false, magicBonus: 0,
    shortRests: 2, roundsPerEncounter: 3, encountersPerDay: 5,
    targetAC: 16, targetSaveBonus: 5, advantageRate: 0.15,
  },
};

const DEFAULT_SKILLS_STATE = () => SKILLS.reduce((acc, s) => { acc[s.key] = { proficient: false, expertise: false }; return acc; }, {});
const DEFAULT_SPELL_SLOTS = () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 });
const STORAGE_KEY = "dnd5e_srd_safe_builder_v2_optimizer";

// =========================================================
// 2. Input Validation & Sanitization
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
 * Validates a level value
 */
function validateLevel(level) {
  const num = Number(level);
  if (isNaN(num)) return MIN_LEVEL;
  return clamp(num, MIN_LEVEL, MAX_LEVEL);
}

/**
 * Validates a spell slot level
 */
function validateSpellSlot(slot) {
  const num = Number(slot);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(num, MAX_SPELL_LEVEL);
}

/**
 * Validates magic bonus
 */
function validateMagicBonus(bonus) {
  const num = Number(bonus);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(num, MAX_MAGIC_BONUS);
}

/**
 * Validates that a class key exists
 */
function validateClassKey(key) {
  return CLASS_OPTIONS.includes(key) ? key : "fighter";
}

/**
 * Validates that an ability key exists
 */
function validateAbilityKey(key) {
  return ABILITIES.includes(key) ? key : "str";
}

// =========================================================
// 3. Rules Math (with null safety)
// =========================================================

function modFromScore(score) { 
  const num = Number(score);
  if (isNaN(num)) return 0;
  return Math.floor((num - 10) / 2); 
}

function proficiencyBonus(level) { 
  const lvl = validateLevel(level);
  return Math.floor((lvl - 1) / 4) + 2; 
}

function clamp(n, min, max) { 
  const num = Number(n);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, num)); 
}

/**
 * Calculate point buy cost for a given score
 * Scores below 8 or above 15 return maximum cost
 */
function pointBuyCost(s) { 
  const score = Number(s);
  if (isNaN(score) || score < POINT_BUY_MIN_SCORE) return 0;
  if (score > POINT_BUY_MAX_SCORE) return 9;
  
  const costTable = [0,0,0,0,0,0,0,0,0,1,2,3,4,5,7,9];
  return costTable[score] || 0;
}

/**
 * Safely get class data with fallback
 */
function getClassData(key) { 
  const validKey = validateClassKey(key);
  return CLASSES[validKey]; 
}

/**
 * Calculate estimated HP for a character
 */
function getEstimatedHP(level, classKey, conMod) {
  const hd = getClassData(classKey).hitDie;
  const lvl = validateLevel(level);
  const con = Number(conMod) || 0;
  
  if (lvl <= 1) return hd + con;
  
  const avgRoll = Math.floor(hd / 2) + 1;
  return hd + con + (lvl - 1) * (avgRoll + con);
}

/**
 * Estimate armor class based on character and equipment
 */
function getArmorClassEstimate(character, dexMod) {
  try {
    const cls = getClassData(character.class);
    const shield = character.hasShield ? 2 : 0;
    const mag = validateMagicBonus(character.armorMagicBonus);
    const dex = Number(dexMod) || 0;
    
    if (cls.armorType === "heavy")    return 16 + shield + mag;
    if (cls.armorType === "medium")   return 14 + clamp(dex, 0, 2) + shield + mag;
    if (cls.armorType === "light")    return 11 + dex + shield + mag;
    if (cls.armorType === "unarmored") {
      const wisBonus = Math.max(modFromScore(character.abilities?.wis || 10), 0);
      return BASE_AC + dex + wisBonus;
    }
    return BASE_AC + dex;
  } catch (error) {
    console.error("Error calculating AC:", error);
    return BASE_AC;
  }
}

/**
 * Get the casting ability for a character with fallback
 */
function getCasterAbility(character) {
  if (!character || !character.spellcasting) return "int";
  
  const specified = character.spellcasting.castingAbility;
  if (specified && ABILITIES.includes(specified)) return specified;
  
  const classDefault = getClassData(character.class).defaultCastingAbility;
  return classDefault || "int";
}

/**
 * Estimate number of attacks per round based on class and level
 */
function estimateAttacksPerRound(classKey, level) {
  try {
    const cls = getClassData(classKey);
    const lvl = validateLevel(level);
    
    if (!cls.features || !cls.features.extraAttackLevel) return 1;
    return lvl >= cls.features.extraAttackLevel ? 2 : 1;
  } catch (error) {
    console.error("Error estimating attacks:", error);
    return 1;
  }
}

/**
 * Calculate effective hit chance including advantage
 */
function effectiveHitChance(attackBonus, targetAC, advantageRate = 0) {
  const bonus = Number(attackBonus) || 0;
  const ac = Number(targetAC) || 10;
  const advRate = clamp(advantageRate, 0, 1);
  
  const needed = clamp(ac - bonus, 2, 19);
  const base = clamp((D20_SIDES + 1 - needed) / D20_SIDES, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
  const withAdvantage = 1 - Math.pow(1 - base, 2);
  
  return base * (1 - advRate) + withAdvantage * advRate;
}

/**
 * Calculate chance of target failing a saving throw
 */
function saveFailChance(saveDC, targetSaveBonus) {
  const dc = Number(saveDC) || 10;
  const bonus = Number(targetSaveBonus) || 0;
  
  const needed = clamp(dc - bonus, 2, 19);
  return clamp((needed - 1) / D20_SIDES, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
}

/**
 * Calculate weapon attack bonus
 */
function weaponAtkBonus(weapon, abilities, pb) {
  if (!weapon || !abilities) return 0;
  
  const abilityKey = validateAbilityKey(weapon.ability);
  const mod = modFromScore(abilities[abilityKey] || 10);
  const prof = weapon.proficient ? pb : 0;
  const magic = validateMagicBonus(weapon.magicBonus);
  
  return mod + prof + magic;
}

/**
 * Calculate average weapon damage with error handling for damage string parsing
 */
function weaponAvgDamage(weapon, abilities, pb) {
  if (!weapon || !abilities) return "0.0";
  
  try {
    const abilityKey = validateAbilityKey(weapon.ability);
    const mod = modFromScore(abilities[abilityKey] || 10);
    const magicBonus = validateMagicBonus(weapon.magicBonus);
    const dmg = String(weapon.damage || "1d8");
    
    // Parse dice notation (e.g., "2d6", "1d8+3")
    const match = dmg.match(/(\d+)d(\d+)/i);
    let diceAvg = 4.5; // Default to d8 average
    
    if (match) { 
      const numDice = Number(match[1]) || 1;
      const dieSize = Number(match[2]) || 8;
      diceAvg = numDice * ((dieSize + 1) / 2); 
    }
    
    return (diceAvg + mod + magicBonus).toFixed(1);
  } catch (error) {
    console.error("Error calculating weapon damage:", error, weapon);
    return "0.0";
  }
}

// =========================================================
// 4. Optimizer Logic
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
  
  // Initialize all scores to minimum
  const scores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  
  // Create priority list
  const priorities = [primary, secondary, tertiary, ...ABILITIES.filter(a => ![primary,secondary,tertiary].includes(a))];
  const targets = [15, 14, 13, 12, 10, 8];
  
  // Apply initial distribution
  priorities.forEach((ab, i) => { 
    scores[ab] = targets[i] !== undefined ? targets[i] : 8; 
  });
  
  // Balance to exactly 27 points
  let cost = ABILITIES.reduce((s, a) => s + pointBuyCost(scores[a]), 0);
  
  // Reduce if over budget (shouldn't happen with standard targets, but safety check)
  while (cost > POINT_BUY_MAX_POINTS) {
    const reducible = priorities.slice().reverse().find(a => scores[a] > POINT_BUY_MIN_SCORE && a !== primary);
    if (!reducible) break;
    scores[reducible]--;
    cost = ABILITIES.reduce((s, a) => s + pointBuyCost(scores[a]), 0);
  }
  
  // Spend remaining points
  while (cost < POINT_BUY_MAX_POINTS) {
    const upgradable = priorities.find(a => {
      if (scores[a] >= POINT_BUY_MAX_SCORE) return false;
      const increase = pointBuyCost(scores[a] + 1) - pointBuyCost(scores[a]);
      return increase <= (POINT_BUY_MAX_POINTS - cost);
    });
    if (!upgradable) break;
    cost += pointBuyCost(scores[upgradable] + 1) - pointBuyCost(scores[upgradable]);
    scores[upgradable]++;
  }
  
  return scores;
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

    // Offensive capabilities
    const attackBonus = pb + primaryMod + validateMagicBonus(assumptions.magicBonus);
    const avgDie = cls.weaponStyle === "dex" ? 4.5 : 5.5; // Finesse/ranged vs heavy weapons
    const attacks = estimateAttacksPerRound(snapshot.class, snapshot.level);
    const hitChance = effectiveHitChance(attackBonus, assumptions.targetAC, assumptions.advantageRate);
    const bonusDamage = cls.features?.bonusDamagePerAttack || 0;
    const perHitDamage = avgDie + primaryMod + validateMagicBonus(assumptions.magicBonus) + bonusDamage;
    const sustainedDpr = Math.max(0, hitChance * perHitDamage * attacks);

    // Nova/burst damage
    const hasShortRestAbilities = (cls.features?.burstUsesPerShortRest || 0) > 0;
    const burstFactor = hasShortRestAbilities ? 1 + Math.min(0.75, assumptions.shortRests * 0.2) : 1;
    const burstBonus = hasShortRestAbilities ? NOVA_BURST_BONUS : 0;
    const featBonus = snapshot.featPlan?.includes("damage_feat") ? DAMAGE_FEAT_BONUS : 0;
    const novaDpr = sustainedDpr * (1 + burstBonus) * burstFactor + featBonus;

    // Defensive capabilities
    const hp = getEstimatedHP(snapshot.level, snapshot.class, conMod);
    const ac = getArmorClassEstimate({ 
      ...snapshot, 
      hasShield: objective === "tank", 
      armorMagicBonus: assumptions.magicBonus 
    }, dexMod);
    const effectiveHp = hp * (1 + (ac - 15) * AC_TO_HP_MULTIPLIER);

    // Spellcasting metrics
    const casterAbility = cls.defaultCastingAbility || "int";
    const spellDc = BASE_SPELL_DC + pb + modFromScore(snapshot.abilities[casterAbility]);
    const spellAttack = pb + modFromScore(snapshot.abilities[casterAbility]) + validateMagicBonus(assumptions.magicBonus);
    const failChance = saveFailChance(spellDc, assumptions.targetSaveBonus);
    const controlPressure = cls.spellcasting
      ? failChance * (10 + pb * 1.2) + (modFromScore(snapshot.abilities.con) * 0.6)
      : failChance * 2;

    // Skill proficiency score
    const skillKeys = getSuggestedSkills(snapshot.class, objective);
    const skillScore = skillKeys.reduce((sum, k) => {
      const skill = SKILLS.find(s => s.key === k);
      if (!skill) return sum;
      return sum + modFromScore(snapshot.abilities[skill.ability]) + pb;
    }, 0) + (snapshot.class === "rogue" ? pb * 1.5 : 0) + (snapshot.class === "bard" ? pb : 0);

    // Concentration and initiative
    const concentrationScore = cls.spellcasting
      ? (conMod + (cls.saveProficiencies.includes("con") ? pb : 0))
      : conMod;
    const initiativeBonus = snapshot.featPlan?.includes("initiative_feat") ? INITIATIVE_FEAT_BONUS : 0;
    const initiative = dexMod + initiativeBonus;

    // Calculate weighted score based on objective
    const W = {
      sustained_dpr: { sustainedDpr:1.4, novaDpr:0.4, effectiveHp:0.35, controlPressure:0.15, skillScore:0.1, concentrationScore:0.1, initiative:0.15 },
      nova_dpr:      { sustainedDpr:0.7, novaDpr:1.5, effectiveHp:0.2,  controlPressure:0.1,  skillScore:0.05,concentrationScore:0.05,initiative:0.2 },
      tank:          { sustainedDpr:0.35,novaDpr:0.15, effectiveHp:1.5,  controlPressure:0.2,  skillScore:0.05,concentrationScore:0.2, initiative:0.05 },
      controller:    { sustainedDpr:0.25,novaDpr:0.25, effectiveHp:0.25, controlPressure:1.5,  skillScore:0.15,concentrationScore:0.4, initiative:0.2 },
      skill:         { sustainedDpr:0.25,novaDpr:0.15, effectiveHp:0.2,  controlPressure:0.2,  skillScore:1.6, concentrationScore:0.1, initiative:0.2 },
      balanced:      { sustainedDpr:0.8, novaDpr:0.5,  effectiveHp:0.6,  controlPressure:0.6,  skillScore:0.4, concentrationScore:0.2, initiative:0.2 },
    }[objective] || { sustainedDpr:1,novaDpr:1,effectiveHp:1,controlPressure:1,skillScore:1,concentrationScore:1,initiative:1 };

    const score = sustainedDpr*W.sustainedDpr + novaDpr*W.novaDpr + effectiveHp*W.effectiveHp +
      controlPressure*W.controlPressure + skillScore*W.skillScore + concentrationScore*W.concentrationScore + initiative*W.initiative;

    return { 
      score, sustainedDpr, novaDpr, effectiveHp, ac, hp, 
      spellDc, spellAttack, controlPressure, skillScore, 
      concentrationScore, initiative, hitChance, primary 
    };
  } catch (error) {
    console.error("Error evaluating build snapshot:", error, snapshot);
    // Return safe defaults
    return {
      score: 0, sustainedDpr: 0, novaDpr: 0, effectiveHp: 30, ac: 10, hp: 30,
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
    
    return milestones.map(level => {
      const abilities = autoAssignPointBuy(baseClass, objective);
      const featPlan = [];
      const asiLevels = ASI_LEVELS.filter(n => n <= level);
      const primary = getPrimaryAbilityForObjective(baseClass, objective);
      const caster = getClassData(baseClass).defaultCastingAbility;
      
      // Simulate ASI/feat choices
      asiLevels.forEach((_, idx) => {
        const canTakeFeat = assumptions.feats;
        const preferInitiative = canTakeFeat && objective === "controller" && idx === 0;
        const preferDamage = canTakeFeat && ["sustained_dpr","nova_dpr"].includes(objective) && idx === 0;
        
        if (preferInitiative) {
          featPlan.push("initiative_feat");
        } else if (preferDamage) {
          featPlan.push("damage_feat");
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
      
      const snapshot = { class: baseClass, level, abilities, featPlan };
      const metrics = evaluateBuildSnapshot(snapshot, assumptions, objective);
      return { level, snapshot, metrics };
    });
  } catch (error) {
    console.error("Error building milestone plan:", error);
    return [];
  }
}

/**
 * Generate optimized candidate builds for all classes
 * Returns sorted array of build recommendations
 */
function generateCandidateBuilds(config) {
  try {
    const { objective, assumptions, classPool } = config;
    const pool = classPool && classPool.length ? classPool : CLASS_OPTIONS;
    
    const results = pool.map(classKey => {
      try {
        const plan = buildMilestonePlan(classKey, objective, assumptions);
        if (!plan || plan.length === 0) return null;
        
        const finalStep = plan[plan.length - 1] || plan[0];
        if (!finalStep || !finalStep.metrics) return null;
        
        const score = finalStep.metrics.score || 0;
        const cls = getClassData(classKey);
        
        // Identify strengths
        const strengths = [];
        if (finalStep.metrics.sustainedDpr >= 12) strengths.push("Strong sustained offense");
        if (finalStep.metrics.novaDpr >= 18)      strengths.push("Strong burst potential");
        if (finalStep.metrics.effectiveHp >= 70)  strengths.push("High durability");
        if (finalStep.metrics.controlPressure >= 6) strengths.push("Strong control");
        if (finalStep.metrics.skillScore >= 15)   strengths.push("High utility");
        if (cls.tags.includes("short_rest"))       strengths.push("Short-rest efficient");
        
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
            novaDpr: finalStep.metrics.novaDpr,
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
    });
    
    // Filter out failed builds and sort by score
    return results.filter(r => r !== null).sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Error generating candidate builds:", error);
    return [];
  }
}

// =========================================================
// 5. State Model
// =========================================================

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
      assumptions: { ...RULE_PRESETS.common_optimized, analysisLevel: 8 },
      results: [],
    },
  };
}

/**
 * Hydrate and validate character data from storage or import
 * Ensures all required fields exist with valid values
 */
function hydrateCharacter(raw) {
  const def = createDefaultCharacter();
  if (!raw || typeof raw !== "object") return def;
  
  try {
    // Validate and merge identity
    const identity = { ...def.identity };
    if (raw.identity && typeof raw.identity === "object") {
      Object.assign(identity, raw.identity);
    }
    
    // Validate class and level
    const characterClass = validateClassKey(raw.class);
    const level = validateLevel(raw.level);
    const abilityMode = ["standard", "pointbuy", "manual"].includes(raw.abilityMode) 
      ? raw.abilityMode 
      : "standard";
    
    // Validate abilities
    const abilities = { ...def.abilities };
    if (raw.abilities && typeof raw.abilities === "object") {
      ABILITIES.forEach(ab => {
        if (raw.abilities[ab] !== undefined) {
          abilities[ab] = validateAbilityScore(raw.abilities[ab], abilityMode);
        }
      });
    }
    
    // Validate skills
    const skills = { ...def.skills };
    if (raw.skills && typeof raw.skills === "object") {
      Object.keys(raw.skills).forEach(key => {
        if (skills[key] && typeof raw.skills[key] === "object") {
          skills[key] = {
            proficient: Boolean(raw.skills[key].proficient),
            expertise: Boolean(raw.skills[key].expertise)
          };
        }
      });
    }
    
    // Validate weapons
    let weapons = def.weapons;
    if (Array.isArray(raw.weapons) && raw.weapons.length > 0) {
      weapons = raw.weapons.map(w => ({
        id: w.id || safeId(),
        name: String(w.name || ""),
        ability: validateAbilityKey(w.ability),
        proficient: Boolean(w.proficient),
        magicBonus: validateMagicBonus(w.magicBonus),
        damage: String(w.damage || "1d8+MOD")
      }));
    }
    
    // Validate spellcasting
    const spellcasting = { ...def.spellcasting };
    if (raw.spellcasting && typeof raw.spellcasting === "object") {
      if (raw.spellcasting.castingAbility) {
        spellcasting.castingAbility = validateAbilityKey(raw.spellcasting.castingAbility);
      }
      if (raw.spellcasting.slots && typeof raw.spellcasting.slots === "object") {
        for (let i = 1; i <= MAX_SPELL_LEVEL; i++) {
          spellcasting.slots[i] = validateSpellSlot(raw.spellcasting.slots[i]);
        }
      }
      spellcasting.knownSpells = String(raw.spellcasting.knownSpells || "");
      spellcasting.preparedSpells = String(raw.spellcasting.preparedSpells || "");
    }
    
    // Validate equipment
    let equipment = def.equipment;
    if (Array.isArray(raw.equipment)) {
      equipment = raw.equipment.filter(e => typeof e === "string" && e.trim());
    }
    
    // Validate optimizer settings
    const optimizer = { ...def.optimizer };
    if (raw.optimizer && typeof raw.optimizer === "object") {
      const validObjective = OPTIMIZER_OBJECTIVES.find(o => o.key === raw.optimizer.objective);
      if (validObjective) optimizer.objective = validObjective.key;
      
      if (RULE_PRESETS[raw.optimizer.rulePreset]) {
        optimizer.rulePreset = raw.optimizer.rulePreset;
      }
      
      if (raw.optimizer.assumptions && typeof raw.optimizer.assumptions === "object") {
        optimizer.assumptions = { ...def.optimizer.assumptions, ...raw.optimizer.assumptions };
        optimizer.assumptions.analysisLevel = validateLevel(optimizer.assumptions.analysisLevel);
      }
    }
    
    return {
      identity,
      class: characterClass,
      level,
      abilityMode,
      abilities,
      skills,
      weapons,
      spellcasting,
      features: String(raw.features || ""),
      traits: String(raw.traits || ""),
      notes: String(raw.notes || ""),
      equipment,
      hasShield: Boolean(raw.hasShield),
      armorMagicBonus: validateMagicBonus(raw.armorMagicBonus),
      optimizer,
    };
  } catch (error) {
    console.error("Error hydrating character:", error);
    setStatus("⚠ Character data partially corrupted, using defaults", true);
    return def;
  }
}

// =========================================================
// 6. Persistence (with error handling)
// =========================================================

let _saveTimer = null;

/**
 * Schedule a delayed save to localStorage
 * Debounced to avoid excessive writes
 */
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { 
      const json = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, json);
    } catch (e) { 
      console.error("Save failed:", e);
      setStatus("⚠ Save failed: " + e.message, true); 
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
// 7. App State
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

// =========================================================
// 8. DOM Helpers
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
// 9. Render Functions
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
  const tbody = document.getElementById("ability-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  ABILITIES.forEach(ab => {
    const score = state.abilities[ab];
    const mod = modFromScore(score);
    const saveProf = cls.saveProficiencies.includes(ab);
    const saveMod = mod + (saveProf ? pb : 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ABILITY_LABELS[ab]}</td>
      <td><input type="number" min="${state.abilityMode === 'pointbuy' ? POINT_BUY_MIN_SCORE : ABILITY_SCORE_MIN}" max="${state.abilityMode === 'pointbuy' ? POINT_BUY_MAX_SCORE : ABILITY_SCORE_MAX}" value="${score}" data-ab="${ab}"></td>
      <td class="mod-cell">${fmtMod(mod)}</td>
      <td class="save-cell ${saveProf ? "save-prof" : ""}">${fmtMod(saveMod)}${saveProf ? " ●" : ""}</td>
    `;
    tbody.appendChild(tr);
  });

  // Point buy info
  const pbInfo = document.getElementById("pb-info");
  if (state.abilityMode === "pointbuy") {
    const spent = ABILITIES.reduce((s, a) => s + pointBuyCost(state.abilities[a]), 0);
    const rem = POINT_BUY_MAX_POINTS - spent;
    pbInfo.textContent = `Points: ${spent} / ${POINT_BUY_MAX_POINTS}  (${rem} remaining)`;
    pbInfo.className = spent > POINT_BUY_MAX_POINTS ? "pb-info over" : "pb-info";
  } else {
    pbInfo.className = "pb-info hidden";
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

  const grid = document.getElementById("derived-stats");
  if (!grid) return;
  const items = [
    ["HP", hp],
    ["AC", ac],
    ["Prof", fmtMod(pb)],
    ["PP", pp],
  ];
  grid.innerHTML = items.map(([lbl, val]) =>
    `<div class="derived-chip"><div class="dval">${val}</div><div class="dlbl">${lbl}</div></div>`
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
      <td><button class="del-btn" data-del-weapon="${w.id}" title="Remove">✕</button></td>
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
  { key: "targetAC",          label: "Target AC",        type: "number", min: 10, max: 25 },
  { key: "targetSaveBonus",   label: "Target Save",      type: "number", min: 0,  max: 12 },
  { key: "advantageRate",     label: "Adv Rate (0–1)",   type: "number", min: 0,  max: 1, step: 0.05 },
  { key: "magicBonus",        label: "Magic Bonus",      type: "number", min: 0,  max: MAX_MAGIC_BONUS },
  { key: "shortRests",        label: "Short Rests/Day",  type: "number", min: 0,  max: 6 },
  { key: "roundsPerEncounter",label: "Rounds/Encounter", type: "number", min: 1,  max: 10 },
  { key: "encountersPerDay",  label: "Enc/Day",          type: "number", min: 1,  max: 8 },
  { key: "feats",             label: "Feats Allowed",    type: "checkbox" },
  { key: "multiclass",        label: "Multiclass",       type: "checkbox" },
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
function renderMetrics() {
  try {
    const snapshot = { class: state.class, level: Number(state.level), abilities: state.abilities, featPlan: [] };
    const metrics = evaluateBuildSnapshot(snapshot, state.optimizer.assumptions, state.optimizer.objective);
    const grid = document.getElementById("metrics-grid");
    if (!grid) return;
    const items = [
      ["Sust DPR", fmtFixed(metrics.sustainedDpr)],
      ["Nova DPR", fmtFixed(metrics.novaDpr)],
      ["Eff HP",   Math.round(metrics.effectiveHp)],
      ["AC",       metrics.ac],
      ["Spell DC", metrics.spellDc],
      ["Control",  fmtFixed(metrics.controlPressure)],
      ["Skills",   fmtFixed(metrics.skillScore)],
      ["Score",    fmtFixed(metrics.score)],
    ];
    grid.innerHTML = items.map(([lbl, val]) =>
      `<div class="metric-chip"><div class="mval">${val}</div><div class="mlbl">${lbl}</div></div>`
    ).join("");
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
    list.innerHTML = `<div style="font-size:0.72rem;color:#8b949e;padding:0.4rem">Click ⚡ Optimize to generate builds.</div>`;
    if (note) note.textContent = "";
    return;
  }
  if (note) note.textContent = `${results.length} results`;
  list.innerHTML = "";
  results.forEach((r, idx) => {
    const card = document.createElement("div");
    card.className = "result-card" + (idx === 0 ? " rank-1" : "");
    const s = r.summary;
    card.innerHTML = `
      <div class="result-header">
        <span class="result-name">#${idx+1} ${r.classLabel}</span>
        <span class="result-score">Score: ${fmtFixed(r.score)}</span>
      </div>
      <div class="result-stats">
        <span>DPR: ${fmtFixed(s.sustainedDpr)}</span>
        <span>Nova: ${fmtFixed(s.novaDpr)}</span>
        <span>eHP: ${Math.round(s.effectiveHp)}</span>
        <span>AC: ${s.ac}</span>
        <span>SpDC: ${s.spellDc}</span>
        <span>Init: ${fmtMod(s.initiative)}</span>
        <span>Pri: ${s.primaryStat?.toUpperCase()}</span>
      </div>
      <div class="result-tags">
        ${r.strengths.map(t => `<span class="tag good">${t}</span>`).join("")}
        ${r.tradeoffs.map(t => `<span class="tag warn">⚠ ${t}</span>`).join("")}
      </div>
      <button class="result-apply-btn" data-apply-idx="${idx}">Apply to Builder</button>
    `;
    list.appendChild(card);
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// --- Full render ---
function render() {
  renderIdentity();
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
// 10. Event Wiring
// =========================================================
function wireEvents() {
  // Identity text inputs
  document.getElementById("f-name").addEventListener("input", e => { state.identity.name = e.target.value; scheduleSave(); setStatus("Saved."); });
  document.getElementById("f-player").addEventListener("input", e => { state.identity.player = e.target.value; scheduleSave(); });
  document.getElementById("f-subclass").addEventListener("input", e => { state.identity.subclass = e.target.value; scheduleSave(); });
  document.getElementById("f-level").addEventListener("change", e => {
    state.level = validateLevel(e.target.value);
    e.target.value = state.level; // Update display with validated value
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    scheduleSave();
  });
  document.getElementById("f-class").addEventListener("change", e => {
    state.class = validateClassKey(e.target.value);
    // auto-update casting ability to class default
    const def = getClassData(state.class).defaultCastingAbility;
    if (def) state.spellcasting.castingAbility = def;
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderSpellSlots(); renderMetrics();
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
  document.getElementById("ability-tbody").addEventListener("change", e => {
    const ab = e.target.dataset.ab;
    if (!ab) return;
    state.abilities[ab] = validateAbilityScore(e.target.value, state.abilityMode);
    e.target.value = state.abilities[ab]; // Update display with validated value
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    scheduleSave();
  });

  // Apply standard array
  document.getElementById("btn-std-array").addEventListener("click", () => {
    const arr = [...STANDARD_ARRAY];
    ABILITIES.forEach((a, i) => state.abilities[a] = arr[i]);
    state.abilityMode = "standard";
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    scheduleSave();
  });

  // Auto point buy
  document.getElementById("btn-auto-pb").addEventListener("click", () => {
    try {
      const scores = autoAssignPointBuy(state.class, state.optimizer.objective);
      Object.assign(state.abilities, scores);
      state.abilityMode = "pointbuy";
      renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
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
    renderSkills(); renderDerived(); renderMetrics();
    scheduleSave();
  });

  document.getElementById("btn-clear-skills").addEventListener("click", () => {
    state.skills = DEFAULT_SKILLS_STATE();
    renderSkills(); renderDerived(); renderMetrics();
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
    renderDerived(); renderMetrics(); scheduleSave();
  });

  document.getElementById("f-has-shield").addEventListener("change", e => {
    state.hasShield = e.target.checked;
    renderDerived(); renderMetrics(); scheduleSave();
  });

  document.getElementById("f-armor-bonus").addEventListener("change", e => {
    state.armorMagicBonus = validateMagicBonus(e.target.value);
    e.target.value = state.armorMagicBonus;
    renderDerived(); renderMetrics(); scheduleSave();
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
    renderMetrics(); scheduleSave();
  });
  document.getElementById("f-rule-preset").addEventListener("change", e => {
    const key = e.target.value;
    const preset = RULE_PRESETS[key];
    if (preset) {
      state.optimizer.rulePreset = key;
      state.optimizer.assumptions = { ...state.optimizer.assumptions, ...preset, analysisLevel: state.optimizer.assumptions.analysisLevel };
      renderOptimizer(); renderMetrics(); scheduleSave();
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
    renderMetrics(); scheduleSave();
  });

  // Toolbar buttons
  document.getElementById("btn-optimize").addEventListener("click", () => {
    try {
      setStatus("Generating builds…");
      const results = generateCandidateBuilds({
        objective: state.optimizer.objective,
        assumptions: state.optimizer.assumptions,
        classPool: [],
      }).slice(0, 5);
      state.optimizer.results = results;
      renderResults(); renderMetrics(); scheduleSave();
      setStatus(`Top ${results.length} builds generated.`);
    } catch (error) {
      console.error("Optimization failed:", error);
      setStatus("⚠ Optimization failed", true);
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
      state = hydrateCharacter(parsed);
      render();
      document.getElementById("f-known-spells").value = state.spellcasting.knownSpells || "";
      document.getElementById("f-prep-spells").value = state.spellcasting.preparedSpells || "";
      document.getElementById("f-import-text").value = "";
      scheduleSave();
      setStatus("Import successful.");
    } catch (error) {
      console.error("Import failed:", error);
      setStatus("⚠ Invalid JSON", true);
    }
  });

  // Apply build from results list
  document.getElementById("results-list").addEventListener("click", e => {
    const btn = e.target.closest("[data-apply-idx]");
    if (!btn) return;
    applyBuildResult(Number(btn.dataset.applyIdx));
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
    const castAb = getClassData(result.classKey).defaultCastingAbility;
    if (castAb) state.spellcasting.castingAbility = castAb;
    render();
    scheduleSave();
    setStatus(`Applied ${result.classLabel} build.`);
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
// 11. Boot
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
