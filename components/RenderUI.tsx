"use client";

// RenderUI — agent-emitted UISpec → 12-primitive React render.
// Single `state` object keyed by component id. Every input writes via
// setState({ ...state, [id]: v }). Every data_source call happens
// inline during render (no useMemo, no useEffect) so dynamic components
// automatically refresh on any state change.

import * as React from "react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UIComponent, UISpec } from "../lib/uiSpec";
// Raw <input>/<select> intentionally — wrapper components had earlier
// shown event-handling weirdness in this scaffold.
import { getData, type InputValues } from "../lib/dataSources";

interface RenderUIProps {
  spec: UISpec;
}

export function RenderUI({ spec }: RenderUIProps) {
  // Single state object. Initialized with each input's defaults to avoid
  // React's "controlled to uncontrolled" warning on first interaction.
  const [state, setState] = useState<InputValues>(() => initialState(spec));

  // Debug: log state on every render.
  // eslint-disable-next-line no-console
  console.log("[RenderUI] state:", state);

  const layoutClass =
    spec.layout === "grid"
      ? "grid grid-cols-1 md:grid-cols-2 gap-6"
      : "flex flex-col gap-6";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          {spec.paperTitle}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          {spec.summary}
        </p>
      </header>

      <div className={layoutClass}>
        {spec.components.map((c) => (
          <ComponentRenderer
            key={c.id}
            component={c}
            state={state}
            setState={setState}
          />
        ))}
      </div>
    </div>
  );
}

function initialState(spec: UISpec): InputValues {
  const out: InputValues = {};
  for (const c of spec.components) {
    if (c.type === "slider") out[c.id] = c.default;
    else if (c.type === "dropdown" && c.defaultValue !== undefined) {
      out[c.id] = c.defaultValue;
    } else if (c.type === "text_input" && c.defaultValue !== undefined) {
      out[c.id] = c.defaultValue;
    }
  }
  return out;
}

interface RendererProps<T extends UIComponent = UIComponent> {
  component: T;
  state: InputValues;
  setState: React.Dispatch<React.SetStateAction<InputValues>>;
}

