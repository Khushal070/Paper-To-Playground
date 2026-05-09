# Paper-to-Playground

Paste any arXiv paper URL and an agent designs a paper-specific interactive playground for it. Different paper, different generated UI - the agent picks the components, the layout, and how each input drives each visualization. No hardcoded templates.

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- CopilotKit + AG-UI (frontend protocol)
- LangGraph TS (agent orchestration)
- Gemini 2.5 Flash via `@google/generative-ai`
- Vercel (deploy)

> The brief called for Next.js 14; the official `copilotkit create -f langgraph-js` scaffold ships Next.js 16. Stack is otherwise unchanged.

## How it works

1. User pastes an arXiv URL on the homepage.
2. **`/api/fetch-paper`** extracts the arXiv ID (handles `abs/`, `pdf/`, `html/`, and bare-ID forms), fetches the rendered HTML from arXiv, falls back to the abstract page if HTML isn't available, strips to plain text, and caps at 30,000 characters.
3. **`/api/generate-playground`** sends the paper to Gemini 2.5 Flash with a system prompt that describes the 12 primitive components and a strict JSON output schema.
4. Gemini emits a `UISpec`: `{ paperTitle, summary, layout, components }`.
5. **`<RenderUI spec={...} />`** renders the spec via a fixed library of 12 primitives:
   - `text_block`, `annotation`, `text_input`, `slider`, `dropdown`, `button`, `heatmap`, `chart` (line / bar / scatter), `image_display`, `graph_viz`, `code_block`, `comparison_pair`.

## What's generative

The agent designs the UI per paper. Three real examples it produces:

- **Attention paper** → `text_block` + `text_input` (sentence) + `dropdown` (head) + `heatmap` (mock_attention) + `annotation`. Type a sentence; switch heads to see proximity vs. first-letter vs. uniform attention.
- **LoRA paper** → `text_block` + `slider` (rank) + `chart` + `comparison_pair` + `annotation`. Drag the rank to see parameter cost vs. capacity.
- **DDPM paper** → `text_block` + `slider` (Noise Level, 0 = clean / 1000 = pure noise) + `image_display` (mock_denoise) + `annotation`. Drag right to add noise, drag left to denoise - the reverse process the model learns.

A unified `state` object in `RenderUI` holds every input value keyed by component id. Every `data_source` function (`mock_attention`, `mock_chart`, `mock_image`, `mock_optimizer_path`, `mock_denoise`, `static`) reads from `state` heuristically - no per-paper hardcoding - so any input the agent emits drives any compatible visualization automatically.

## Local setup

```bash
npm install

# Add to .env.local:
#   GEMINI_API_KEY=...
#   GOOGLE_API_KEY=...

npm run dev
# → http://localhost:3000
```

## Try these papers

- **Transformer** (Attention Is All You Need) - https://arxiv.org/abs/1706.03762
- **LoRA** - https://arxiv.org/abs/2106.09685
- **DDPM** (Denoising Diffusion Probabilistic Models) - https://arxiv.org/abs/2006.11239

## Built for

Generative UI Global Hackathon 2026 - Boston : Solo build.
