/* =========================================================
   D&D 5e SRD-Safe Character Builder + Optimizer
   Vanilla JS – no frameworks, no external dependencies
   
   VERSION: 2.1 - Improved with better validation and error handling
   ========================================================= */

import {
  ABILITIES, CLASSES,
  POINT_BUY_MAX_POINTS, POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE,
  MAX_MAGIC_BONUS, BASE_AC,
  EHP_AC_BASELINE, EHP_AC_SCALAR,
  clamp, validateLevel, validateMagicBonus, validateClassKey, validateAbilityKey,
  modFromScore, proficiencyBonus, pointBuyCost,
  getClassData, getEstimatedHP, getArmorClassEstimate, getCasterAbility,
  estimateAttacksPerRound, effectiveHitChance, saveFailChance,
  weaponAtkBonus, weaponAvgDamage,
} from "./dnd-engine.js";

import { normalizeState, validateState } from "./validation.js";

import { CancelToken, runOptimizerAsync } from "./optimizer-runner.js";

import {
  AVG_DIE_FINESSE, AVG_DIE_HEAVY,
  NOVA_BURST_BONUS_FACTOR, BURST_FACTOR_CAP, BURST_FACTOR_PER_REST,
  DAMAGE_FEAT_BONUS, INITIATIVE_FEAT_BONUS,
  BASE_SPELL_DC,
  CONTROL_PRESSURE_PB_MULT, CONTROL_PRESSURE_BASE, CONTROL_CON_WEIGHT, CONTROL_NON_CASTER_FACTOR,
  SKILL_ROGUE_BONUS_MULT, SKILL_BARD_BONUS_MULT,
  STRENGTH_THRESHOLD_SUSTAINED_DPR, STRENGTH_THRESHOLD_NOVA_DPR,
  STRENGTH_THRESHOLD_EFFECTIVE_HP, STRENGTH_THRESHOLD_CONTROL, STRENGTH_THRESHOLD_SKILL,
  OBJECTIVE_WEIGHTS, OBJECTIVE_WEIGHTS_DEFAULT,
} from "./optimizer-constants.js";

// =========================================================
// CONSTANTS - App-specific magic numbers
// =========================================================
const ABILITY_SCORE_MIN = 3;
const ABILITY_SCORE_MAX = 20;
const MAX_SPELL_LEVEL = 9;

// ASI/Feat breakpoint levels
const ASI_LEVELS = [4, 8, 12, 16, 19];
const MILESTONE_LEVELS = [1, 3, 5, 8, 11, 17, 20];

