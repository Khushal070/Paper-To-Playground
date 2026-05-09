// Generic, paper-agnostic data sources. Each function reads the unified
// state object via heuristic extractors so ANY agent-emitted spec drives
// them — no per-paper hardcoded ids. Every function is pure (state in →
// data out, no side effects beyond a debug console.log).

import type { DataSource } from "./uiSpec";

export type InputValue = string | number | boolean | undefined;
export type InputValues = Record<string, InputValue>;

// ── Generic state extractors ──────────────────────────────────────────

const HEAD_RX = /^head[_-]?\d+$/i;
// Short alphanumeric tokens — typical of dropdown values like "head_0",
// "sgd", "adam", "v1". We use this to *exclude* them when hunting for a
// sentence string.
const OPTION_RX = /^[a-z0-9_-]{1,16}$/i;

function looksLikeOption(s: string): boolean {
  return OPTION_RX.test(s.trim());
}

/** Find a sentence-shaped string in state. Prefers common ids, then any
 *  non-option-looking string (longest wins). */
function findSentence(state: InputValues): string | undefined {
  for (const k of [
    "sentence_input",
    "sentence",
    "input",
    "query",
    "text",
    "prompt",
  ]) {
    const v = state[k];
    if (typeof v === "string" && v.trim() && !looksLikeOption(v)) {
      return v.trim();
    }
  }
  let best: string | undefined;
  for (const v of Object.values(state)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || looksLikeOption(t)) continue;
    if (!best || t.length > best.length) best = t;
  }
  return best;
}

