/* =========================================================
   D&D 5e SRD-Safe Rules Engine
   Shared math and rules logic for the D&D 5e Min/Max Builder

   Usable as ESM:
     import { modFromScore } from './dnd-engine.js';

   Usable as a browser global (for classic <script> usage):
     DndEngine.modFromScore(score)
   ========================================================= */

// =========================================================
// Constants
// =========================================================

export const POINT_BUY_MAX_POINTS = 27;
export const POINT_BUY_MIN_SCORE  = 8;
export const POINT_BUY_MAX_SCORE  = 15;
export const MAX_LEVEL            = 20;
export const MIN_LEVEL            = 1;
export const MAX_MAGIC_BONUS      = 5;
export const D20_SIDES            = 20;
export const BASE_AC              = 10;
export const MIN_HIT_CHANCE       = 0.05; // Natural 1 always misses
export const MAX_HIT_CHANCE       = 0.95; // Natural 20 always hits

// Needed-roll clamp bounds for d20 checks.
// A "needed roll" of 2 means any roll except a 1 hits; 19 means only a 20 hits
// (natural 20 always hits / natural 1 always misses, enforced by MIN/MAX_HIT_CHANCE).
export const NEEDED_ROLL_MIN = 2;
export const NEEDED_ROLL_MAX = 19;

// Effective-HP calculation: adjusts raw HP by how far AC deviates from baseline.
// EHP = HP × (1 + (AC − EHP_AC_BASELINE) × EHP_AC_SCALAR)
export const EHP_AC_BASELINE = 15;  // Typical enemy target AC in 5e
export const EHP_AC_SCALAR   = 0.07; // HP multiplier per AC point above/below baseline

// Default average for a d8 (the most common versatile weapon die), used as a
// fallback when the weapon damage string cannot be parsed.
export const DEFAULT_DIE_AVERAGE = 4.5; // (1 + 8) / 2

// Default ability score used when a value is missing or invalid (10 = +0 modifier).
export const DEFAULT_ABILITY_SCORE = 10;

// =========================================================
// Data Tables
// =========================================================

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

