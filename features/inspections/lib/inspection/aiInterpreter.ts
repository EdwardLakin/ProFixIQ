import { ParsedCommand } from "@shared/lib/inspection/types";

export default async function interpretCommand(
  transcript: string,
): Promise<ParsedCommand[]> {
  const response = await fetch("/api/ai/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });

  if (!response.ok) {
    throw new Error("AI interpretation failed");
  }

  const data = await response.json();
  return data as ParsedCommand[];
}