/** Find any finite numeric value (sliders, click counters, etc.). */
function findNumber(state: InputValues): number | undefined {
  for (const v of Object.values(state)) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

/** Find a "selection-like" short string. Optional predicate refines the
 *  search (e.g. only `head_<n>`, only optimizer names, etc.). */
function findOption(
  state: InputValues,
  predicate?: (s: string) => boolean,
): string | undefined {
  for (const v of Object.values(state)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    if (predicate ? predicate(t) : looksLikeOption(t)) return t;
  }
  return undefined;
}

// ── Data sources ──────────────────────────────────────────────────────

export const dataSources = {
  /** Self-attention matrix from a sentence. Pattern depends on parsed
   *  head index: 0=proximity, 1=first-letter, 2=noise, 3=uniform. */
  mock_attention: (state: InputValues): number[][] => {
    const sentence = findSentence(state) ?? "The quick brown fox jumps";
    const head =
      findOption(state, (s) => HEAD_RX.test(s)) ??
      findOption(state) ??
      "head_0";
    const m = head.match(/(\d+)/);
    const headIdx = m ? parseInt(m[1], 10) % 4 : 0;

    const tokens = sentence.split(/\s+/).filter(Boolean);
    const n = Math.max(1, tokens.length);

    const raw: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        let v: number;
        if (headIdx === 0) {
          v = 1 / (1 + Math.abs(i - j));
        } else if (headIdx === 1) {
          const a = tokens[i]?.[0]?.toLowerCase();
          const b = tokens[j]?.[0]?.toLowerCase();
          v = a && b && a === b ? 1.0 : 0.05;
        } else if (headIdx === 2) {
          const seed = (i * 31 + j * 17 + n * 7) ^ sentence.length;
          v = Math.abs(Math.sin(seed * 12.9898));
        } else {
          v = 1;
        }
        row.push(v);
      }
      raw.push(row);
    }

    const out = raw.map((row) => {
      const sum = row.reduce((a, b) => a + b, 0);
      return sum > 0 ? row.map((v) => v / sum) : row;
    });

    // eslint-disable-next-line no-console
    console.log("[mock_attention]", {
      state,
      sentence,
      head,
      headIdx,
      dimensions: `${n}x${n}`,
    });
    return out;
  },

  /** Diffusion-step image. Returns a fixed base image plus a noise level
   *  derived from any numeric state value (0–1000). The renderer applies
   *  CSS filters/overlays so the slider visibly denoises the same image. */
  mock_denoise: (state: InputValues): { src: string; noiseLevel: number } => {
    const step = findNumber(state) ?? 500;
    const noiseLevel = Math.max(0, Math.min(1000, Math.round(step)));
    const src = "https://picsum.photos/seed/denoise-base/400/400";
    // eslint-disable-next-line no-console
    console.log("[mock_denoise]", { state, step, noiseLevel, src });
    return { src, noiseLevel };
  },

  /** 2D loss-landscape trajectory. Optimizer-name-keyed signature. */
  mock_optimizer_path: (
    state: InputValues,
  ): Array<{ x: number; y: number }> => {
    const OPT_RX = /(sgd|adamw|adam|lion|momentum|rmsprop)/i;
    let opt = "sgd";
    for (const v of Object.values(state)) {
      if (typeof v !== "string") continue;
      const found = v.match(OPT_RX);
      if (found) {
        opt = found[1].toLowerCase();
        break;
      }
    }

    const N = 40;
    let path: Array<{ x: number; y: number }>;

    if (opt === "adam" || opt === "adamw") {
      path = Array.from({ length: N }, (_, t) => {
        const decay = Math.exp(-t / 12);
        return { x: 10 * decay, y: 8 * decay - Math.sin(t / 5) * 0.25 };
      });
    } else if (opt === "lion") {
      path = Array.from({ length: N }, (_, t) => {
        const phase = Math.floor(t / 6);
        const decay = Math.exp(-t / 14);
        const dirX = phase % 2 === 0 ? 1 : -0.6;
        const dirY = phase % 2 === 0 ? -0.6 : 1;
        return {
          x: 10 * decay + dirX * 0.7,
          y: 8 * decay + dirY * 0.7,
        };
      });
    } else {
      // SGD (default): noisy zigzag
      path = Array.from({ length: N }, (_, t) => {
        const decay = Math.exp(-t / 15);
        return {
          x: 10 * decay + Math.sin(t * 2.3) * 1.8,
          y: 8 * decay + Math.cos(t * 2.3) * 1.8,
        };
      });
    }

    // eslint-disable-next-line no-console
    console.log("[mock_optimizer_path]", { state, optimizer: opt, points: N });
    return path;
  },

  /** Sigmoid curve over x = 0..N-1. Curve *shape* is fixed; only the
   *  highlighted marker moves with the slider value, and the y-axis range
   *  scales with it so the curve subtly shifts. `y` aliases `y1` so the
   *  existing single-series ChartRenderer (dataKey="y") still draws. */
  mock_chart: (
    state: InputValues,
  ): Array<{
    x: number;
    y: number;
    y1: number;
    y2: number;
    highlight?: boolean;
  }> => {
    const sliderValue = findNumber(state) ?? 0;
    const N = 20;
    // Map any slider value (assumed 0–100, but clamped) into a data index.
    const norm = Math.max(0, Math.min(100, sliderValue));
    const markerX = Math.round((norm / 100) * (N - 1));
    // Y-axis scale grows with slider so the curve visibly stretches.
    const scale = 60 + norm * 0.6;
    // Tiny phase shift keeps the shape recognizable but visibly responsive.
    const shift = norm / 50;
    const data = Array.from({ length: N }, (_, i) => {
      const sig = 1 / (1 + Math.exp(-(i - N / 2 + shift) / 2.2));
      const y1 = sig * scale + 5;
      const y2 = sig * scale * 0.75 + 8;
      return {
        x: i,
        y1,
        y2,
        y: y1,
        highlight: i === markerX,
      };
    });
    // eslint-disable-next-line no-console
    console.log("[mock_chart]", {
      state,
      sliderValue,
      markerX,
      scale,
      points: N,
    });
    return data;
  },

  /** LoRA-style performance curve over rank 1..64. Saturating shape:
   *  rises sharply, plateaus around rank 8–16, slight gain after.
   *  Marker at x = state.rank moves visibly as the user drags. */
  mock_lora_perf: (
    state: InputValues,
  ): Array<{
    x: number;
    y: number;
    highlight?: boolean;
  }> => {
    let rank: number;
    if (typeof state.rank === "number" && Number.isFinite(state.rank)) {
      rank = state.rank;
    } else {
      rank = findNumber(state) ?? 8;
    }
    rank = Math.max(1, Math.min(64, Math.round(rank)));

    const baseline = 60;
    const peak = 35;
    const data = Array.from({ length: 64 }, (_, i) => {
      const x = i + 1;
      // Saturating exponential — most gain by rank 16, tiny tail after.
      const fast = peak * 0.85 * (1 - Math.exp(-x / 4));
      const slow = peak * 0.15 * (Math.log(1 + x) / Math.log(65));
      const y = baseline + fast + slow;
      return { x, y, highlight: x === rank };
    });
    // eslint-disable-next-line no-console
    console.log("[mock_lora_perf]", { state, rank, points: data.length });
    return data;
  },

  /** Picsum URL whose seed is derived from the *entire* state object,
   *  so the image changes whenever any input changes. */
  mock_image: (state: InputValues): string => {
    const seed =
      Object.entries(state)
        .map(([k, v]) => `${k}:${String(v)}`)
        .join("|") || "default";
    const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/400`;
    // eslint-disable-next-line no-console
    console.log("[mock_image]", { state, seed: seed.slice(0, 80), url });
    return url;
  },

  /** Identity passthrough. `data_source: "static"` means the component
   *  carries its data inline; this exists for completeness. */
  static: <T>(value: T): T => value,
};

export function getData(
  sourceName: DataSource,
  state: InputValues = {},
): unknown {
  switch (sourceName) {
    case "mock_attention":
      return dataSources.mock_attention(state);
    case "mock_denoise":
      return dataSources.mock_denoise(state);
    case "mock_optimizer_path":
      return dataSources.mock_optimizer_path(state);
    case "mock_chart":
      return dataSources.mock_chart(state);
    case "mock_lora_perf":
      return dataSources.mock_lora_perf(state);
    case "mock_image":
      return dataSources.mock_image(state);
    case "static":
      return null;
    default:
      return null;
  }
}
