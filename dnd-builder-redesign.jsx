/**
 * D&D 5e Min/Max Builder — Complete UI/UX Redesign
 * Architecture: React (single-file, all state co-located at root)
 * Design system: custom tokens, Tailwind utility-first
 *
 * This file is the DESIGN SYSTEM + CORE SHELL.
 * It renders the full layout with live interactions.
 * Wire up the existing JS engine modules via props/context.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
// All values here feed into CSS-in-JS inline styles.
// In production, extract to a CSS custom properties file.
const T = {
  // Surface
  bg0: "#0a0d14",       // page
  bg1: "#111520",       // panels
  bg2: "#171c2d",       // raised
  bg3: "#1d2338",       // hover / input
  bg4: "#242a42",       // active / selected

  // Border
  bd0: "#1f2640",       // subtle
  bd1: "#2c3555",       // default
  bd2: "#3d4a70",       // hover
  bd3: "#5568a0",       // focus

  // Text
  tx0: "#e8eaf2",       // primary
  tx1: "#8892b0",       // secondary
  tx2: "#546180",       // tertiary

  // Accent (electric indigo-blue)
  ac0: "#4f6ef7",       // main
  ac1: "#7b93ff",       // light
  ac2: "#1e2e7a",       // dim bg

  // Semantic
  ok0: "#22c984",       // success text
  ok1: "#0d4f36",       // success bg
  ok2: "#083325",       // success dim

  wa0: "#f0a429",       // warning text
  wa1: "#5c3a0a",       // warning bg

  er0: "#f05656",       // danger text
  er1: "#4d1414",       // danger bg

  // Special
  nova:   "#c084fc",    // burst/nova metric
  tank:   "#38bdf8",    // ehp metric
  ctrl:   "#fb923c",    // control metric
  skill:  "#a3e635",    // skill metric

  // Spacing (8px grid)
  s1: "4px", s2: "8px", s3: "12px", s4: "16px", s5: "20px",
  s6: "24px", s8: "32px", s10: "40px",

  // Radius
  r1: "4px", r2: "6px", r3: "8px", r4: "12px", r5: "16px",

  // Font
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  sans: "'Inter', 'Segoe UI', system-ui, sans-serif",
  display: "'Syne', 'DM Sans', 'Inter', sans-serif",
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const mod = (score) => Math.floor((score - 10) / 2);
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const pb = (level) => Math.ceil(level / 4) + 1;
const fmt1 = (n) => Number.isFinite(n) ? n.toFixed(1) : "—";

// ─── Mock data (replace with your engine imports) ─────────────────────────────
const CLASSES = ["Barbarian","Bard","Cleric","Druid","Fighter","Monk",
                 "Paladin","Ranger","Rogue","Sorcerer","Warlock","Wizard"];
const ABILITIES = ["STR","DEX","CON","INT","WIS","CHA"];
const ABILITY_KEYS = ["str","dex","con","int","wis","cha"];
const CLASS_TAGS = {
  barbarian: ["frontliner","durable"],   bard:    ["support","utility"],
  cleric:    ["support","healer"],       druid:   ["control","utility"],
  fighter:   ["nova","frontliner"],      monk:    ["mobile","skirmisher"],
  paladin:   ["nova","tank"],            ranger:  ["sustained","ranged"],
  rogue:     ["burst","stealth"],        sorcerer:["blaster","control"],
  warlock:   ["sustained","pact"],       wizard:  ["control","arcane"],
};
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const METRICS_COLOR = {
  sustainedDpr: T.ok0, burstDprRound1: T.nova,
  effectiveHp: T.tank, controlPressure: T.ctrl,
  skillScore: T.skill, initiative: T.ac0,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Thin horizontal rule used as section separator */
const Sep = () => (
  <div style={{ height: 1, background: T.bd0, margin: `${T.s3} 0` }} />
);

/** Inline badge pill */
const Badge = ({ label, color = T.ac0, bg }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
    textTransform: "uppercase", padding: "2px 6px",
    borderRadius: T.r1, color,
    background: bg || color + "22",
    border: `1px solid ${color}44`,
  }}>{label}</span>
);

/** Single-stat chip used in metric grid and derived bar */
const StatChip = ({ label, value, color = T.tx0, sub }) => (
  <div style={{
    background: T.bg3, border: `1px solid ${T.bd0}`,
    borderRadius: T.r3, padding: `${T.s2} ${T.s3}`,
    display: "flex", flexDirection: "column", alignItems: "center",
    minWidth: 64, flex: "1 1 64px",
  }}>
    <span style={{ fontSize: 18, fontWeight: 700, color, fontFamily: T.mono, lineHeight: 1.2 }}>
      {value}
    </span>
    <span style={{ fontSize: 10, color: T.tx2, textTransform: "uppercase",
                   letterSpacing: "0.07em", marginTop: 2 }}>{label}</span>
    {sub && <span style={{ fontSize: 10, color, marginTop: 1 }}>{sub}</span>}
  </div>
);

