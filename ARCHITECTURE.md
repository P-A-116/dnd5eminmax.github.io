# D&D 5e Rules Engine – Architecture Guide

## Overview

This codebase has been extended with three new modules that implement a
full algorithmic rules engine, combat simulator, and spell evaluation framework.

```
effect-system.js    ← State layer + data-driven effect system + build pipeline
combat-engine.js    ← Turn-based combat simulator (deterministic + Monte Carlo)
spell-evaluator.js  ← Unified spell evaluation framework (SpellValue = EDE)
```

These sit on top of the existing modules:

```
dnd-engine.js          ← Core math (modFromScore, proficiencyBonus, hitChance …)
damage-model.js        ← Class-aware DPR (sustainedDpr, burstDprRound1)
optimizer-constants.js ← All numeric tuning knobs
optimizer-runner.js    ← Async, chunked optimizer loop
validation.js          ← State normalisation + validation
app.js                 ← UI + evaluateBuildSnapshot
```

---

## Module 1 – effect-system.js

### State Layer

All character data is held in a `CharacterState` object produced by `createState()`.
The state is intentionally **shallow** – sub-objects are one level deep so a
spread clone is cheap and correct:

```js
import { createState, cloneState, buildFromCharacter } from "./effect-system.js";

// From a normalised character (validation.normalizeState output):
const state = buildFromCharacter(character, ["gwm", "alert"]);

// Cheap clone for search / simulation:
const copy = cloneState(state);
```

### Effect System

Every rule is expressed as an `Effect` object:

```js
const myEffect = {
  id:         "bless_hit",
  target:     "attack_bonus",   // stat to modify
  operation:  "add",            // add | multiply | override | add_tag | grant_action …
  value:      "half_proficiency_bonus",  // number OR symbolic resolver key
  trigger:    "passive",        // passive | on_hit | on_cast | on_turn_start
  condition:  { level_gte: 1 }, // structured condition (AND/OR/NOT/stat/tag)
  stackGroup: "bless",          // only highest in group applies
  source:     "Bless spell",
};
```

Supported `condition` shapes:
- `{ and: [...] }` / `{ or: [...] }` / `{ not: cond }`
- `{ has_tag: "tag_name" }`
- `{ class_is: "rogue" }`
- `{ level_gte: 5 }`
- `{ weapon_style: "str" | "dex" }`
- `{ stat_gte: { stat: "ac", value: 18 } }`

Supported `value` resolver keys:
`"DEX_mod"`, `"STR_mod"`, … `"CHA_mod"`, `"proficiency_bonus"`,
`"half_proficiency_bonus"`, `"level"`

### Build Pipeline

```js
import { applyEffectPipeline, featsToEffects, CLASS_FEATURE_EFFECTS } from "./effect-system.js";

const featEffects  = featsToEffects(["gwm", "alert"]);
const classEffects = CLASS_FEATURE_EFFECTS["fighter"] || [];
const finalState   = applyEffectPipeline(baseState, [...classEffects, ...featEffects]);
```

Pipeline steps:
1. Clone base state (no mutation)
2. Deduplicate stacking groups (best value wins per group)
3. Apply all passive effects
4. Recompute derived stats (mods → AC → EHP → initiative …)

### Explainability

```js
import { explainStat } from "./effect-system.js";
const lines = explainStat(finalState, "attackBonus");
// ["attackBonus = 9", "  ← Great Weapon Master: add(-5)", "  ← Alert: add(5)"]
```

---

## Module 2 – combat-engine.js

### Deterministic (Expected-Value) Mode

```js
import { simulateCombat } from "./combat-engine.js";

const result = simulateCombat({
  state,
  encounter: {
    targetAC:        15,
    targetSaveBonus: 4,
    targetDPR:       10,   // enemy DPR (for control spell value)
    enemyCount:      1,
  },
  rounds: 4,
  mode:   "deterministic",   // default
});

console.log(result.averageDpr);     // sustained DPR across rounds
console.log(result.burstRound1);    // extra burst in round 1
console.log(result.log);            // ["Round 1: Attack → 12.50 dmg", …]
```

### Monte Carlo Mode

```js
const mcResult = simulateCombat({
  state,
  encounter: { targetAC: 15, targetSaveBonus: 4, targetDPR: 10, enemyCount: 1 },
  rounds:     4,
  mode:       "montecarlo",
  iterations: 1000,          // more = slower but more accurate
});
```

### Action Selection

The engine evaluates **every available action** via `_evaluateActionEV()` and
picks the highest-EV option for each slot (action / bonus action / reaction).
No decisions are hardcoded – each action type goes through the EV formula.

Actions are built dynamically from the CharacterState:
- Weapon attacks (scale with effectiveAttacks)
- Eldritch Blast (scales with beam count)
- Action Surge (consumed resource, round 1 only)
- Flurry of Blows (Ki resource)
- PAM Bonus Attack (granted by feat effect)
- Divine Smite (slot resource)
- Best available spell slot (via spell evaluator)

### Optimizer Integration

```js
import { computeDprFromState } from "./combat-engine.js";

// Drop-in replacement for the inline DPR calculation in evaluateBuildSnapshot:
const { sustainedDpr, burstDprRound1 } = computeDprFromState(state, assumptions);
```

---

## Module 3 – spell-evaluator.js

