// app/api/chatbot/route.ts
import { NextResponse } from "next/server";
import { openai } from "lib/server/openai";

type Variant = "marketing" | "full";
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function guardrailSystem(variant: Variant): string {
  if (variant === "marketing") {
    return `You are TechBot for ProFixIQ on the public landing page.
Answer ONLY questions about ProFixIQ: features, pricing, plans, roles, onboarding, and how the app works.
Refuse anything about private data, diagnostics for a specific car, or taking actions inside the product.
Keep answers brief and helpful.`;
  }
  return `You are TechBot for ProFixIQ inside the app.
Help with diagnostics, inspections, work orders, quotes, parts, and app navigation.
When relevant, suggest the next action within the app. Keep answers clear and mechanic-friendly.`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: ChatMessage[]; variant?: Variant };

    // ✅ Only allow the marketing bot to use this endpoint
    const variant: Variant = body?.variant === "marketing" ? "marketing" : "full";
    if (variant !== "marketing") {
      return NextResponse.json({ error: "This assistant is only available on the landing page." }, { status: 403 });
    }

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const safeMsgs: ChatMessage[] = [
      { role: "system", content: guardrailSystem("marketing") },
      ...messages.filter(m => m && typeof m.content === "string").map(m => ({ role: m.role, content: m.content })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: safeMsgs,
      temperature: 0.4,
      max_tokens: 600,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate a response.";
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "The assistant is not available right now." }, { status: 500 });
  }
}

export const runtime = "nodejs";