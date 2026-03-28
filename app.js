/* =========================================================
   D&D 5e SRD-Safe Character Builder + Optimizer
   Vanilla JS – no frameworks, no external dependencies
   ========================================================= */
"use strict";

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
// 2. Rules Math
// =========================================================
function modFromScore(score) { return Math.floor((Number(score || 10) - 10) / 2); }
function proficiencyBonus(level) { return Math.floor((Number(level || 1) - 1) / 4) + 2; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function pointBuyCost(s) { const t = [0,0,0,0,0,0,0,0,0,1,2,3,4,5,7,9]; return t[clamp(Number(s),0,15)] || 0; }
function abilityScoreBounds(mode) { return mode === "pointbuy" ? { min: 8, max: 15 } : { min: 3, max: 20 }; }

function getClassData(key) { return CLASSES[key] || CLASSES.fighter; }

function getEstimatedHP(level, classKey, conMod) {
  const hd = getClassData(classKey).hitDie;
  const lvl = Number(level || 1);
  if (lvl <= 1) return hd + conMod;
  return hd + conMod + (lvl - 1) * (Math.floor(hd / 2) + 1 + conMod);
}

function getArmorClassEstimate(character, dexMod) {
  const cls = getClassData(character.class);
  const shield = character.hasShield ? 2 : 0;
  const mag = Number(character.armorMagicBonus || 0);
  if (cls.armorType === "heavy")    return 16 + shield + mag;
  if (cls.armorType === "medium")   return 14 + clamp(dexMod, 0, 2) + shield + mag;
  if (cls.armorType === "light")    return 11 + dexMod + shield + mag;
  if (cls.armorType === "unarmored") return 10 + dexMod + Math.max(modFromScore(character.abilities.wis), 0);
  return 10 + dexMod;
}

function getCasterAbility(character) {
  return character.spellcasting.castingAbility || getClassData(character.class).defaultCastingAbility || "int";
}

function estimateAttacksPerRound(classKey, level) {
  const cls = getClassData(classKey);
  return (cls.features.extraAttackLevel && Number(level) >= cls.features.extraAttackLevel) ? 2 : 1;
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

function weaponAtkBonus(weapon, abilities, pb) {
  const mod = modFromScore(abilities[weapon.ability] || 10);
  const prof = weapon.proficient ? pb : 0;
  return mod + prof + Number(weapon.magicBonus || 0);
}

function weaponAvgDamage(weapon, abilities, pb) {
  const mod = modFromScore(abilities[weapon.ability] || 10);
  const magicBonus = Number(weapon.magicBonus || 0);
  const dmg = String(weapon.damage || "1d8");
  const match = dmg.match(/(\d+)d(\d+)/i);
  let diceAvg = 4.5;
  if (match) { const n = Number(match[1]); const d = Number(match[2]); diceAvg = n * ((d + 1) / 2); }
  return (diceAvg + mod + magicBonus).toFixed(1);
}

// =========================================================
// 3. Optimizer Logic
// =========================================================
function getPrimaryAbilityForObjective(classKey, objective) {
  const cls = getClassData(classKey);
  if (objective === "controller") return cls.defaultCastingAbility || "int";
  if (objective === "skill") return classKey === "rogue" ? "dex" : classKey === "bard" ? "cha" : cls.defaultCastingAbility || cls.weaponStyle || "dex";
  if (cls.spellcasting && ["bard","cleric","druid","sorcerer","warlock","wizard"].includes(classKey)) {
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
  const priorities = [primary, secondary, tertiary, ...ABILITIES.filter(a => ![primary,secondary,tertiary].includes(a))];
  const targets = [15, 14, 13, 12, 10, 8];
  priorities.forEach((ab, i) => { scores[ab] = targets[i] !== undefined ? targets[i] : 8; });
  let cost = ABILITIES.reduce((s, a) => s + pointBuyCost(scores[a]), 0);
  while (cost > 27) {
    const r = priorities.slice().reverse().find(a => scores[a] > 8 && a !== primary);
    if (!r) break;
    scores[r]--;
    cost = ABILITIES.reduce((s, a) => s + pointBuyCost(scores[a]), 0);
  }
  while (cost < 27) {
    const u = priorities.find(a => scores[a] < 15 && (pointBuyCost(scores[a]+1) - pointBuyCost(scores[a])) <= (27 - cost));
    if (!u) break;
    cost += pointBuyCost(scores[u]+1) - pointBuyCost(scores[u]);
    scores[u]++;
  }
  return scores;
}

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

function evaluateBuildSnapshot(snapshot, assumptions, objective) {
  const pb = proficiencyBonus(snapshot.level);
  const primary = getPrimaryAbilityForObjective(snapshot.class, objective);
  const primaryMod = modFromScore(snapshot.abilities[primary]);
  const dexMod = modFromScore(snapshot.abilities.dex);
  const conMod = modFromScore(snapshot.abilities.con);
  const cls = getClassData(snapshot.class);

  const attackBonus = pb + primaryMod + Number(assumptions.magicBonus || 0);
  const avgDie = cls.weaponStyle === "dex" ? 4.5 : 5.5;
  const attacks = estimateAttacksPerRound(snapshot.class, snapshot.level);
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
  const controlPressure = cls.spellcasting
    ? failChance * (10 + pb * 1.2) + (modFromScore(snapshot.abilities.con) * 0.6)
    : failChance * 2;

  const skillKeys = getSuggestedSkills(snapshot.class, objective);
  const skillScore = skillKeys.reduce((sum, k) => {
    const skill = SKILLS.find(s => s.key === k);
    if (!skill) return sum;
    return sum + modFromScore(snapshot.abilities[skill.ability]) + pb;
  }, 0) + (snapshot.class === "rogue" ? pb * 1.5 : 0) + (snapshot.class === "bard" ? pb : 0);

  const concentrationScore = cls.spellcasting
    ? (conMod + (cls.saveProficiencies.includes("con") ? pb : 0))
    : conMod;
  const initiative = dexMod + (snapshot.featPlan.includes("initiative_feat") ? 3 : 0);

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

  return { score, sustainedDpr, novaDpr, effectiveHp, ac, hp, spellDc, spellAttack, controlPressure, skillScore, concentrationScore, initiative, hitChance, primary };
}

function buildMilestonePlan(baseClass, objective, assumptions) {
  const milestones = [1,3,5,8,11,17,20].filter(n => n <= assumptions.analysisLevel);
  return milestones.map(level => {
    const abilities = autoAssignPointBuy(baseClass, objective);
    const featPlan = [];
    const asiLevels = [4,8,12,16,19].filter(n => n <= level);
    const primary = getPrimaryAbilityForObjective(baseClass, objective);
    const caster = getClassData(baseClass).defaultCastingAbility;
    asiLevels.forEach((_, idx) => {
      if (assumptions.feats && objective === "controller" && idx === 0) {
        featPlan.push("initiative_feat");
      } else if (assumptions.feats && ["sustained_dpr","nova_dpr"].includes(objective) && idx === 0) {
        featPlan.push("damage_feat");
      } else {
        if (abilities[primary] < 20) abilities[primary] = Math.min(20, abilities[primary]+2);
        else if (abilities.con < 18) abilities.con = Math.min(20, abilities.con+2);
        else if (caster && abilities[caster] < 20) abilities[caster] = Math.min(20, abilities[caster]+2);
      }
      if (featPlan.length && abilities[primary] < 18 && idx > 0) abilities[primary] = Math.min(20, abilities[primary]+2);
    });
    const snapshot = { class: baseClass, level, abilities, featPlan };
    const metrics = evaluateBuildSnapshot(snapshot, assumptions, objective);
    return { level, snapshot, metrics };
  });
}

function generateCandidateBuilds(config) {
  const { objective, assumptions, classPool } = config;
  const pool = classPool.length ? classPool : CLASS_OPTIONS;
  return pool.map(classKey => {
    const plan = buildMilestonePlan(classKey, objective, assumptions);
    const finalStep = plan[plan.length - 1] || plan[0];
    const score = finalStep?.metrics?.score || 0;
    const cls = getClassData(classKey);
    const strengths = [];
    if (finalStep.metrics.sustainedDpr >= 12) strengths.push("Strong sustained offense");
    if (finalStep.metrics.novaDpr >= 18)      strengths.push("Strong burst potential");
    if (finalStep.metrics.effectiveHp >= 70)  strengths.push("High durability");
    if (finalStep.metrics.controlPressure >= 6) strengths.push("Strong control");
    if (finalStep.metrics.skillScore >= 15)   strengths.push("High utility");
    if (cls.tags.includes("short_rest"))       strengths.push("Short-rest efficient");
    const tradeoffs = [];
    if (cls.hitDie <= 6)                              tradeoffs.push("Lower durability");
    if (!cls.spellcasting && objective === "controller") tradeoffs.push("Limited magical control");
    if (cls.armorType === "light" && objective === "tank") tradeoffs.push("Weaker armor scaling");
    if (cls.tags.includes("nova_dpr") && assumptions.roundsPerEncounter >= 5) tradeoffs.push("Value dips in long fights");
    return {
      classKey, classLabel: cls.label, score, plan, strengths, tradeoffs,
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
  }).sort((a, b) => b.score - a.score);
}

// =========================================================
// 4. State Model
// =========================================================
function safeId() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

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

function hydrateCharacter(raw) {
  const def = createDefaultCharacter();
  if (!raw || typeof raw !== "object") return def;
  return {
    ...def, ...raw,
    identity: { ...def.identity, ...(raw.identity || {}) },
    abilities: { ...def.abilities, ...(raw.abilities || {}) },
    skills: (raw.skills && typeof raw.skills === "object") ? { ...def.skills, ...raw.skills } : def.skills,
    weapons: Array.isArray(raw.weapons) ? raw.weapons.map(w => ({ id: safeId(), name: "", ability: "str", proficient: true, magicBonus: 0, damage: "1d8+MOD", ...w })) : def.weapons,
    spellcasting: {
      ...def.spellcasting, ...(raw.spellcasting || {}),
      slots: { ...DEFAULT_SPELL_SLOTS(), ...((raw.spellcasting || {}).slots || {}) },
    },
    equipment: Array.isArray(raw.equipment) ? raw.equipment : def.equipment,
    optimizer: {
      ...def.optimizer, ...(raw.optimizer || {}),
      assumptions: { ...def.optimizer.assumptions, ...((raw.optimizer || {}).assumptions || {}) },
      results: [],
    },
  };
}

// =========================================================
// 5. Persistence
// =========================================================
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { setStatus("⚠ Save failed: " + e.message, true); }
  }, 400);
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return hydrateCharacter(JSON.parse(raw));
  } catch {}
  return createDefaultCharacter();
}