### Core Formula

```
SpellValue (EDE) = ExpectedDamageEquivalent
```

Every spell reduces to a single number comparable to weapon damage:

| Category | Formula |
|----------|---------|
| Damage   | `P(hit/fail) × avgDamage × targets` |
| Control  | `P(success) × expectedDuration × targetDPR × targets + critBonus` |
| Buff     | `addedAllyDPR × duration + preventedDamage × duration` |
| Heal     | `healedHP × 0.6` (weighted below prevention) |
| Utility  | `slotLevel × 1.5` (small baseline) |

### Evaluating a single spell

```js
import { evaluateSpell } from "./spell-evaluator.js";

const { value, breakdown } = evaluateSpell("fireball", {
  spellDC:         16,
  spellAttack:     8,
  castingMod:      4,
  targetAC:        15,
  targetSaveBonus: 4,
  targetDPR:       10,
  partyDPR:        30,
  enemyCount:      4,
  roundsLeft:      4,
  slotLevel:       3,  // upcast slot
});
```

### Optimal loadout

```js
import { optimizeSpellLoadout, evaluateSpellContribution } from "./spell-evaluator.js";

const loadout = optimizeSpellLoadout(
  { 1: 4, 2: 3, 3: 2 },         // available spell slots
  ["fireball", "hold_person", "magic_missile"],
  context
);
// [{ spell: "fireball", slotLevel: 3, value: 42.1 }, …]
```

### Control pressure (optimizer metric)

```js
import { computeControlPressure } from "./spell-evaluator.js";

// Compatible with existing optimizer; upgrades the metric when knownSpells given:
const pressure = computeControlPressure(spellSlots, context, ["hold_person", "hypnotic_pattern"]);
```

### Combat engine integration

```js
import { bestSpellAction } from "./spell-evaluator.js";

// Inside the combat engine's action selector:
const { spell, value } = bestSpellAction(state, knownSpells, context);
```

---

## Integration with the Existing Optimizer

### Drop-in for `evaluateBuildSnapshot` in `app.js`

Replace the inline DPR and control-pressure calculations:

```js
// Before (existing app.js):
const sustainedDpr = computeSustainedDpr({ ... });
const burstDprRound1 = computeBurstDprRound1({ ... });

// After (using new engine):
import { buildFromCharacter }  from "./effect-system.js";
import { computeDprFromState } from "./combat-engine.js";
import { computeControlPressure } from "./spell-evaluator.js";

const state = buildFromCharacter(character, featPlan, { weaponMagicBonus, armorMagicBonus });
const { sustainedDpr, burstDprRound1 } = computeDprFromState(state, assumptions);
const controlPressure = computeControlPressure(spellSlots, spellCtx, knownSpells);
```

The existing `damage-model.js` functions remain fully valid and are
imported by the new modules where appropriate. No breaking changes.

---

## Adding New Rules

### New feat

```js
import { FEAT_EFFECTS } from "./effect-system.js";

FEAT_EFFECTS.crossbow_expert = [
  {
    id: "cbe_no_disadvantage", target: "ranged_melee_penalty",
    operation: "override", value: 0,
    trigger: "passive", condition: { weapon_style: "dex" },
    source: "Crossbow Expert",
  },
  {
    id: "cbe_bonus_attack", target: "actions",
    operation: "grant_action",
    value: { type: "bonus_action_attack", label: "Crossbow Expert BA" },
    trigger: "passive", condition: { weapon_style: "dex" },
    source: "Crossbow Expert",
  },
];
```

### New spell

```js
import { SPELL_DATABASE } from "./spell-evaluator.js";

SPELL_DATABASE.arms_of_hadar = {
  key: "arms_of_hadar", name: "Arms of Hadar", level: 1, school: "conjuration",
  category: "damage", saveType: "str", halfOnSave: false,
  diceExpr: "2d6", targets: 3, upcastDicePerLevel: 1,
  controlType: "reaction_disabled",
};
```

### New class feature

```js
import { CLASS_FEATURE_EFFECTS } from "./effect-system.js";

CLASS_FEATURE_EFFECTS.paladin.push({
  id: "paladin_divine_health", target: "disease_immunity",
  operation: "add_tag", value: "immune_disease",
  trigger: "passive", condition: { level_gte: 3 },
  source: "Divine Health",
});
```

---

## Future Extensions

### MCTS / Search hooks

The `cloneState()` function produces cheap copies suitable for tree search.
A minimal hook point:

```js
// In a search node:
const childState = cloneState(parentState);
applyEffect(someDecision, childState);
const { sustainedDpr } = computeDprFromState(childState, assumptions);
// Use sustainedDpr as the node's heuristic value
```

### Caching / memoization

The build pipeline is deterministic given the same inputs.
Add a lightweight cache keyed on `(classKey, level, featPlan.join(","), magicBonuses)`:

```js
const cache = new Map();
function cachedBuild(character, featPlan) {
  const key = `${character.class}:${character.level}:${featPlan.join(",")}`;
  if (!cache.has(key)) cache.set(key, buildFromCharacter(character, featPlan));
  return cache.get(key);
}
```

### Monte Carlo calibration

Run the Monte Carlo simulator against the deterministic model on a known
build and compare `averageDpr` values – they should converge within ~2% at
500+ iterations. Use this as a regression test baseline.
