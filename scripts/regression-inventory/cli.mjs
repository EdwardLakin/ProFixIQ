#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_BASELINE_PATH,
  DEFAULT_FLOW_CONFIG_PATH,
  DEFAULT_SCHEMA_PATH,
  assertReadableFile,
  baselineSnapshot,
  buildInventory,
  compareWithBaseline,
  loadBaseline,
  renderMarkdown,
} from "./lib.mjs";

function usage() {
  return `Usage: node scripts/regression-inventory/cli.mjs [options]

Options:
  --check                 Fail when an error is not in the committed baseline
  --strict                Fail when any current error exists
  --write-baseline        Replace the baseline with the current static findings
  --schema <path>         Supabase generated-types contract
  --flows <path>          Critical-flow manifest
  --baseline <path>       Known-finding baseline
  --logs <path>           Optional JSON/NDJSON production log export
  --output-dir <path>     Report directory (default: artifacts/regression-inventory)
  --help                  Show this help
`;
}

function parseArgs(argv) {
  const options = {
    check: false,
    strict: false,
    writeBaseline: false,
    schema: DEFAULT_SCHEMA_PATH,
    flows: DEFAULT_FLOW_CONFIG_PATH,
    baseline: DEFAULT_BASELINE_PATH,
    logs: null,
    outputDir: "artifacts/regression-inventory",
  };
  const valueOptions = new Map([
    ["--schema", "schema"],
    ["--flows", "flows"],
    ["--baseline", "baseline"],
    ["--logs", "logs"],
    ["--output-dir", "outputDir"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      process.stdout.write(usage());
      process.exit(0);
    }
    if (argument === "--check") options.check = true;
    else if (argument === "--strict") options.strict = true;
    else if (argument === "--write-baseline") options.writeBaseline = true;
    else if (valueOptions.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      options[valueOptions.get(argument)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (options.writeBaseline && options.logs) {
    throw new Error("Refusing to baseline volatile production log findings");
  }
  return options;
}

function main() {
  const rootDir = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  assertReadableFile(rootDir, options.schema, "Schema contract");
  assertReadableFile(rootDir, options.flows, "Critical-flow manifest");
  if (options.logs) assertReadableFile(rootDir, options.logs, "Log export");

  const inventory = buildInventory({
    rootDir,
    schemaPath: options.schema,
    flowConfigPath: options.flows,
    logPath: options.logs,
  });

  let baseline = loadBaseline(rootDir, options.baseline);
  if (options.check && !baseline) {
    throw new Error(
      `Baseline required for --check but not found: ${options.baseline}`,
    );
  }

  if (options.writeBaseline) {
    const baselinePath = path.resolve(rootDir, options.baseline);
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(
      baselinePath,
      `${JSON.stringify(baselineSnapshot(inventory), null, 2)}\n`,
      "utf8",
    );
    baseline = loadBaseline(rootDir, options.baseline);
  }

  const compared = compareWithBaseline(inventory, baseline);
  const outputDir = path.resolve(rootDir, options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "inventory.json");
  const markdownPath = path.join(outputDir, "summary.md");
  writeFileSync(jsonPath, `${JSON.stringify(compared, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(compared), "utf8");

  const summary = [
    `Regression inventory: ${compared.summary.sourceFiles} source files, ${compared.summary.pages} pages, ${compared.summary.apiRoutes} API routes`,
    `Contracts: ${compared.summary.relationsUsed} relations, ${compared.summary.rpcsUsed} RPCs, ${compared.summary.dynamicReferences} dynamic references`,
    `Findings: ${compared.comparison.newErrors} new errors, ${compared.comparison.existingErrors} existing errors, ${compared.comparison.newWarnings} new warnings, ${compared.comparison.existingWarnings} existing warnings, ${compared.comparison.resolved} resolved baseline entries`,
    `Critical flows: ${compared.summary.criticalFlows - compared.summary.criticalFlowGaps}/${compared.summary.criticalFlows} covered`,
    `Reports: ${path.relative(rootDir, markdownPath)}, ${path.relative(rootDir, jsonPath)}`,
  ];
  process.stdout.write(`${summary.join("\n")}\n`);

  if (
    options.check &&
    (compared.comparison.newErrors > 0 ||
      compared.comparison.resolved > 0 ||
      compared.comparison.expired > 0)
  ) {
    process.exitCode = 1;
  }
  if (options.strict && compared.summary.errors > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `Regression inventory failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
