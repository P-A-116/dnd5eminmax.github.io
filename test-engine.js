/* =========================================================
   Browser-based test suite for dnd-engine.js core math
   and damage-model.js mechanics.
   ESM module – no build tools required.

   Import this from tests.html as:
     <script type="module" src="./test-engine.js"></script>
   ========================================================= */

import {
  MIN_HIT_CHANCE,
  MAX_HIT_CHANCE,
  clamp,
  modFromScore,
  proficiencyBonus,
  pointBuyCost,
  effectiveHitChance,
  saveFailChance,
} from "./dnd-engine.js";

import {
  atLeastOneHitChance,
  sneakAttackAvg,
  warlockBeamCount,
  computeSustainedDpr,
  computeBurstDprRound1,
  alertInitiativeBonus,
} from "./damage-model.js";

import {
  ALERT_INITIATIVE_BONUS,
  GWM_HIT_PENALTY,
  GWM_DAMAGE_BONUS,
  DIVINE_SMITE_AVG_DICE,
} from "./optimizer-constants.js";

import {
  buildFromCharacter,
  cachedBuild,
} from "./effect-system.js";

import { computeDprFromState } from "./combat-engine.js";

import {
  evaluateSpell,
  computeControlPressure,
  SPELL_DATABASE,
} from "./spell-evaluator.js";

// =========================================================
// Assertion helpers
// =========================================================

const results = [];

function assertEqual(actual, expected, message) {
  const pass = actual === expected;
  results.push({
    pass,
    message,
    detail: pass ? null : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  });
}

function assertApproxEqual(actual, expected, message, tolerance = 1e-9) {
  const pass = Math.abs(actual - expected) <= tolerance;
  results.push({
    pass,
    message,
    detail: pass ? null : `expected ≈${expected} (±${tolerance}), got ${actual}`,
  });
}

function assertTrue(condition, message, detail = "") {
  results.push({
    pass: !!condition,
    message,
    detail: condition ? null : (detail || "condition was false"),
  });
}

// =========================================================
// proficiencyBonus – levels 1-20
// =========================================================

const PB_EXPECTATIONS = [
  [1, 2], [2, 2], [3, 2], [4, 2],
  [5, 3], [6, 3], [7, 3], [8, 3],
  [9, 4], [10, 4], [11, 4], [12, 4],
  [13, 5], [14, 5], [15, 5], [16, 5],
  [17, 6], [18, 6], [19, 6], [20, 6],
];

for (const [level, expected] of PB_EXPECTATIONS) {
  assertEqual(
    proficiencyBonus(level),
    expected,
    `proficiencyBonus(${level}) === ${expected}`,
  );
}

// =========================================================
// modFromScore – known values
// =========================================================

const MOD_EXPECTATIONS = [
  [1,  -5],
  [8,  -1],
  [10,  0],
  [12,  1],
  [20,  5],
  [30, 10],
];

for (const [score, expected] of MOD_EXPECTATIONS) {
  assertEqual(
    modFromScore(score),
    expected,
    `modFromScore(${score}) === ${expected}`,
  );
}

// =========================================================
// clamp
// =========================================================

assertEqual(clamp(5, 0, 10),   5,  "clamp(5, 0, 10) === 5 (in range)");
assertEqual(clamp(-5, 0, 10),  0,  "clamp(-5, 0, 10) === 0 (below min)");
assertEqual(clamp(15, 0, 10), 10,  "clamp(15, 0, 10) === 10 (above max)");
assertEqual(clamp(0, 0, 10),   0,  "clamp(0, 0, 10) === 0 (at min boundary)");
assertEqual(clamp(10, 0, 10), 10,  "clamp(10, 0, 10) === 10 (at max boundary)");
assertEqual(clamp(NaN, 0, 10), 0,  "clamp(NaN, 0, 10) === 0 (NaN → min)");

// =========================================================
// effectiveHitChance – clamping at extremes
// =========================================================