// =========================================================
// 1. Data / Constants
// =========================================================
const CLASS_OPTIONS = Object.keys(CLASSES);

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
    const avgDie = cls.weaponStyle === "dex" ? AVG_DIE_FINESSE : AVG_DIE_HEAVY; // Finesse/ranged vs heavy weapons
    const attacks = estimateAttacksPerRound(snapshot.class, snapshot.level);
    const hitChance = effectiveHitChance(attackBonus, assumptions.targetAC, assumptions.advantageRate);
    const bonusDamage = cls.features?.bonusDamagePerAttack || 0;
    const perHitDamage = avgDie + primaryMod + validateMagicBonus(assumptions.magicBonus) + bonusDamage;
    const sustainedDpr = Math.max(0, hitChance * perHitDamage * attacks);

    // Nova/burst damage
    const hasShortRestAbilities = (cls.features?.burstUsesPerShortRest || 0) > 0;
    const burstFactor = hasShortRestAbilities ? 1 + Math.min(BURST_FACTOR_CAP, assumptions.shortRests * BURST_FACTOR_PER_REST) : 1;
    const burstBonus = hasShortRestAbilities ? NOVA_BURST_BONUS_FACTOR : 0;
    const featBonus = snapshot.featPlan?.includes("damage_feat") ? DAMAGE_FEAT_BONUS : 0;
    const novaDpr = sustainedDpr * (1 + burstBonus) * burstFactor + featBonus;

    // Defensive capabilities
    const hp = getEstimatedHP(snapshot.level, snapshot.class, conMod);
    const ac = getArmorClassEstimate({ 
      ...snapshot, 
      hasShield: objective === "tank", 
      armorMagicBonus: assumptions.magicBonus 
    }, dexMod);
    const effectiveHp = hp * (1 + (ac - EHP_AC_BASELINE) * EHP_AC_SCALAR);

    // Spellcasting metrics
    const casterAbility = cls.defaultCastingAbility || "int";
    const spellDc = BASE_SPELL_DC + pb + modFromScore(snapshot.abilities[casterAbility]);
    const spellAttack = pb + modFromScore(snapshot.abilities[casterAbility]) + validateMagicBonus(assumptions.magicBonus);
    const failChance = saveFailChance(spellDc, assumptions.targetSaveBonus);
    const controlPressure = cls.spellcasting
      ? failChance * (CONTROL_PRESSURE_BASE + pb * CONTROL_PRESSURE_PB_MULT) + (modFromScore(snapshot.abilities.con) * CONTROL_CON_WEIGHT)
      : failChance * CONTROL_NON_CASTER_FACTOR;

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
    const initiativeBonus = snapshot.featPlan?.includes("initiative_feat") ? INITIATIVE_FEAT_BONUS : 0;
    const initiative = dexMod + initiativeBonus;

    // Calculate weighted score based on objective
    const W = OBJECTIVE_WEIGHTS[objective] || OBJECTIVE_WEIGHTS_DEFAULT;

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
    if (finalStep.metrics.novaDpr >= STRENGTH_THRESHOLD_NOVA_DPR)            strengths.push("Strong burst potential");
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
}

/**
 * Generate optimized candidate builds for all classes
 * Returns sorted array of build recommendations
 */
function generateCandidateBuilds(config) {
  try {
    const { objective, assumptions, classPool } = config;
    const pool = classPool && classPool.length ? classPool : CLASS_OPTIONS;

    const results = pool
      .map(classKey => buildOneClassResult(classKey, objective, assumptions))
      .filter(r => r !== null);

    // Filter out failed builds and sort by score
    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Error generating candidate builds:", error);
    return [];
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
      assumptions: { ...RULE_PRESETS.common_optimized, analysisLevel: 8 },
      results: [],
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

    // Disable optimize / apply; show cancel
    btnOptimize.disabled = true;
    btnApplyTop.disabled = true;
    btnCancel.classList.remove("hidden");

    const pool = CLASS_OPTIONS;
    setStatus(`Generating builds… 0 / ${pool.length}`);

    _currentCancelToken = new CancelToken();
    const token = _currentCancelToken;

    const { objective, assumptions } = state.optimizer;

    try {
      const sorted = await runOptimizerAsync(
        pool,
        classKey => buildOneClassResult(classKey, objective, assumptions),
        token,
        ({ processed, total, phase }) => {
          if (phase === "generating") {
            setStatus(`Generating builds… ${processed} / ${total}`);
          } else if (phase === "sorting") {
            setStatus("Sorting results…");
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
        renderResults(); renderMetrics(); scheduleSave();
        setStatus(`Top ${state.optimizer.results.length} builds generated.`);
      }
    } catch (error) {
      console.error("Optimization failed:", error);
      setStatus("⚠ Optimization failed", true);
    } finally {
      btnOptimize.disabled = false;
      btnApplyTop.disabled = false;
      btnCancel.classList.add("hidden");
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

    // Normalize + validate the applied state; preserve existing optimizer results
    const savedResults = state.optimizer.results || [];
    const normalizedApplied = hydrateCharacter(state);
    const { issues } = validateState(normalizedApplied);
    state = normalizedApplied;
    state.optimizer.results = savedResults;

    render();
    scheduleSave();
    showValidationIssues(issues);
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
