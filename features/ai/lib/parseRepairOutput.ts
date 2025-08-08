// src/lib/parseRepairOutput.ts

export type RepairLine = {
  id?: string; // optional for parsing, required when syncing with DB
  complaint: string;
  cause?: string;
  correction?: string;
  tools?: string; // must be a single string for DB
  labor_time?: number; // parsed as number
  status?: "unassigned" | "assigned" | "in_progress" | "on_hold" | "completed";
  hold_reason?: "parts" | "authorization" | "diagnosis_pending" | "other" | "";
};

export function parseRepairOutput(raw: string): RepairLine[] {
  const lines: RepairLine[] = [];

  const entries = raw
    .split(/\n{2,}/) // double newline = new repair block
    .filter(Boolean);

  for (const entry of entries) {
    const complaint = entry.match(/Complaint:\s*(.*)/i)?.[1]?.trim();
    const cause = entry.match(/Cause:\s*(.*)/i)?.[1]?.trim();
    const correction = entry.match(/Correction:\s*(.*)/i)?.[1]?.trim();
    const toolsRaw = entry.match(/Tools:\s*(.*)/i)?.[1]?.trim();
    const laborRaw = entry.match(/Labor(?: Time)?:\s*(.*)/i)?.[1]?.trim();

    const tools = toolsRaw
      ? toolsRaw
          .split(",")
          .map((t) => t.trim())
          .join(", ")
      : undefined;
    const labor_time = laborRaw ? parseFloat(laborRaw) : undefined;

    if (complaint) {
      lines.push({
        complaint,
        cause,
        correction,
        tools,
        labor_time,
        status: "unassigned",
      });
    }
  }

  return lines;
}