// Extreme favorable: huge bonus vs tiny AC → maximum hit chance
assertApproxEqual(
  effectiveHitChance(100, 1),
  MAX_HIT_CHANCE,
  `effectiveHitChance(100, 1) === MAX_HIT_CHANCE (${MAX_HIT_CHANCE})`,
);

// Extreme unfavorable: tiny bonus vs huge AC → still ≥ MIN_HIT_CHANCE
const ehcMin = effectiveHitChance(-100, 100);
assertTrue(
  ehcMin >= MIN_HIT_CHANCE,
  `effectiveHitChance(-100, 100) >= MIN_HIT_CHANCE (${MIN_HIT_CHANCE})`,
  `got ${ehcMin}`,
);

// Result is always within [MIN_HIT_CHANCE, MAX_HIT_CHANCE]
assertTrue(
  ehcMin <= MAX_HIT_CHANCE,
  `effectiveHitChance(-100, 100) <= MAX_HIT_CHANCE (${MAX_HIT_CHANCE})`,
  `got ${ehcMin}`,
);

// Full advantage on an easy hit is higher than the no-advantage result
const ehcNoAdv   = effectiveHitChance(100, 1, 0);
const ehcFullAdv = effectiveHitChance(100, 1, 1);
assertTrue(
  ehcFullAdv >= ehcNoAdv,
  `effectiveHitChance(100, 1) with full advantage >= without advantage`,
  `no-adv: ${ehcNoAdv}, full-adv: ${ehcFullAdv}`,
);
// Advantage result is still a valid probability (<= 1)
assertTrue(
  ehcFullAdv <= 1,
  `effectiveHitChance(100, 1, 1) <= 1`,
  `got ${ehcFullAdv}`,
);

// =========================================================
// saveFailChance – clamping at extremes
// =========================================================

// Extreme easy save (very low DC vs very high save bonus) → MIN_HIT_CHANCE
assertApproxEqual(
  saveFailChance(1, 100),
  MIN_HIT_CHANCE,
  `saveFailChance(1, 100) === MIN_HIT_CHANCE (${MIN_HIT_CHANCE})`,
);

// Extreme hard save (very high DC vs very low save bonus) → ≤ MAX_HIT_CHANCE
const sfcMax = saveFailChance(100, -100);
assertTrue(
  sfcMax <= MAX_HIT_CHANCE,
  `saveFailChance(100, -100) <= MAX_HIT_CHANCE (${MAX_HIT_CHANCE})`,
  `got ${sfcMax}`,
);
assertTrue(
  sfcMax >= MIN_HIT_CHANCE,
  `saveFailChance(100, -100) >= MIN_HIT_CHANCE (${MIN_HIT_CHANCE})`,
  `got ${sfcMax}`,
);

// =========================================================
// pointBuyCost – canonical values for scores 8–15
// =========================================================

const POINT_BUY_EXPECTATIONS = [
  [8,  0],
  [9,  1],
  [10, 2],
  [11, 3],
  [12, 4],
  [13, 5],
  [14, 7],
  [15, 9],
];

for (const [score, expected] of POINT_BUY_EXPECTATIONS) {
  assertEqual(
    pointBuyCost(score),
    expected,
    `pointBuyCost(${score}) === ${expected}`,
  );
}

// Boundary: below min returns 0, above max returns 9
assertEqual(pointBuyCost(7),  0, "pointBuyCost(7) === 0 (below min)");
assertEqual(pointBuyCost(16), 9, "pointBuyCost(16) === 9 (above max)");

// =========================================================
// atLeastOneHitChance – once-per-turn rider probability
// =========================================================

// With 0 hit chance, still returns 0
assertApproxEqual(
  atLeastOneHitChance(0, 3),
  0,
  "atLeastOneHitChance(0, 3) === 0",
);

