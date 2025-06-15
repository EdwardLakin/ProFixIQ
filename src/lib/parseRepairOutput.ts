// src/lib/parseRepairOutput.ts

export type RepairLine = {
  complaint: string;
  cause?: string;
  correction?: string;
  tools?: string[];
  labor_time?: string;
};

export function parseRepairOutput(raw: string): RepairLine[] {
  const lines: RepairLine[] = [];

  const entries = raw
    .split(/\n{2,}/) // split by double newlines (each repair block)
    .filter(Boolean);

  for (const entry of entries) {
    const complaint = entry.match(/Complaint:\s*(.*)/i)?.[1]?.trim();
    const cause = entry.match(/Cause:\s*(.*)/i)?.[1]?.trim();
    const correction = entry.match(/Correction:\s*(.*)/i)?.[1]?.trim();
    const toolsRaw = entry.match(/Tools:\s*(.*)/i)?.[1]?.trim();
    const labor = entry.match(/Labor(?: Time)?:\s*(.*)/i)?.[1]?.trim();

    if (complaint) {
      lines.push({
        complaint,
        cause,
        correction,
        tools: toolsRaw ? toolsRaw.split(",").map((t) => t.trim()) : [],
        labor_time: labor,
      });
    }
  }

  return lines;
}
