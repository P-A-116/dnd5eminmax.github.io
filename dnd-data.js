/* =========================================================
   D&D 5e SRD-Safe Builder – shared data tables
   Pure data: no framework, no DOM, no side-effects.
   ========================================================= */

// =========================================================
// Ability score constants
// =========================================================
export const ABILITY_SCORE_MIN = 3;
export const ABILITY_SCORE_MAX = 20;

// ASI/Feat breakpoint levels (Fighter gets extra at 6/14 but we keep it simple)
export const ASI_LEVELS       = [4, 8, 12, 16, 19];

// Milestone levels used by the optimizer analysis
export const MILESTONE_LEVELS = [1, 3, 5, 8, 11, 17, 20];

// =========================================================
// Display labels
// =========================================================
export const ABILITY_LABELS = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

// =========================================================
// Standard array values
// =========================================================
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// =========================================================
// Character identity drop-downs
// =========================================================
export const ALIGNMENTS = [
  "Lawful Good",   "Neutral Good",  "Chaotic Good",
  "Lawful Neutral","True Neutral",  "Chaotic Neutral",
  "Lawful Evil",   "Neutral Evil",  "Chaotic Evil",
];

export const RACES = [
  "Human","Dwarf","Elf","Halfling","Dragonborn",
  "Gnome","Half-Elf","Half-Orc","Tiefling","Custom / Lineage",
];

export const BACKGROUNDS = [
  "Acolyte","Criminal","Folk Hero","Noble","Sage",
  "Soldier","Artisan","Entertainer","Hermit","Custom",
];

// =========================================================
// Skills
// =========================================================
export const SKILLS = [
  { key: "acrobatics",     label: "Acrobatics",      ability: "dex" },
  { key: "animalHandling", label: "Animal Handling",  ability: "wis" },
  { key: "arcana",         label: "Arcana",           ability: "int" },
  { key: "athletics",      label: "Athletics",        ability: "str" },
  { key: "deception",      label: "Deception",        ability: "cha" },
  { key: "history",        label: "History",          ability: "int" },
  { key: "insight",        label: "Insight",          ability: "wis" },
  { key: "intimidation",   label: "Intimidation",     ability: "cha" },
  { key: "investigation",  label: "Investigation",    ability: "int" },
  { key: "medicine",       label: "Medicine",         ability: "wis" },
  { key: "nature",         label: "Nature",           ability: "int" },
  { key: "perception",     label: "Perception",       ability: "wis" },
  { key: "performance",    label: "Performance",      ability: "cha" },
  { key: "persuasion",     label: "Persuasion",       ability: "cha" },
  { key: "religion",       label: "Religion",         ability: "int" },
  { key: "sleightOfHand",  label: "Sleight of Hand",  ability: "dex" },
  { key: "stealth",        label: "Stealth",          ability: "dex" },
  { key: "survival",       label: "Survival",         ability: "wis" },
];

// =========================================================
// Optimizer objectives
// =========================================================
export const OPTIMIZER_OBJECTIVES = [
  { key: "sustained_dpr", label: "Sustained DPR"          },
  { key: "nova_dpr",      label: "Nova / Burst DPR"       },
  { key: "tank",          label: "Tank / Effective HP"    },
  { key: "controller",    label: "Control / Save Pressure" },
  { key: "skill",         label: "Skill Specialist"       },
  { key: "balanced",      label: "Balanced All-Rounder"   },
];

// =========================================================
// Rule presets (used by optimizer assumptions UI)
// =========================================================
export const RULE_PRESETS = {
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
