// features/integrations/ai/shopBoost/csv.ts
export function parseCsvText(csv: string): Array<Record<string, unknown>> {
  const text = csv.replace(/^\uFEFF/, ""); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c] ?? `col_${c}`] = vals[c] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

// minimal CSV parser (handles quoted commas)
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      // toggle quotes unless it's doubled quote inside quoted value
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((v) => v.trim());
}