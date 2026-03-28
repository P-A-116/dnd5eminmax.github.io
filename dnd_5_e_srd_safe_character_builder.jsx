import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Trash2, Download, Upload, RotateCcw, Printer, Sparkles, Shield, Swords, Wand2, BarChart3, CheckCircle2 } from "lucide-react";

/**
 * D&D 5e SRD-Safe Character Builder + Optimizer (Single-file React App)
 * ---------------------------------------------------------------------
 * Version 2 patch adds "Optimizer Mode" while keeping the app SRD-safe.
 *
 * DESIGN NOTES
 * - Data-driven rules scaffolding for easy future expansion.
 * - Generic / SRD-safe descriptors only; no copyrighted feature prose.
 * - Heuristic optimizer (not full rules simulation) for practical build planning.
 * - localStorage persistence, JSON import/export, print support.
 *
 * This file intentionally contains all data and logic in one place for Canvas.
 */

// =========================
// Core Data
// =========================
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABELS = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

const SKILLS = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "animalHandling", label: "Animal Handling", ability: "wis" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "history", label: "History", ability: "int" },
  { key: "insight", label: "Insight", ability: "wis" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "investigation", label: "Investigation", ability: "int" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "int" },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "persuasion", label: "Persuasion", ability: "cha" },
  { key: "religion", label: "Religion", ability: "int" },
  { key: "sleightOfHand", label: "Sleight of Hand", ability: "dex" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" },
];

// Generic class scaffolding. Keep this intentionally concise + extendable.
const CLASSES = {
  barbarian: {
    label: "Barbarian",
    hitDie: 12,
    saveProficiencies: ["str", "con"],
    armorType: "medium",
    weaponStyle: "str",
    spellcasting: null,
    tags: ["frontliner", "durable", "sustained_dpr"],
    features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 2 },
  },
  bard: {
    label: "Bard",
    hitDie: 8,
    saveProficiencies: ["dex", "cha"],
    armorType: "light",
    weaponStyle: "dex",
    spellcasting: "full",
    defaultCastingAbility: "cha",
    tags: ["support", "control", "utility"],
    features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 },
  },
  cleric: {
    label: "Cleric",
    hitDie: 8,
    saveProficiencies: ["wis", "cha"],
    armorType: "medium",
    weaponStyle: "str",
    spellcasting: "full",
    defaultCastingAbility: "wis",
    tags: ["support", "control", "durable"],
    features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 },
  },
  druid: {
    label: "Druid",
    hitDie: 8,
    saveProficiencies: ["int", "wis"],
    armorType: "medium",
    weaponStyle: "dex",
    spellcasting: "full",
    defaultCastingAbility: "wis",
    tags: ["control", "support", "utility"],
    features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 },
  },
  fighter: {
    label: "Fighter",
    hitDie: 10,
    saveProficiencies: ["str", "con"],
    armorType: "heavy",
    weaponStyle: "str",
    spellcasting: null,
    tags: ["frontliner", "sustained_dpr", "nova_dpr", "tank"],
    features: { extraAttackLevel: 5, burstUsesPerShortRest: 1, bonusDamagePerAttack: 0 },
  },
  monk: {
    label: "Monk",
    hitDie: 8,
    saveProficiencies: ["str", "dex"],
    armorType: "unarmored",
    weaponStyle: "dex",
    spellcasting: null,
    tags: ["mobile", "sustained_dpr", "skirmisher"],
    features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 },
  },
  paladin: {
    label: "Paladin",
    hitDie: 10,
    saveProficiencies: ["wis", "cha"],
    armorType: "heavy",
    weaponStyle: "str",
    spellcasting: "half",
    defaultCastingAbility: "cha",
    tags: ["nova_dpr", "tank", "support"],
    features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 },
  },
  ranger: {
    label: "Ranger",
    hitDie: 10,
    saveProficiencies: ["str", "dex"],
    armorType: "medium",
    weaponStyle: "dex",
    spellcasting: "half",
    defaultCastingAbility: "wis",
    tags: ["sustained_dpr", "utility", "ranged"],
    features: { extraAttackLevel: 5, burstUsesPerShortRest: 0, bonusDamagePerAttack: 1 },
  },
  rogue: {
    label: "Rogue",
    hitDie: 8,
    saveProficiencies: ["dex", "int"],
    armorType: "light",
    weaponStyle: "dex",
    spellcasting: null,
    tags: ["nova_dpr", "skills", "initiative"],
    features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 3 },
  },
  sorcerer: {
    label: "Sorcerer",
    hitDie: 6,
    saveProficiencies: ["con", "cha"],
    armorType: "light",
    weaponStyle: "dex",
    spellcasting: "full",
    defaultCastingAbility: "cha",
    tags: ["blaster", "control", "concentration"],
    features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 },
  },
  warlock: {
    label: "Warlock",
    hitDie: 8,
    saveProficiencies: ["wis", "cha"],
    armorType: "light",
    weaponStyle: "dex",
    spellcasting: "pact",
    defaultCastingAbility: "cha",
    tags: ["sustained_dpr", "blaster", "short_rest"],
    features: { extraAttackLevel: null, burstUsesPerShortRest: 1, bonusDamagePerAttack: 0 },
  },
  wizard: {
    label: "Wizard",
    hitDie: 6,
    saveProficiencies: ["int", "wis"],
    armorType: "light",
    weaponStyle: "dex",
    spellcasting: "full",
    defaultCastingAbility: "int",
    tags: ["control", "blaster", "utility"],
    features: { extraAttackLevel: null, burstUsesPerShortRest: 0, bonusDamagePerAttack: 0 },
  },
};

const RACES = [
  "Human",
  "Dwarf",
  "Elf",
  "Halfling",
  "Dragonborn",
  "Gnome",
  "Half-Elf",
  "Half-Orc",
  "Tiefling",
  "Custom / Lineage",
];

const BACKGROUNDS = [
  "Acolyte",
  "Criminal",
  "Folk Hero",
  "Noble",
  "Sage",
  "Soldier",
  "Artisan",
  "Entertainer",
  "Hermit",
  "Custom",
];

const CLASS_OPTIONS = Object.keys(CLASSES);

const OPTIMIZER_OBJECTIVES = [
  { key: "sustained_dpr", label: "Sustained DPR", icon: Swords },
  { key: "nova_dpr", label: "Nova DPR", icon: Sparkles },
  { key: "tank", label: "Tank / Effective HP", icon: Shield },
  { key: "controller", label: "Control / Save Pressure", icon: Wand2 },
  { key: "skill", label: "Skill Specialist", icon: CheckCircle2 },
  { key: "balanced", label: "Balanced All-Rounder", icon: BarChart3 },
];

