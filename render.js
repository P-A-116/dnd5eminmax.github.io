/* =========================================================
   render.js – All DOM rendering functions.
   Reads from the state singleton; never mutates state.
   ========================================================= */

import {
  ABILITIES, CLASSES,
  MAX_MAGIC_BONUS, BASE_AC,
  modFromScore, proficiencyBonus, pointBuyCost,
  getClassData, getEstimatedHP, getArmorClassEstimate, getCasterAbility,
  weaponAtkBonus, weaponAvgDamage,
  POINT_BUY_MAX_POINTS, POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE,
} from "./dnd-engine.js";

import {
  ABILITY_LABELS, SKILLS, ALIGNMENTS, RACES, BACKGROUNDS,
  OPTIMIZER_OBJECTIVES, RULE_PRESETS,
  ABILITY_SCORE_MIN, ABILITY_SCORE_MAX,
} from "./dnd-data.js";

import { evaluateBuildSnapshot } from "./optimizer-engine.js";

import { getState } from "./state.js";

// =========================================================
// Tiny helpers
// =========================================================

export function fmtMod(n) { return n >= 0 ? "+" + n : String(n); }
export function fmtFixed(n, d = 1) { return Number(n).toFixed(d); }

export function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function populateSelect(id, options, current) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = "";
  options.forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value        = val;
    opt.textContent  = label;
    if (val === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

const CLASS_OPTIONS = Object.keys(CLASSES);

// =========================================================
// Individual section renderers
// =========================================================

export function renderIdentity() {
  const s = getState();
  document.getElementById("f-name").value    = s.identity.name;
  document.getElementById("f-player").value  = s.identity.player;
  document.getElementById("f-subclass").value = s.identity.subclass;
  document.getElementById("f-level").value   = s.level;
  populateSelect("f-class",      CLASS_OPTIONS.map(k => [k, CLASSES[k].label]), s.class);
  populateSelect("f-race",       RACES.map(r => [r, r]),                        s.identity.race);
  populateSelect("f-background", BACKGROUNDS.map(b => [b, b]),                  s.identity.background);
  populateSelect("f-alignment",  ALIGNMENTS.map(a => [a, a]),                   s.identity.alignment);
  const modeEl = document.getElementById("f-ability-mode");
  if (modeEl) modeEl.value = s.abilityMode;
}

export function renderAbilities() {
  const s   = getState();
  const pb  = proficiencyBonus(s.level);
  const cls = getClassData(s.class);
  const tbody = document.getElementById("ability-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  ABILITIES.forEach(ab => {
    const score   = s.abilities[ab];
    const mod     = modFromScore(score);
    const saveProf = cls.saveProficiencies.includes(ab);
    const saveMod  = mod + (saveProf ? pb : 0);
    const minV = s.abilityMode === "pointbuy" ? POINT_BUY_MIN_SCORE : ABILITY_SCORE_MIN;
    const maxV = s.abilityMode === "pointbuy" ? POINT_BUY_MAX_SCORE : ABILITY_SCORE_MAX;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ABILITY_LABELS[ab]}</td>
      <td><input type="number" min="${minV}" max="${maxV}" value="${score}" data-ab="${ab}"></td>
      <td class="mod-cell">${fmtMod(mod)}</td>
      <td class="save-cell ${saveProf ? "save-prof" : ""}">${fmtMod(saveMod)}${saveProf ? " ●" : ""}</td>
    `;
    tbody.appendChild(tr);
  });

  const pbInfo = document.getElementById("pb-info");
  if (s.abilityMode === "pointbuy") {
    const spent    = ABILITIES.reduce((sum, a) => sum + pointBuyCost(s.abilities[a]), 0);
    const rem      = POINT_BUY_MAX_POINTS - spent;
    const overBudget = spent > POINT_BUY_MAX_POINTS;
    pbInfo.textContent = overBudget
      ? `Over budget — Points: ${spent} / ${POINT_BUY_MAX_POINTS} (${Math.abs(rem)} over limit)`
      : `Points: ${spent} / ${POINT_BUY_MAX_POINTS}  (${rem} remaining)`;
    pbInfo.className = overBudget ? "pb-info over" : "pb-info";
  } else {
    pbInfo.className = "pb-info hidden";
  }
}

export function renderDerived() {
  const s    = getState();
  const pb   = proficiencyBonus(s.level);
  const mods = {};
  ABILITIES.forEach(a => (mods[a] = modFromScore(s.abilities[a])));
  const hp      = getEstimatedHP(s.level, s.class, mods.con);
  const ac      = getArmorClassEstimate(s, mods.dex);
  const castAb  = getCasterAbility(s);
  const spellDc = 8 + pb + mods[castAb];  // 8 = base spell DC per SRD
  const spellAtk = pb + mods[castAb];
  const pp       = BASE_AC + mods.wis;

  const grid = document.getElementById("derived-stats");
  if (!grid) return;
  grid.innerHTML = [["HP", hp], ["AC", ac], ["Prof", fmtMod(pb)], ["PP", pp]]
    .map(([lbl, val]) =>
      `<div class="derived-chip"><div class="dval">${val}</div><div class="dlbl">${lbl}</div></div>`
    ).join("");

  document.getElementById("status-pb").textContent   = `PB: ${fmtMod(pb)}`;
  document.getElementById("status-pp").textContent   = `PP: ${pp}`;
  document.getElementById("status-init").textContent = `Init: ${fmtMod(mods.dex)}`;

  const sa = document.getElementById("d-spell-atk");
  const sd = document.getElementById("d-spell-dc");
  if (sa) sa.textContent = fmtMod(spellAtk);
  if (sd) sd.textContent = spellDc;
}

export function renderSkills() {
  const s    = getState();
  const pb   = proficiencyBonus(s.level);
  const mods = {};
  ABILITIES.forEach(a => (mods[a] = modFromScore(s.abilities[a])));
  const tbody = document.getElementById("skills-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  SKILLS.forEach(sk => {
    const prof  = s.skills[sk.key]?.proficient || false;
    const exp   = s.skills[sk.key]?.expertise  || false;
    const bonus = mods[sk.ability] + (prof ? pb : 0) + (exp ? pb : 0);
    const tr    = document.createElement("tr");
    tr.innerHTML = `
      <td>${sk.label}</td>
      <td>${sk.ability.toUpperCase()}</td>
      <td>${fmtMod(bonus)}</td>
      <td><input type="checkbox" ${prof ? "checked" : ""} data-skill="${sk.key}" data-field="proficient"></td>
      <td><input type="checkbox" ${exp  ? "checked" : ""} data-skill="${sk.key}" data-field="expertise"></td>
    `;
    tbody.appendChild(tr);
  });
}

export function renderWeapons() {
  const s    = getState();
  const pb   = proficiencyBonus(s.level);
  const tbody = document.getElementById("weapons-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  s.weapons.forEach(w => {
    const atk = weaponAtkBonus(w, s.abilities, pb);
    const avg = weaponAvgDamage(w, s.abilities, pb);
    const tr  = document.createElement("tr");
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

const MAX_SPELL_LEVEL = 9;

export function renderSpellSlots() {
  const s = getState();
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
    td.innerHTML = `<input type="number" min="0" max="9" value="${s.spellcasting.slots[lvl] || 0}" data-slot="${lvl}">`;
    bodyRow.appendChild(td);
  }
  populateSelect("f-cast-ability", ABILITIES.map(a => [a, ABILITY_LABELS[a]]), getCasterAbility(s));
  document.getElementById("f-has-shield").checked    = s.hasShield;
  document.getElementById("f-armor-bonus").value     = s.armorMagicBonus;
}

export function renderNotes() {
  const s = getState();
  document.getElementById("f-features").value  = s.features;
  document.getElementById("f-traits").value    = s.traits;
  document.getElementById("f-notes").value     = s.notes;
  document.getElementById("f-equipment").value = (s.equipment || []).join(", ");
}

const ASSUMPTION_FIELDS = [
  { key: "targetAC",           label: "Target AC",        type: "number",   min: 10, max: 25 },
  { key: "targetSaveBonus",    label: "Target Save",      type: "number",   min: 0,  max: 12 },
  { key: "advantageRate",      label: "Adv Rate (0–1)",   type: "number",   min: 0,  max: 1, step: 0.05 },
  { key: "magicBonus",         label: "Magic Bonus",      type: "number",   min: 0,  max: MAX_MAGIC_BONUS },
  { key: "shortRests",         label: "Short Rests/Day",  type: "number",   min: 0,  max: 6 },
  { key: "roundsPerEncounter", label: "Rounds/Encounter", type: "number",   min: 1,  max: 10 },
  { key: "encountersPerDay",   label: "Enc/Day",          type: "number",   min: 1,  max: 8 },
  { key: "feats",              label: "Feats Allowed",    type: "checkbox" },
  { key: "multiclass",         label: "Multiclass",       type: "checkbox" },
];

export function renderOptimizer() {
  const s = getState();
  populateSelect("f-objective",   OPTIMIZER_OBJECTIVES.map(o => [o.key, o.label]), s.optimizer.objective);
  populateSelect("f-rule-preset", Object.entries(RULE_PRESETS).map(([k, v]) => [k, v.label]), s.optimizer.rulePreset);
  document.getElementById("f-analysis-level").value = s.optimizer.assumptions.analysisLevel;

  const grid = document.getElementById("assumptions-grid");
  if (!grid) return;
  grid.innerHTML = "";
  ASSUMPTION_FIELDS.forEach(f => {
    const label = document.createElement("label");
    if (f.type === "checkbox") {
      label.innerHTML = `<input type="checkbox" data-assumption="${f.key}" ${s.optimizer.assumptions[f.key] ? "checked" : ""}> ${f.label}`;
    } else {
      const step = f.step ? `step="${f.step}"` : "";
      label.innerHTML = `${f.label}<input type="number" min="${f.min}" max="${f.max}" ${step} value="${s.optimizer.assumptions[f.key]}" data-assumption="${f.key}">`;
    }
    grid.appendChild(label);
  });
}

export function renderMetrics() {
  const s = getState();
  try {
    const snapshot = {
      class: s.class,
      level: Number(s.level),
      abilities: s.abilities,
      featPlan: [],
    };
    const metrics = evaluateBuildSnapshot(snapshot, s.optimizer.assumptions, s.optimizer.objective);
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
  }
}

export function renderResults() {
  const s    = getState();
  const list = document.getElementById("results-list");
  const note = document.getElementById("results-note");
  if (!list) return;
  const results = s.optimizer.results || [];
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
    const s2 = r.summary;
    card.innerHTML = `
      <div class="result-header">
        <span class="result-name">#${idx + 1} ${r.classLabel}</span>
        <span class="result-score">Score: ${fmtFixed(r.score)}</span>
      </div>
      <div class="result-stats">
        <span>DPR: ${fmtFixed(s2.sustainedDpr)}</span>
        <span>Nova: ${fmtFixed(s2.novaDpr)}</span>
        <span>eHP: ${Math.round(s2.effectiveHp)}</span>
        <span>AC: ${s2.ac}</span>
        <span>SpDC: ${s2.spellDc}</span>
        <span>Init: ${fmtMod(s2.initiative)}</span>
        <span>Pri: ${s2.primaryStat?.toUpperCase()}</span>
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

// =========================================================
// Full render
// =========================================================

export function render() {
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