// =========================================================
// 6. App State
// =========================================================
let state = loadFromStorage();

function setStatus(msg, warn) {
  const el = document.getElementById("status-msg");
  if (el) { el.textContent = msg; el.style.color = warn ? "#f85149" : ""; }
}

// =========================================================
// 7. DOM Helpers
// =========================================================
function qs(sel) { return document.querySelector(sel); }

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
  const tbody = document.getElementById("ability-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const { min: abMin, max: abMax } = abilityScoreBounds(state.abilityMode);
  ABILITIES.forEach(ab => {
    const score = state.abilities[ab];
    const mod = modFromScore(score);
    const saveProf = cls.saveProficiencies.includes(ab);
    const saveMod = mod + (saveProf ? pb : 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ABILITY_LABELS[ab]}</td>
      <td><input type="number" min="${abMin}" max="${abMax}" value="${score}" data-ab="${ab}"></td>
      <td class="mod-cell">${fmtMod(mod)}</td>
      <td class="save-cell ${saveProf ? "save-prof" : ""}">${fmtMod(saveMod)}${saveProf ? " ●" : ""}</td>
    `;
    tbody.appendChild(tr);
  });

  // Point buy info
  const pbInfo = document.getElementById("pb-info");
  if (state.abilityMode === "pointbuy") {
    const spent = ABILITIES.reduce((s, a) => s + pointBuyCost(state.abilities[a]), 0);
    const rem = 27 - spent;
    pbInfo.textContent = `Point Buy: ${spent}/27 spent — ${rem >= 0 ? rem + " remaining" : Math.abs(rem) + " over budget"}`;
    pbInfo.className = "pb-info" + (rem < 0 ? " over" : "");
    pbInfo.classList.remove("hidden");
  } else {
    pbInfo.className = "pb-info hidden";
  }

  // set ability mode selector
  document.getElementById("f-ability-mode").value = state.abilityMode;
}

// --- Derived stats ---
function renderDerived() {
  const pb = proficiencyBonus(state.level);
  const mods = {};
  ABILITIES.forEach(a => mods[a] = modFromScore(state.abilities[a]));
  const hp = getEstimatedHP(state.level, state.class, mods.con);
  const ac = getArmorClassEstimate(state, mods.dex);
  const castAb = getCasterAbility(state);
  const spellAtk = pb + mods[castAb];
  const spellDc = 8 + pb + mods[castAb];
  const pp = 10 + mods.wis + (state.skills.perception?.proficient ? pb : 0) + (state.skills.perception?.expertise ? pb : 0);

  const container = document.getElementById("derived-stats");
  if (!container) return;
  const chips = [
    ["HP", hp],
    ["AC", ac],
    ["Prof", fmtMod(pb)],
    ["Init", fmtMod(mods.dex)],
    ["Spell Atk", fmtMod(spellAtk)],
    ["Spell DC", spellDc],
    ["Pass Perc", pp],
  ];
  container.innerHTML = chips.map(([lbl, val]) =>
    `<div class="derived-chip"><span class="dval">${val}</span><span class="dlbl">${lbl}</span></div>`
  ).join("");

  // statusbar
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
      <td><input type="number" min="0" max="5" value="${w.magicBonus}" data-wfield="magicBonus" style="width:2.8rem"></td>
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
  for (let lvl = 1; lvl <= 9; lvl++) {
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
  { key: "targetSaveBonus",   label: "Target Save",      type: "number", min: -5, max: 12 },
  { key: "advantageRate",     label: "Adv Rate (0–1)",   type: "number", min: 0,  max: 1, step: 0.05 },
  { key: "magicBonus",        label: "Magic Bonus",      type: "number", min: 0,  max: 3 },
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
// 9. Event Wiring
// =========================================================
function wireEvents() {
  // Identity text inputs
  document.getElementById("f-name").addEventListener("input", e => { state.identity.name = e.target.value; scheduleSave(); setStatus("Saved."); });
  document.getElementById("f-player").addEventListener("input", e => { state.identity.player = e.target.value; scheduleSave(); });
  document.getElementById("f-subclass").addEventListener("input", e => { state.identity.subclass = e.target.value; scheduleSave(); });
  document.getElementById("f-level").addEventListener("change", e => {
    state.level = clamp(Number(e.target.value) || 1, 1, 20);
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    scheduleSave();
  });
  document.getElementById("f-class").addEventListener("change", e => {
    state.class = e.target.value;
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
    const { min, max } = abilityScoreBounds(state.abilityMode);
    state.abilities[ab] = clamp(Number(e.target.value) || 8, min, max);
    e.target.value = state.abilities[ab];
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
    const scores = autoAssignPointBuy(state.class, state.optimizer.objective);
    Object.assign(state.abilities, scores);
    state.abilityMode = "pointbuy";
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    setStatus("Auto Point Buy applied.");
    scheduleSave();
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
    else if (field === "magicBonus") w[field] = Number(e.target.value) || 0;
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
    if (slot) { state.spellcasting.slots[slot] = Number(e.target.value) || 0; scheduleSave(); }
  });

  document.getElementById("f-cast-ability").addEventListener("change", e => {
    state.spellcasting.castingAbility = e.target.value;
    renderDerived(); renderMetrics(); scheduleSave();
  });

  document.getElementById("f-has-shield").addEventListener("change", e => {
    state.hasShield = e.target.checked;
    renderDerived(); renderMetrics(); scheduleSave();
  });

  document.getElementById("f-armor-bonus").addEventListener("change", e => {
    state.armorMagicBonus = Number(e.target.value) || 0;
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
    state.optimizer.assumptions.analysisLevel = clamp(Number(e.target.value) || 8, 1, 20);
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
    setStatus("Generating builds…");
    const results = generateCandidateBuilds({
      objective: state.optimizer.objective,
      assumptions: state.optimizer.assumptions,
      classPool: [],
    }).slice(0, 5);
    state.optimizer.results = results;
    renderResults(); renderMetrics(); scheduleSave();
    setStatus(`Top ${results.length} builds generated.`);
  });

  document.getElementById("btn-apply-top").addEventListener("click", () => applyBuildResult(0));

  document.getElementById("btn-export").addEventListener("click", exportJson);
  document.getElementById("btn-export2").addEventListener("click", () => {
    navigator.clipboard.writeText(JSON.stringify(state, null, 2))
      .then(() => setStatus("Copied to clipboard."))
      .catch(() => { document.getElementById("f-import-text").value = JSON.stringify(state, null, 2); setStatus("Paste from text area."); });
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
    } catch {
      setStatus("Invalid JSON.", true);
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
}

function exportJson() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (state.identity.name || "character") + ".json";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Exported.");
}

// =========================================================
// 10. Boot
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  render();
  wireEvents();
  setStatus("Loaded.");
});