const RULE_PRESETS = {
  strict_srd: {
    label: "Strict SRD-ish",
    feats: false,
    multiclass: false,
    magicBonus: 0,
    shortRests: 1,
    roundsPerEncounter: 3,
    encountersPerDay: 4,
    targetAC: 15,
    targetSaveBonus: 3,
    advantageRate: 0.1,
  },
  common_optimized: {
    label: "Common Optimized Table",
    feats: true,
    multiclass: true,
    magicBonus: 1,
    shortRests: 2,
    roundsPerEncounter: 4,
    encountersPerDay: 4,
    targetAC: 15,
    targetSaveBonus: 4,
    advantageRate: 0.25,
  },
  no_multiclass: {
    label: "Feats On / No Multiclass",
    feats: true,
    multiclass: false,
    magicBonus: 0,
    shortRests: 2,
    roundsPerEncounter: 3,
    encountersPerDay: 5,
    targetAC: 16,
    targetSaveBonus: 5,
    advantageRate: 0.15,
  },
};

const DEFAULT_SKILLS_STATE = SKILLS.reduce((acc, s) => {
  acc[s.key] = { proficient: false, expertise: false };
  return acc;
}, {});

const DEFAULT_SPELL_SLOTS = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };

const STORAGE_KEY = "dnd5e_srd_safe_builder_v2_optimizer";

// =========================
// Helpers / Rules Math
// =========================
function modFromScore(score) {
  return Math.floor((Number(score || 10) - 10) / 2);
}