// With 1 attack the result should equal the base hit chance
assertApproxEqual(
  atLeastOneHitChance(0.65, 1),
  0.65,
  "atLeastOneHitChance(0.65, 1) === 0.65 (single attack = base hit chance)",
  1e-9,
);

// With 2 attacks and 0.65 hit chance: P(at least 1) = 1 - (1-0.65)^2 = 1 - 0.1225 = 0.8775
assertApproxEqual(
  atLeastOneHitChance(0.65, 2),
  0.8775,
  "atLeastOneHitChance(0.65, 2) ≈ 0.8775",
  1e-9,
);

// At least one hit is always >= base hit chance when attacks > 1
const otpBase = 0.5;
const otpWith2 = atLeastOneHitChance(otpBase, 2);
assertTrue(
  otpWith2 > otpBase,
  `atLeastOneHitChance(${otpBase}, 2) > ${otpBase} (more attacks = higher chance)`,
  `got ${otpWith2}`,
);

// =========================================================
// Rogue Sneak Attack: once-per-turn does NOT multiply by attacks
// =========================================================

// A level-1 rogue has 1d6 (avg 3.5) Sneak Attack.
// With 1 attack, sneakAttackAvg(1) * hitChance should equal
// atLeastOneHitChance(hitChance, 1) * 3.5.
const rogueHit = 0.65;
assertEqual(sneakAttackAvg(1), 3.5, "sneakAttackAvg(1) === 3.5 (1d6)");
assertEqual(sneakAttackAvg(5), 10.5, "sneakAttackAvg(5) === 10.5 (3d6)");

// Sustained DPR for a level-1 Rogue (no feats):
// weapon part: hitChance * (avgDie + primaryMod + weaponMagic) * 1 attack
// sneak part: atLeastOneHitChance(hitChance, 1) * 3.5
// The sneak part should equal hitChance * 3.5 (with 1 attack)
const rogueParams = {
  classKey: "rogue",
  level: 1,
  attackBonus: 5,
  targetAC: 15,
  advantageRate: 0,
  primaryMod: 3,
  weaponMagicBonus: 0,
  attacks: 1,
  featPlan: [],
};
const rogueLevel1Dpr = computeSustainedDpr(rogueParams);
// Expected: hitChance * (4.5+3+0) + hitChance * 3.5 = 0.55 * 7.5 + 0.55 * 3.5 = 0.55 * 11
// attackBonus=5 vs AC=15: needed=10, hitChance=(20+1-10)/20 = 11/20 = 0.55
const expectedRogueDpr = 0.55 * (4.5 + 3) + 0.55 * 3.5;
assertApproxEqual(
  rogueLevel1Dpr,
  expectedRogueDpr,
  `Level-1 Rogue sustained DPR ≈ ${expectedRogueDpr.toFixed(3)} (weapon + once-per-turn sneak attack)`,
  0.001,
);

// With 2 attacks the sneak attack should NOT double (once per turn rule)
const rogueLevel11Params = { ...rogueParams, level: 11, attacks: 2 };
const rogueLevel11Dpr = computeSustainedDpr(rogueLevel11Params);
// sneakAttackAvg(11) = ceil(11/2)*3.5 = 6*3.5 = 21
// atLeastOneHitChance(0.55, 2) = 1 - (0.45)^2 = 1 - 0.2025 = 0.7975
const sneakRound11 = (1 - Math.pow(1 - 0.55, 2)) * 21;
const weaponRound11 = 0.55 * (4.5 + 3) * 2;
const expectedRogueL11 = weaponRound11 + sneakRound11;
assertApproxEqual(
  rogueLevel11Dpr,
  expectedRogueL11,
  `Level-11 Rogue DPR uses atLeastOneHit for sneak (≈ ${expectedRogueL11.toFixed(3)})`,
  0.001,
);

// =========================================================
// Magic Bonus Split – weapon vs armor vs spell focus
// =========================================================

