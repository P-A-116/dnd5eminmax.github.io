// @ts-nocheck
export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface AbilityScores {
  str: number; dex: number; con: number;
  int: number; wis: number; cha: number;
}

export interface SkillState { proficient: boolean; expertise: boolean; }
export interface Weapon {
  id: string; name: string; ability: AbilityKey;
  proficient: boolean; magicBonus: number; damage: string;
}
export type SpellSlots = Record<number, number>;
export interface SpellcastingState {
  castingAbility: AbilityKey; slots: SpellSlots;
  knownSpells: string; preparedSpells: string;
}
export interface CharacterIdentity {
  name: string; player: string; subclass: string;
  race: string; background: string; alignment: string;
}
export interface OptimizerAssumptions {
  feats: boolean; multiclass: boolean;
  weaponMagicBonus: number; armorMagicBonus: number; spellFocusBonus: number;
  shortRests: number; roundsPerEncounter: number; encountersPerDay: number;
  targetAC: number; targetSaveBonus: number; advantageRate: number; analysisLevel: number;
}
export interface BuildMetrics {
  score: number; sustainedDpr: number; burstDprRound1: number;
  effectiveHp: number; ac: number; hp: number; spellDc: number;
  spellAttack: number; controlPressure: number; skillScore: number;
  concentrationScore: number; initiative: number; hitChance: number; primary: string;
}
export interface BuildSummary {
  primaryStat: string; sustainedDpr: number; burstDprRound1: number;
  effectiveHp: number; spellDc: number; initiative: number; ac: number;
}
export interface MulticlassData {
  primary?: string; secondary: string; primaryLevel?: number; secondaryLevel: number;
}
export interface BuildSnapshot {
  class: string; level: number; abilities: AbilityScores;
  featPlan?: string[];
  spellcasting?: { slots: SpellSlots; castingAbility: string };
  multiclassData?: MulticlassData;
  _primaryLevel?: number; hasShield?: boolean; armorMagicBonus?: number;
}
export interface MilestonePlan { level: number; snapshot: BuildSnapshot; metrics: BuildMetrics; }
export interface BuildResult {
  classKey: string; classLabel: string; score: number;
  plan: MilestonePlan[]; strengths: string[]; tradeoffs: string[];
  isMulticlass?: boolean; multiclassData?: MulticlassData; summary: BuildSummary;
}
export interface OptimizerState {
  objective: string; rulePreset: string;
  assumptions: OptimizerAssumptions; results: BuildResult[];
}
export interface CharacterState {
  identity: CharacterIdentity; class: string; level: number;
  abilityMode: "standard" | "pointbuy" | "manual";
  abilities: AbilityScores; skills: Record<string, SkillState>;
  weapons: Weapon[]; spellcasting: SpellcastingState;
  features: string; traits: string; notes: string; equipment: string[];
  hasShield: boolean; armorMagicBonus: number; optimizer: OptimizerState;
}
export interface ValidationIssue { path: string; message: string; severity: "error" | "warning"; }
