// app/api/ai/summarize-tech-performance/route.ts
import { NextResponse } from "next/server";
import { openai } from "lib/server/openai";

type Range = "weekly" | "monthly" | "quarterly" | "yearly";

type TechRow = {
  name: string;
  jobs: number;
  revenue: number;
  laborCost: number;
  profit: number;
  billedHours: number;
  clockedHours: number;
  revenuePerHour: number;
  efficiencyPct: number;
};

type Payload = {
  timeRange: Range;
  tech: TechRow | null;
  peers: TechRow[]; // all rows for this shop/range (including tech)
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const { timeRange, tech, peers } = body;

    if (!tech) {
      return NextResponse.json(
        { summary: "No performance data available for this technician yet." },
        { status: 200 },
      );
    }

    const timeLabel =
      timeRange === "weekly"
        ? "this week"
        : timeRange === "monthly"
          ? "this month"
          : timeRange === "quarterly"
            ? "this quarter"
            : "this year";

    // Build a compact numeric context for the model
    const peerCount = peers.length;
    const totalPeerRevenue = peers.reduce((acc, p) => acc + p.revenue, 0);
    const avgPeerRevenue =
      peerCount > 0 ? totalPeerRevenue / peerCount : 0;

    const totalPeerEff = peers.reduce(
      (acc, p) => acc + (Number.isFinite(p.efficiencyPct) ? p.efficiencyPct : 0),
      0,
    );
    const avgPeerEff =
      peerCount > 0 ? totalPeerEff / peerCount : 0;

    const userPrompt = [
      `You are helping an auto repair shop summarize one technician's performance ${timeLabel}.`,
      "",
      `Technician: ${tech.name || "Unnamed tech"}`,
      `Jobs: ${tech.jobs}`,
      `Revenue: ${tech.revenue.toFixed(2)}`,
      `Labor cost: ${tech.laborCost.toFixed(2)}`,
      `Profit: ${tech.profit.toFixed(2)}`,
      `Clocked hours: ${tech.clockedHours.toFixed(2)}`,
      `Billed hours: ${tech.billedHours.toFixed(2)}`,
      `Revenue per hour: ${tech.revenuePerHour.toFixed(2)}`,
      `Efficiency (%): ${tech.efficiencyPct.toFixed(1)}`,
      "",
      `Peer techs in same shop for ${timeLabel}: ${peerCount}`,
      `Average peer revenue: ${avgPeerRevenue.toFixed(2)}`,
      `Average peer efficiency: ${avgPeerEff.toFixed(1)}%`,
      "",
      "Write a short, plain-language summary (3–5 sentences) for the technician themselves.",
      "Focus on:",
      "- how they are doing overall,",
      "- where they appear above or below the peer average, and",
      "- one or two simple, actionable suggestions.",
      "Do NOT use bullet points. Keep it under 120 words. No greetings or sign-offs.",
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 260,
      messages: [
        {
          role: "system",
          content:
            "You are an auto repair shop performance coach. You speak clearly and concisely to technicians about their numbers.",
        },
        { role: "user", content: userPrompt },
      ],
    });

    const summary =
      completion.choices[0]?.message?.content?.trim() ??
      "No AI summary could be generated.";

    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[AI] summarize-tech-performance error:", error);
    return NextResponse.json(
      { error: "Failed to generate AI tech summary." },
      { status: 500 },
    );
  }
}