function ComponentRenderer({
  component: c,
  state,
  setState,
}: RendererProps) {
  switch (c.type) {
    case "text_block":
      return (
        <div>
          {c.label && (
            <h3 className="mb-2 text-sm font-semibold">{c.label}</h3>
          )}
          <p className="text-sm leading-relaxed text-[var(--card-foreground)]">
            {c.text}
          </p>
        </div>
      );

    case "annotation": {
      const tone =
        c.kind === "warning"
          ? "bg-amber-50 border-amber-500 text-amber-900"
          : c.kind === "tip"
            ? "bg-emerald-50 border-emerald-500 text-emerald-900"
            : c.kind === "note"
              ? "bg-slate-50 border-slate-500 text-slate-900"
              : "bg-blue-50 border-blue-500 text-blue-900";
      return (
        <div className={`rounded-md border-l-4 p-4 ${tone}`}>
          {c.label && (
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
              {c.label}
            </div>
          )}
          <div className="text-sm leading-relaxed">{c.text}</div>
        </div>
      );
    }

    case "text_input":
      return (
        <div>
          {c.label && (
            <label
              htmlFor={c.id}
              className="block text-sm font-medium mb-1 text-slate-700"
            >
              {c.label}
            </label>
          )}
          <input
            id={c.id}
            type="text"
            placeholder={c.placeholder}
            value={(state[c.id] as string | undefined) ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              // eslint-disable-next-line no-console
              console.log("input change", c.id, v);
              setState({ ...state, [c.id]: v });
            }}
            className="block h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      );

    case "slider": {
      const cur = (state[c.id] as number | undefined) ?? c.default;
      return (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            {c.label && (
              <label
                htmlFor={c.id}
                className="block text-sm font-medium text-slate-700"
              >
                {c.label}
              </label>
            )}
            <span className="text-xs tabular-nums text-slate-500">{cur}</span>
          </div>
          <input
            id={c.id}
            type="range"
            min={c.min}
            max={c.max}
            step={c.step ?? 1}
            value={cur}
            onChange={(e) => {
              const v = Number(e.target.value);
              // eslint-disable-next-line no-console
              console.log("input change", c.id, v);
              setState({ ...state, [c.id]: v });
            }}
            className="w-full cursor-pointer accent-blue-500"
          />
        </div>
      );
    }

    case "dropdown": {
      const cur =
        (state[c.id] as string | undefined) ?? c.defaultValue ?? "";
      return (
        <div>
          {c.label && (
            <label
              htmlFor={c.id}
              className="block text-sm font-medium mb-1 text-slate-700"
            >
              {c.label}
            </label>
          )}
          <select
            id={c.id}
            value={cur}
            onChange={(e) => {
              const v = e.target.value;
              // eslint-disable-next-line no-console
              console.log("input change", c.id, v);
              setState({ ...state, [c.id]: v });
            }}
            className="block h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {c.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case "button":
      return (
        <Button
          onClick={() => {
            // Button click → integer counter into state at the button's id.
            // Lets data_source functions react to button presses just like
            // any other input ("step", "regenerate", etc.).
            const prev =
              typeof state[c.id] === "number" ? (state[c.id] as number) : 0;
            const next = prev + 1;
            // eslint-disable-next-line no-console
            console.log("input change", c.id, next, "(click)");
            setState({ ...state, [c.id]: next });
          }}
        >
          {c.label ?? "Action"}
        </Button>
      );

    case "heatmap":
      return <HeatmapRenderer component={c} state={state} />;

    case "chart":
      return <ChartRenderer component={c} state={state} />;

    case "image_display": {
      // Direct getData call inside render — re-runs every state change.
      // Sources may return either a plain URL string (mock_image) or a
      // { src, noiseLevel } object (mock_denoise). Normalize either shape.
      const raw = getData(c.data_source, state);
      const data: { src: string; noiseLevel: number } | null =
        raw && typeof raw === "object" && "src" in (raw as object)
          ? (raw as { src: string; noiseLevel: number })
          : typeof raw === "string"
            ? { src: raw, noiseLevel: 0 }
            : null;
      const noise = data?.noiseLevel ?? 0;
      const filter = `blur(${noise / 50}px) contrast(${1 + noise / 200}) saturate(${1 - noise / 1500})`;
      // Inline SVG fractal-noise pattern, applied as an overlay whose
      // opacity tracks noiseLevel/1000 so step=0 is clean, step=1000 is grainy.
      const noisePattern =
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>";
      return (
        <Card className="overflow-hidden">
          {c.label && (
            <div className="px-4 pt-4 text-sm font-semibold">{c.label}</div>
          )}
          {data && (
            <div className="relative p-4">
              <img
                src={data.src}
                alt={c.alt ?? c.label ?? "image"}
                className="block h-auto w-full"
                style={{ filter }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-4"
                style={{
                  backgroundImage: `url("${noisePattern}")`,
                  opacity: noise / 1000,
                  mixBlendMode: "overlay",
                }}
              />
            </div>
          )}
        </Card>
      );
    }

    case "graph_viz":
      return <GraphRenderer component={c} state={state} />;

    case "code_block":
      return (
        <Card className="overflow-hidden">
          {c.label && (
            <div className="px-4 pt-3 pb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {c.label}
            </div>
          )}
          <pre className="overflow-x-auto px-4 pb-4 text-xs">
            <code className={`language-${c.language ?? "plaintext"}`}>
              {c.code}
            </code>
          </pre>
        </Card>
      );

    case "comparison_pair":
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="p-4">
            {c.leftLabel && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {c.leftLabel}
              </div>
            )}
            <div className="text-sm leading-relaxed">{c.left}</div>
          </Card>
          <Card className="p-4">
            {c.rightLabel && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {c.rightLabel}
              </div>
            )}
            <div className="text-sm leading-relaxed">{c.right}</div>
          </Card>
        </div>
      );

    default: {
      const _exhaustive: never = c;
      return null;
    }
  }
}

// ── Heatmap ──────────────────────────────────────────────────────────

