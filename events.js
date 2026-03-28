/* =========================================================
   events.js – All DOM event wiring.
   ========================================================= */

import {
  validateLevel, validateClassKey, validateAbilityKey, validateMagicBonus,
  getClassData, ABILITIES, clamp,
  POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE, POINT_BUY_MAX_POINTS,
} from "./dnd-engine.js";

import {
  ABILITY_SCORE_MIN, ABILITY_SCORE_MAX, RULE_PRESETS, STANDARD_ARRAY,
} from "./dnd-data.js";

import { STORAGE_KEY } from "./persistence.js";

import { validateState } from "./validation.js";

import {
  getState, setState, saveState,
  createDefaultCharacter, hydrateCharacter, DEFAULT_SKILLS_STATE,
} from "./state.js";

import {
  setStatus, clearAllIssues, setValidationIssues, reportIssue,
} from "./diagnostics.js";

import {
  renderAbilities, renderDerived, renderSkills, renderWeapons,
  renderSpellSlots, renderMetrics, renderOptimizer, render,
} from "./render.js";

import {
  autoAssignPointBuy,
} from "./optimizer-engine.js";

import {
  runOptimizer, cancelOptimizer, applyBuildResult, exportJson, exportToClipboard,
} from "./optimizer-ui.js";

// =========================================================
// Local validation helpers
// =========================================================

function validateAbilityScore(score, mode) {
  const num = Number(score);
  if (isNaN(num)) return mode === "pointbuy" ? POINT_BUY_MIN_SCORE : 10;
  if (mode === "pointbuy") return clamp(num, POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE);
  return clamp(num, ABILITY_SCORE_MIN, ABILITY_SCORE_MAX);
}

function validateSpellSlot(slot) {
  const num = Number(slot);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(num, 9);
}

// =========================================================
// Wire all events
// =========================================================

