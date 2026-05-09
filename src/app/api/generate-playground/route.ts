// POST /api/generate-playground  { paperText, paperTitle } → UISpec
//
// Path note: requested at app/api/generate-playground/route.ts; placed
// under src/app/ because this scaffold's app router lives there.

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { UISpec } from "../../../../lib/uiSpec";

const SYSTEM_PROMPT = `You are designing an interactive playground that teaches an ML paper's core idea.

You will receive paper text. Identify the SINGLE core contribution — the one mechanism a reader needs to understand to "get" this paper.

Design a playground using ONLY these primitive component types:
text_block, annotation, text_input, slider, dropdown, button, heatmap, chart (line/bar/scatter), image_display, graph_viz, code_block, comparison_pair.

Available data_source values: mock_attention, mock_denoise, mock_optimizer_path, mock_chart, mock_image, static.

Pick 4–7 components total. Always include:
- One text_block at the top with a 2–3 sentence plain-English summary
- At least one interactive component (slider/text_input/dropdown)
- At least one annotation explaining what the user should notice

Examples by paper type:
- Attention paper → text_block + text_input(sentence) + dropdown(head) + heatmap(data_source: mock_attention) + annotation
- Diffusion paper → text_block + slider(label "Noise Level", min 0 = clean / max 1000 = pure noise, default ~500) + image_display(mock_denoise) + annotation with text "Drag right to add noise, drag left to denoise — this is the reverse process the model learns."
- Optimizer paper → text_block + dropdown(optimizer: SGD/Adam/Lion) + chart(scatter, mock_optimizer_path) + annotation
- Embedding/RAG paper → text_block + text_input(query) + chart(scatter, mock_chart) + annotation

For unfamiliar paper types, be creative — pick primitives that capture the input → mechanism → output flow.

Output schema (the top-level object MUST have exactly these four keys):
{
  "paperTitle": string,
  "summary": string,
  "layout": "vertical" | "grid",
  "components": Component[]
}

Every Component requires { "id": string, "type": <one of the types above>, "label"?: string } plus the type-specific props below. Use exactly these field names — do not rename, nest, or wrap.
- text_block: { "text": string }
- annotation: { "text": string, "kind"?: "info" | "warning" | "tip" | "note" }
- text_input: { "placeholder"?: string, "defaultValue"?: string }
- slider: { "min": number, "max": number, "default": number, "step"?: number }
- dropdown: { "options": [{ "value": string, "label": string }], "defaultValue"?: string }
- button: { "action"?: string }
- heatmap: { "rows": number, "cols": number, "data_source": string }
- chart: { "chartType": "line" | "bar" | "scatter", "data_source": string }
- image_display: { "data_source": string, "alt"?: string }
- graph_viz: { "data_source": string }
- code_block: { "code": string, "language"?: string }
- comparison_pair: { "left": string, "right": string, "leftLabel"?: string, "rightLabel"?: string }

Example output (one line, exact shape to follow):
{"paperTitle":"Attention Is All You Need","summary":"The Transformer replaces recurrence with self-attention so every token can attend to every other token in parallel. The heatmap below shows which tokens attend to which.","layout":"vertical","components":[{"id":"intro","type":"text_block","text":"Type a sentence; the heatmap shows attention between tokens."},{"id":"sentence","type":"text_input","label":"Sentence","defaultValue":"The cat sat on the mat"},{"id":"map","type":"heatmap","label":"Self-attention","rows":8,"cols":8,"data_source":"mock_attention"},{"id":"note","type":"annotation","kind":"tip","text":"Tokens sharing a first letter highlight each other."}]}

Output ONLY valid JSON matching this exact schema. No markdown fences, no wrapper objects (no "playground" / "data" / "result" envelopes), no explanation.`;

// Loose validator: confirms "this is shaped like a UISpec" without
// re-encoding every primitive's prop schema (Zod for the 12 variants
// would be ~200 lines and we'd have to keep it in sync with uiSpec.ts).
// `passthrough` lets agent-emitted components carry whatever fields
// they need; RenderUI handles unknown/missing props with empty fallbacks.
const UISpecLoose = z.object({
  paperTitle: z.string(),
  summary: z.string(),
  layout: z.enum(["vertical", "grid"]),
  components: z
    .array(z.object({ type: z.string(), id: z.string() }).passthrough())
    .min(1),
});

function stripCodeFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

function fallbackSpec(paperTitle: string): UISpec {
  const title = paperTitle || "Paper";
  return {
    paperTitle: title,
    summary: "We couldn't generate a custom playground for this paper.",
    layout: "vertical",
    components: [
      {
        type: "text_block",
        id: "summary",
        label: "Summary",
        text: `"${title}" — the agent couldn't design a custom playground for this one. Try another paper or refresh.`,
      },
      {
        type: "annotation",
        id: "fallback-note",
        kind: "warning",
        text: "Auto-generated playground unavailable for this paper.",
      },
    ],
  };
}

export async function POST(req: Request) {
  let body: { paperText?: unknown; paperTitle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const paperText = typeof body.paperText === "string" ? body.paperText : "";
  const paperTitle =
    typeof body.paperTitle === "string" ? body.paperTitle : "";
  if (!paperText) {
    return NextResponse.json(
      { error: "Missing 'paperText' string" },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server missing GEMINI_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      // Model history on this project:
      //   gemini-2.0-flash  → 429 quota limit:0 on this key
      //   gemini-1.5-flash  → 404 (retired on this v1beta endpoint)
      //   gemini-2.5-flash  → ✓ works with key's free tier (current pick)
      // Revert to 2.0/1.5 when/if quota or availability changes.
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        // JSON mode is supported on 2.0 Flash and removes the need for
        // fence-stripping in the happy path. We still strip fences below
        // as a defensive fallback in case the model ignores it.
        responseMimeType: "application/json",
      },
    });

    const userMessage = paperTitle
      ? `Paper title: ${paperTitle}\n\nPaper text:\n${paperText}`
      : paperText;

    const result = await model.generateContent(userMessage);
    const raw = result.response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(raw));
    } catch {
      // eslint-disable-next-line no-console
      console.error(
        "[generate-playground] JSON.parse failed:",
        raw.slice(0, 300),
      );
      return NextResponse.json(fallbackSpec(paperTitle));
    }

    const v = UISpecLoose.safeParse(parsed);
    if (!v.success) {
      // eslint-disable-next-line no-console
      console.error(
        "[generate-playground] schema validation failed:",
        v.error.flatten(),
      );
      return NextResponse.json(fallbackSpec(paperTitle));
    }

    return NextResponse.json(parsed as UISpec);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    // eslint-disable-next-line no-console
    console.error("[generate-playground] gemini call failed:", msg);
    return NextResponse.json(fallbackSpec(paperTitle));
  }
}