/** Compact panel shell */
const Panel = ({ title, right, children, accent }) => (
  <div style={{
    background: T.bg1, border: `1px solid ${T.bd1}`,
    borderRadius: T.r4, overflow: "hidden",
    borderTop: accent ? `2px solid ${accent}` : undefined,
  }}>
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: `${T.s3} ${T.s4}`,
      borderBottom: `1px solid ${T.bd0}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                     textTransform: "uppercase", color: T.tx1 }}>{title}</span>
      {right && <div style={{ display: "flex", gap: T.s2, alignItems: "center" }}>{right}</div>}
    </div>
    <div style={{ padding: T.s4 }}>{children}</div>
  </div>
);

/** Ghost / filled button */
const Btn = ({ children, onClick, primary, danger, disabled, small, icon }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: small ? "4px 10px" : "7px 14px",
      fontSize: small ? 11 : 12, fontWeight: 600,
      borderRadius: T.r2, cursor: disabled ? "not-allowed" : "pointer",
      border: `1px solid ${primary ? T.ac0 : danger ? T.er0 : T.bd1}`,
      background: primary ? T.ac0 : danger ? T.er1 : "transparent",
      color: primary ? "#fff" : danger ? T.er0 : T.tx0,
      opacity: disabled ? 0.4 : 1,
      transition: "all 0.12s",
      fontFamily: T.sans,
      whiteSpace: "nowrap",
    }}
  >
    {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
    {children}
  </button>
);

/** Styled input / select */
const Field = ({ label, type = "text", value, onChange, min, max, options, style }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    {label && <span style={{ fontSize: 10, color: T.tx2, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>}
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background: T.bg3, border: `1px solid ${T.bd1}`, borderRadius: T.r2,
                 color: T.tx0, padding: "5px 8px", fontSize: 12, fontFamily: T.sans,
                 outline: "none", ...style }}>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    ) : (
      <input type={type} value={value} min={min} max={max}
        onChange={e => onChange(e.target.value)}
        style={{ background: T.bg3, border: `1px solid ${T.bd1}`, borderRadius: T.r2,
                 color: T.tx0, padding: "5px 8px", fontSize: 12, fontFamily: T.sans,
                 outline: "none", ...style }} />
    )}
  </label>
);

// ─── Command Palette ──────────────────────────────────────────────────────────
const CMD_ITEMS = [
  { id: "optimize",    label: "Run optimizer",        key: "⌘⏎", icon: "⚡" },
  { id: "apply",       label: "Apply top build",      key: "⌘⇧A", icon: "✔" },
  { id: "reset",       label: "Reset character",      key: "⌘⇧R", icon: "↺" },
  { id: "export",      label: "Export JSON",          key: "⌘E",  icon: "⬇" },
  { id: "std-array",   label: "Apply standard array", key: "⌘⇧S", icon: "🎲" },
  { id: "auto-pb",     label: "Auto point buy",       key: "⌘P",  icon: "📊" },
  { id: "tab-builder", label: "Go to Builder",        key: "⌘1",  icon: "⚔" },
  { id: "tab-combat",  label: "Go to Combat Sim",     key: "⌘2",  icon: "🛡" },
  { id: "tab-spells",  label: "Go to Spells",         key: "⌘3",  icon: "✨" },
  { id: "tab-compare", label: "Go to Compare",        key: "⌘4",  icon: "⚖" },
];

const CommandPalette = ({ open, onClose, onAction }) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef();

  useEffect(() => {
    if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const filtered = CMD_ITEMS.filter(i =>
    i.label.toLowerCase().includes(query.toLowerCase())
  );

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: 120, zIndex: 9999,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, background: T.bg2, border: `1px solid ${T.bd2}`,
        borderRadius: T.r4, overflow: "hidden", boxShadow: `0 24px 64px rgba(0,0,0,0.6)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: T.s4,
                      borderBottom: `1px solid ${T.bd1}`, gap: T.s3 }}>
          <span style={{ color: T.tx2, fontSize: 16 }}>⌘</span>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Type a command…"
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered[0]) {
                onAction(filtered[0].id); onClose();
              }
            }}
            style={{ flex: 1, background: "none", border: "none", outline: "none",
                     color: T.tx0, fontSize: 15, fontFamily: T.sans }} />
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {filtered.map((item, i) => (
            <div key={item.id}
              onClick={() => { onAction(item.id); onClose(); }}
              style={{
                display: "flex", alignItems: "center", gap: T.s3,
                padding: `${T.s3} ${T.s4}`, cursor: "pointer",
                background: i === 0 ? T.bg4 : "transparent",
                borderBottom: `1px solid ${T.bd0}`,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.bg3}
              onMouseLeave={e => e.currentTarget.style.background = i === 0 ? T.bg4 : "transparent"}
            >
              <span style={{ fontSize: 14, width: 20 }}>{item.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: T.tx0 }}>{item.label}</span>
              <span style={{ fontSize: 11, color: T.tx2, fontFamily: T.mono }}>{item.key}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: T.s4, color: T.tx2, fontSize: 13, textAlign: "center" }}>
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Level Timeline / Stepper ─────────────────────────────────────────────────
const LEVEL_MILESTONES = {
  1:  "Base class",
  2:  "Subclass feature",
  3:  "Subclass choice",
  4:  "ASI",
  5:  "Extra Attack",
  6:  "Subclass feature",
  7:  "Feature",
  8:  "ASI",
  9:  "Feature",
  10: "Capstone feature",
  11: "Greater power",
  12: "ASI",
  14: "Capstone II",
  17: "Top-tier feature",
  19: "ASI",
  20: "Class capstone",
};

const LevelTimeline = ({ level, onChange }) => {
  const steps = Array.from({ length: 20 }, (_, i) => i + 1);
  return (
    <div style={{ padding: `${T.s2} 0` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto",
                    paddingBottom: T.s2 }}>
        {steps.map(lv => {
          const isCurrent = lv === level;
          const isPast    = lv < level;
          const milestone = LEVEL_MILESTONES[lv];
          return (
            <div key={lv} style={{ display: "flex", flexDirection: "column",
                                   alignItems: "center", flex: "0 0 auto" }}>
              {/* connector */}
              {lv > 1 && (
                <div style={{
                  position: "absolute", width: "calc(100% / 20)",
                  height: 2, background: isPast || isCurrent ? T.ac0 : T.bd0,
                }} />
              )}
              <button
                onClick={() => onChange(lv)}
                title={milestone || `Level ${lv}`}
                style={{
                  width: isCurrent ? 32 : milestone ? 22 : 16,
                  height: isCurrent ? 32 : milestone ? 22 : 16,
                  borderRadius: "50%",
                  border: `2px solid ${isCurrent ? T.ac0 : isPast ? T.ac2 : T.bd1}`,
                  background: isCurrent ? T.ac0 : isPast ? T.ac2 + "66" : T.bg3,
                  color: isCurrent ? "#fff" : T.tx1,
                  fontSize: isCurrent ? 12 : 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                  zIndex: 1, position: "relative",
                  fontFamily: T.mono,
                }}
              >
                {lv}
              </button>
              {milestone && (
                <div style={{
                  fontSize: 8, color: isCurrent ? T.ac1 : T.tx2,
                  textAlign: "center", marginTop: 2, width: 40,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {milestone}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between",
                    marginTop: T.s2, paddingTop: T.s2, borderTop: `1px solid ${T.bd0}` }}>
        <span style={{ fontSize: 11, color: T.tx2 }}>Level {level}</span>
        <span style={{ fontSize: 11, color: T.ac1 }}>
          Prof Bonus: {sign(pb(level))}
        </span>
      </div>
    </div>
  );
};

// ─── Ability Score Block ──────────────────────────────────────────────────────
const AbilityBlock = ({ abilities, onChange, mode, profSaves = [] }) => {
  const spendMap = { 8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9 };
  const totalSpent = ABILITY_KEYS.reduce((s, k) => s + (spendMap[abilities[k]] ?? 0), 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: T.s2 }}>
      {ABILITY_KEYS.map((key, i) => {
        const score = abilities[key] ?? 10;
        const m     = mod(score);
        const hasSave = profSaves.includes(key);
        return (
          <div key={key} style={{
            background: T.bg3, border: `1px solid ${T.bd1}`,
            borderRadius: T.r3, padding: T.s3,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          }}>
            <span style={{ fontSize: 9, letterSpacing: "0.1em", color: T.tx2,
                           textTransform: "uppercase", fontWeight: 700 }}>
              {ABILITIES[i]}
            </span>
            <input
              type="number" min={3} max={30} value={score}
              onChange={e => onChange(key, Number(e.target.value))}
              style={{
                width: 52, height: 36, textAlign: "center",
                fontSize: 18, fontWeight: 700, fontFamily: T.mono,
                background: "transparent", border: `1px solid ${T.bd1}`,
                borderRadius: T.r2, color: T.tx0, outline: "none",
              }}
            />
            <span style={{
              fontSize: 16, fontWeight: 700, color: T.ac1, fontFamily: T.mono,
              lineHeight: 1,
            }}>
              {sign(m)}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <span style={{ fontSize: 9, color: hasSave ? T.ok0 : T.tx2 }}>
                {hasSave ? "●" : "○"} SAVE {sign(hasSave ? m + 2 : m)}
              </span>
            </div>
          </div>
        );
      })}
      {mode === "pointbuy" && (
        <div style={{
          gridColumn: "1 / -1", textAlign: "center",
          fontSize: 11, color: totalSpent > 27 ? T.er0 : T.tx2,
          padding: `${T.s2} 0`,
        }}>
          Point Buy: {totalSpent} / 27 used
        </div>
      )}
    </div>
  );
};

// ─── DPR Bar ──────────────────────────────────────────────────────────────────
const DprBar = ({ sustained, burst, maxDpr = 50 }) => {
  const susW = Math.min(100, (sustained / maxDpr) * 100);
  const burstExtra = Math.min(100, ((burst - sustained) / maxDpr) * 100);
  return (
    <div style={{ margin: `${T.s2} 0` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: T.tx2 }}>DPR</span>
        <span style={{ fontSize: 10, color: T.tx1 }}>
          <span style={{ color: T.ok0 }}>{fmt1(sustained)}</span>
          {" "}<span style={{ color: T.tx2 }}>sustain</span>
          {"  "}
          <span style={{ color: T.nova }}>{fmt1(burst)}</span>
          {" "}<span style={{ color: T.tx2 }}>burst R1</span>
        </span>
      </div>
      <div style={{ height: 6, background: T.bg3, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ position: "relative", height: "100%" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%",
                        width: `${susW}%`, background: T.ok0, borderRadius: 99,
                        transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)" }} />
          <div style={{ position: "absolute", left: `${susW}%`, top: 0, height: "100%",
                        width: `${Math.max(0, burstExtra)}%`,
                        background: `linear-gradient(90deg, ${T.nova}88, ${T.nova})`,
                        borderRadius: "0 99px 99px 0",
                        transition: "all 0.4s cubic-bezier(0.4,0,0.2,1)" }} />
        </div>
      </div>
    </div>
  );
};

// ─── Result Card ─────────────────────────────────────────────────────────────
const ResultCard = ({ result, rank, onApply }) => {
  const isMulti = result.isMulticlass;
  return (
    <div style={{
      background: T.bg2, border: `1px solid ${rank === 1 ? T.ac0 : T.bd1}`,
      borderLeft: `3px solid ${isMulti ? T.nova : rank === 1 ? T.ac0 : T.bd1}`,
      borderRadius: T.r3, padding: T.s3,
      transition: "border-color 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start",
                    justifyContent: "space-between", gap: T.s3, marginBottom: T.s2 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.s2, marginBottom: 4 }}>
            {rank <= 3 && (
              <span style={{ fontSize: 11, color: [T.wa0,"#aaa","#cd7f32"][rank-1],
                             fontWeight: 700, fontFamily: T.mono }}>
                #{rank}
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: T.tx0 }}>
              {result.label}
            </span>
            {isMulti && <Badge label="Multiclass" color={T.nova} />}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: T.s1 }}>
            {(result.strengths || []).map(s => (
              <Badge key={s} label={s} color={T.ok0} />
            ))}
            {(result.weaknesses || []).map(w => (
              <Badge key={w} label={w} color={T.wa0} bg={T.wa1} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: T.s1 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: T.ac1,
                         fontFamily: T.mono }}>
            {(result.score || 0).toFixed(1)}
          </span>
          <Btn small primary onClick={() => onApply(result)}>Apply</Btn>
        </div>
      </div>
      <DprBar sustained={result.sustainedDpr || 0}
              burst={result.burstDprRound1 || result.sustainedDpr || 0}
              maxDpr={40} />
      <div style={{ display: "flex", gap: T.s3, flexWrap: "wrap", marginTop: T.s2 }}>
        {[
          ["EHP", result.effectiveHp, T.tank],
          ["Ctrl", result.controlPressure, T.ctrl],
          ["Skill", result.skillScore, T.skill],
          ["Init", result.initiative, T.tx1],
        ].map(([l, v, c]) => (
          <span key={l} style={{ fontSize: 11, color: T.tx2 }}>
            {l}: <span style={{ color: c, fontFamily: T.mono }}>{fmt1(v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── Optimizer Tradeoff Radar ────────────────────────────────────────────────
const RadarChart = ({ metrics }) => {
  const keys = ["sustainedDpr","burstDprRound1","effectiveHp","controlPressure","skillScore","initiative"];
  const labels = ["Sustained","Burst","Tank","Control","Skill","Initiative"];
  const colors = [T.ok0, T.nova, T.tank, T.ctrl, T.skill, T.ac1];
  const maxVals = { sustainedDpr:40, burstDprRound1:60, effectiveHp:150,
                    controlPressure:20, skillScore:30, initiative:15 };
  const cx = 110, cy = 110, r = 80;
  const angleStep = (Math.PI * 2) / keys.length;
  const pts = keys.map((k, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const frac  = Math.min(1, (metrics[k] || 0) / (maxVals[k] || 1));
    return {
      x: cx + Math.cos(angle) * r * frac,
      y: cy + Math.sin(angle) * r * frac,
      lx: cx + Math.cos(angle) * (r + 20),
      ly: cy + Math.sin(angle) * (r + 20),
      color: colors[i], label: labels[i], frac,
    };
  });
  const polyPts = pts.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox="0 0 220 220" width="100%" style={{ maxWidth: 220 }}>
      {/* grid circles */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <circle key={f} cx={cx} cy={cy} r={r * f}
          fill="none" stroke={T.bd0} strokeWidth={0.5} />
      ))}
      {/* spokes */}
      {pts.map((p, i) => (
        <line key={i} x1={cx} y1={cy}
          x2={cx + Math.cos(i * angleStep - Math.PI/2) * r}
          y2={cy + Math.sin(i * angleStep - Math.PI/2) * r}
          stroke={T.bd0} strokeWidth={0.5} />
      ))}
      {/* filled area */}
      <polygon points={polyPts} fill={T.ac0 + "33"} stroke={T.ac0} strokeWidth={1.5} />
      {/* dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3}
          fill={p.color} stroke={T.bg2} strokeWidth={1} />
      ))}
      {/* labels */}
      {pts.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly + 4}
          textAnchor="middle" fontSize={8} fill={T.tx2}
          fontFamily={T.sans}>{p.label}</text>
      ))}
    </svg>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const INITIAL_STATE = {
  name: "Thalindra",
  player: "",
  class: "fighter",
  level: 8,
  race: "Human",
  background: "Soldier",
  subclass: "Battle Master",
  alignment: "Lawful Good",
  abilities: { str: 18, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
  abilityMode: "standard",
  weapons: [{ name: "Longsword", ability: "str", dmg: "1d8", magic: 1, prof: true }],
  castAbility: "int",
  slots: {},
  knownSpells: "", prepSpells: "",
  features: "", traits: "", notes: "", equipment: "Chain Mail, Shield",
};

export default function DnDBuilder() {
  const [state, setState]       = useState(INITIAL_STATE);
  const [tab, setTab]           = useState("builder"); // builder | combat | spells | compare
  const [cmdOpen, setCmdOpen]   = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [results, setResults]   = useState([]);
  const [objective, setObjective] = useState("sustained_dpr");
  const [progress, setProgress] = useState(0);
  const [validPanel, setValidPanel] = useState(false);

  // Keyboard shortcut: ⌘K → command palette
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const update = useCallback((key, val) =>
    setState(s => ({ ...s, [key]: val })), []);

  const updateAbility = useCallback((key, val) =>
    setState(s => ({ ...s, abilities: { ...s.abilities, [key]: Math.max(3, Math.min(30, val)) } })), []);

  // Derived stats (normally computed by dnd-engine.js)
  const derived = useMemo(() => {
    const lvl   = state.level;
    const ab    = state.abilities;
    const cls   = state.class;
    const strM  = mod(ab.str), dexM = mod(ab.dex), conM = mod(ab.con);
    const intM  = mod(ab.int), wisM = mod(ab.wis), chaM = mod(ab.cha);
    const profB = pb(lvl);
    // rough HP estimate
    const hitDice = { barbarian:12, fighter:10, paladin:10, ranger:10,
                      bard:8, cleric:8, druid:8, monk:8, rogue:8, warlock:8,
                      sorcerer:6, wizard:6 };
    const hd  = hitDice[cls] || 8;
    const hp  = hd + conM + (lvl - 1) * (Math.ceil(hd / 2) + 1 + conM);
    const ac  = (cls === "fighter" || cls === "paladin" || cls === "cleric") ? 18 : 14;
    const atk = profB + (ab.str >= ab.dex ? strM : dexM) + 1; // +1 magic assumed
    const spellAtk = profB + Math.max(wisM, intM, chaM) + 1;
    const spellDC  = 8 + profB + Math.max(wisM, intM, chaM) + 1;
    const initiative = dexM;
    // simplified DPR
    const attacks = lvl >= 5 ? 2 : 1;
    const hitChance = Math.min(0.95, Math.max(0.05, (atk + 20 - 15) / 20));
    const sustainedDpr = hitChance * (4.5 + strM + 1) * attacks;
    const burstDprRound1 = sustainedDpr * 1.5;
    const effectiveHp = hp * (1 + (ac - 15) * 0.07);
    const controlPressure = (cls === "wizard" || cls === "cleric" || cls === "druid") ? 10 : 2;
    const skillScore = (cls === "rogue" || cls === "bard") ? 25 : 10;

    return {
      hp, ac, atk, spellAtk, spellDC, initiative, profB,
      attacks, sustainedDpr, burstDprRound1, effectiveHp,
      controlPressure, skillScore,
    };
  }, [state]);

  const handleCmd = useCallback((id) => {
    if (id === "std-array") {
      const keys = ABILITY_KEYS;
      setState(s => ({
        ...s, abilityMode: "standard",
        abilities: Object.fromEntries(keys.map((k, i) => [k, STANDARD_ARRAY[i]]))
      }));
    }
    if (id.startsWith("tab-")) setTab(id.replace("tab-", ""));
    if (id === "reset")   setState(INITIAL_STATE);
    if (id === "optimize") runOptimizer();
    if (id === "export") {
      navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    }
  }, [state]);

  const runOptimizer = useCallback(() => {
    setOptimizing(true); setProgress(0);
    // Simulate async optimizer (replace with real runOptimizerAsync)
    let i = 0;
    const interval = setInterval(() => {
      i += 8; setProgress(Math.min(i, 100));
      if (i >= 100) {
        clearInterval(interval);
        setOptimizing(false);
        // Mock top builds
        setResults([
          { label: "Fighter 8 (Battle Master)", score: 28.4,
            sustainedDpr: 24.2, burstDprRound1: 38.6, effectiveHp: 112, controlPressure: 3,
            skillScore: 8, initiative: 2, strengths: ["high dpr","nova"], weaknesses: [], isMulticlass: false },
          { label: "Paladin 6 / Sorcerer 2", score: 25.8,
            sustainedDpr: 18.4, burstDprRound1: 44.1, effectiveHp: 98, controlPressure: 5,
            skillScore: 6, initiative: 1, strengths: ["burst","smite"], weaknesses: ["low sustain"], isMulticlass: true },
          { label: "Fighter 5 / Champion", score: 23.1,
            sustainedDpr: 21.8, burstDprRound1: 30.2, effectiveHp: 105, controlPressure: 1,
            skillScore: 7, initiative: 3, strengths: ["crits"], weaknesses: [], isMulticlass: false },
        ]);
      }
    }, 80);
  }, [objective]);

  const TABS = [
    { id: "builder", label: "Builder",    icon: "⚔" },
    { id: "combat",  label: "Combat Sim", icon: "🛡" },
    { id: "spells",  label: "Spells",     icon: "✨" },
    { id: "compare", label: "Compare",    icon: "⚖" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg0, color: T.tx0,
                  fontFamily: T.sans, fontSize: 13 }}>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onAction={handleCmd} />

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: T.bg1, borderBottom: `1px solid ${T.bd0}`,
        display: "flex", alignItems: "center", padding: `0 ${T.s4}`,
        height: 48, gap: T.s3,
      }}>
        <span style={{ fontFamily: T.display, fontWeight: 800, fontSize: 15,
                       color: T.ac1, letterSpacing: "-0.02em", marginRight: T.s4 }}>
          D&D 5e SRD
        </span>

        {/* Nav tabs */}
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: `0 ${T.s3}`, height: 48, fontSize: 12, fontWeight: 600,
            color: tab === t.id ? T.ac1 : T.tx2,
            background: "none", border: "none", borderBottom: `2px solid ${tab === t.id ? T.ac0 : "transparent"}`,
            cursor: "pointer", transition: "all 0.15s", fontFamily: T.sans,
          }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span> {t.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Cmd palette hint */}
        <button onClick={() => setCmdOpen(true)} style={{
          display: "flex", alignItems: "center", gap: T.s2,
          padding: `4px ${T.s3}`, borderRadius: T.r2,
          background: T.bg3, border: `1px solid ${T.bd1}`,
          color: T.tx2, fontSize: 11, cursor: "pointer", fontFamily: T.mono,
        }}>
          <span>⌘K</span>
        </button>

        <Btn primary onClick={runOptimizer} disabled={optimizing} icon="⚡">
          {optimizing ? "Running…" : "Optimize"}
        </Btn>
      </header>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {optimizing && (
        <div style={{ height: 2, background: T.bd0 }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: `linear-gradient(90deg, ${T.ac0}, ${T.ac1})`,
            transition: "width 0.1s",
          }} />
        </div>
      )}

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px",
                    gap: T.s4, padding: T.s4, maxWidth: 1400, margin: "0 auto",
                    alignItems: "start" }}>

        {/* ══ LEFT COLUMN ══════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: T.s3 }}>

          {tab === "builder" && <>
            {/* Identity */}
            <Panel title="Identity">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
                            gap: T.s3, marginBottom: T.s3 }}>
                <Field label="Name" value={state.name} onChange={v => update("name", v)} />
                <Field label="Player" value={state.player} onChange={v => update("player", v)} />
                <Field label="Subclass" value={state.subclass} onChange={v => update("subclass", v)} />
                <Field label="Alignment" value={state.alignment} onChange={v => update("alignment", v)}
                  options={["Lawful Good","Neutral Good","Chaotic Good",
                            "Lawful Neutral","True Neutral","Chaotic Neutral",
                            "Lawful Evil","Neutral Evil","Chaotic Evil"]} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
                            gap: T.s3 }}>
                <Field label="Class" value={state.class} onChange={v => update("class", v.toLowerCase())}
                  options={CLASSES.map(c => ({ value: c.toLowerCase(), label: c }))} />
                <Field label="Race" value={state.race} onChange={v => update("race", v)}
                  options={["Human","Dwarf","Elf","Halfling","Dragonborn","Gnome","Half-Elf","Half-Orc","Tiefling","Custom"]} />
                <Field label="Background" value={state.background} onChange={v => update("background", v)}
                  options={["Acolyte","Criminal","Folk Hero","Noble","Sage","Soldier","Artisan","Entertainer","Hermit","Custom"]} />
                <div />
              </div>
            </Panel>

            {/* Level Timeline */}
            <Panel title="Level Progression" accent={T.ac0}>
              <LevelTimeline level={state.level} onChange={lv => update("level", lv)} />
            </Panel>

            {/* Abilities */}
            <Panel title="Ability Scores"
              right={
                <>
                  <Field label="" value={state.abilityMode}
                    onChange={v => update("abilityMode", v)}
                    options={[
                      { value: "standard", label: "Standard Array" },
                      { value: "pointbuy", label: "Point Buy" },
                      { value: "manual",   label: "Manual" },
                    ]}
                    style={{ fontSize: 11, padding: "3px 6px" }} />
                  <Btn small onClick={() => handleCmd("std-array")}>Apply SA</Btn>
                </>
              }
            >
              <AbilityBlock
                abilities={state.abilities}
                onChange={updateAbility}
                mode={state.abilityMode}
                profSaves={["str","con"]}
              />
            </Panel>

            {/* Derived Stats */}
            <Panel title="Derived Stats">
              <div style={{ display: "flex", flexWrap: "wrap", gap: T.s2 }}>
                {[
                  ["HP",    derived.hp,         T.ok0],
                  ["AC",    derived.ac,         T.tank],
                  ["Init",  sign(derived.initiative), T.ac1],
                  ["Atk",   sign(derived.atk),  T.ok0],
                  ["Speed", "30 ft",            T.tx1],
                  ["Prof",  sign(derived.profB), T.ac1],
                  ["Spell Atk", sign(derived.spellAtk), T.nova],
                  ["DC",    derived.spellDC,    T.nova],
                ].map(([l, v, c]) => (
                  <StatChip key={l} label={l} value={v} color={c} />
                ))}
              </div>
            </Panel>

            {/* Notes */}
            <Panel title="Notes & Traits">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.s3 }}>
                {["features","traits","notes","equipment"].map(k => (
                  <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 10, color: T.tx2, textTransform: "uppercase",
                                   letterSpacing: "0.06em" }}>{k}</span>
                    <textarea value={state[k]} onChange={e => update(k, e.target.value)}
                      rows={3} style={{
                        background: T.bg3, border: `1px solid ${T.bd1}`,
                        borderRadius: T.r2, color: T.tx0, padding: T.s2,
                        fontSize: 12, fontFamily: T.sans, resize: "vertical",
                        outline: "none",
                      }} />
                  </label>
                ))}
              </div>
            </Panel>
          </>}

          {tab === "combat" && (
            <Panel title="Combat Simulator" accent={T.er0}>
              <div style={{ color: T.tx2, fontSize: 13, textAlign: "center",
                            padding: `${T.s8} 0` }}>
                <div style={{ fontSize: 32, marginBottom: T.s3 }}>🛡</div>
                <div>Combat simulator is connected to your built character.</div>
                <div style={{ marginTop: T.s2 }}>
                  Configure assumptions in the Optimizer panel, then run the sim.
                </div>
                <div style={{ marginTop: T.s4 }}>
                  <DprBar sustained={derived.sustainedDpr}
                          burst={derived.burstDprRound1} maxDpr={50} />
                </div>
              </div>
            </Panel>
          )}

          {tab === "spells" && (
            <Panel title="Spellcasting" accent={T.nova}>
              <div style={{ display: "flex", gap: T.s3, flexWrap: "wrap", marginBottom: T.s4 }}>
                <Field label="Casting Ability" value={state.castAbility}
                  onChange={v => update("castAbility", v)}
                  options={ABILITY_KEYS.map(k => ({ value: k, label: ABILITIES[ABILITY_KEYS.indexOf(k)] }))} />
                <StatChip label="Spell Atk" value={sign(derived.spellAtk)} color={T.nova} />
                <StatChip label="Save DC"   value={derived.spellDC}        color={T.nova} />
              </div>
              <div style={{ color: T.tx2, fontSize: 12, textAlign: "center",
                            padding: `${T.s6} 0` }}>
                Spell database + context-aware recommendations coming in full implementation.
              </div>
            </Panel>
          )}

          {tab === "compare" && (
            <Panel title="Build Comparison" accent={T.skill}>
              <div style={{ color: T.tx2, fontSize: 12, textAlign: "center",
                            padding: `${T.s6} 0` }}>
                Run the optimizer to generate builds, then compare them side-by-side here.
              </div>
            </Panel>
          )}
        </div>

        {/* ══ RIGHT COLUMN ════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: T.s3,
                      position: "sticky", top: 56 }}>

          {/* Current Build Metrics */}
          <Panel title="Build Metrics" accent={T.ok0}>
            <RadarChart metrics={derived} />
            <Sep />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.s2 }}>
              {[
                ["Sustained DPR", derived.sustainedDpr,     T.ok0],
                ["Burst R1 DPR",  derived.burstDprRound1,   T.nova],
                ["Effective HP",  derived.effectiveHp,      T.tank],
                ["Control",       derived.controlPressure,  T.ctrl],
                ["Skill Score",   derived.skillScore,       T.skill],
                ["Initiative",    sign(derived.initiative), T.ac1],
              ].map(([l, v, c]) => (
                <div key={l} style={{
                  background: T.bg3, borderRadius: T.r2,
                  padding: `${T.s2} ${T.s3}`, textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c,
                                fontFamily: T.mono }}>
                    {typeof v === "number" ? fmt1(v) : v}
                  </div>
                  <div style={{ fontSize: 9, color: T.tx2, textTransform: "uppercase",
                                letterSpacing: "0.06em", marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Optimizer */}
          <Panel title="Optimizer">
            <div style={{ display: "flex", flexDirection: "column", gap: T.s3 }}>
              <Field label="Objective" value={objective}
                onChange={setObjective}
                options={[
                  { value: "sustained_dpr", label: "⚔ Sustained DPR" },
                  { value: "nova_dpr",      label: "⚡ Nova / Burst" },
                  { value: "tank",          label: "🛡 Durability" },
                  { value: "controller",    label: "🌀 Controller" },
                  { value: "skill",         label: "🧠 Skill Monkey" },
                  { value: "balanced",      label: "⚖ Balanced" },
                ]} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.s2 }}>
                {[
                  ["Target AC", "15", "targetAC"],
                  ["Adv Rate",  "25%","advantageRate"],
                  ["Encounters/Day", "4", "encountersPerDay"],
                  ["Short Rests", "2", "shortRests"],
                ].map(([l, placeholder, k]) => (
                  <Field key={k} label={l} type="number" value={placeholder}
                    onChange={() => {}} />
                ))}
              </div>

              <div style={{ display: "flex", gap: T.s2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: T.s2,
                                fontSize: 11, color: T.tx1, cursor: "pointer" }}>
                  <input type="checkbox" defaultChecked
                    style={{ accentColor: T.ac0 }} />
                  Feats
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: T.s2,
                                fontSize: 11, color: T.tx1, cursor: "pointer" }}>
                  <input type="checkbox" defaultChecked
                    style={{ accentColor: T.ac0 }} />
                  Multiclass
                </label>
              </div>

              <Btn primary onClick={runOptimizer} disabled={optimizing}>
                {optimizing ? `Optimizing… ${progress}%` : "⚡ Run Optimizer"}
              </Btn>
            </div>
          </Panel>

          {/* Results */}
          {results.length > 0 && (
            <Panel title={`Top Builds (${results.length})`}>
              <div style={{ display: "flex", flexDirection: "column", gap: T.s2 }}>
                {results.map((r, i) => (
                  <ResultCard key={i} result={r} rank={i + 1}
                    onApply={r => {
                      update("class", r.label.toLowerCase().includes("paladin") ? "paladin" : "fighter");
                    }} />
                ))}
              </div>
            </Panel>
          )}

          {/* Import / Export */}
          <Panel title="Import / Export">
            <div style={{ display: "flex", gap: T.s2, flexWrap: "wrap" }}>
              <Btn icon="⬇" onClick={() => handleCmd("export")}>Export JSON</Btn>
              <Btn icon="⬆" onClick={() => {}}>Import JSON</Btn>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
