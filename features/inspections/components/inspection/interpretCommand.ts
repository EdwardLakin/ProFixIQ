// src/lib/inspection/interpretCommand.ts

import { ParsedCommand } from "@inspections/lib/inspection/types";

export const interpretCommand = async (
  transcript: string,
): Promise<ParsedCommand[]> => {
  try {
    const response = await fetch("/api/ai/interpret", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) {
      console.error("Interpretation request failed");
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.warn("Unexpected AI response format:", data);
      return [];
    }

    return data as ParsedCommand[];
  } catch (error) {
    console.error("Interpretation error:", error);
    return [];
  }
};
