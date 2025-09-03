// app/api/assistant/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Vehicle = { year: string; make: string; model: string };

export async function POST(req: Request) {
  try {
    const { vehicle, prompt, dtcCode, image_data, context } = await req.json() as {
      vehicle?: Vehicle;
      prompt?: string;
      dtcCode?: string;
      image_data?: string; // data URL (base64) or external URL
      context?: string; // optional extra detail
    };

    // Basic guard for all modes
    if (!vehicle?.year || !vehicle?.make || !vehicle?.model) {
      return NextResponse.json(
        { error: "Missing vehicle info (year/make/model)." },
        { status: 400 },
      );
    }

    const vdesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    // -------- PHOTO MODE --------
    if (image_data) {
      const system = [
        `You are an automotive repair expert. A technician uploaded a photo from a ${vdesc}.`,
        `Analyze the image and return a concise, helpful markdown answer with sections:`,
        `**Issue**, **Likely Cause**, **Recommended Fix**, **Estimated Labor Time**.`,
      ].join(" ");

      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              context ? { type: "text", text: context } : null,
              { type: "image_url", image_url: { url: image_data } },
            ].filter(Boolean) as any,
          },
        ],
      });

      const result =
        resp.choices?.[0]?.message?.content?.trim() ?? "No analysis.";
      return NextResponse.json({ mode: "photo", result });
    }

    // -------- DTC MODE --------
    if (dtcCode?.trim()) {
      const code = dtcCode.trim().toUpperCase();
      const system =
        `You are a master diagnostic technician. Analyze DTC ${code} for a ${vdesc}. ` +
        `Reply in markdown with **DTC Summary**, **Likely Causes**, **Troubleshooting Steps**, ` +
        `**Recommended Fix**, and **Estimated Labor Time**. Keep it practical.`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.5,
        messages: [
          { role: "system", content: system },
          { role: "user", content: context?.trim() ? context : `Code: ${code}` },
        ],
      });

      const result =
        resp.choices?.[0]?.message?.content?.trim() ?? "No result.";
      return NextResponse.json({ mode: "dtc", result });
    }

    // -------- CHAT MODE --------
    const userPrompt = (prompt ?? "").trim();
    if (!userPrompt) {
      return NextResponse.json(
        { error: "Provide a prompt, DTC, or image." },
        { status: 400 },
      );
    }

    const system =
      `You are a top-level automotive diagnostic expert helping on a ${vdesc}. ` +
      `Reply in clear markdown with **Complaint**, **Likely Causes**, **Recommended Fix**, ` +
      `and **Estimated Labor Time**. Prefer concise, actionable guidance.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        ...(context?.trim() ? [{ role: "user", content: context }] : []),
        { role: "user", content: userPrompt },
      ],
    });

    const result =
      resp.choices?.[0]?.message?.content?.trim() ?? "No response.";
    return NextResponse.json({ mode: "chat", result });
  } catch (err) {
    console.error("Assistant error:", err);
    return NextResponse.json({ error: "Assistant failed." }, { status: 500 });
  }
}