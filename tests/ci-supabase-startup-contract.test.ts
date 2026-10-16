import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const script = join(root, "scripts/ci/disable-supabase-pgdelta.sh");
const workflowDir = join(root, ".github/workflows");

function runScript(config: string): { status: number; config: string } {
  const dir = mkdtempSync(join(tmpdir(), "pgdelta-"));
  const file = join(dir, "config.toml");
  writeFileSync(file, config);
  try {
    execFileSync("bash", [script, file], { stdio: "pipe" });
    return { status: 0, config: readFileSync(file, "utf8") };
  } catch (error) {
    return {
      status: (error as { status?: number }).status ?? 1,
      config: readFileSync(file, "utf8"),
    };
  }
}

describe("CI Supabase startup", () => {
  it("disables pg-delta only inside its own section", () => {
    const { status, config } = runScript(
      [
        "[experimental]",
        "enabled = true",
        "",
        "[experimental.pgdelta]",
        "enabled = true",
        'declarative_schema_path = "./database"',
        "",
        "[other]",
        "enabled = true",
        "",
      ].join("\n"),
    );
    expect(status).toBe(0);
    expect(config).toContain("[experimental]\nenabled = true");
    expect(config).toContain("[experimental.pgdelta]\nenabled = false");
    expect(config).toContain("[other]\nenabled = true");
  });

  it("is idempotent and tolerates configs without pg-delta", () => {
    expect(runScript("[experimental.pgdelta]\nenabled = false\n").status).toBe(0);
    const absent = runScript("[db]\nport = 54322\n");
    expect(absent.status).toBe(0);
    expect(absent.config).toBe("[db]\nport = 54322\n");
  });

  it("keeps the committed config untouched by the script", () => {
    const committed = readFileSync(join(root, "supabase/config.toml"), "utf8");
    expect(committed).toMatch(/\[experimental\.pgdelta\]\s*\nenabled = true/);
  });

  it("is invoked before every workflow that starts the local database", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(workflowDir).filter((n) => n.endsWith(".yml"))) {
      const text = readFileSync(join(workflowDir, name), "utf8");
      const start = text.search(/supabase db start/);
      if (start === -1) continue;
      const disable = text.indexOf("scripts/ci/disable-supabase-pgdelta.sh");
      // Workflows intentionally left alone must still be explicit about it.
      if (name === "temporary-lifecycle-typegen.yml") continue;
      if (disable === -1 || disable > start) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps clean replay migrating and replaying the full chain", () => {
    const text = readFileSync(
      join(workflowDir, "supabase-clean-replay-audit.yml"),
      "utf8",
    );
    expect(text).toContain("supabase db start");
    expect(text).toContain("supabase db reset --local --no-seed");
    expect(text).toContain("verify-supabase-generated-types.sh --check");
    expect(text).toContain("scripts/ci/check-sql-syntax.py");
  });
});
