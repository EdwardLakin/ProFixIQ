// app/api/chatbot/route.ts
import { NextResponse } from "next/server";
import { openai } from "lib/server/openai";

type Variant = "marketing" | "full";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

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
    // basic payload validation
    const body = (await req.json()) as {
      messages?: ChatMessage[];
      variant?: Variant;
    };

    const variant: Variant = body?.variant === "marketing" ? "marketing" : "full";
    const messages = Array.isArray(body?.messages) ? body!.messages : [];

    // Reinforce a fresh system message server-side (first one in array wins)
    const system: ChatMessage = { role: "system", content: guardrailSystem(variant) };

    // Filter only roles we allow and coerce to OpenAI format
    const safeMsgs = [system, ...messages.filter(m => m && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content }))] as ChatMessage[];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: safeMsgs,
      temperature: variant === "marketing" ? 0.4 : 0.6,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I couldn't generate a response.";

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    // Common helpful error texts
    let message = "Unexpected error.";
    if (err && typeof err === "object" && "message" in err) {
      message = String((err as any).message);
    }

    // Hide leak-y messages in production
    if (/api key/i.test(message) || /401|403/.test(message)) {
      message = "The assistant is not available right now.";
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Use Node runtime (OpenAI SDK is great here)
export const runtime = "nodejs";