// Weapon magic bonus should increase weapon attack DPR
const baseParams = {
  classKey: "fighter",
  level: 5,
  attackBonus: 5,        // before magic
  targetAC: 15,
  advantageRate: 0,
  primaryMod: 3,
  weaponMagicBonus: 0,
  attacks: 2,
  featPlan: [],
};
const dprNoMagic  = computeSustainedDpr(baseParams);
const dprWith2Mag = computeSustainedDpr({ ...baseParams, attackBonus: 7, weaponMagicBonus: 2 });
assertTrue(
  dprWith2Mag > dprNoMagic,
  `weaponMagicBonus:2 raises DPR above no-magic baseline (${dprNoMagic.toFixed(2)} → ${dprWith2Mag.toFixed(2)})`,
);

// =========================================================
// GWM / Sharpshooter – tradeoff changes DPR
// =========================================================

// Fighter with GWM: check that DPR with gwm differs from without
const fighterBase = {
  classKey: "fighter",
  level: 5,
  attackBonus: 6,
  targetAC: 15,
  advantageRate: 0,
  primaryMod: 3,
  weaponMagicBonus: 0,
  attacks: 2,
  featPlan: [],
};
const dprNoGWM  = computeSustainedDpr(fighterBase);
const dprWithGWM = computeSustainedDpr({ ...fighterBase, featPlan: ["gwm"] });

// With GWM penalty: penHitChance uses attackBonus-5=1 vs AC15 → needed=14 → (20+1-14)/20 = 7/20 = 0.35
// normalDpr: 0.55*(5.5+3)*2 = 0.55*17 = 9.35
// penaltyDpr: 0.35*(5.5+3+10)*2 = 0.35*37 = 12.95 → GWM wins here
assertTrue(
  Math.abs(dprWithGWM - dprNoGWM) > 0.01,
  `GWM feat changes DPR (no feat: ${dprNoGWM.toFixed(2)}, with GWM: ${dprWithGWM.toFixed(2)})`,
);
assertTrue(
  dprWithGWM > dprNoGWM,
  `GWM is beneficial in this scenario (high hit chance; +10 dmg outweighs -5 hit)`,
  `no GWM: ${dprNoGWM.toFixed(2)}, with GWM: ${dprWithGWM.toFixed(2)}`,
);

// Sharpshooter works for dex-style classes
const archerBase = {
  classKey: "ranger",
  level: 5,
  attackBonus: 6,
  targetAC: 15,
  advantageRate: 0,
  primaryMod: 3,
  weaponMagicBonus: 0,
  attacks: 2,
  featPlan: [],
};
const dprNoSS  = computeSustainedDpr(archerBase);
const dprWithSS = computeSustainedDpr({ ...archerBase, featPlan: ["sharpshooter"] });
assertTrue(
  Math.abs(dprWithSS - dprNoSS) > 0.01,
  `Sharpshooter feat changes DPR for ranger (no SS: ${dprNoSS.toFixed(2)}, with SS: ${dprWithSS.toFixed(2)})`,
);

// =========================================================
// Fighter Action Surge – burst DPR
// =========================================================

const fighterBurstParams = {
  classKey: "fighter",
  level: 5,
  hitChance: 0.55,
  primaryMod: 3,
  weaponMagicBonus: 0,
  attacks: 2,
  spellSlots: {},
  assumptions: { shortRests: 2, encountersPerDay: 4 },
};
const fighterBurst = computeBurstDprRound1(fighterBurstParams);
// usesPerDay = 1 + min(1,2) = 2; expected = min(1, 2/4) = 0.5
// burstExtra = 0.5 * 0.55 * (5.5+3) * 2 = 0.5 * 0.55 * 17 = 4.675
const expectedFighterBurst = 0.5 * 0.55 * (5.5 + 3) * 2;
assertApproxEqual(
  fighterBurst,
  expectedFighterBurst,
  `Fighter Action Surge burst extra DPR ≈ ${expectedFighterBurst.toFixed(3)}`,
  0.001,
);
assertTrue(
  fighterBurst > 0,
  "Fighter burst DPR (Round 1) is positive",
  `got ${fighterBurst}`,
);

