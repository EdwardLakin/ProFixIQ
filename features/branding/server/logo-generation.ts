import OpenAI from "openai";

export type LogoPreset =
  | "industrial-dark"
  | "clean-oem"
  | "performance"
  | "fleet-utility"
  | "modern-tech";

type BuildLogoPromptInput = {
  shopName?: string | null;
  prompt: string;
  stylePreset?: string | null;
};

const PRESET_GUIDANCE: Record<LogoPreset, string> = {
  "industrial-dark":
    "Industrial premium aesthetic. Dark metallic feel, sharp geometry, strong contrast, rugged but refined.",
  "clean-oem":
    "Clean OEM service aesthetic. Minimal, trustworthy, modern, dealership-grade, balanced spacing.",
  performance:
    "Performance motorsport aesthetic. Bold, aggressive, fast, energetic, modern speed-driven design.",
  "fleet-utility":
    "Fleet and utility aesthetic. Durable, professional, dependable, commercial-grade, clear and strong forms.",
  "modern-tech":
    "Modern tech aesthetic. Sleek, minimal, futuristic, software-forward, polished and precise.",
};

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({ apiKey });
}

export function buildLogoPrompt(input: BuildLogoPromptInput): string {
  const preset = (input.stylePreset?.trim() || "industrial-dark") as LogoPreset;
  const presetGuidance = PRESET_GUIDANCE[preset] ?? PRESET_GUIDANCE["industrial-dark"];
  const shopName = input.shopName?.trim() || "ProFixIQ Shop";
  const userPrompt = input.prompt.trim();

  return [
    `Create a professional automotive repair shop logo for the brand "${shopName}".`,
    presetGuidance,
    `User creative direction: ${userPrompt}.`,
    "Output a clean, premium logo mark suitable for SaaS dashboard branding, invoice headers, inspection PDFs, and customer portal use.",
    "Design requirements:",
    "- centered composition",
    "- transparent or very clean background look",
    "- strong silhouette",
    "- legible at small sizes",
    "- no mockup walls, paper, business cards, shirts, buildings, or 3D scene staging",
    "- no photorealistic environment",
    "- avoid clutter and tiny unreadable text",
    "- prefer icon + wordmark or strong standalone emblem",
    "- automotive / shop appropriate but not childish",
    "Deliver a polished production-ready logo image."
  ].join("\n");
}
