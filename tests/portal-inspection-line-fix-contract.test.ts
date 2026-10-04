import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r", "");

const fix = read("supabase/migrations/20261004200000_fix_portal_inspection_line.sql");
const previous = read("supabase/migrations/20261004192655_refuse_portal_info_lines.sql");
const generatedTypes = read("features/shared/types/types/supabase.ts");

function definition(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  return source.slice(start, end + 4);
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("portal inspection line fix", () => {
  it("has no DROP statements and no grant changes", () => {
    expect(fix).not.toMatch(/^\s*drop\s/im);
    expect(fix).not.toMatch(/\b(grant|revoke)\b/i);
  });

  it("reads only columns that exist on inspection_templates", () => {
    const body = definition(fix, "add_portal_request_line_atomic");
    for (const missing of ["v_template.is_active", "v_template.name", "v_template.title"]) {
      expect(body).not.toContain(missing);
    }
    expect(body).toContain("v_template.template_name");
    expect(body).toContain("v_template.description");

    // The columns the function reads are real columns of the generated table type.
    const start = generatedTypes.indexOf("      inspection_templates: {");
    const row = generatedTypes.slice(start, generatedTypes.indexOf("Insert:", start));
    expect(row).toContain("template_name:");
    expect(row).toContain("description:");
    expect(row).not.toContain("is_active:");
  });

  it("changes nothing else in add_portal_request_line_atomic", () => {
    const before = definition(previous, "add_portal_request_line_atomic");
    const after = definition(fix, "add_portal_request_line_atomic");
    const restored = after.replace(
      "\n    v_description := coalesce(\n      nullif(trim(v_template.template_name), ''),\n      nullif(trim(v_template.description), ''),\n      'Inspection'\n    );\n",
      "    if v_template.is_active is false then\n      raise exception using errcode = 'P0001', message = 'Inspection template is inactive.';\n    end if;\n\n    v_description := coalesce(\n      nullif(trim(v_template.name), ''),\n      nullif(trim(v_template.title), ''),\n      nullif(trim(v_template.description), ''),\n      'Inspection'\n    );\n",
    );
    expect(normalize(restored)).toBe(normalize(before));
  });

  it("keeps the function security definer with a pinned search_path", () => {
    const body = definition(fix, "add_portal_request_line_atomic");
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = public");
  });

  it("is exercised by a runtime test in the clean replay workflow", () => {
    expect(read(".github/workflows/supabase-clean-replay-audit.yml")).toContain(
      "tests/security/portal-inspection-line.runtime.sql",
    );
    const runtime = read("tests/security/portal-inspection-line.runtime.sql");
    for (const covered of [
      "Seasonal safety inspection",
      "Description only template",
      "Inspection template not found for this shop.",
      "named_replay",
    ]) {
      expect(runtime).toContain(covered);
    }
  });
});
