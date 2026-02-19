import { NextResponse } from "next/server";
// IMPORTANT: use your alias-based import so Vercel resolves it consistently.
// If your project uses a different alias, adjust this one line.
import { openai } from "lib/server/openai";

type Variant = "marketing" | "full";
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function guardrailSystem(variant: Variant): string {
  if (variant === "marketing") {
    return `You are TechBot for ProFixIQ on the public landing page.
Answer ONLY questions about ProFixIQ: features, pricing, plans, roles, onboarding, and how the app works.
Refuse anything about private data, diagnostics for a specific vehicle, or taking actions inside the product.
Keep answers brief and helpful.`;
  }

  return `You are TechBot for ProFixIQ inside the app.
Help with diagnostics, inspections, work orders, quotes, parts, and app navigation.
When relevant, suggest the next action within the app. Keep answers clear and mechanic-friendly.`;
}

function asSafeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];

  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;

    if (
      (role === "system" || role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.trim().length > 0
    ) {
      out.push({ role, content: content.trim() });
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: unknown; variant?: unknown };

    // ✅ Only allow the marketing bot to use this endpoint
    const variant: Variant = body?.variant === "marketing" ? "marketing" : "full";
    if (variant !== "marketing") {
      return NextResponse.json(
        { error: "This assistant is only available on the public landing page." },
        { status: 403 },
      );
    }

    const incoming = asSafeMessages(body?.messages);

    // Avoid double-system messages: always force our guardrail system at the top,
    // then include user/assistant history (excluding any system message the client sent).
    const safeMsgs: ChatMessage[] = [
      { role: "system", content: guardrailSystem("marketing") },
      ...incoming.filter((m) => m.role !== "system"),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: safeMsgs,
      temperature: 0.4,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I couldn't generate a response.";

    return NextResponse.json({ reply });
  } catch (err) {
    // ALWAYS return JSON (so the client never falls into “json parse failed”)
    console.error("[/api/chatbot] error", err);

    return NextResponse.json(
      {
        error:
          "TechBot is unavailable right now. If this keeps happening, it’s usually a server config issue (missing API key or bad import path).",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";