function proficiencyBonus(level) {
  const lvl = Number(level || 1);
  return Math.floor((lvl - 1) / 4) + 2;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pointBuyCost(score) {
  const s = Number(score);
  if (s <= 8) return 0;
  if (s === 9) return 1;
  if (s === 10) return 2;
  if (s === 11) return 3;
  if (s === 12) return 4;
  if (s === 13) return 5;
  if (s === 14) return 7;
  if (s === 15) return 9;
  return 9;
}

function getHitDie(classKey) {
  return CLASSES[classKey]?.hitDie || 8;
}

function getClassData(classKey) {
  return CLASSES[classKey] || CLASSES.fighter;
}

function getEstimatedHP(level, classKey, conMod) {
  const hd = getHitDie(classKey);
  const lvl = Number(level || 1);
  if (lvl <= 1) return hd + conMod;
  const avg = Math.floor(hd / 2) + 1;
  return hd + conMod + (lvl - 1) * (avg + conMod);
}

function getArmorClassEstimate(character, dexMod) {
  const cls = getClassData(character.class);
  const shieldBonus = character.hasShield ? 2 : 0;
  if (cls.armorType === "heavy") return 16 + shieldBonus + Number(character.armorMagicBonus || 0);
  if (cls.armorType === "medium") return 14 + clamp(dexMod, 0, 2) + shieldBonus + Number(character.armorMagicBonus || 0);
  if (cls.armorType === "light") return 11 + dexMod + shieldBonus + Number(character.armorMagicBonus || 0);
  if (cls.armorType === "unarmored") return 10 + dexMod + Math.max(modFromScore(character.abilities.wis), 0);
  return 10 + dexMod;
}

function getCasterAbility(character) {
  return character.spellcasting.castingAbility || getClassData(character.class).defaultCastingAbility || "int";
}

function estimateAttacksPerRound(character) {
  const cls = getClassData(character.class);
  const lvl = Number(character.level || 1);
  if (cls.features.extraAttackLevel && lvl >= cls.features.extraAttackLevel) return 2;
  return 1;
}

function effectiveHitChance(attackBonus, targetAC, advantageRate = 0) {
  const needed = clamp(targetAC - attackBonus, 2, 19);
  const base = clamp((21 - needed) / 20, 0.05, 0.95);
  const adv = 1 - Math.pow(1 - base, 2);
  return base * (1 - advantageRate) + adv * advantageRate;
}

function saveFailChance(saveDC, targetSaveBonus) {
  const needed = clamp(saveDC - targetSaveBonus, 2, 19);
  return clamp((needed - 1) / 20, 0.05, 0.95);
}

function averageWeaponDie(damageString) {
  const match = String(damageString || "1d8").match(/(\d+)d(\d+)/i);
  if (!match) return 4.5;
  const count = Number(match[1]);
  const die = Number(match[2]);
  return count * ((die + 1) / 2);
}

function getPrimaryAbilityForObjective(classKey, objective) {
  const cls = getClassData(classKey);
  if (objective === "controller") return cls.defaultCastingAbility || "int";
  if (objective === "skill") return classKey === "rogue" ? "dex" : classKey === "bard" ? "cha" : cls.defaultCastingAbility || cls.weaponStyle || "dex";
  if (cls.spellcasting && ["bard", "cleric", "druid", "sorcerer", "warlock", "wizard"].includes(classKey)) {
    if (objective === "balanced") return cls.defaultCastingAbility || "int";
  }
  return cls.weaponStyle || "str";
}

function autoAssignPointBuy(classKey, objective) {
  const primary = getPrimaryAbilityForObjective(classKey, objective);
  const cls = getClassData(classKey);
  const secondary = objective === "tank" ? "con" : cls.spellcasting ? "con" : primary === "dex" ? "con" : "dex";
  const tertiary = objective === "controller" ? "con" : objective === "skill" ? "wis" : cls.defaultCastingAbility && cls.defaultCastingAbility !== primary ? cls.defaultCastingAbility : "wis";

  const scores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
  const priorities = [primary, secondary, tertiary, ...ABILITIES.filter((a) => ![primary, secondary, tertiary].includes(a))];
  const targets = [15, 14, 13, 12, 10, 8];
  priorities.forEach((ability, idx) => {
    scores[ability] = targets[idx] ?? 8;
  });

  let cost = ABILITIES.reduce((sum, a) => sum + pointBuyCost(scores[a]), 0);
  while (cost > 27) {
    const reducible = priorities.find((a) => scores[a] > 8 && a !== primary);
    if (!reducible) break;
    scores[reducible] -= 1;
    cost = ABILITIES.reduce((sum, a) => sum + pointBuyCost(scores[a]), 0);
  }

  while (cost < 27) {
    const upgradable = priorities.find((a) => scores[a] < 15 && pointBuyCost(scores[a] + 1) - pointBuyCost(scores[a]) <= 27 - cost);
    if (!upgradable) break;
    cost += pointBuyCost(scores[upgradable] + 1) - pointBuyCost(scores[upgradable]);
    scores[upgradable] += 1;
  }

  return scores;
}

function getSuggestedSkills(classKey, objective) {
  const priorities = {
    sustained_dpr: ["athletics", "perception", "stealth"],
    nova_dpr: ["stealth", "perception", "acrobatics"],
    tank: ["athletics", "perception", "insight"],
    controller: ["arcana", "insight", "perception"],
    skill: ["stealth", "perception", "persuasion"],
    balanced: ["perception", "insight", "athletics"],
  };
  const byClass = {
    rogue: ["stealth", "perception", "acrobatics", "investigation"],
    bard: ["persuasion", "insight", "perception", "deception"],
    ranger: ["perception", "stealth", "survival", "athletics"],
    wizard: ["arcana", "investigation", "history", "insight"],
  };
  return byClass[classKey] || priorities[objective] || ["perception", "insight", "athletics"];
}

function evaluateBuildSnapshot(snapshot, assumptions, objective) {
  const pb = proficiencyBonus(snapshot.level);
  const primary = getPrimaryAbilityForObjective(snapshot.class, objective);
  const primaryMod = modFromScore(snapshot.abilities[primary]);
  const dexMod = modFromScore(snapshot.abilities.dex);
  const conMod = modFromScore(snapshot.abilities.con);
  const cls = getClassData(snapshot.class);

  const attackBonus = pb + primaryMod + Number(assumptions.magicBonus || 0);
  const avgDie = cls.weaponStyle === "dex" ? 4.5 : 5.5; // heuristic: finesse/ranged ~ d8-ish, heavy ~ d10-ish simplified
  const attacks = estimateAttacksPerRound(snapshot);
  const hitChance = effectiveHitChance(attackBonus, assumptions.targetAC, assumptions.advantageRate);
  const perHitDamage = avgDie + primaryMod + Number(assumptions.magicBonus || 0) + (cls.features.bonusDamagePerAttack || 0);
  const sustainedDpr = Math.max(0, hitChance * perHitDamage * attacks);

  const burstFactor = cls.features.burstUsesPerShortRest > 0 ? 1 + Math.min(0.75, assumptions.shortRests * 0.2) : 1;
  const novaDpr = sustainedDpr * (1 + (cls.features.burstUsesPerShortRest ? 0.6 : 0)) * burstFactor + (snapshot.featPlan.includes("damage_feat") ? 1.5 : 0);

  const hp = getEstimatedHP(snapshot.level, snapshot.class, conMod);
  const ac = getArmorClassEstimate({ ...snapshot, hasShield: objective === "tank", armorMagicBonus: assumptions.magicBonus }, dexMod);
  const effectiveHp = hp * (1 + (ac - 15) * 0.07);

  const casterAbility = cls.defaultCastingAbility || "int";
  const spellDc = 8 + pb + modFromScore(snapshot.abilities[casterAbility]);
  const spellAttack = pb + modFromScore(snapshot.abilities[casterAbility]) + Number(assumptions.magicBonus || 0);
  const failChance = saveFailChance(spellDc, assumptions.targetSaveBonus);
  const controlPressure = cls.spellcasting ? failChance * (10 + pb * 1.2) + (modFromScore(snapshot.abilities.con) * 0.6) : failChance * 2;

  const skillKeys = getSuggestedSkills(snapshot.class, objective);
  const skillScore = skillKeys.reduce((sum, k) => {
    const skill = SKILLS.find((s) => s.key === k);
    if (!skill) return sum;
    const mod = modFromScore(snapshot.abilities[skill.ability]);
    return sum + mod + pb;
  }, 0) + (snapshot.class === "rogue" ? pb * 1.5 : 0) + (snapshot.class === "bard" ? pb : 0);

  const concentrationScore = cls.spellcasting ? (conMod + (cls.saveProficiencies.includes("con") ? pb : 0)) : conMod;
  const initiative = dexMod + (snapshot.featPlan.includes("initiative_feat") ? 3 : 0);

  const weights = {
    sustained_dpr: { sustainedDpr: 1.4, novaDpr: 0.4, effectiveHp: 0.35, controlPressure: 0.15, skillScore: 0.1, concentrationScore: 0.1, initiative: 0.15 },
    nova_dpr: { sustainedDpr: 0.7, novaDpr: 1.5, effectiveHp: 0.2, controlPressure: 0.1, skillScore: 0.05, concentrationScore: 0.05, initiative: 0.2 },
    tank: { sustainedDpr: 0.35, novaDpr: 0.15, effectiveHp: 1.5, controlPressure: 0.2, skillScore: 0.05, concentrationScore: 0.2, initiative: 0.05 },
    controller: { sustainedDpr: 0.25, novaDpr: 0.25, effectiveHp: 0.25, controlPressure: 1.5, skillScore: 0.15, concentrationScore: 0.4, initiative: 0.2 },
    skill: { sustainedDpr: 0.25, novaDpr: 0.15, effectiveHp: 0.2, controlPressure: 0.2, skillScore: 1.6, concentrationScore: 0.1, initiative: 0.2 },
    balanced: { sustainedDpr: 0.8, novaDpr: 0.5, effectiveHp: 0.6, controlPressure: 0.6, skillScore: 0.4, concentrationScore: 0.2, initiative: 0.2 },
  }[objective] || { sustainedDpr: 1, novaDpr: 1, effectiveHp: 1, controlPressure: 1, skillScore: 1, concentrationScore: 1, initiative: 1 };

  const score =
    sustainedDpr * weights.sustainedDpr +
    novaDpr * weights.novaDpr +
    effectiveHp * weights.effectiveHp +
    controlPressure * weights.controlPressure +
    skillScore * weights.skillScore +
    concentrationScore * weights.concentrationScore +
    initiative * weights.initiative;

  return {
    score,
    sustainedDpr,
    novaDpr,
    effectiveHp,
    ac,
    hp,
    spellDc,
    spellAttack,
    controlPressure,
    skillScore,
    concentrationScore,
    initiative,
    hitChance,
    primary,
  };
}

function buildMilestonePlan(baseClass, objective, assumptions) {
  const milestones = [1, 3, 5, 8, 11, 17, 20].filter((n) => n <= assumptions.analysisLevel);
  return milestones.map((level) => {
    const abilities = autoAssignPointBuy(baseClass, objective);
    const featPlan = [];
    const asiLevels = [4, 8, 12, 16, 19].filter((n) => n <= level);

    // Heuristic ASI/feat path
    const primary = getPrimaryAbilityForObjective(baseClass, objective);
    const caster = getClassData(baseClass).defaultCastingAbility;
    asiLevels.forEach((asiLvl, idx) => {
      const canTakeFeat = assumptions.feats;
      const preferInitiativeFeat = objective === "controller" && idx === 0;
      const preferDamageFeat = ["sustained_dpr", "nova_dpr"].includes(objective) && idx === 0;

      if (canTakeFeat && preferInitiativeFeat) {
        featPlan.push("initiative_feat");
      } else if (canTakeFeat && preferDamageFeat) {
        featPlan.push("damage_feat");
      } else {
        if (abilities[primary] < 20) abilities[primary] = Math.min(20, abilities[primary] + 2);
        else if (abilities.con < 18) abilities.con = Math.min(20, abilities.con + 2);
        else if (caster && abilities[caster] < 20) abilities[caster] = Math.min(20, abilities[caster] + 2);
      }

      // If feat was taken, still allow later ASIs to catch up
      if (featPlan.length && abilities[primary] < 18 && idx > 0) {
        abilities[primary] = Math.min(20, abilities[primary] + 2);
      }
    });

    const snapshot = { class: baseClass, level, abilities, featPlan };
    const metrics = evaluateBuildSnapshot(snapshot, assumptions, objective);
    return { level, snapshot, metrics };
  });
}

function generateCandidateBuilds(config) {
  const { objective, assumptions, classPool } = config;
  const pool = classPool.length ? classPool : CLASS_OPTIONS;

  return pool.map((classKey) => {
    const plan = buildMilestonePlan(classKey, objective, assumptions);
    const finalStep = plan[plan.length - 1] || plan[0];
    const score = finalStep?.metrics?.score || 0;
    const classData = getClassData(classKey);

    const strengths = [];
    if (finalStep.metrics.sustainedDpr >= 12) strengths.push("Strong sustained offense");
    if (finalStep.metrics.novaDpr >= 18) strengths.push("Strong burst / nova potential");
    if (finalStep.metrics.effectiveHp >= 70) strengths.push("High durability");
    if (finalStep.metrics.controlPressure >= 6) strengths.push("Strong save pressure / control");
    if (finalStep.metrics.skillScore >= 15) strengths.push("High utility / skills");
    if (classData.tags.includes("short_rest")) strengths.push("Benefits from short rests");

    const tradeoffs = [];
    if (classData.hitDie <= 6) tradeoffs.push("Lower base durability");
    if (!classData.spellcasting && objective === "controller") tradeoffs.push("Limited magical control tools");
    if (classData.armorType === "light" && objective === "tank") tradeoffs.push("Armor scaling is weaker for pure tanking");
    if (classData.tags.includes("nova_dpr") && assumptions.roundsPerEncounter >= 5) tradeoffs.push("Value dips in very long encounters");

    return {
      classKey,
      classLabel: classData.label,
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
      },
    };
  }).sort((a, b) => b.score - a.score);
}

