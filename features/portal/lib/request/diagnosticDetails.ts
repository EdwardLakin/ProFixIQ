export type DiagnosticDetails = {
  concern: string;
  timing?: string | null;
  frequency?: string | null;
  conditions?: string | null;
  warningLights?: string | null;
  drivable?: "yes" | "no" | "unsure" | null;
  additionalNotes?: string | null;
};

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildDiagnosticRequestNotes(input: DiagnosticDetails): string {
  const rows = [
    ["When it happens", input.timing],
    ["How often", input.frequency],
    ["Conditions", input.conditions],
    ["Warning lights / codes", input.warningLights],
    ["Safe to drive", input.drivable],
    ["Customer notes", input.additionalNotes],
  ] as const;

  return rows
    .map(([label, value]) => [label, clean(value)].join(": "))
    .filter((row) => !row.endsWith(": "))
    .join("\n");
}

export function diagnosticRequestIsComplete(input: DiagnosticDetails): boolean {
  return clean(input.concern).length >= 3;
}