export function wireEvents() {
  // ── Identity ─────────────────────────────────────────────
  document.getElementById("f-name").addEventListener("input", e => {
    getState().identity.name = e.target.value;
    saveState(); setStatus("Saved.");
  });
  document.getElementById("f-player").addEventListener("input", e => {
    getState().identity.player = e.target.value; saveState();
  });
  document.getElementById("f-subclass").addEventListener("input", e => {
    getState().identity.subclass = e.target.value; saveState();
  });
  document.getElementById("f-level").addEventListener("change", e => {
    const s = getState();
    s.level       = validateLevel(e.target.value);
    e.target.value = s.level;
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    saveState();
  });
  document.getElementById("f-class").addEventListener("change", e => {
    const s   = getState();
    s.class   = validateClassKey(e.target.value);
    const def = getClassData(s.class).defaultCastingAbility;
    if (def) s.spellcasting.castingAbility = def;
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderSpellSlots(); renderMetrics();
    saveState();
  });
  document.getElementById("f-race").addEventListener("change", e => {
    getState().identity.race = e.target.value; saveState();
  });
  document.getElementById("f-background").addEventListener("change", e => {
    getState().identity.background = e.target.value; saveState();
  });
  document.getElementById("f-alignment").addEventListener("change", e => {
    getState().identity.alignment = e.target.value; saveState();
  });

  // ── Ability mode ─────────────────────────────────────────
  document.getElementById("f-ability-mode").addEventListener("change", e => {
    getState().abilityMode = e.target.value;
    renderAbilities(); saveState();
  });

  // ── Ability scores (delegated) ───────────────────────────
  document.getElementById("ability-tbody").addEventListener("change", e => {
    const ab = e.target.dataset.ab;
    if (!ab) return;
    const s = getState();
    s.abilities[ab] = validateAbilityScore(e.target.value, s.abilityMode);
    e.target.value  = s.abilities[ab];
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    saveState();
  });

  // ── Apply standard array ─────────────────────────────────
  document.getElementById("btn-std-array").addEventListener("click", () => {
    const s   = getState();
    const arr = [...STANDARD_ARRAY];
    ABILITIES.forEach((a, i) => { s.abilities[a] = arr[i]; });
    s.abilityMode = "standard";
    renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
    saveState();
  });

  // ── Auto point buy ───────────────────────────────────────
  document.getElementById("btn-auto-pb").addEventListener("click", () => {
    try {
      const s      = getState();
      const scores = autoAssignPointBuy(s.class, s.optimizer.objective);
      Object.assign(s.abilities, scores);
      s.abilityMode = "pointbuy";
      renderAbilities(); renderDerived(); renderSkills(); renderWeapons(); renderMetrics();
      setStatus("Auto Point Buy applied.");
      saveState();
    } catch (error) {
      console.error("Auto point buy failed:", error);
      setStatus("⚠ Auto point buy failed", true);
    }
  });

  // ── Skills (delegated) ───────────────────────────────────
  document.getElementById("skills-tbody").addEventListener("change", e => {
    const key   = e.target.dataset.skill;
    const field = e.target.dataset.field;
    if (!key || !field) return;
    const s = getState();
    if (!s.skills[key]) s.skills[key] = { proficient: false, expertise: false };
    s.skills[key][field] = e.target.checked;
    if (field === "expertise" && e.target.checked) s.skills[key].proficient = true;
    renderSkills(); renderDerived(); renderMetrics();
    saveState();
  });

  document.getElementById("btn-clear-skills").addEventListener("click", () => {
    getState().skills = DEFAULT_SKILLS_STATE();
    renderSkills(); renderDerived(); renderMetrics();
    saveState();
  });

  // ── Add weapon ───────────────────────────────────────────
  document.getElementById("btn-add-weapon").addEventListener("click", () => {
    const id = (() => {
      try { return crypto.randomUUID(); }
      catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
    })();
    getState().weapons.push({ id, name: "New Weapon", ability: "str", proficient: true, magicBonus: 0, damage: "1d8+MOD" });
    renderWeapons(); saveState();
  });

  // ── Weapons (delegated) ──────────────────────────────────
  document.getElementById("weapons-tbody").addEventListener("change", e => {
    const wid   = e.target.closest("tr")?.dataset.wid;
    if (!wid) return;
    const field = e.target.dataset.wfield;
    if (!field) return;
    const w = getState().weapons.find(x => x.id === wid);
    if (!w) return;
    if (field === "proficient")   w[field] = e.target.checked;
    else if (field === "magicBonus") { w[field] = validateMagicBonus(e.target.value); e.target.value = w[field]; }
    else if (field === "ability") w[field] = validateAbilityKey(e.target.value);
    else                          w[field] = e.target.value;
    renderWeapons(); saveState();
  });

  document.getElementById("weapons-tbody").addEventListener("click", e => {
    const btn = e.target.closest("[data-del-weapon]");
    if (!btn) return;
    const s = getState();
    s.weapons = s.weapons.filter(w => w.id !== btn.dataset.delWeapon);
    renderWeapons(); saveState();
  });

  // ── Spell slots ──────────────────────────────────────────
  document.getElementById("slots-body-row").addEventListener("change", e => {
    const slot = e.target.dataset.slot;
    if (slot) {
      const s = getState();
      s.spellcasting.slots[slot] = validateSpellSlot(e.target.value);
      e.target.value = s.spellcasting.slots[slot];
      saveState();
    }
  });

  document.getElementById("f-cast-ability").addEventListener("change", e => {
    getState().spellcasting.castingAbility = validateAbilityKey(e.target.value);
    renderDerived(); renderMetrics(); saveState();
  });

  document.getElementById("f-has-shield").addEventListener("change", e => {
    getState().hasShield = e.target.checked;
    renderDerived(); renderMetrics(); saveState();
  });

  document.getElementById("f-armor-bonus").addEventListener("change", e => {
    const s = getState();
    s.armorMagicBonus = validateMagicBonus(e.target.value);
    e.target.value    = s.armorMagicBonus;
    renderDerived(); renderMetrics(); saveState();
  });

  // ── Spell textareas ──────────────────────────────────────
  document.getElementById("f-known-spells").addEventListener("input", e => {
    getState().spellcasting.knownSpells = e.target.value; saveState();
  });
  document.getElementById("f-prep-spells").addEventListener("input", e => {
    getState().spellcasting.preparedSpells = e.target.value; saveState();
  });
  // Restore textareas (not covered by renderSpellSlots)
  document.getElementById("f-known-spells").value = getState().spellcasting.knownSpells || "";
  document.getElementById("f-prep-spells").value  = getState().spellcasting.preparedSpells || "";

  // ── Notes ────────────────────────────────────────────────
  document.getElementById("f-features").addEventListener("input", e => { getState().features = e.target.value; saveState(); });
  document.getElementById("f-traits").addEventListener("input",   e => { getState().traits   = e.target.value; saveState(); });
  document.getElementById("f-notes").addEventListener("input",    e => { getState().notes    = e.target.value; saveState(); });
  document.getElementById("f-equipment").addEventListener("input", e => {
    getState().equipment = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
    saveState();
  });

  // ── Optimizer controls ───────────────────────────────────
  document.getElementById("f-objective").addEventListener("change", e => {
    getState().optimizer.objective = e.target.value;
    renderMetrics(); saveState();
  });

  document.getElementById("f-rule-preset").addEventListener("change", e => {
    const key    = e.target.value;
    const preset = RULE_PRESETS[key];
    if (preset) {
      const s = getState();
      s.optimizer.rulePreset  = key;
      s.optimizer.assumptions = {
        ...s.optimizer.assumptions,
        ...preset,
        analysisLevel: s.optimizer.assumptions.analysisLevel,
      };
      renderOptimizer(); renderMetrics(); saveState();
    }
  });

  document.getElementById("f-analysis-level").addEventListener("change", e => {
    const s = getState();
    s.optimizer.assumptions.analysisLevel = validateLevel(e.target.value);
    e.target.value = s.optimizer.assumptions.analysisLevel;
    saveState();
  });

  document.getElementById("assumptions-grid").addEventListener("change", e => {
    const key = e.target.dataset.assumption;
    if (!key) return;
    const s = getState();
    if (e.target.type === "checkbox") s.optimizer.assumptions[key] = e.target.checked;
    else                              s.optimizer.assumptions[key] = Number(e.target.value);
    renderMetrics(); saveState();
  });

  // ── Toolbar buttons ──────────────────────────────────────
  document.getElementById("btn-optimize").addEventListener("click", () => runOptimizer());

  document.getElementById("btn-cancel").addEventListener("click", () => cancelOptimizer());

  document.getElementById("btn-apply-top").addEventListener("click", () => applyBuildResult(0));

  document.getElementById("btn-export").addEventListener("click", () => exportJson());

  document.getElementById("btn-export2").addEventListener("click", () => exportToClipboard());

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Reset all character and optimizer data?")) return;
    setState(createDefaultCharacter());
    localStorage.removeItem(STORAGE_KEY);
    clearAllIssues();
    render();
    document.getElementById("f-known-spells").value = "";
    document.getElementById("f-prep-spells").value  = "";
    setStatus("Reset.");
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    const txt = document.getElementById("f-import-text").value.trim();
    if (!txt) { setStatus("Paste JSON first.", true); return; }
    try {
      const parsed = JSON.parse(txt);
      const { issues } = validateState(parsed);
      const normalized = hydrateCharacter(parsed);
      setState(normalized);
      render();
      document.getElementById("f-known-spells").value  = getState().spellcasting.knownSpells || "";
      document.getElementById("f-prep-spells").value   = getState().spellcasting.preparedSpells || "";
      document.getElementById("f-import-text").value   = "";
      saveState();
      setValidationIssues(issues);
      const hasErrors   = issues.some(i => i.severity === "error");
      const hasWarnings = issues.length > 0;
      if (hasErrors) {
        setStatus("⚠ Import completed with errors — check diagnostics.");
        reportIssue({ severity: "error", path: "import", message: "Import completed with errors — check diagnostics panel." });
      } else if (hasWarnings) {
        setStatus("Import completed with warnings — check diagnostics.");
      } else {
        setStatus("Import successful.");
      }
    } catch (error) {
      console.error("Import failed:", error);
      setStatus("⚠ Invalid JSON — could not parse.", true);
      reportIssue({ severity: "error", path: "import", message: "Invalid JSON — could not parse: " + (error.message || String(error)) });
    }
  });

  // ── Results list (delegated) ─────────────────────────────
  document.getElementById("results-list").addEventListener("click", e => {
    const btn = e.target.closest("[data-apply-idx]");
    if (!btn) return;
    applyBuildResult(Number(btn.dataset.applyIdx));
  });
}