// =========================
// Defaults
// =========================
function createDefaultCharacter() {
  return {
    identity: {
      name: "",
      player: "",
      subclass: "",
      race: "Human",
      background: "Soldier",
      alignment: "True Neutral",
    },
    class: "fighter",
    level: 1,
    abilityMode: "standard",
    abilities: {
      str: 15,
      dex: 14,
      con: 13,
      int: 12,
      wis: 10,
      cha: 8,
    },
    standardAssignments: {
      str: 15,
      dex: 14,
      con: 13,
      int: 12,
      wis: 10,
      cha: 8,
    },
    skills: JSON.parse(JSON.stringify(DEFAULT_SKILLS_STATE)),
    equipment: ["Backpack", "Bedroll", "Rations"],
    inventoryInput: "",
    weapons: [
      { id: crypto.randomUUID(), name: "Longsword", ability: "str", proficient: true, magicBonus: 0, damage: "1d8+STR" },
    ],
    spellcasting: {
      castingAbility: "int",
      slots: { ...DEFAULT_SPELL_SLOTS },
      knownSpells: "",
      preparedSpells: "",
    },
    features: "",
    traits: "",
    notes: "",
    hasShield: false,
    armorMagicBonus: 0,
    optimizer: {
      objective: "balanced",
      rulePreset: "common_optimized",
      assumptions: {
        ...RULE_PRESETS.common_optimized,
        analysisLevel: 8,
      },
      useRecommendedClassesOnly: false,
      selectedClasses: [],
      results: [],
    },
  };
}