function HeatmapRenderer({
  component: c,
  state,
}: {
  component: Extract<UIComponent, { type: "heatmap" }>;
  state: InputValues;
}) {
  // Direct getData every render — no memoization.
  const data = getData(c.data_source, state) as number[][] | null;
  // Size from actual data dimensions, not the spec's hardcoded rows/cols.
  const grid =
    data ?? Array.from({ length: c.rows }, () => Array(c.cols).fill(0));
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const cell = 32;
  const w = cols * cell;
  const h = rows * cell;

  return (
    <Card className="p-4">
      {c.label && <div className="mb-3 text-sm font-semibold">{c.label}</div>}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {grid.map((row, y) =>
          row.map((v, x) => {
            const op = Math.min(1, Math.max(0, Number(v) || 0));
            return (
              <rect
                key={`${x}-${y}`}
                x={x * cell}
                y={y * cell}
                width={cell - 1}
                height={cell - 1}
                fill={`rgba(59, 130, 246, ${op})`}
                stroke="rgba(0,0,0,0.05)"
              >
                <title>
                  {`(${x}, ${y}) = ${
                    typeof v === "number" ? v.toFixed(3) : String(v)
                  }`}
                </title>
              </rect>
            );
          }),
        )}
      </svg>
    </Card>
  );
}

// ── Chart ────────────────────────────────────────────────────────────

function ChartRenderer({
  component: c,
  state,
}: {
  component: Extract<UIComponent, { type: "chart" }>;
  state: InputValues;
}) {
  // Direct getData every render — re-runs on any state change so the
  // marker tracks the slider/dropdown without useEffect/useMemo staleness.
  const raw = getData(c.data_source, state);
  const data = (Array.isArray(raw) ? raw : []) as Array<Record<string, any>>;
  // A marked point — drawn as a red dot/bar plus a vertical reference line —
  // so reactivity is visible even when the curve shape barely changes.
  const marker = data.find((d) => d?.highlight === true);
  const markerX = marker?.x;

  const renderDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (payload?.highlight) {
      return (
        <circle
          key={`dot-${index}`}
          cx={cx}
          cy={cy}
          r={6}
          fill="#ef4444"
          stroke="white"
          strokeWidth={2}
        />
      );
    }
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={0}
        fill="transparent"
      />
    );
  };

  return (
    <Card className="p-4">
      {c.label && <div className="mb-3 text-sm font-semibold">{c.label}</div>}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {c.chartType === "line" ? (
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {markerX !== undefined && (
                <ReferenceLine
                  x={markerX}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              <Line
                type="monotone"
                dataKey="y"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={renderDot}
                isAnimationActive={false}
              />
            </LineChart>
          ) : c.chartType === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {markerX !== undefined && (
                <ReferenceLine
                  x={markerX}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              <Bar
                dataKey="y"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d?.highlight ? "#ef4444" : "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <ScatterChart>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="x" type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="y" type="number" tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              {markerX !== undefined && (
                <ReferenceLine
                  x={markerX}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              <Scatter data={data} fill="#3b82f6" isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d?.highlight ? "#ef4444" : "#3b82f6"} />
                ))}
              </Scatter>
            </ScatterChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ── Graph ────────────────────────────────────────────────────────────

interface GraphData {
  nodes: Array<{ id: string; x: number; y: number; label?: string }>;
  edges: Array<{ from: string; to: string }>;
}

function GraphRenderer({
  component: c,
  state,
}: {
  component: Extract<UIComponent, { type: "graph_viz" }>;
  state: InputValues;
}) {
  const data = getData(c.data_source, state) as GraphData | null;
  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const pad = 30;
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = (xs.length ? Math.min(...xs) : 0) - pad;
  const minY = (ys.length ? Math.min(...ys) : 0) - pad;
  const maxX = (xs.length ? Math.max(...xs) : 100) + pad;
  const maxY = (ys.length ? Math.max(...ys) : 100) + pad;

  return (
    <Card className="p-4">
      {c.label && <div className="mb-3 text-sm font-semibold">{c.label}</div>}
      <svg
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        className="h-64 w-full"
      >
        {edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          );
        })}
        {nodes.map((n) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={10}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={2}
            />
            {n.label && (
              <text
                x={n.x}
                y={n.y - 14}
                fontSize={10}
                textAnchor="middle"
                fill="#475569"
              >
                {n.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </Card>
  );
}