// Burst DPR must be 0 for a non-burst class (e.g. wizard)
const wizardBurst = computeBurstDprRound1({
  classKey: "wizard",
  level: 5,
  hitChance: 0.55,
  primaryMod: 2,
  weaponMagicBonus: 0,
  attacks: 1,
  spellSlots: { 1: 4, 2: 3, 3: 2 },
  assumptions: { shortRests: 0, encountersPerDay: 4 },
});
assertEqual(wizardBurst, 0, "Wizard burst DPR extra is 0 (no explicit burst model)");

// =========================================================
// Alert feat – initiative bonus
// =========================================================

assertEqual(alertInitiativeBonus([]),             0,                    "alertInitiativeBonus([]) === 0");
assertEqual(alertInitiativeBonus(["gwm"]),         0,                    "alertInitiativeBonus(['gwm']) === 0 (wrong feat)");
assertEqual(alertInitiativeBonus(["alert"]),       ALERT_INITIATIVE_BONUS, `alertInitiativeBonus(['alert']) === ${ALERT_INITIATIVE_BONUS}`);
assertEqual(alertInitiativeBonus(["gwm","alert"]), ALERT_INITIATIVE_BONUS, "alertInitiativeBonus with multiple feats");

// =========================================================
// Integration tests: buildFromCharacter
// =========================================================

const testCharacter = {
  class: "fighter",
  level: 5,
  abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
};

const builtState = buildFromCharacter(testCharacter, [], {});
assertTrue(
  builtState !== null && typeof builtState === "object",
  "buildFromCharacter returns an object",
);
assertEqual(builtState.classKey, "fighter", "buildFromCharacter: classKey is 'fighter'");
assertEqual(builtState.level,    5,         "buildFromCharacter: level is 5");
assertTrue(
  builtState.attackBonus > 0,
  "buildFromCharacter: attackBonus > 0",
  `got ${builtState.attackBonus}`,
);
assertTrue(
  typeof builtState.effectiveHp === "number" && builtState.effectiveHp > 0,
  "buildFromCharacter: effectiveHp is a positive number",
  `got ${builtState.effectiveHp}`,
);

// GWM feat should modify attackBonus (–5) and damage bonus (+10)
const stateGwm = buildFromCharacter(testCharacter, ["gwm"], {});
assertTrue(
  stateGwm.attackBonus < builtState.attackBonus,
  `buildFromCharacter with GWM: attackBonus lower (${stateGwm.attackBonus} < ${builtState.attackBonus})`,
);

// =========================================================
// Integration tests: computeDprFromState
// =========================================================

const dprResult = computeDprFromState(builtState, {
  targetAC: 15,
  targetSaveBonus: 4,
  advantageRate: 0,
  roundsPerEncounter: 4,
});

assertTrue(
  typeof dprResult.sustainedDpr === "number" && dprResult.sustainedDpr > 0,
  `computeDprFromState: sustainedDpr > 0 (got ${dprResult.sustainedDpr?.toFixed(2)})`,
);
assertTrue(
  typeof dprResult.burstDprRound1 === "number" && dprResult.burstDprRound1 >= 0,
  `computeDprFromState: burstDprRound1 >= 0 (got ${dprResult.burstDprRound1?.toFixed(2)})`,
);

// =========================================================
// Integration tests: computeControlPressure
// =========================================================

const wizardSpellSlots = { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1, 6: 0, 7: 0, 8: 0, 9: 0 };
const spellCtx = {
  spellDC: 15, spellAttack: 7, castingMod: 3, casterLevel: 9,
  targetAC: 15, targetSaveBonus: 4, targetDPR: 12, partyDPR: 25,
  enemyCount: 2, roundsLeft: 4,
};

