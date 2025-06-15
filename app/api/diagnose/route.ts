import { NextResponse } from "next/server";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

export async function POST(req: Request) {
  try {
    const { code, vehicle } = await req.json();

    if (!code || !vehicle) {
      return NextResponse.json(
        { error: "Missing code or vehicle info" },
        { status: 400 },
      );
    }

    const vehicleStr = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const prompt = `You are an expert automotive technician. The user has provided a DTC code and vehicle information.\n\nVehicle: ${vehicleStr}\nCode: ${code}\n\nExplain what the code means, how serious it is, common causes, and recommended diagnostic steps. Be concise but thorough.`;

    const res = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert auto technician." },
        { role: "user", content: prompt },
      ],
    });

    const result =
      res.data.choices[0]?.message?.content || "No result returned.";
    return NextResponse.json({ result });
  } catch (err) {
    console.error("DTC Diagnose API Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
