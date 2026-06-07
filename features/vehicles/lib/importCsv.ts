export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  headers: string[];
  rows: CsvRow[];
  skippedBlankRows: number;
};

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseCsv(text: string): CsvParseResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerLine = lines.shift() ?? "";
  const headers = parseLine(headerLine).map((header) => header.trim()).filter(Boolean);
  let skippedBlankRows = 0;
  const rows = lines.reduce<CsvRow[]>((acc, line) => {
    if (!line.trim()) {
      skippedBlankRows += 1;
      return acc;
    }
    const cells = parseLine(line);
    const row = headers.reduce<CsvRow>((next, header, index) => {
      next[header] = cells[index]?.trim() ?? "";
      return next;
    }, {});
    acc.push(row);
    return acc;
  }, []);
  return { headers, rows, skippedBlankRows };
}

export function normalizeCsvHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