export const CLASSES = {
  barbarian: { label: "Barbarian", hitDie: 12, saveProficiencies: ["str","con"], armorType: "medium",    weaponStyle: "str", spellcasting: null,   defaultCastingAbility: null, tags: ["frontliner","durable","sustained_dpr"],        features: { extraAttackLevel: 5,    burstUsesPerShortRest: 0, bonusDamagePerAttack: 2 } },
  bard:      { label: "Bard",      hitDie:  8, saveProficiencies: ["dex","cha"], armorType: "light",     weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "cha", tags: ["support","control","utility"],                features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  cleric:    { label: "Cleric",    hitDie:  8, saveProficiencies: ["wis","cha"], armorType: "medium",    weaponStyle: "str", spellcasting: "full", defaultCastingAbility: "wis", tags: ["support","control","durable"],                features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  druid:     { label: "Druid",     hitDie:  8, saveProficiencies: ["int","wis"], armorType: "medium",    weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "wis", tags: ["control","support","utility"],                features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  fighter:   { label: "Fighter",   hitDie: 10, saveProficiencies: ["str","con"], armorType: "heavy",     weaponStyle: "str", spellcasting: null,   defaultCastingAbility: null, tags: ["frontliner","sustained_dpr","nova_dpr","tank"], features: { extraAttackLevel: 5,    burstUsesPerShortRest: 1, bonusDamagePerAttack: 0 } },
  monk:      { label: "Monk",      hitDie:  8, saveProficiencies: ["str","dex"], armorType: "unarmored", weaponStyle: "dex", spellcasting: null,   defaultCastingAbility: null, tags: ["mobile","sustained_dpr","skirmisher"],         features: { extraAttackLevel: 5,    burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  paladin:   { label: "Paladin",   hitDie: 10, saveProficiencies: ["wis","cha"], armorType: "heavy",     weaponStyle: "str", spellcasting: "half", defaultCastingAbility: "cha", tags: ["nova_dpr","tank","support"],                  features: { extraAttackLevel: 5,    burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  ranger:    { label: "Ranger",    hitDie: 10, saveProficiencies: ["str","dex"], armorType: "medium",    weaponStyle: "dex", spellcasting: "half", defaultCastingAbility: "wis", tags: ["sustained_dpr","utility","ranged"],           features: { extraAttackLevel: 5,    burstUsesPerShortRest: 0, bonusDamagePerAttack: 1 } },
  rogue:     { label: "Rogue",     hitDie:  8, saveProficiencies: ["dex","int"], armorType: "light",     weaponStyle: "dex", spellcasting: null,   defaultCastingAbility: null, tags: ["nova_dpr","skills","initiative"],              features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 3 } },
  sorcerer:  { label: "Sorcerer",  hitDie:  6, saveProficiencies: ["con","cha"], armorType: "light",     weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "cha", tags: ["blaster","control","concentration"],          features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
  warlock:   { label: "Warlock",   hitDie:  8, saveProficiencies: ["wis","cha"], armorType: "light",     weaponStyle: "dex", spellcasting: "pact", defaultCastingAbility: "cha", tags: ["sustained_dpr","blaster","short_rest"],       features: { extraAttackLevel: null, burstUsesPerShortRest: 1, bonusDamagePerAttack: 0 } },
  wizard:    { label: "Wizard",    hitDie:  6, saveProficiencies: ["int","wis"], armorType: "light",     weaponStyle: "dex", spellcasting: "full", defaultCastingAbility: "int", tags: ["control","blaster","utility"],                features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 } },
};

// Internal – not exported separately; consumers can use Object.keys(CLASSES)
const CLASS_OPTIONS = Object.keys(CLASSES);

// =========================================================
// Validation Helpers
// =========================================================

/**
 * Clamp a number between min and max, coercing to Number.
 * Returns min if the value is not a valid number.
 */
export function clamp(n, min, max) {
  const num = Number(n);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
}

/**
 * Validate and clamp a character level to [1, 20].
 */
export function validateLevel(level) {
  const num = Number(level);
  if (isNaN(num)) return MIN_LEVEL;
  return clamp(num, MIN_LEVEL, MAX_LEVEL);
}

/**
 * Validate a magic bonus, clamping to [0, MAX_MAGIC_BONUS].
 */
export function validateMagicBonus(bonus) {
  const num = Number(bonus);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(num, MAX_MAGIC_BONUS);
}

/**
 * Validate that a class key exists; fall back to "fighter".
 */
export function validateClassKey(key) {
  return CLASS_OPTIONS.includes(key) ? key : "fighter";
}

/**
 * Validate that an ability key exists; fall back to "str".
 */
export function validateAbilityKey(key) {
  return ABILITIES.includes(key) ? key : "str";
}

// =========================================================
// Rules Math
// =========================================================

/**
 * Ability modifier from a raw score.
 */
export function modFromScore(score) {
  const num = Number(score);
  if (isNaN(num)) return 0;
  return Math.floor((num - 10) / 2);
}

/**
 * Proficiency bonus for a given character level (1–20).
 */
export function proficiencyBonus(level) {
  const lvl = validateLevel(level);
  return Math.floor((lvl - 1) / 4) + 2;
}

/**
 * Point-buy cost table for a single ability score.
 * Scores below 8 return 0; scores above 15 return 9 (max cost).
 */
export function pointBuyCost(s) {
  const score = Number(s);
  if (isNaN(score) || score < POINT_BUY_MIN_SCORE) return 0;
  if (score > POINT_BUY_MAX_SCORE) return 9;
  const costTable = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 7, 9];
  return costTable[score] || 0;
}

/**
 * Retrieve class data for a given key, falling back to "fighter" if unknown.
 */
export function getClassData(key) {
  const validKey = validateClassKey(key);
  return CLASSES[validKey];
}

/**
 * Estimated maximum HP at a given level, class, and Constitution modifier.
 */
export function getEstimatedHP(level, classKey, conMod) {
  const hd  = getClassData(classKey).hitDie;
  const lvl = validateLevel(level);
  const con = Number(conMod) || 0;
  if (lvl <= 1) return hd + con;
  const avgRoll = Math.floor(hd / 2) + 1;
  return hd + con + (lvl - 1) * (avgRoll + con);
}

/**
 * Estimated Armor Class for a character object with optional dexterity modifier.
 * character must have: .class, .hasShield, .armorMagicBonus, .abilities
 */
export function getArmorClassEstimate(character, dexMod) {
  try {
    const cls    = getClassData(character.class);
    const shield = character.hasShield ? 2 : 0;
    const mag    = validateMagicBonus(character.armorMagicBonus);
    const dex    = Number(dexMod) || 0;

    if (cls.armorType === "heavy")     return 16 + shield + mag;
    if (cls.armorType === "medium")    return 14 + clamp(dex, 0, 2) + shield + mag;
    if (cls.armorType === "light")     return 11 + dex + shield + mag;
    if (cls.armorType === "unarmored") {
      const wisBonus = Math.max(modFromScore(character.abilities?.wis || DEFAULT_ABILITY_SCORE), 0);
      return BASE_AC + dex + wisBonus;
    }
    return BASE_AC + dex;
  } catch (error) {
    console.error("Error calculating AC:", error);
    return BASE_AC;
  }
}

/**
 * Determine the effective spellcasting ability for a character.
 * Falls back to the class default, then "int".
 */
export function getCasterAbility(character) {
  if (!character || !character.spellcasting) return "int";
  const specified = character.spellcasting.castingAbility;
  if (specified && ABILITIES.includes(specified)) return specified;
  const classDefault = getClassData(character.class).defaultCastingAbility;
  return classDefault || "int";
}

/**
 * Estimate the number of weapon attacks per round based on class and level.
 */
export function estimateAttacksPerRound(classKey, level) {
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
 * Effective hit chance against a target AC, accounting for advantage.
 * @param {number} attackBonus  - Total attack bonus (ability mod + PB + magic)
 * @param {number} targetAC     - Target's Armor Class
 * @param {number} advantageRate - Fraction of attacks made with advantage [0, 1]
 */
export function effectiveHitChance(attackBonus, targetAC, advantageRate = 0) {
  const bonus   = Number(attackBonus) || 0;
  const ac      = Number(targetAC) || 10;
  const advRate = clamp(advantageRate, 0, 1);

  const needed       = clamp(ac - bonus, NEEDED_ROLL_MIN, NEEDED_ROLL_MAX);
  const base         = clamp((D20_SIDES + 1 - needed) / D20_SIDES, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
  const withAdvantage = 1 - Math.pow(1 - base, 2);

  return base * (1 - advRate) + withAdvantage * advRate;
}

/**
 * Probability that a target fails a saving throw against a given save DC.
 * @param {number} saveDC         - The spell or ability save DC
 * @param {number} targetSaveBonus - Target's total saving throw modifier
 */
export function saveFailChance(saveDC, targetSaveBonus) {
  const dc    = Number(saveDC) || 10;
  const bonus = Number(targetSaveBonus) || 0;
  const needed = clamp(dc - bonus, NEEDED_ROLL_MIN, NEEDED_ROLL_MAX);
  return clamp((needed - 1) / D20_SIDES, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
}

/**
 * Total attack bonus for a weapon, given the character's ability scores and
 * proficiency bonus.
 */
export function weaponAtkBonus(weapon, abilities, pb) {
  if (!weapon || !abilities) return 0;
  const abilityKey = validateAbilityKey(weapon.ability);
  const mod        = modFromScore(abilities[abilityKey] || DEFAULT_ABILITY_SCORE);
  const prof       = weapon.proficient ? pb : 0;
  const magic      = validateMagicBonus(weapon.magicBonus);
  return mod + prof + magic;
}

/**
 * Average damage string for a weapon (e.g. "7.5").
 * Parses standard dice notation such as "2d6" or "1d8+3".
 */
export function weaponAvgDamage(weapon, abilities, pb) {
  if (!weapon || !abilities) return "0.0";
  try {
    const abilityKey = validateAbilityKey(weapon.ability);
    const mod        = modFromScore(abilities[abilityKey] || DEFAULT_ABILITY_SCORE);
    const magicBonus = validateMagicBonus(weapon.magicBonus);
    const dmg        = String(weapon.damage || "1d8");

    const match    = dmg.match(/(\d+)d(\d+)/i);
    let   diceAvg  = DEFAULT_DIE_AVERAGE; // Fallback to d8 average when damage string is unparseable

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
// Browser global – attach the full API to globalThis.DndEngine
// so the module can also be used from classic <script> tags.
// =========================================================
if (typeof globalThis !== "undefined") {
  globalThis.DndEngine = {
    // Constants
    ABILITIES,
    CLASSES,
    POINT_BUY_MAX_POINTS,
    POINT_BUY_MIN_SCORE,
    POINT_BUY_MAX_SCORE,
    MAX_LEVEL,
    MIN_LEVEL,
    MAX_MAGIC_BONUS,
    D20_SIDES,
    BASE_AC,
    MIN_HIT_CHANCE,
    MAX_HIT_CHANCE,
    NEEDED_ROLL_MIN,
    NEEDED_ROLL_MAX,
    EHP_AC_BASELINE,
    EHP_AC_SCALAR,
    DEFAULT_DIE_AVERAGE,
    DEFAULT_ABILITY_SCORE,
    // Validation helpers
    clamp,
    validateLevel,
    validateMagicBonus,
    validateClassKey,
    validateAbilityKey,
    // Rules math
    modFromScore,
    proficiencyBonus,
    pointBuyCost,
    getClassData,
    getEstimatedHP,
    getArmorClassEstimate,
    getCasterAbility,
    estimateAttacksPerRound,
    effectiveHitChance,
    saveFailChance,
    weaponAtkBonus,
    weaponAvgDamage,
  };
}
