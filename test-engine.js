/* =========================================================
   Browser-based test suite for dnd-engine.js core math.
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
