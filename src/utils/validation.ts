// @ts-nocheck
/* =========================================================
   D&D 5e Validation + Normalization Module
   Provides:
     - normalizeState(raw)  → canonical, safe character state
     - validateState(state) → { ok: boolean, issues: Array<{path,message,severity}> }

   Usable as ESM:
     import { normalizeState, validateState } from './validation.js';
   ========================================================= */

import {
  ABILITIES, CLASSES,
  POINT_BUY_MIN_SCORE, POINT_BUY_MAX_SCORE,
  ABILITY_SCORE_MIN, ABILITY_SCORE_MAX,
  MAX_LEVEL, MIN_LEVEL, MAX_MAGIC_BONUS,
  clamp, validateLevel, validateMagicBonus, validateClassKey, validateAbilityKey,
} from "../engine/dnd-engine";

import { DEFAULT_ASSUMPTIONS } from "./optimizer-constants";


