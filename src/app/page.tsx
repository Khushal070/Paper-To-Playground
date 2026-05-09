"use client";

// Paper-to-Playground homepage. Three phases:
//   idle    — hero + URL input
//   loading — fetching paper, then designing playground
//   ready   — rendered <RenderUI/> inside a Card with reset button.
// Sonner toasts surface fetch errors. The CopilotKit provider in
// layout.tsx is a context-only mount (no visible chrome) so it doesn't
// fight the centered hero.

import { useState } from "react";
import { toast, Toaster } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { RenderUI } from "../../components/RenderUI";
import type { UISpec } from "../../lib/uiSpec";

const DEFAULT_URL = "https://arxiv.org/abs/1706.03762";

const EXAMPLES: Array<{ label: string; url: string }> = [
  { label: "Transformer", url: "https://arxiv.org/abs/1706.03762" },
  { label: "LoRA", url: "https://arxiv.org/abs/2106.09685" },
  { label: "DDPM", url: "https://arxiv.org/abs/2006.11239" },
];

type Phase = "idle" | "loading" | "ready";
type LoadingStep = "reading" | "designing";

export default function HomePage() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState<LoadingStep>("reading");
  const [spec, setSpec] = useState<UISpec | null>(null);

  async function handleGenerate() {
    const u = url.trim();
    if (!u) {
      toast.error("Paste an arXiv URL first");
      return;
    }
    setPhase("loading");
    setStep("reading");
    try {
      const fpRes = await fetch("/api/fetch-paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      if (!fpRes.ok) {
        const j = await fpRes.json().catch(() => ({}));
        throw new Error(
          j.error ?? `Couldn't read the paper (HTTP ${fpRes.status})`,
        );
      }
      const paper = (await fpRes.json()) as { title: string; text: string };

      setStep("designing");
      const gpRes = await fetch("/api/generate-playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperTitle: paper.title,
          paperText: paper.text,
        }),
      });
      if (!gpRes.ok) {
        const j = await gpRes.json().catch(() => ({}));
        throw new Error(
          j.error ?? `Couldn't design the playground (HTTP ${gpRes.status})`,
        );
      }
      const ui = (await gpRes.json()) as UISpec;
      setSpec(ui);
      setPhase("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
      setPhase("idle");
    }
  }

  function handleReset() {
    setSpec(null);
    setPhase("idle");
  }

  const loading = phase === "loading";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Toaster position="top-center" richColors closeButton />

      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <header className="mb-10 text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-slate-900">
            Paper-to-Playground
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Turn ML and deep learning papers into interactive playgrounds
          </p>
        </header>

        <Card className="mx-auto max-w-2xl rounded-2xl border-slate-200 bg-white p-8 shadow-sm">
          <label
            htmlFor="arxiv-url"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            arXiv URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="arxiv-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) handleGenerate();
              }}
              placeholder="https://arxiv.org/abs/..."
              disabled={loading}
              className="flex-1 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
            />
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="sm:w-auto"
            >
              {loading ? "Working…" : "Generate Playground"}
            </Button>
          </div>

          {/* Example chips — fill the input on click. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setUrl(ex.url)}
                disabled={loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {ex.label}
              </button>
            ))}
          </div>

          {loading && (
            // Stepwise messaging (literal "Reading paper... designing
            // playground..." would over-promise: the second half is wrong
            // until we actually reach that step).
            <p
              className="mt-4 text-sm text-slate-500"
              aria-live="polite"
              role="status"
            >
              {step === "reading"
                ? "Reading paper…"
                : "Designing playground…"}
            </p>
          )}
        </Card>

        {phase === "ready" && spec && (
          <section className="mt-12">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Generated playground
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Try a different paper
              </Button>
            </div>
            <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
              <RenderUI spec={spec} />
            </Card>
          </section>
        )}

        <footer className="mt-16 border-t border-slate-200 pt-8 text-center text-xs text-slate-500">
          Built at Generative UI Global Hackathon 2026 — Stack: Next.js,
          TypeScript, CopilotKit, AG-UI, LangGraph, Gemini 2.5 Flash.
        </footer>
      </main>
    </div>
  );
}
