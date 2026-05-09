// POST /api/fetch-paper  { url: string } → { title, text }
//
// Path note: requested at app/api/fetch-paper/route.ts; placed under
// src/app/ because this scaffold's app router lives there.

import { NextResponse } from "next/server";

const MAX_TEXT = 30_000;
const UA = "paper-to-playground/0.1 (hackathon demo)";

// New format covers ~all arXiv IDs from 2007 onward.
const NEW_ID = /(\d{4}\.\d{4,5})(?:v\d+)?/;
// Legacy format like "cs.LG/9912345" — rare but cheap to handle.
const OLD_ID = /([a-z\-]+(?:\.[A-Z]{2})?\/\d{7})/;

function extractArxivId(input: string): string | null {
  const s = input.trim();
  const m = s.match(NEW_ID) ?? s.match(OLD_ID);
  return m ? m[1] : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string | null {
  // citation_title is the most reliable on /abs and usually present on /html
  const meta =
    html.match(
      /<meta\s+name=["']citation_title["']\s+content=["']([^"']+)["']/i,
    ) ||
    html.match(
      /<meta\s+content=["']([^"']+)["']\s+name=["']citation_title["']/i,
    );
  if (meta) return decodeEntities(meta[1]).trim();

  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) {
    return decodeEntities(t[1])
      .replace(/\s+/g, " ")
      // arXiv's <title> often starts with "[2301.12345] " — drop it
      .replace(/^\[?\d{4}\.\d{4,5}v?\d*\]?\s+/, "")
      .trim();
  }
  return null;
}

function extractAbstract(html: string): string | null {
  // /abs pages put the abstract in <blockquote class="abstract mathjax">
  const bq = html.match(
    /<blockquote[^>]*class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/i,
  );
  if (bq) {
    const inner = bq[1]
      .replace(
        /<span[^>]*class=["'][^"']*descriptor[^"']*["'][^>]*>[\s\S]*?<\/span>/i,
        "",
      )
      .replace(/<[^>]+>/g, " ");
    return decodeEntities(inner).replace(/\s+/g, " ").trim();
  }
  // og:description is a reliable backup that sometimes carries the abstract.
  const og = html.match(
    /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
  );
  if (og) return decodeEntities(og[1]).trim();
  return null;
}

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const marker = "\n\n[…truncated…]\n\n";
  const room = max - marker.length;
  const head = Math.floor(room / 2);
  const tail = room - head;
  return s.slice(0, head) + marker + s.slice(s.length - tail);
}

export async function POST(req: Request) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url : "";
  if (!url) {
    return NextResponse.json(
      { error: "Missing or non-string 'url' field" },
      { status: 400 },
    );
  }

  const id = extractArxivId(url);
  if (!id) {
    return NextResponse.json(
      { error: `Could not extract an arXiv ID from: ${url}` },
      { status: 400 },
    );
  }

  // 1) Try the rendered HTML — full body text, what we want for the agent.
  try {
    const r = await fetch(`https://arxiv.org/html/${id}`, {
      headers: { "User-Agent": UA },
    });
    if (r.ok) {
      const html = await r.text();
      const title = extractTitle(html) ?? `arXiv:${id}`;
      const text = stripHtml(html);
      // Some IDs without a rendered HTML build serve a tiny stub page.
      // If we got <500 chars after stripping, treat as missing and fall
      // through to the /abs fallback.
      if (text.length > 500) {
        return NextResponse.json({
          title,
          text: truncateMiddle(text, MAX_TEXT),
        });
      }
    }
  } catch (err) {
    // Network failure — fall through to /abs fallback rather than 500'ing
    // immediately; /abs is a smaller, more stable endpoint.
    // eslint-disable-next-line no-console
    console.error("[fetch-paper] html fetch error:", err);
  }

  // 2) Fallback: /abs page → title + abstract.
  try {
    const r = await fetch(`https://arxiv.org/abs/${id}`, {
      headers: { "User-Agent": UA },
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `arXiv returned ${r.status} for /abs/${id}` },
        { status: 500 },
      );
    }
    const html = await r.text();
    const title = extractTitle(html) ?? `arXiv:${id}`;
    const abstract = extractAbstract(html);
    const text = abstract ? `${title}\n\n${abstract}` : stripHtml(html);
    return NextResponse.json({
      title,
      text: truncateMiddle(text, MAX_TEXT),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Failed to fetch arXiv: ${msg}` },
      { status: 500 },
    );
  }
}