// =========================
// UI Component
// =========================
export default function Dnd5eSrdSafeCharacterBuilder() {
  const [character, setCharacter] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultCharacter();
      const parsed = JSON.parse(raw);
      return {
        ...createDefaultCharacter(),
        ...parsed,
        identity: { ...createDefaultCharacter().identity, ...(parsed.identity || {}) },
        abilities: { ...createDefaultCharacter().abilities, ...(parsed.abilities || {}) },
        standardAssignments: { ...createDefaultCharacter().standardAssignments, ...(parsed.standardAssignments || {}) },
        skills: { ...createDefaultCharacter().skills, ...(parsed.skills || {}) },
        spellcasting: {
          ...createDefaultCharacter().spellcasting,
          ...(parsed.spellcasting || {}),
          slots: { ...DEFAULT_SPELL_SLOTS, ...(parsed.spellcasting?.slots || {}) },
        },
        optimizer: {
          ...createDefaultCharacter().optimizer,
          ...(parsed.optimizer || {}),
          assumptions: {
            ...createDefaultCharacter().optimizer.assumptions,
            ...(parsed.optimizer?.assumptions || {}),
          },
        },
      };
    } catch {
      return createDefaultCharacter();
    }
  });

  const [importText, setImportText] = useState("");
  const [activeTab, setActiveTab] = useState("builder");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(character));
  }, [character]);

  const pb = useMemo(() => proficiencyBonus(character.level), [character.level]);
  const abilityMods = useMemo(() => {
    const out = {};
    ABILITIES.forEach((a) => (out[a] = modFromScore(character.abilities[a])));
    return out;
  }, [character.abilities]);

  const classData = useMemo(() => getClassData(character.class), [character.class]);
  const saveProfs = classData.saveProficiencies;
  const passivePerception = 10 + abilityMods.wis + (character.skills.perception?.proficient ? pb : 0) + (character.skills.perception?.expertise ? pb : 0);
  const initiative = abilityMods.dex;
  const hpEstimate = getEstimatedHP(character.level, character.class, abilityMods.con);
  const acEstimate = getArmorClassEstimate(character, abilityMods.dex);
  const casterAbility = getCasterAbility(character);
  const spellAttackBonus = pb + modFromScore(character.abilities[casterAbility]);
  const spellSaveDC = 8 + pb + modFromScore(character.abilities[casterAbility]);
  const pointBuySpent = ABILITIES.reduce((sum, a) => sum + pointBuyCost(character.abilities[a]), 0);
  const pointBuyRemaining = 27 - pointBuySpent;

  const optimizerResults = character.optimizer.results || [];

  function update(path, value) {
    setCharacter((prev) => {
      const next = structuredClone(prev);
      let target = next;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
      target[path[path.length - 1]] = value;
      return next;
    });
  }

  function setAbility(ability, value) {
    const num = clamp(Number(value || 8), 3, 20);
    update(["abilities", ability], num);
  }

  function applyStandardArrayPreset() {
    const next = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    setCharacter((prev) => ({ ...prev, abilities: next, standardAssignments: next }));
  }

  function applyAutoPointBuyToCharacter() {
    const optimized = autoAssignPointBuy(character.class, character.optimizer.objective);
    setCharacter((prev) => ({ ...prev, abilityMode: "pointbuy", abilities: optimized }));
  }

  function toggleSkill(key, field) {
    setCharacter((prev) => {
      const next = structuredClone(prev);
      const current = next.skills[key][field];
      next.skills[key][field] = !current;
      if (field === "expertise" && !next.skills[key].proficient) next.skills[key].proficient = true;
      return next;
    });
  }

  function addInventoryItem() {
    const item = character.inventoryInput.trim();
    if (!item) return;
    setCharacter((prev) => ({ ...prev, equipment: [...prev.equipment, item], inventoryInput: "" }));
  }

  function removeInventoryItem(index) {
    setCharacter((prev) => ({ ...prev, equipment: prev.equipment.filter((_, i) => i !== index) }));
  }

  function addWeapon() {
    setCharacter((prev) => ({
      ...prev,
      weapons: [...prev.weapons, { id: crypto.randomUUID(), name: "New Weapon", ability: "str", proficient: true, magicBonus: 0, damage: "1d8+MOD" }],
    }));
  }

  function updateWeapon(id, field, value) {
    setCharacter((prev) => ({
      ...prev,
      weapons: prev.weapons.map((w) => (w.id === id ? { ...w, [field]: value } : w)),
    }));
  }

  function removeWeapon(id) {
    setCharacter((prev) => ({ ...prev, weapons: prev.weapons.filter((w) => w.id !== id) }));
  }

  function exportJson() {
    const data = JSON.stringify(character, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${character.identity.name || "character"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson() {
    try {
      const parsed = JSON.parse(importText);
      setCharacter({
        ...createDefaultCharacter(),
        ...parsed,
        identity: { ...createDefaultCharacter().identity, ...(parsed.identity || {}) },
        abilities: { ...createDefaultCharacter().abilities, ...(parsed.abilities || {}) },
        standardAssignments: { ...createDefaultCharacter().standardAssignments, ...(parsed.standardAssignments || {}) },
        skills: { ...createDefaultCharacter().skills, ...(parsed.skills || {}) },
        spellcasting: {
          ...createDefaultCharacter().spellcasting,
          ...(parsed.spellcasting || {}),
          slots: { ...DEFAULT_SPELL_SLOTS, ...(parsed.spellcasting?.slots || {}) },
        },
        optimizer: {
          ...createDefaultCharacter().optimizer,
          ...(parsed.optimizer || {}),
          assumptions: {
            ...createDefaultCharacter().optimizer.assumptions,
            ...(parsed.optimizer?.assumptions || {}),
          },
        },
      });
      setImportText("");
    } catch {
      alert("Invalid JSON. Please paste a valid export.");
    }
  }

  function resetCharacter() {
    if (!confirm("Reset character and optimizer data?")) return;
    const fresh = createDefaultCharacter();
    setCharacter(fresh);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  }

  function printView() {
    window.print();
  }

  function applyRulePreset(key) {
    const preset = RULE_PRESETS[key];
    if (!preset) return;
    setCharacter((prev) => ({
      ...prev,
      optimizer: {
        ...prev.optimizer,
        rulePreset: key,
        assumptions: {
          ...prev.optimizer.assumptions,
          ...preset,
          analysisLevel: prev.optimizer.assumptions.analysisLevel || 8,
        },
      },
    }));
  }

  function generateOptimizedBuilds() {
    const assumptions = character.optimizer.assumptions;
    const objective = character.optimizer.objective;

    const recommendedByObjective = {
      sustained_dpr: ["fighter", "ranger", "barbarian", "warlock", "rogue"],
      nova_dpr: ["fighter", "paladin", "rogue", "sorcerer"],
      tank: ["fighter", "paladin", "barbarian", "cleric"],
      controller: ["wizard", "sorcerer", "bard", "druid", "cleric"],
      skill: ["rogue", "bard", "ranger", "wizard"],
      balanced: ["fighter", "paladin", "bard", "cleric", "ranger", "wizard"],
    };

    const classPool = character.optimizer.selectedClasses.length
      ? character.optimizer.selectedClasses
      : character.optimizer.useRecommendedClassesOnly
      ? recommendedByObjective[objective] || CLASS_OPTIONS
      : CLASS_OPTIONS;

    const results = generateCandidateBuilds({ objective, assumptions, classPool }).slice(0, 5);
    setCharacter((prev) => ({
      ...prev,
      optimizer: {
        ...prev.optimizer,
        results,
      },
    }));
  }

  function applyTopBuildToCharacter(index = 0) {
    const result = optimizerResults[index];
    if (!result) return;
    const finalStep = result.plan[result.plan.length - 1];
    const suggestedSkills = getSuggestedSkills(result.classKey, character.optimizer.objective);
    const nextSkills = JSON.parse(JSON.stringify(DEFAULT_SKILLS_STATE));
    suggestedSkills.forEach((k, idx) => {
      if (nextSkills[k]) {
        nextSkills[k].proficient = true;
        if (result.classKey === "rogue" && idx < 2) nextSkills[k].expertise = true;
      }
    });

    setCharacter((prev) => ({
      ...prev,
      class: result.classKey,
      level: character.optimizer.assumptions.analysisLevel,
      abilityMode: "pointbuy",
      abilities: finalStep.snapshot.abilities,
      skills: nextSkills,
      spellcasting: {
        ...prev.spellcasting,
        castingAbility: getClassData(result.classKey).defaultCastingAbility || prev.spellcasting.castingAbility,
      },
    }));
    setActiveTab("builder");
  }

  const metricsForCurrent = useMemo(() => {
    const snapshot = { class: character.class, level: Number(character.level), abilities: character.abilities, featPlan: [] };
    return evaluateBuildSnapshot(snapshot, character.optimizer.assumptions, character.optimizer.objective);
  }, [character.class, character.level, character.abilities, character.optimizer.assumptions, character.optimizer.objective]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 print:bg-white print:text-black">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:px-0">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">D&D 5e SRD-Safe Character Builder</h1>
            <p className="text-sm text-slate-400">Version 2: Character Builder + Optimizer Mode (single-file React app)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={generateOptimizedBuilds}><Sparkles className="mr-2 h-4 w-4" />Generate Optimized Builds</Button>
            <Button variant="secondary" onClick={exportJson}><Download className="mr-2 h-4 w-4" />Export JSON</Button>
            <Button variant="secondary" onClick={printView}><Printer className="mr-2 h-4 w-4" />Print</Button>
            <Button variant="destructive" onClick={resetCharacter}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 print:hidden">
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="optimizer">Optimizer Mode</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="data">JSON / Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="builder" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader>
                    <CardTitle>Character Identity</CardTitle>
                    <CardDescription>Core character information</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2"><Label>Name</Label><Input value={character.identity.name} onChange={(e) => update(["identity", "name"], e.target.value)} /></div>
                    <div className="space-y-2"><Label>Player</Label><Input value={character.identity.player} onChange={(e) => update(["identity", "player"], e.target.value)} /></div>
                    <div className="space-y-2"><Label>Subclass (optional)</Label><Input value={character.identity.subclass} onChange={(e) => update(["identity", "subclass"], e.target.value)} /></div>
                    <div className="space-y-2">
                      <Label>Class</Label>
                      <Select value={character.class} onValueChange={(v) => update(["class"], v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>{CLASSES[c].label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Race / Lineage</Label>
                      <Select value={character.identity.race} onValueChange={(v) => update(["identity", "race"], v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{RACES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Background</Label>
                      <Select value={character.identity.background} onValueChange={(v) => update(["identity", "background"], v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{BACKGROUNDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Alignment</Label>
                      <Select value={character.identity.alignment} onValueChange={(v) => update(["identity", "alignment"], v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ALIGNMENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Level</Label><Input type="number" min={1} max={20} value={character.level} onChange={(e) => update(["level"], clamp(Number(e.target.value || 1), 1, 20))} /></div>
                    <div className="space-y-2 flex items-end"><Button onClick={applyAutoPointBuyToCharacter} className="w-full"><Sparkles className="mr-2 h-4 w-4" />Auto Point Buy for Objective</Button></div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader>
                    <CardTitle>Ability Scores</CardTitle>
                    <CardDescription>Standard Array, Point Buy, or Manual</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        ["standard", "Standard Array"],
                        ["pointbuy", "Point Buy"],
                        ["manual", "Manual"],
                      ].map(([key, label]) => (
                        <Button key={key} variant={character.abilityMode === key ? "default" : "secondary"} onClick={() => update(["abilityMode"], key)}>{label}</Button>
                      ))}
                    </div>
                    {character.abilityMode === "standard" && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span className="text-sm text-slate-300">Preset:</span>
                        {STANDARD_ARRAY.map((n, i) => <Badge key={i} variant="secondary">{n}</Badge>)}
                        <Button size="sm" variant="secondary" onClick={applyStandardArrayPreset}>Apply Default Assignment</Button>
                      </div>
                    )}
                    {character.abilityMode === "pointbuy" && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <span>Budget: <strong>27</strong></span>
                          <span>Spent: <strong>{pointBuySpent}</strong></span>
                          <span className={pointBuyRemaining < 0 ? "text-red-400" : "text-emerald-400"}>Remaining: <strong>{pointBuyRemaining}</strong></span>
                        </div>
                        <p className="mt-2 text-slate-400">Allowed range for point buy is typically 8–15 before bonuses. This builder keeps inputs flexible for table variation.</p>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {ABILITIES.map((ability) => (
                        <div key={ability} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <Label>{ABILITY_LABELS[ability]}</Label>
                            <Badge>{ability.toUpperCase()}</Badge>
                          </div>
                          <Input
                            type="number"
                            min={character.abilityMode === "pointbuy" ? 8 : 3}
                            max={character.abilityMode === "pointbuy" ? 15 : 20}
                            value={character.abilities[ability]}
                            onChange={(e) => setAbility(ability, e.target.value)}
                          />
                          <div className="mt-2 text-sm text-slate-400">Modifier: <strong className="text-slate-100">{abilityMods[ability] >= 0 ? `+${abilityMods[ability]}` : abilityMods[ability]}</strong></div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Accordion type="multiple" className="space-y-4">
                  <AccordionItem value="skills" className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4">
                    <AccordionTrigger>Skills & Saving Throws</AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {ABILITIES.map((a) => {
                          const total = abilityMods[a] + (saveProfs.includes(a) ? pb : 0);
                          return (
                            <div key={a} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                              <div className="flex items-center justify-between">
                                <span>{ABILITY_LABELS[a]} Save</span>
                                <Badge variant={saveProfs.includes(a) ? "default" : "secondary"}>{saveProfs.includes(a) ? "Prof" : "—"}</Badge>
                              </div>
                              <div className="mt-1 text-lg font-semibold">{total >= 0 ? `+${total}` : total}</div>
                            </div>
                          );
                        })}
                      </div>
                      <Separator className="bg-slate-800" />
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {SKILLS.map((skill) => {
                          const prof = character.skills[skill.key]?.proficient;
                          const exp = character.skills[skill.key]?.expertise;
                          const bonus = abilityMods[skill.ability] + (prof ? pb : 0) + (exp ? pb : 0);
                          return (
                            <div key={skill.key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-medium">{skill.label}</div>
                                  <div className="text-xs text-slate-400">{ABILITY_LABELS[skill.ability]}</div>
                                </div>
                                <div className="text-lg font-semibold">{bonus >= 0 ? `+${bonus}` : bonus}</div>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                <div className="flex items-center gap-2"><Switch checked={prof} onCheckedChange={() => toggleSkill(skill.key, "proficient")} /><span>Prof</span></div>
                                <div className="flex items-center gap-2"><Switch checked={exp} onCheckedChange={() => toggleSkill(skill.key, "expertise")} /><span>Expertise</span></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="equipment" className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4">
                    <AccordionTrigger>Equipment, Inventory & Weapons</AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                          <Input placeholder="Add inventory item" value={character.inventoryInput} onChange={(e) => update(["inventoryInput"], e.target.value)} />
                          <Button onClick={addInventoryItem}><Plus className="mr-2 h-4 w-4" />Add Item</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {character.equipment.map((item, idx) => (
                            <Badge key={`${item}-${idx}`} className="gap-2 px-3 py-1 text-sm">{item}<button onClick={() => removeInventoryItem(idx)}><Trash2 className="h-3 w-3" /></button></Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">Weapons</h4>
                          <p className="text-sm text-slate-400">Auto-calculates attack bonus from ability + proficiency + magic</p>
                        </div>
                        <Button variant="secondary" onClick={addWeapon}><Plus className="mr-2 h-4 w-4" />Add Weapon</Button>
                      </div>

                      <div className="space-y-3">
                        {character.weapons.map((weapon) => {
                          const mod = abilityMods[weapon.ability] || 0;
                          const attackBonus = mod + (weapon.proficient ? pb : 0) + Number(weapon.magicBonus || 0);
                          return (
                            <div key={weapon.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                              <div className="grid gap-3 md:grid-cols-6">
                                <div className="md:col-span-2"><Label>Name</Label><Input value={weapon.name} onChange={(e) => updateWeapon(weapon.id, "name", e.target.value)} /></div>
                                <div>
                                  <Label>Ability</Label>
                                  <Select value={weapon.ability} onValueChange={(v) => updateWeapon(weapon.id, "ability", v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{ABILITIES.map((a) => <SelectItem key={a} value={a}>{ABILITY_LABELS[a]}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div><Label>Magic Bonus</Label><Input type="number" value={weapon.magicBonus} onChange={(e) => updateWeapon(weapon.id, "magicBonus", Number(e.target.value || 0))} /></div>
                                <div className="md:col-span-2"><Label>Damage</Label><Input value={weapon.damage} onChange={(e) => updateWeapon(weapon.id, "damage", e.target.value)} /></div>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2"><Switch checked={weapon.proficient} onCheckedChange={(v) => updateWeapon(weapon.id, "proficient", v)} /><span className="text-sm">Proficient</span></div>
                                <Badge>Attack {attackBonus >= 0 ? `+${attackBonus}` : attackBonus}</Badge>
                                <Button variant="ghost" size="sm" onClick={() => removeWeapon(weapon.id)}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="spellcasting" className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4">
                    <AccordionTrigger>Spellcasting, Features & Notes</AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="bg-slate-950/60 border-slate-800">
                          <CardHeader><CardTitle className="text-base">Spellcasting</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div>
                              <Label>Casting Ability</Label>
                              <Select value={character.spellcasting.castingAbility} onValueChange={(v) => update(["spellcasting", "castingAbility"], v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{ABILITIES.map((a) => <SelectItem key={a} value={a}>{ABILITY_LABELS[a]}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-2 grid-cols-3 md:grid-cols-5">
                              {Object.keys(character.spellcasting.slots).map((lvl) => (
                                <div key={lvl}>
                                  <Label>Slot {lvl}</Label>
                                  <Input type="number" min={0} value={character.spellcasting.slots[lvl]} onChange={(e) => update(["spellcasting", "slots", lvl], Number(e.target.value || 0))} />
                                </div>
                              ))}
                            </div>
                            <div><Label>Known Spells</Label><Textarea rows={5} value={character.spellcasting.knownSpells} onChange={(e) => update(["spellcasting", "knownSpells"], e.target.value)} /></div>
                            <div><Label>Prepared Spells</Label><Textarea rows={5} value={character.spellcasting.preparedSpells} onChange={(e) => update(["spellcasting", "preparedSpells"], e.target.value)} /></div>
                          </CardContent>
                        </Card>

                        <Card className="bg-slate-950/60 border-slate-800">
                          <CardHeader><CardTitle className="text-base">Features / Traits / Notes</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div><Label>Features</Label><Textarea rows={4} value={character.features} onChange={(e) => update(["features"], e.target.value)} /></div>
                            <div><Label>Traits</Label><Textarea rows={4} value={character.traits} onChange={(e) => update(["traits"], e.target.value)} /></div>
                            <div><Label>Notes</Label><Textarea rows={6} value={character.notes} onChange={(e) => update(["notes"], e.target.value)} /></div>
                          </CardContent>
                        </Card>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              <div className="space-y-4">
                <Card className="bg-slate-900/80 border-slate-800 sticky top-4 print:static">
                  <CardHeader>
                    <CardTitle>Derived Summary</CardTitle>
                    <CardDescription>Auto-calculated values</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    {[
                      ["Proficiency Bonus", `+${pb}`],
                      ["Passive Perception", passivePerception],
                      ["Initiative", initiative >= 0 ? `+${initiative}` : initiative],
                      ["HP Estimate", hpEstimate],
                      ["AC Estimate", acEstimate],
                      ["Spell Attack", spellAttackBonus >= 0 ? `+${spellAttackBonus}` : spellAttackBonus],
                      ["Spell Save DC", spellSaveDC],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
                        <div className="mt-1 text-xl font-bold">{value}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="optimizer" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-4 xl:col-span-1">
                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader>
                    <CardTitle>Build Objective</CardTitle>
                    <CardDescription>Choose what “optimized” means</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {OPTIMIZER_OBJECTIVES.map((obj) => {
                      const Icon = obj.icon;
                      const active = character.optimizer.objective === obj.key;
                      return (
                        <button
                          key={obj.key}
                          onClick={() => update(["optimizer", "objective"], obj.key)}
                          className={`w-full rounded-2xl border p-3 text-left transition ${active ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-5 w-5" />
                            <div className="font-medium">{obj.label}</div>
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader>
                    <CardTitle>Rule Presets & Assumptions</CardTitle>
                    <CardDescription>Critical for meaningful min-maxing</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Rule Preset</Label>
                      <Select value={character.optimizer.rulePreset} onValueChange={applyRulePreset}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(RULE_PRESETS).map(([key, v]) => <SelectItem key={key} value={key}>{v.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label>Analysis Level</Label><Input type="number" min={1} max={20} value={character.optimizer.assumptions.analysisLevel} onChange={(e) => update(["optimizer", "assumptions", "analysisLevel"], clamp(Number(e.target.value || 1), 1, 20))} /></div>
                      <div><Label>Target AC</Label><Input type="number" min={8} max={25} value={character.optimizer.assumptions.targetAC} onChange={(e) => update(["optimizer", "assumptions", "targetAC"], clamp(Number(e.target.value || 10), 8, 25))} /></div>
                      <div><Label>Target Save Bonus</Label><Input type="number" min={-2} max={15} value={character.optimizer.assumptions.targetSaveBonus} onChange={(e) => update(["optimizer", "assumptions", "targetSaveBonus"], Number(e.target.value || 0))} /></div>
                      <div><Label>Magic Bonus Assumption</Label><Input type="number" min={0} max={3} value={character.optimizer.assumptions.magicBonus} onChange={(e) => update(["optimizer", "assumptions", "magicBonus"], clamp(Number(e.target.value || 0), 0, 3))} /></div>
                      <div><Label>Rounds / Encounter</Label><Input type="number" min={1} max={10} value={character.optimizer.assumptions.roundsPerEncounter} onChange={(e) => update(["optimizer", "assumptions", "roundsPerEncounter"], clamp(Number(e.target.value || 1), 1, 10))} /></div>
                      <div><Label>Encounters / Day</Label><Input type="number" min={1} max={12} value={character.optimizer.assumptions.encountersPerDay} onChange={(e) => update(["optimizer", "assumptions", "encountersPerDay"], clamp(Number(e.target.value || 1), 1, 12))} /></div>
                      <div><Label>Short Rests / Day</Label><Input type="number" min={0} max={5} value={character.optimizer.assumptions.shortRests} onChange={(e) => update(["optimizer", "assumptions", "shortRests"], clamp(Number(e.target.value || 0), 0, 5))} /></div>
                      <div><Label>Advantage Rate (0–1)</Label><Input type="number" step="0.05" min={0} max={1} value={character.optimizer.assumptions.advantageRate} onChange={(e) => update(["optimizer", "assumptions", "advantageRate"], clamp(Number(e.target.value || 0), 0, 1))} /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3"><span>Feats Enabled</span><Switch checked={character.optimizer.assumptions.feats} onCheckedChange={(v) => update(["optimizer", "assumptions", "feats"], v)} /></div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3"><span>Multiclass Allowed*</span><Switch checked={character.optimizer.assumptions.multiclass} onCheckedChange={(v) => update(["optimizer", "assumptions", "multiclass"], v)} /></div>
                    </div>
                    <p className="text-xs text-slate-400">*Current optimizer uses strong single-class heuristics first. Multiclass flag is reserved for future expansion.</p>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader>
                    <CardTitle>Class Pool</CardTitle>
                    <CardDescription>Constrain the generator</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <span>Use recommended classes only</span>
                      <Switch checked={character.optimizer.useRecommendedClassesOnly} onCheckedChange={(v) => update(["optimizer", "useRecommendedClassesOnly"], v)} />
                    </div>
                    <ScrollArea className="h-56 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="grid gap-2">
                        {CLASS_OPTIONS.map((classKey) => {
                          const checked = character.optimizer.selectedClasses.includes(classKey);
                          return (
                            <button
                              key={classKey}
                              onClick={() => {
                                const current = character.optimizer.selectedClasses;
                                const next = checked ? current.filter((c) => c !== classKey) : [...current, classKey];
                                update(["optimizer", "selectedClasses"], next);
                              }}
                              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${checked ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800"}`}
                            >
                              <span>{CLASSES[classKey].label}</span>
                              <Badge variant={checked ? "default" : "secondary"}>{checked ? "Included" : "Off"}</Badge>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="secondary" onClick={() => update(["optimizer", "selectedClasses"], CLASS_OPTIONS)}>Select All</Button>
                      <Button variant="secondary" onClick={() => update(["optimizer", "selectedClasses"], [])}>Clear Manual Pool</Button>
                    </div>
                    <Button className="w-full" onClick={generateOptimizedBuilds}><Sparkles className="mr-2 h-4 w-4" />Generate Optimized Builds</Button>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4 xl:col-span-2">
                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader>
                    <CardTitle>Top Recommendations</CardTitle>
                    <CardDescription>Heuristic optimizer output with tradeoffs and milestone paths</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!optimizerResults.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
                        Click <strong>Generate Optimized Builds</strong> to rank builds for your chosen objective and assumptions.
                      </div>
                    ) : (
                      optimizerResults.map((result, idx) => (
                        <Card key={`${result.classKey}-${idx}`} className="bg-slate-950/60 border-slate-800">
                          <CardHeader>
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <CardTitle className="text-xl">#{idx + 1} — {result.classLabel}</CardTitle>
                                <CardDescription>
                                  Score {result.score.toFixed(1)} • Primary {String(result.summary.primaryStat).toUpperCase()} • Level {character.optimizer.assumptions.analysisLevel}
                                </CardDescription>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => applyTopBuildToCharacter(idx)}>Apply to Builder</Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {[
                                ["Sustained DPR", result.summary.sustainedDpr.toFixed(1)],
                                ["Nova DPR", result.summary.novaDpr.toFixed(1)],
                                ["Effective HP", result.summary.effectiveHp.toFixed(1)],
                                ["Spell DC", result.summary.spellDc],
                                ["Initiative", result.summary.initiative >= 0 ? `+${result.summary.initiative}` : result.summary.initiative],
                              ].map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                  <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
                                  <div className="mt-1 text-xl font-bold">{value}</div>
                                </div>
                              ))}
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <h4 className="mb-2 font-semibold">Why this scores well</h4>
                                <div className="flex flex-wrap gap-2">
                                  {result.strengths.length ? result.strengths.map((s, i) => <Badge key={i} className="bg-emerald-600/20 text-emerald-300 border border-emerald-700">{s}</Badge>) : <span className="text-sm text-slate-400">No standout flags</span>}
                                </div>
                              </div>
                              <div>
                                <h4 className="mb-2 font-semibold">Tradeoffs</h4>
                                <div className="flex flex-wrap gap-2">
                                  {result.tradeoffs.length ? result.tradeoffs.map((t, i) => <Badge key={i} variant="secondary">{t}</Badge>) : <span className="text-sm text-slate-400">No major flagged drawbacks</span>}
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="mb-3 font-semibold">Milestone Path</h4>
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {result.plan.map((step) => (
                                  <div key={step.level} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                      <Badge>Level {step.level}</Badge>
                                      <span className="text-xs text-slate-400">Score {step.metrics.score.toFixed(1)}</span>
                                    </div>
                                    <div className="space-y-1 text-sm">
                                      <div>Primary {String(step.metrics.primary).toUpperCase()} mod: <strong>{modFromScore(step.snapshot.abilities[step.metrics.primary]) >= 0 ? `+${modFromScore(step.snapshot.abilities[step.metrics.primary])}` : modFromScore(step.snapshot.abilities[step.metrics.primary])}</strong></div>
                                      <div>DPR: <strong>{step.metrics.sustainedDpr.toFixed(1)}</strong></div>
                                      <div>Nova: <strong>{step.metrics.novaDpr.toFixed(1)}</strong></div>
                                      <div>EHP: <strong>{step.metrics.effectiveHp.toFixed(1)}</strong></div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="bg-slate-900/80 border-slate-800 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Current Character Build Analysis</CardTitle>
                  <CardDescription>Objective-aware heuristics for the build currently in the Builder tab</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Build Score", metricsForCurrent.score.toFixed(1)],
                      ["Sustained DPR", metricsForCurrent.sustainedDpr.toFixed(1)],
                      ["Nova DPR", metricsForCurrent.novaDpr.toFixed(1)],
                      ["Effective HP", metricsForCurrent.effectiveHp.toFixed(1)],
                      ["Hit Chance", `${Math.round(metricsForCurrent.hitChance * 100)}%`],
                      ["Spell DC", metricsForCurrent.spellDc],
                      ["Control Pressure", metricsForCurrent.controlPressure.toFixed(1)],
                      ["Concentration", metricsForCurrent.concentrationScore >= 0 ? `+${metricsForCurrent.concentrationScore}` : metricsForCurrent.concentrationScore],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
                        <div className="mt-1 text-xl font-bold">{value}</div>
                      </div>
                    ))}
                  </div>

                  <Card className="bg-slate-950/60 border-slate-800">
                    <CardHeader><CardTitle className="text-base">Interpretation & Best Practices</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-300">
                      <p><strong>Objective:</strong> {OPTIMIZER_OBJECTIVES.find((o) => o.key === character.optimizer.objective)?.label}</p>
                      <p><strong>Primary stat for this objective:</strong> {String(metricsForCurrent.primary).toUpperCase()}</p>
                      <p><strong>Use case:</strong> The analysis score is only meaningful relative to your current assumptions (target AC, save bonus, rest cadence, feats, and magic assumptions).</p>
                      <p><strong>Min-max tip:</strong> Compare the current build against optimizer recommendations at the same level band before making ASI/feat decisions.</p>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/80 border-slate-800">
                <CardHeader>
                  <CardTitle>Quick Optimizer Actions</CardTitle>
                  <CardDescription>Fast iteration loop</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full" onClick={applyAutoPointBuyToCharacter}><Sparkles className="mr-2 h-4 w-4" />Auto-Assign Point Buy</Button>
                  <Button variant="secondary" className="w-full" onClick={generateOptimizedBuilds}><BarChart3 className="mr-2 h-4 w-4" />Re-run Optimizer</Button>
                  <Button variant="secondary" className="w-full" onClick={() => applyTopBuildToCharacter(0)} disabled={!optimizerResults.length}><CheckCircle2 className="mr-2 h-4 w-4" />Apply #1 Recommendation</Button>
                  <Separator className="bg-slate-800" />
                  <div className="text-xs text-slate-400 space-y-2">
                    <p>Best practice for min-maxing:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Set realistic target AC / save assumptions first.</li>
                      <li>Optimize by level breakpoint, not only level 20.</li>
                      <li>Re-check after each ASI/feat milestone.</li>
                      <li>Use “Apply to Builder” to inspect real tradeoffs.</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="bg-slate-900/80 border-slate-800">
                <CardHeader>
                  <CardTitle>JSON Import / Export</CardTitle>
                  <CardDescription>Persist and share builds locally</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={exportJson}><Download className="mr-2 h-4 w-4" />Export Current Character JSON</Button>
                  <div className="space-y-2">
                    <Label>Paste JSON to Import</Label>
                    <Textarea rows={12} value={importText} onChange={(e) => setImportText(e.target.value)} />
                  </div>
                  <Button variant="secondary" onClick={importJson}><Upload className="mr-2 h-4 w-4" />Import JSON</Button>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/80 border-slate-800">
                <CardHeader>
                  <CardTitle>Extensibility Notes</CardTitle>
                  <CardDescription>How to expand this app safely</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-300">
                  <p>• Add new classes/races/backgrounds by extending the top-level data objects.</p>
                  <p>• Keep optimization logic mechanical and generic (tags, values, heuristics), not copyrighted feature prose.</p>
                  <p>• Multiclass support is scaffolded conceptually but not fully enumerated in this version.</p>
                  <p>• Future upgrades: feat catalogs, multiclass path search, spell role tagging, resource trackers, and printable sheet mode.</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