const cpBaseline = computeControlPressure(wizardSpellSlots, spellCtx);
assertTrue(
  typeof cpBaseline === "number" && cpBaseline > 0,
  `computeControlPressure (no known spells): score > 0 (got ${cpBaseline?.toFixed(3)})`,
);

// With known control spells the result should be non-negative
const cpWithSpells = computeControlPressure(
  wizardSpellSlots,
  spellCtx,
  ["hold_person", "hypnotic_pattern", "banishment"],
);
assertTrue(
  typeof cpWithSpells === "number" && cpWithSpells >= 0,
  `computeControlPressure (with known spells): score >= 0 (got ${cpWithSpells?.toFixed(3)})`,
);

// =========================================================
// Integration tests: evaluateSpell
// =========================================================

// Damage spell: fireball
const fireballResult = evaluateSpell("fireball", spellCtx);
assertTrue(
  typeof fireballResult.value === "number" && fireballResult.value > 0,
  `evaluateSpell fireball: value > 0 (got ${fireballResult.value?.toFixed(2)})`,
);
assertEqual(
  fireballResult.breakdown.category,
  "damage",
  "evaluateSpell fireball: breakdown.category === 'damage'",
);

// Control spell: hold_person
const holdPersonResult = evaluateSpell("hold_person", spellCtx);
assertTrue(
  typeof holdPersonResult.value === "number" && holdPersonResult.value > 0,
  `evaluateSpell hold_person: value > 0 (got ${holdPersonResult.value?.toFixed(2)})`,
);
assertEqual(
  holdPersonResult.breakdown.category,
  "control",
  "evaluateSpell hold_person: breakdown.category === 'control'",
);

// Unknown spell key returns 0
const unknownResult = evaluateSpell("not_a_real_spell", spellCtx);
assertEqual(unknownResult.value, 0, "evaluateSpell unknown key: value === 0");

// Ice Storm: damage should be > 0 and reflect both 2d8 and 4d6 components
const iceStormResult = evaluateSpell("ice_storm", spellCtx);
assertTrue(
  iceStormResult.value > 0,
  `evaluateSpell ice_storm: value > 0 (got ${iceStormResult.value?.toFixed(2)})`,
);
// The avg damage should be 9 (2d8) + 14 (4d6) = 23 before save/target multipliers
assertTrue(
  iceStormResult.breakdown.avgDice >= 23,
  `evaluateSpell ice_storm: avgDice >= 23 (got ${iceStormResult.breakdown.avgDice})`,
);

// =========================================================
// Integration tests: cachedBuild (same reference for same inputs)
// =========================================================

const cachedA = cachedBuild(testCharacter, []);
const cachedB = cachedBuild(testCharacter, []);
assertTrue(
  cachedA === cachedB,
  "cachedBuild: identical inputs return the same object reference",
);

const cachedDiff = cachedBuild({ ...testCharacter, level: 6 }, []);
assertTrue(
  cachedDiff !== cachedA,
  "cachedBuild: different level produces a different object",
);

// =========================================================
// Publish results to the page
// =========================================================

const passed  = results.filter(r => r.pass).length;
const failed  = results.filter(r => !r.pass).length;
const total   = results.length;

document.getElementById("summary").textContent =
  `${passed} passed / ${failed} failed / ${total} total`;
document.getElementById("summary").className =
  failed === 0 ? "summary pass" : "summary fail";

const list = document.getElementById("results");
for (const r of results) {
  const li = document.createElement("li");
  li.className = r.pass ? "pass" : "fail";
  li.textContent = (r.pass ? "✓ " : "✗ ") + r.message;
  if (!r.pass && r.detail) {
    const span = document.createElement("span");
    span.className = "detail";
    span.textContent = " — " + r.detail;
    li.appendChild(span);
  }
  list.appendChild(li);
}
