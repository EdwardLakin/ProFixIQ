import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const DEFAULT_SCHEMA_PATH = "features/shared/types/types/supabase.ts";
export const DEFAULT_FLOW_CONFIG_PATH =
  "scripts/regression-inventory/critical-flows.json";
export const DEFAULT_BASELINE_PATH =
  "scripts/regression-inventory/baseline.json";

const SOURCE_ROOTS = [
  "app",
  "features",
  "components",
  "hooks",
  "lib",
  "shared",
  "scripts",
  "supabase/functions",
];

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const QUERY_METHODS = new Set([
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
  "overlaps",
  "match",
  "not",
  "or",
  "filter",
  "order",
  "limit",
  "range",
  "single",
  "maybeSingle",
  "throwOnError",
]);

const COLUMN_METHODS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
  "overlaps",
  "not",
  "filter",
  "order",
  "textSearch",
]);

const NON_DATABASE_FROM_RECEIVERS = new Set([
  "Array",
  "Buffer",
  "Object",
  "Reflect",
  "String",
  "Uint8Array",
]);

const DOMAIN_RULES = [
  [
    "parts",
    /(?:^|\/)(?:parts?|inventory|purchase-orders?|vendors?)(?:\/|[-_.])/,
  ],
  ["quotes-approvals", /(?:quote|estimate|approval)/],
  ["work-orders", /(?:work[-_]?orders?|repair[-_]?orders?)/],
  ["inspections", /inspection/],
  ["financial", /(?:invoice|payment|financial|stripe|billing|quickbooks)/],
  ["messaging", /(?:message|chat|notification|sendgrid|email)/],
  ["fleet", /fleet/],
  ["customer-portal", /(?:customer[-_]?portal|portal[-_]?customer)/],
  ["technician", /(?:technician|mobile|offline|labor|job[-_]?clock)/],
  ["workforce", /(?:workforce|payroll|attendance|punch|shift)/],
  [
    "ai-automation",
    /(?:^|\/)(?:ai|agent|optimization|shop[-_]?boost)(?:\/|[-_.])/,
  ],
  ["reporting", /(?:report|export|analytics|dashboard|pdf)/],
  ["property", /(?:^|\/)property(?:\/|[-_.])/],
  ["imports", /(?:import|csv)/],
  ["identity-tenancy", /(?:auth|membership|profile|shops?|users?|settings)/],
  ["scheduling", /(?:booking|calendar|schedule)/],
];

const LOG_RULES = [
  {
    id: "runtime-schema-column-missing",
    severity: "error",
    domain: "schema-contract",
    flowId: "schema.consumer-contract",
    title: "Runtime query references a missing column",
    pattern:
      /(?:column\s+[^\n]+\s+does not exist|could not find the ["'][^"']+["'] column|\bPGRST204\b|\b42703\b)/i,
  },
  {
    id: "runtime-schema-relation-missing",
    severity: "error",
    domain: "schema-contract",
    flowId: "schema.consumer-contract",
    title: "Runtime query references a missing relation",
    pattern: /(?:relation\s+[^\n]+\s+does not exist|\bPGRST205\b|\b42P01\b)/i,
  },
  {
    id: "runtime-rpc-signature-missing",
    severity: "error",
    domain: "schema-contract",
    flowId: "schema.consumer-contract",
    title: "Runtime RPC name or signature is missing",
    pattern: /(?:could not find the function|\bPGRST202\b|\b42883\b)/i,
  },
  {
    id: "runtime-parts-po-unresolved-item",
    severity: "error",
    domain: "parts",
    flowId: "parts.request-to-po",
    title: "Purchase order request item has no selected inventory part",
    pattern: /request item has no selected inventory part/i,
  },
  {
    id: "runtime-notification-acknowledgement",
    severity: "error",
    domain: "messaging",
    flowId: "messaging.notification-acknowledgement",
    title: "Notification acknowledgement persistence failed",
    pattern:
      /(?:notification[^\n]*(?:acknowledg|constraint)|acknowledg[^\n]*notification)/i,
  },
  {
    id: "runtime-rls-denied",
    severity: "error",
    domain: "security",
    flowId: "tenant.auth-role-boundary",
    title: "Row-level security rejected an operation",
    pattern: /(?:row-level security|row level security)/i,
  },
  {
    id: "runtime-invoice-cost-rpc-permission",
    severity: "error",
    domain: "financial",
    flowId: "invoices.ready-finalize-send",
    title: "Invoice cost recomputation RPC permission drifted",
    pattern: /permission denied[^\n]*recompute_live_invoice_costs/i,
  },
  {
    id: "runtime-permission-denied",
    severity: "error",
    domain: "security",
    flowId: "tenant.auth-role-boundary",
    title: "Database permission was denied",
    pattern: /(?:permission denied|\b42501\b)/i,
  },
  {
    id: "runtime-constraint-violation",
    severity: "error",
    domain: "data-integrity",
    flowId: "schema.consumer-contract",
    title: "Database constraint rejected an operation",
    pattern: /(?:violates[^\n]*constraint|\b2350[235]\b|\b23514\b)/i,
  },
  {
    id: "runtime-invalid-filter",
    severity: "error",
    domain: "schema-contract",
    flowId: "schema.consumer-contract",
    title: "Runtime query sent an invalid filter",
    pattern: /(?:failed to parse filter|invalid filter|unexpected.*operator)/i,
  },
  {
    id: "runtime-http-5xx",
    severity: "error",
    domain: "runtime",
    flowId: "observability.correlation-failure-sink",
    title: "Application or API returned a server error",
    pattern: /(?:\bstatus(?:_code)?["':=\s]+5\d\d\b|\bHTTP\s+5\d\d\b)/i,
  },
];

const SOURCE_INITIALIZERS = new WeakMap();

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function getPropertyName(node) {
  if (!node?.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) {
    return node.name.text;
  }
  if (ts.isNumericLiteral(node.name)) return node.name.text;
  return null;
}

function asTypeLiteral(node) {
  return node && ts.isTypeLiteralNode(node) ? node : null;
}

function findTypeMember(typeNode, name) {
  const literal = asTypeLiteral(typeNode);
  if (!literal) return null;
  return (
    literal.members.find((member) => getPropertyName(member) === name) ?? null
  );
}

function propertyNames(typeNode) {
  const literal = asTypeLiteral(typeNode);
  if (!literal) return [];
  return literal.members
    .map((member) => getPropertyName(member))
    .filter((name) => name !== null);
}

function parseFunctionContract(functionMember) {
  const contracts = ts.isUnionTypeNode(functionMember.type)
    ? functionMember.type.types
    : [functionMember.type];
  const signatures = [];
  for (const contractType of contracts) {
    const contract = asTypeLiteral(contractType);
    const argsMember = contract ? findTypeMember(contract, "Args") : null;
    const argsType = argsMember?.type;
    const args = new Set();
    const requiredArgs = new Set();
    if (argsType && ts.isTypeLiteralNode(argsType)) {
      for (const member of argsType.members) {
        const name = getPropertyName(member);
        if (!name) continue;
        args.add(name);
        if (!member.questionToken) requiredArgs.add(name);
      }
    }
    signatures.push({ args, requiredArgs });
  }
  return { signatures };
}

export function parseSchemaTypes(schemaPath) {
  const source = readFileSync(schemaPath, "utf8");
  const sourceFile = ts.createSourceFile(
    schemaPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const databaseAlias = sourceFile.statements.find(
    (statement) =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === "Database",
  );

  if (!databaseAlias || !ts.isTypeLiteralNode(databaseAlias.type)) {
    throw new Error(`Database type alias not found in ${schemaPath}`);
  }

  const publicMember = findTypeMember(databaseAlias.type, "public");
  const publicType = publicMember?.type;
  const tablesMember = findTypeMember(publicType, "Tables");
  const viewsMember = findTypeMember(publicType, "Views");
  const functionsMember = findTypeMember(publicType, "Functions");
  const enumsMember = findTypeMember(publicType, "Enums");

  if (!tablesMember || !functionsMember) {
    throw new Error(
      `Public Tables/Functions contract not found in ${schemaPath}`,
    );
  }

  const relations = new Map();
  const addRelations = (container, kind) => {
    const literal = asTypeLiteral(container?.type);
    if (!literal) return;
    for (const member of literal.members) {
      const name = getPropertyName(member);
      const relationType = asTypeLiteral(member.type);
      if (!name || !relationType) continue;
      const row = findTypeMember(relationType, "Row");
      const insert = findTypeMember(relationType, "Insert");
      const update = findTypeMember(relationType, "Update");
      relations.set(name, {
        kind,
        row: new Set(propertyNames(row?.type)),
        insert: new Set(propertyNames(insert?.type)),
        update: new Set(propertyNames(update?.type)),
      });
    }
  };

  addRelations(tablesMember, "table");
  addRelations(viewsMember, "view");

  const functions = new Map();
  const functionLiteral = asTypeLiteral(functionsMember.type);
  if (functionLiteral) {
    for (const member of functionLiteral.members) {
      const name = getPropertyName(member);
      if (name) functions.set(name, parseFunctionContract(member));
    }
  }

  return {
    sourcePath: schemaPath,
    relations,
    functions,
    enums: new Set(propertyNames(enumsMember?.type)),
    storageBuckets: new Set(),
  };
}

function walkFiles(directory, predicate, output = []) {
  if (!existsSync(directory)) return output;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".next" ||
      entry.name === "artifacts" ||
      entry.name === "dist" ||
      entry.name === "build"
    ) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(absolute, predicate, output);
    else if (entry.isFile() && predicate(absolute)) output.push(absolute);
  }
  return output;
}

export function discoverSourceFiles(rootDir) {
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(rootDir, sourceRoot);
    walkFiles(
      absoluteRoot,
      (file) => {
        const relative = toPosix(path.relative(rootDir, file));
        const extension = path.extname(file);
        return (
          SOURCE_EXTENSIONS.has(extension) &&
          !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)/.test(relative) &&
          !/(?:^|\/)_archive(?:\/|$)/.test(relative) &&
          !/\.(?:test|spec)\.[^.]+$/.test(relative) &&
          relative !== DEFAULT_SCHEMA_PATH &&
          relative !== "shared/types/types/supabase.ts" &&
          !relative.startsWith("scripts/regression-inventory/")
        );
      },
      files,
    );
  }
  return [...new Set(files)].sort();
}

function scriptKindFor(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function literalText(node) {
  if (!node) return null;
  let current = node;
  const seen = new Set();
  while (ts.isIdentifier(current)) {
    if (seen.has(current.text)) return null;
    seen.add(current.text);
    const initializer = SOURCE_INITIALIZERS.get(current.getSourceFile())?.get(
      current.text,
    );
    if (!initializer) return null;
    current = unwrapExpression(initializer);
  }
  if (
    ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    return current.text;
  }
  return null;
}

function collectSourceInitializers(sourceFile) {
  const initializers = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      if (initializers.has(node.name.text)) {
        initializers.set(node.name.text, null);
      } else {
        initializers.set(node.name.text, node.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  SOURCE_INITIALIZERS.set(sourceFile, initializers);
}

function callMethodName(node) {
  if (!ts.isCallExpression(node)) return null;
  if (
    ts.isPropertyAccessExpression(node.expression) ||
    ts.isPropertyAccessChain(node.expression)
  ) {
    return node.expression.name.text;
  }
  return null;
}

function outermostChainCall(start) {
  let current = start;
  let outerCall = start;
  while (current.parent) {
    const parent = current.parent;
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isPropertyAccessChain(parent)) &&
      parent.expression === current &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent
    ) {
      outerCall = parent.parent;
      current = parent.parent;
      continue;
    }
    if (
      (ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    break;
  }
  return outerCall;
}

function decomposeChain(node, output = []) {
  if (!ts.isCallExpression(node)) return output;
  const expression = node.expression;
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isPropertyAccessChain(expression)
  ) {
    decomposeChain(expression.expression, output);
    output.push({
      name: expression.name.text,
      args: [...node.arguments],
      node,
    });
  }
  return output;
}

function splitTopLevel(value, separator = ",") {
  const output = [];
  let current = "";
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      current += character;
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === separator && depth === 0) {
      output.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current) output.push(current);
  return output;
}

export function parseSelectColumns(select) {
  const columns = [];
  for (const rawEntry of splitTopLevel(select)) {
    let entry = rawEntry.trim();
    if (!entry || entry === "*" || entry.includes("(")) continue;
    if (entry.includes(":")) entry = entry.slice(entry.lastIndexOf(":") + 1);
    entry = entry.trim().replace(/^['"]|['"]$/g, "");
    entry = entry.split("::")[0].split("->")[0].trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry)) columns.push(entry);
  }
  return columns;
}

function parseOrFilterColumns(filter) {
  const columns = [];
  const matcher =
    /(?:^|[,(])([A-Za-z_][A-Za-z0-9_]*)(?:->>?[A-Za-z0-9_]+)?\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|fts|plfts|phfts|wfts)\./g;
  let match;
  while ((match = matcher.exec(filter)) !== null) columns.push(match[1]);
  return columns;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function objectKeys(node) {
  let current = unwrapExpression(node);
  if (ts.isIdentifier(current)) {
    const initializer = SOURCE_INITIALIZERS.get(current.getSourceFile())?.get(
      current.text,
    );
    if (initializer) current = unwrapExpression(initializer);
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.flatMap((element) => objectKeys(element));
  }
  if (!ts.isObjectLiteralExpression(current)) return [];
  return current.properties.flatMap((property) => {
    if (ts.isSpreadAssignment(property)) return objectKeys(property.expression);
    const name = getPropertyName(property);
    return name ? [name] : [];
  });
}

function isStaticallyObjectLike(node) {
  let current = unwrapExpression(node);
  if (ts.isIdentifier(current)) {
    const initializer = SOURCE_INITIALIZERS.get(current.getSourceFile())?.get(
      current.text,
    );
    if (initializer) current = unwrapExpression(initializer);
  }
  return (
    ts.isObjectLiteralExpression(current) ||
    ts.isArrayLiteralExpression(current)
  );
}

function objectPropertyValue(node, name) {
  let current = unwrapExpression(node);
  if (ts.isIdentifier(current)) {
    const initializer = SOURCE_INITIALIZERS.get(current.getSourceFile())?.get(
      current.text,
    );
    if (initializer) current = unwrapExpression(initializer);
  }
  if (!ts.isObjectLiteralExpression(current)) return null;
  const property = current.properties.find(
    (candidate) => getPropertyName(candidate) === name,
  );
  if (!property || !ts.isPropertyAssignment(property)) return null;
  return property.initializer;
}

function receiverName(call) {
  if (!ts.isCallExpression(call)) return "";
  const expression = call.expression;
  if (
    !ts.isPropertyAccessExpression(expression) &&
    !ts.isPropertyAccessChain(expression)
  ) {
    return "";
  }
  return expression.expression.getText();
}

function domainFromPath(file) {
  const normalized = file.toLowerCase();
  for (const [domain, pattern] of DOMAIN_RULES) {
    if (pattern.test(normalized)) return domain;
  }
  return "core";
}

function findingFingerprint(finding) {
  const stable = [
    finding.rule,
    finding.file ?? "",
    finding.subject ?? "",
    finding.operation ?? "",
  ].join("\u0000");
  return createHash("sha256").update(stable).digest("hex").slice(0, 20);
}

export function createFinding(input) {
  const finding = {
    severity: "error",
    domain: input.file ? domainFromPath(input.file) : "core",
    ...input,
  };
  return { ...finding, fingerprint: findingFingerprint(finding) };
}

function validateColumn({
  column,
  operation,
  relationName,
  relationContract,
  relativeFile,
  line,
  findings,
}) {
  if (!column || column === "*") return;
  if (column.includes(".")) return;
  const normalized = column.split("->")[0].split(".")[0].trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) return;
  if (relationContract.row.has(normalized)) return;
  findings.push(
    createFinding({
      rule: "missing-column",
      severity: "error",
      file: relativeFile,
      line,
      subject: `${relationName}.${normalized}`,
      operation,
      message: `${operation} references missing column ${relationName}.${normalized}`,
    }),
  );
}

function isDatabaseFromCall(call, schema, chain) {
  const receiver = receiverName(call);
  const firstReceiver = receiver.split(".")[0];
  if (NON_DATABASE_FROM_RECEIVERS.has(firstReceiver)) return false;
  const relationName = literalText(call.arguments[0]);
  if (relationName && schema.relations.has(relationName)) return true;
  if (chain.some((entry) => QUERY_METHODS.has(entry.name))) return true;
  return /(?:supabase|postgres|database|client|admin|\bdb\b)/i.test(receiver);
}

function scanRelationCall({ call, sourceFile, schema, relativeFile }) {
  const findings = [];
  const references = [];
  const line =
    sourceFile.getLineAndCharacterOfPosition(call.getStart()).line + 1;
  const chain = decomposeChain(outermostChainCall(call));
  const relationName = literalText(call.arguments[0]);

  if (!isDatabaseFromCall(call, schema, chain)) return { findings, references };

  if (!relationName) {
    findings.push(
      createFinding({
        rule: "dynamic-relation",
        severity: "warning",
        file: relativeFile,
        line,
        subject: "dynamic .from()",
        operation: "from",
        message: "Dynamic relation name cannot be checked against the schema",
      }),
    );
    references.push({
      kind: "relation",
      name: null,
      dynamic: true,
      file: relativeFile,
      line,
      operations: chain.map((entry) => entry.name),
    });
    return { findings, references };
  }

  references.push({
    kind: "relation",
    name: relationName,
    dynamic: false,
    file: relativeFile,
    line,
    operations: chain.map((entry) => entry.name),
  });

  const relationContract = schema.relations.get(relationName);
  if (!relationContract) {
    findings.push(
      createFinding({
        rule: "missing-relation",
        severity: "error",
        file: relativeFile,
        line,
        subject: relationName,
        operation: "from",
        message: `.from(${JSON.stringify(relationName)}) references a relation missing from the schema contract`,
      }),
    );
    return { findings, references };
  }

  for (const entry of chain) {
    if (entry.name === "select" && entry.args[0]) {
      const select = literalText(entry.args[0]);
      if (select === null) {
        findings.push(
          createFinding({
            rule: "dynamic-select",
            severity: "warning",
            file: relativeFile,
            line,
            subject: relationName,
            operation: "select",
            message: `Dynamic select list for ${relationName} cannot be checked`,
          }),
        );
      } else {
        for (const column of parseSelectColumns(select)) {
          validateColumn({
            column,
            operation: "select",
            relationName,
            relationContract,
            relativeFile,
            line,
            findings,
          });
        }
      }
    }

    if (COLUMN_METHODS.has(entry.name) && entry.args[0]) {
      const column = literalText(entry.args[0]);
      if (column !== null) {
        validateColumn({
          column,
          operation: entry.name,
          relationName,
          relationContract,
          relativeFile,
          line,
          findings,
        });
      }
    }

    if (entry.name === "or" && entry.args[0]) {
      const filter = literalText(entry.args[0]);
      if (filter !== null) {
        for (const column of parseOrFilterColumns(filter)) {
          validateColumn({
            column,
            operation: "or",
            relationName,
            relationContract,
            relativeFile,
            line,
            findings,
          });
        }
      }
    }

    if (entry.name === "match" && entry.args[0]) {
      for (const column of objectKeys(entry.args[0])) {
        validateColumn({
          column,
          operation: "match",
          relationName,
          relationContract,
          relativeFile,
          line,
          findings,
        });
      }
    }

    if (["insert", "update", "upsert"].includes(entry.name) && entry.args[0]) {
      const allowed =
        entry.name === "update"
          ? relationContract.update
          : relationContract.insert;
      const payloadKeys = objectKeys(entry.args[0]);
      if (payloadKeys.length === 0 && !isStaticallyObjectLike(entry.args[0])) {
        findings.push(
          createFinding({
            rule: "dynamic-mutation-payload",
            severity: "warning",
            file: relativeFile,
            line,
            subject: relationName,
            operation: entry.name,
            message: `${entry.name} payload for ${relationName} cannot be checked statically`,
          }),
        );
      }
      for (const column of payloadKeys) {
        if (allowed.has(column)) continue;
        findings.push(
          createFinding({
            rule: "missing-mutation-column",
            severity: "error",
            file: relativeFile,
            line,
            subject: `${relationName}.${column}`,
            operation: entry.name,
            message: `${entry.name} payload contains missing column ${relationName}.${column}`,
          }),
        );
      }
    }
  }

  return { findings, references };
}

function scanStorageCall({ call, sourceFile, relativeFile, schema }) {
  const line =
    sourceFile.getLineAndCharacterOfPosition(call.getStart()).line + 1;
  const bucket = literalText(call.arguments[0]);
  const chain = decomposeChain(outermostChainCall(call));
  const findings = [];
  if (!bucket) {
    findings.push(
      createFinding({
        rule: "dynamic-storage-bucket",
        severity: "warning",
        file: relativeFile,
        line,
        subject: "dynamic storage bucket",
        operation: "storage.from",
        message: "Dynamic storage bucket cannot be inventoried statically",
      }),
    );
  } else if (schema.storageBuckets && !schema.storageBuckets.has(bucket)) {
    findings.push(
      createFinding({
        rule: "missing-storage-bucket",
        severity: "error",
        file: relativeFile,
        line,
        subject: bucket,
        operation: "storage.from",
        message: `Storage bucket ${bucket} is not provisioned by the migration chain`,
      }),
    );
  }
  return {
    findings,
    references: [
      {
        kind: "storage",
        name: bucket,
        dynamic: bucket === null,
        file: relativeFile,
        line,
        operations: chain.map((entry) => entry.name),
      },
    ],
  };
}

function scanRealtimeCall({ call, sourceFile, schema, relativeFile }) {
  const findings = [];
  const references = [];
  if (literalText(call.arguments[0]) !== "postgres_changes") {
    return { findings, references };
  }
  const config = call.arguments[1];
  if (!config) return { findings, references };
  const line =
    sourceFile.getLineAndCharacterOfPosition(call.getStart()).line + 1;
  const tableNode = objectPropertyValue(config, "table");
  const table = tableNode ? literalText(tableNode) : null;
  references.push({
    kind: "realtime",
    name: table,
    dynamic: !table,
    file: relativeFile,
    line,
    operations: ["postgres_changes"],
  });
  if (!table) {
    findings.push(
      createFinding({
        rule: "dynamic-realtime-relation",
        severity: "warning",
        file: relativeFile,
        line,
        subject: "dynamic realtime relation",
        operation: "postgres_changes",
        message:
          "Dynamic Realtime relation cannot be checked against the schema",
      }),
    );
    return { findings, references };
  }
  const contract = schema.relations.get(table);
  if (!contract) {
    findings.push(
      createFinding({
        rule: "missing-realtime-relation",
        severity: "error",
        file: relativeFile,
        line,
        subject: table,
        operation: "postgres_changes",
        message: `Realtime subscription references missing relation ${table}`,
      }),
    );
    return { findings, references };
  }
  const filterNode = objectPropertyValue(config, "filter");
  const filter = filterNode ? literalText(filterNode) : null;
  const filterColumn = filter?.split("=")[0]?.trim();
  if (filterColumn) {
    validateColumn({
      column: filterColumn,
      operation: "realtime-filter",
      relationName: table,
      relationContract: contract,
      relativeFile,
      line,
      findings,
    });
  }
  return { findings, references };
}

function scanRpcCall({ call, sourceFile, schema, relativeFile }) {
  const findings = [];
  const line =
    sourceFile.getLineAndCharacterOfPosition(call.getStart()).line + 1;
  const rpcName = literalText(call.arguments[0]);
  if (!rpcName) {
    findings.push(
      createFinding({
        rule: "dynamic-rpc",
        severity: "warning",
        file: relativeFile,
        line,
        subject: "dynamic rpc",
        operation: "rpc",
        message: "Dynamic RPC name cannot be checked against the schema",
      }),
    );
    return {
      findings,
      references: [
        {
          kind: "rpc",
          name: null,
          dynamic: true,
          file: relativeFile,
          line,
          operations: ["rpc"],
        },
      ],
    };
  }

  const references = [
    {
      kind: "rpc",
      name: rpcName,
      dynamic: false,
      file: relativeFile,
      line,
      operations: ["rpc"],
    },
  ];
  const contract = schema.functions.get(rpcName);
  if (!contract) {
    findings.push(
      createFinding({
        rule: "missing-rpc",
        severity: "error",
        file: relativeFile,
        line,
        subject: rpcName,
        operation: "rpc",
        message: `.rpc(${JSON.stringify(rpcName)}) is missing from the schema contract`,
      }),
    );
    return { findings, references };
  }

  const suppliedArgument = call.arguments[1];
  if (suppliedArgument) {
    const supplied = new Set(objectKeys(call.arguments[1]));
    if (supplied.size === 0 && !isStaticallyObjectLike(suppliedArgument)) {
      findings.push(
        createFinding({
          rule: "dynamic-rpc-arguments",
          severity: "warning",
          file: relativeFile,
          line,
          subject: rpcName,
          operation: "rpc",
          message: `RPC ${rpcName} arguments cannot be checked statically`,
        }),
      );
    }
    if (supplied.size > 0) {
      const exactSignature = contract.signatures.find(
        (signature) =>
          [...supplied].every((argument) => signature.args.has(argument)) &&
          [...signature.requiredArgs].every((argument) =>
            supplied.has(argument),
          ),
      );
      if (exactSignature) return { findings, references };

      for (const argument of supplied) {
        if (
          contract.signatures.some((signature) => signature.args.has(argument))
        ) {
          continue;
        }
        findings.push(
          createFinding({
            rule: "unknown-rpc-argument",
            severity: "error",
            file: relativeFile,
            line,
            subject: `${rpcName}.${argument}`,
            operation: "rpc",
            message: `RPC ${rpcName} does not declare argument ${argument}`,
          }),
        );
      }
      const compatible = contract.signatures
        .filter((signature) =>
          [...supplied].every((argument) => signature.args.has(argument)),
        )
        .map((signature) => ({
          signature,
          missing: [...signature.requiredArgs].filter(
            (argument) => !supplied.has(argument),
          ),
        }))
        .sort((left, right) => left.missing.length - right.missing.length)[0];
      for (const required of compatible?.missing ?? []) {
        findings.push(
          createFinding({
            rule: "missing-rpc-argument",
            severity: "error",
            file: relativeFile,
            line,
            subject: `${rpcName}.${required}`,
            operation: "rpc",
            message: `RPC ${rpcName} call omits required argument ${required}`,
          }),
        );
      }
    }
  } else if (
    !contract.signatures.some((signature) => signature.requiredArgs.size === 0)
  ) {
    const smallest = [...contract.signatures].sort(
      (left, right) => left.requiredArgs.size - right.requiredArgs.size,
    )[0];
    for (const required of smallest?.requiredArgs ?? []) {
      findings.push(
        createFinding({
          rule: "missing-rpc-argument",
          severity: "error",
          file: relativeFile,
          line,
          subject: `${rpcName}.${required}`,
          operation: "rpc",
          message: `RPC ${rpcName} call omits required argument ${required}`,
        }),
      );
    }
  }

  return { findings, references };
}

export function scanSourceText({ source, file, schema }) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
  collectSourceInitializers(sourceFile);
  const findings = [];
  const references = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const method = callMethodName(node);
      if (method === "from") {
        const receiver = receiverName(node);
        const result = /(?:^|\.)storage$/.test(receiver)
          ? scanStorageCall({
              call: node,
              sourceFile,
              relativeFile: file,
              schema,
            })
          : scanRelationCall({
              call: node,
              sourceFile,
              schema,
              relativeFile: file,
            });
        findings.push(...result.findings);
        references.push(...result.references);
      } else if (method === "on") {
        const result = scanRealtimeCall({
          call: node,
          sourceFile,
          schema,
          relativeFile: file,
        });
        findings.push(...result.findings);
        references.push(...result.references);
      } else if (method === "rpc") {
        const result = scanRpcCall({
          call: node,
          sourceFile,
          schema,
          relativeFile: file,
        });
        findings.push(...result.findings);
        references.push(...result.references);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { findings, references };
}

function deduplicateFindings(findings) {
  const byFingerprint = new Map();
  for (const finding of findings) {
    const existing = byFingerprint.get(finding.fingerprint);
    if (!existing) {
      byFingerprint.set(finding.fingerprint, {
        ...finding,
        occurrences: 1,
        locations: finding.file
          ? [{ file: finding.file, line: finding.line }]
          : [],
      });
      continue;
    }
    existing.occurrences += 1;
    if (
      finding.file &&
      !existing.locations.some(
        (location) =>
          location.file === finding.file && location.line === finding.line,
      )
    ) {
      existing.locations.push({ file: finding.file, line: finding.line });
    }
  }
  return [...byFingerprint.values()].sort((left, right) =>
    `${left.severity}:${left.rule}:${left.file}:${left.subject}`.localeCompare(
      `${right.severity}:${right.rule}:${right.file}:${right.subject}`,
    ),
  );
}

function routePathFor(relativeFile) {
  let route = relativeFile
    .replace(/^app/, "")
    .replace(/\/(?:page|route)\.[^.]+$/, "");
  route = route
    .split("/")
    .filter(
      (segment) =>
        segment && !/^\(.*\)$/.test(segment) && !segment.startsWith("@"),
    )
    .join("/");
  return `/${route}`.replace(/\/+/g, "/");
}

export function discoverRoutes(rootDir) {
  const appRoot = path.join(rootDir, "app");
  return walkFiles(appRoot, (file) =>
    /\/(?:page|route)\.(?:ts|tsx|js|jsx)$/.test(toPosix(file)),
  )
    .map((absolute) => {
      const file = toPosix(path.relative(rootDir, absolute));
      return {
        file,
        route: routePathFor(file),
        kind: /\/route\.[^.]+$/.test(file) ? "api" : "page",
        domain: domainFromPath(file),
      };
    })
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function discoverTests(rootDir) {
  const workflowRoot = path.join(rootDir, ".github", "workflows");
  const workflowText = walkFiles(workflowRoot, (file) => /\.ya?ml$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const candidates = walkFiles(rootDir, (file) =>
    /(?:\.(?:test|spec)\.(?:ts|tsx|js|jsx)|\.runtime\.sql|\.runtime\.sh)$/.test(
      file,
    ),
  );
  return candidates
    .map((absolute) => {
      const file = toPosix(path.relative(rootDir, absolute));
      const source = readFileSync(absolute, "utf8");
      const markers = [
        ...source.matchAll(/@regression-flow\s+([A-Za-z0-9_.-]+)/g),
      ].map((match) => match[1]);
      if (file.endsWith(".runtime.sql")) {
        return {
          file,
          kind: "database-runtime",
          domain: domainFromPath(file),
          ciInvoked: workflowText.includes(file),
          markers,
        };
      }
      if (file.endsWith(".runtime.sh")) {
        return {
          file,
          kind: "database-runtime-shell",
          domain: domainFromPath(file),
          ciInvoked: workflowText.includes(file),
          markers,
        };
      }
      const sourceContract =
        /(?:readFileSync|readFile)\s*\(/.test(source) &&
        /\.toContain\s*\(/.test(source);
      return {
        file,
        kind: sourceContract ? "source-contract" : "vitest",
        domain: domainFromPath(file),
        ciInvoked: true,
        markers,
      };
    })
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function discoverMigrationStorageBuckets(rootDir) {
  const migrationRoot = path.join(rootDir, "supabase", "migrations");
  const buckets = new Set();
  for (const file of walkFiles(migrationRoot, (candidate) =>
    candidate.endsWith(".sql"),
  )) {
    const source = readFileSync(file, "utf8");
    const insert =
      /insert\s+into\s+storage\.buckets\s*\(\s*id\b[\s\S]{0,500}?\)\s*values\s*\(\s*'([^']+)'/gi;
    let match;
    while ((match = insert.exec(source)) !== null) buckets.add(match[1]);
  }
  return buckets;
}

function globToRegExp(glob) {
  let expression = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*") {
      if (glob[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += ".";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

function matchesAnyGlob(file, globs) {
  return globs.some((glob) => globToRegExp(glob).test(file));
}

export function evaluateCriticalFlows(flowConfig, tests) {
  const findings = [];
  const flows = flowConfig.flows.map((flow) => {
    const requirements = flow.evidence.map((requirement) => {
      const matches = tests.filter(
        (test) =>
          requirement.kinds.includes(test.kind) &&
          (!requirement.ciRequired || test.ciInvoked) &&
          (!requirement.markers ||
            requirement.markers.some((marker) =>
              test.markers.includes(marker),
            )) &&
          matchesAnyGlob(test.file, requirement.globs),
      );
      const satisfied = matches.length >= requirement.minimum;
      if (!satisfied) {
        findings.push(
          createFinding({
            rule: "critical-flow-evidence-gap",
            severity: "error",
            domain: flow.domain,
            file: DEFAULT_FLOW_CONFIG_PATH,
            line: null,
            subject: `${flow.id}:${requirement.id}`,
            operation: "coverage",
            message: `${flow.title} is missing ${requirement.label}`,
          }),
        );
      }
      return {
        ...requirement,
        satisfied,
        matches: matches.map((test) => test.file),
      };
    });
    const allSatisfied = requirements.every(
      (requirement) => requirement.satisfied,
    );
    return { ...flow, requirements, status: allSatisfied ? "covered" : "gap" };
  });
  return { flows, findings };
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, output);
    return output;
  }
  if (value && typeof value === "object") {
    const preferred = [
      "event_message",
      "message",
      "error",
      "error_description",
      "detail",
      "msg",
    ];
    let usedPreferred = false;
    for (const key of preferred) {
      if (typeof value[key] === "string") {
        output.push(value[key]);
        usedPreferred = true;
      }
    }
    if (!usedPreferred) {
      for (const entry of Object.values(value)) collectStrings(entry, output);
    }
  }
  return output;
}

function extractLogMessages(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    return collectStrings(JSON.parse(trimmed));
  } catch {
    const messages = [];
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        collectStrings(JSON.parse(line), messages);
      } catch {
        messages.push(line);
      }
    }
    return messages;
  }
}

export function classifyLogs(raw) {
  const messages = extractLogMessages(raw);
  const categories = new Map();
  for (const message of messages) {
    for (const rule of LOG_RULES) {
      if (!rule.pattern.test(message)) continue;
      const current = categories.get(rule.id) ?? { ...rule, count: 0 };
      current.count += 1;
      categories.set(rule.id, current);
      break;
    }
  }
  const findings = [...categories.values()].map((category) =>
    createFinding({
      rule: category.id,
      severity: category.severity,
      domain: category.domain,
      file: "runtime-log-export",
      line: null,
      subject: category.id,
      operation: "runtime",
      message: `${category.title} (${category.count} event${category.count === 1 ? "" : "s"})`,
    }),
  );
  return {
    messagesInspected: messages.length,
    matchedEvents: [...categories.values()].reduce(
      (sum, category) => sum + category.count,
      0,
    ),
    categories: [...categories.values()]
      .map(({ pattern: _pattern, ...category }) => category)
      .sort((left, right) => right.count - left.count),
    findings,
  };
}

function aggregateDomains(routes, references, tests, flows) {
  const domains = new Map();
  const ensure = (domain) => {
    if (!domains.has(domain)) {
      domains.set(domain, {
        domain,
        pages: 0,
        apiRoutes: 0,
        databaseReferences: 0,
        vitest: 0,
        sourceContracts: 0,
        databaseRuntime: 0,
        criticalFlows: 0,
        flowGaps: 0,
      });
    }
    return domains.get(domain);
  };
  for (const route of routes) {
    const domain = ensure(route.domain);
    if (route.kind === "page") domain.pages += 1;
    else domain.apiRoutes += 1;
  }
  for (const reference of references) {
    ensure(domainFromPath(reference.file)).databaseReferences += 1;
  }
  for (const test of tests) {
    const domain = ensure(test.domain);
    if (test.kind === "vitest") domain.vitest += 1;
    else if (test.kind === "source-contract") domain.sourceContracts += 1;
    else domain.databaseRuntime += 1;
  }
  for (const flow of flows) {
    const domain = ensure(flow.domain);
    domain.criticalFlows += 1;
    if (flow.status !== "covered") domain.flowGaps += 1;
  }
  return [...domains.values()].sort((left, right) =>
    left.domain.localeCompare(right.domain),
  );
}

export function buildInventory({
  rootDir,
  schemaPath = DEFAULT_SCHEMA_PATH,
  flowConfigPath = DEFAULT_FLOW_CONFIG_PATH,
  logPath = null,
}) {
  const absoluteSchema = path.resolve(rootDir, schemaPath);
  const schema = parseSchemaTypes(absoluteSchema);
  schema.storageBuckets = discoverMigrationStorageBuckets(rootDir);
  const sourceFiles = discoverSourceFiles(rootDir);
  const findings = [];
  const references = [];

  for (const absoluteFile of sourceFiles) {
    const relativeFile = toPosix(path.relative(rootDir, absoluteFile));
    const result = scanSourceText({
      source: readFileSync(absoluteFile, "utf8"),
      file: relativeFile,
      schema,
    });
    findings.push(...result.findings);
    references.push(...result.references);
  }

  const routes = discoverRoutes(rootDir);
  const tests = discoverTests(rootDir);
  for (const test of tests) {
    if (!test.kind.startsWith("database-runtime") || test.ciInvoked) continue;
    findings.push(
      createFinding({
        rule: "database-runtime-not-in-ci",
        severity: "error",
        domain: test.domain,
        file: test.file,
        line: null,
        subject: test.file,
        operation: "ci-coverage",
        message: `${test.file} exists but no GitHub workflow executes it`,
      }),
    );
  }
  const flowConfig = JSON.parse(
    readFileSync(path.resolve(rootDir, flowConfigPath), "utf8"),
  );
  const criticalFlows = evaluateCriticalFlows(flowConfig, tests);
  findings.push(...criticalFlows.findings);

  let runtime = null;
  if (logPath) {
    runtime = classifyLogs(
      readFileSync(path.resolve(rootDir, logPath), "utf8"),
    );
    findings.push(...runtime.findings);
  }

  const deduplicated = deduplicateFindings(findings);
  const staticReferences = references.filter((reference) => !reference.dynamic);
  const relationNames = new Set(
    staticReferences
      .filter((reference) => reference.kind === "relation")
      .map((reference) => reference.name),
  );
  const rpcNames = new Set(
    staticReferences
      .filter((reference) => reference.kind === "rpc")
      .map((reference) => reference.name),
  );
  const storageBuckets = new Set(
    staticReferences
      .filter((reference) => reference.kind === "storage")
      .map((reference) => reference.name),
  );

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    schema: {
      path: schemaPath,
      tablesAndViews: schema.relations.size,
      functions: schema.functions.size,
      enums: schema.enums.size,
      storageBuckets: schema.storageBuckets.size,
    },
    fixture: flowConfig.fixture,
    summary: {
      sourceFiles: sourceFiles.length,
      pages: routes.filter((route) => route.kind === "page").length,
      apiRoutes: routes.filter((route) => route.kind === "api").length,
      tests: tests.length,
      sourceContractTests: tests.filter(
        (test) => test.kind === "source-contract",
      ).length,
      databaseRuntimeTests: tests.filter((test) =>
        test.kind.startsWith("database-runtime"),
      ).length,
      references: references.length,
      dynamicReferences: references.filter((reference) => reference.dynamic)
        .length,
      relationsUsed: relationNames.size,
      rpcsUsed: rpcNames.size,
      storageBucketsUsed: storageBuckets.size,
      criticalFlows: criticalFlows.flows.length,
      criticalFlowGaps: criticalFlows.flows.filter(
        (flow) => flow.status !== "covered",
      ).length,
      errors: deduplicated.filter((finding) => finding.severity === "error")
        .length,
      warnings: deduplicated.filter((finding) => finding.severity === "warning")
        .length,
    },
    domains: aggregateDomains(routes, references, tests, criticalFlows.flows),
    routes,
    tests,
    references,
    criticalFlows: criticalFlows.flows,
    runtime,
    findings: deduplicated,
  };
}

export function loadBaseline(rootDir, baselinePath = DEFAULT_BASELINE_PATH) {
  const absolute = path.resolve(rootDir, baselinePath);
  if (!existsSync(absolute)) return null;
  const parsed = JSON.parse(readFileSync(absolute, "utf8"));
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.findings) ||
    parsed.findings.some((finding) => typeof finding.fingerprint !== "string")
  ) {
    throw new Error(`Invalid regression inventory baseline: ${baselinePath}`);
  }
  return parsed;
}

export function baselineSnapshot(inventory) {
  const expiresAt = new Date(inventory.generatedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
  const expiresOn = expiresAt.toISOString().slice(0, 10);
  return {
    version: 1,
    schema: inventory.schema.path,
    findings: inventory.findings.map((finding) => ({
      fingerprint: finding.fingerprint,
      rule: finding.rule,
      severity: finding.severity,
      domain: finding.domain,
      file: finding.file,
      subject: finding.subject,
      message: finding.message,
      expiresOn,
    })),
  };
}

export function compareWithBaseline(inventory, baseline) {
  const today = inventory.generatedAt.slice(0, 10);
  const expiredFindings = (baseline?.findings ?? []).filter(
    (finding) => finding.expiresOn && finding.expiresOn < today,
  );
  const baselineByFingerprint = new Map(
    (baseline?.findings ?? [])
      .filter((finding) => !finding.expiresOn || finding.expiresOn >= today)
      .map((finding) => [finding.fingerprint, finding]),
  );
  const currentFingerprints = new Set(
    inventory.findings.map((finding) => finding.fingerprint),
  );
  const findings = inventory.findings.map((finding) => ({
    ...finding,
    status: baselineByFingerprint.has(finding.fingerprint) ? "existing" : "new",
  }));
  const resolved = (baseline?.findings ?? []).filter(
    (finding) => !currentFingerprints.has(finding.fingerprint),
  );
  return {
    ...inventory,
    findings,
    comparison: {
      baselineLoaded: Boolean(baseline),
      newErrors: findings.filter(
        (finding) => finding.status === "new" && finding.severity === "error",
      ).length,
      newWarnings: findings.filter(
        (finding) => finding.status === "new" && finding.severity === "warning",
      ).length,
      existingErrors: findings.filter(
        (finding) =>
          finding.status === "existing" && finding.severity === "error",
      ).length,
      existingWarnings: findings.filter(
        (finding) =>
          finding.status === "existing" && finding.severity === "warning",
      ).length,
      resolved: resolved.length,
      expired: expiredFindings.length,
    },
    resolvedFindings: resolved,
  };
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function findingLocation(finding) {
  if (!finding.file) return "—";
  return finding.line ? `${finding.file}:${finding.line}` : finding.file;
}

export function renderMarkdown(inventory) {
  const comparison = inventory.comparison ?? {
    newErrors: inventory.summary.errors,
    newWarnings: inventory.summary.warnings,
    existingErrors: 0,
    existingWarnings: 0,
    resolved: 0,
    expired: 0,
  };
  const lines = [
    "# Full-app regression inventory",
    "",
    `Generated: ${inventory.generatedAt}`,
    "",
    "## Gate summary",
    "",
    "| New errors | Existing errors | New warnings | Existing warnings | Resolved baseline | Expired baseline |",
    "| ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${comparison.newErrors} | ${comparison.existingErrors} | ${comparison.newWarnings} | ${comparison.existingWarnings} | ${comparison.resolved} | ${comparison.expired} |`,
    "",
    "The exact, expiring baseline keeps known debt visible while the CI gate rejects new errors, expired entries, and stale entries for already-resolved debt. `--strict` rejects all current errors.",
    "",
    "## Inventory scope",
    "",
    "| Source files | UI pages | API routes | DB references | Relations used | RPCs used | Storage buckets | Tests | Source-text contracts | DB runtime tests |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${inventory.summary.sourceFiles} | ${inventory.summary.pages} | ${inventory.summary.apiRoutes} | ${inventory.summary.references} | ${inventory.summary.relationsUsed} | ${inventory.summary.rpcsUsed} | ${inventory.summary.storageBucketsUsed} | ${inventory.summary.tests} | ${inventory.summary.sourceContractTests} | ${inventory.summary.databaseRuntimeTests} |`,
    "",
    `Schema contract: \`${inventory.schema.path}\` (${inventory.schema.tablesAndViews} tables/views, ${inventory.schema.functions} functions, ${inventory.schema.enums} enums, ${inventory.schema.storageBuckets} migration-provisioned storage buckets).`,
    "",
    "## Domain coverage",
    "",
    "| Domain | Pages | APIs | DB refs | Vitest | Source contracts | DB runtime | Critical flows | Flow gaps |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const domain of inventory.domains) {
    lines.push(
      `| ${markdownCell(domain.domain)} | ${domain.pages} | ${domain.apiRoutes} | ${domain.databaseReferences} | ${domain.vitest} | ${domain.sourceContracts} | ${domain.databaseRuntime} | ${domain.criticalFlows} | ${domain.flowGaps} |`,
    );
  }

  lines.push(
    "",
    "## Critical golden paths",
    "",
    `Seed fixture: ${inventory.fixture.description}`,
    "",
    "| Flow | Domain | Stages | Automated evidence | Status |",
    "| --- | --- | ---: | ---: | --- |",
  );
  for (const flow of inventory.criticalFlows) {
    const evidenceCount = flow.requirements.reduce(
      (sum, requirement) => sum + requirement.matches.length,
      0,
    );
    lines.push(
      `| ${markdownCell(flow.title)} | ${markdownCell(flow.domain)} | ${flow.stages.length} | ${evidenceCount} | ${flow.status} |`,
    );
  }

  if (inventory.runtime) {
    lines.push(
      "",
      "## Runtime log classification",
      "",
      `${inventory.runtime.messagesInspected} messages inspected; ${inventory.runtime.matchedEvents} matched a known regression signature. Raw log text is not included in this report.`,
      "",
      "| Category | Domain | Severity | Events |",
      "| --- | --- | --- | ---: |",
    );
    for (const category of inventory.runtime.categories) {
      lines.push(
        `| ${markdownCell(category.title)} | ${markdownCell(category.domain)} | ${category.severity} | ${category.count} |`,
      );
    }
  }

  lines.push("", "## Findings", "");
  if (inventory.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push(
      "| Status | Severity | Rule | Domain | Location | Finding |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    const ordered = [...inventory.findings].sort((left, right) => {
      const statusOrder = { new: 0, existing: 1 };
      const severityOrder = { error: 0, warning: 1 };
      return (
        (statusOrder[left.status] ?? 0) - (statusOrder[right.status] ?? 0) ||
        (severityOrder[left.severity] ?? 2) -
          (severityOrder[right.severity] ?? 2) ||
        left.fingerprint.localeCompare(right.fingerprint)
      );
    });
    for (const finding of ordered) {
      lines.push(
        `| ${finding.status ?? "current"} | ${finding.severity} | ${markdownCell(finding.rule)} | ${markdownCell(finding.domain)} | ${markdownCell(findingLocation(finding))} | ${markdownCell(finding.message)} |`,
      );
    }
  }

  if (inventory.resolvedFindings?.length) {
    lines.push("", "## Resolved baseline findings", "");
    for (const finding of inventory.resolvedFindings) {
      lines.push(`- ${finding.rule}: ${finding.message}`);
    }
  }

  lines.push(
    "",
    "## Interpretation",
    "",
    "- Schema errors are derived from literal Supabase table, column, mutation, filter, and RPC consumers across the application.",
    "- Dynamic references remain warnings because their runtime target cannot be proven statically.",
    "- Source-text contract tests are inventoried separately from executable Vitest and database-runtime evidence.",
    "- The existing clean-replay workflow proves that the committed generated types match a fresh migration replay; this inventory proves that app consumers match those types.",
    "",
  );
  return lines.join("\n");
}

export function assertReadableFile(rootDir, file, label) {
  const absolute = path.resolve(rootDir, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`${label} not found: ${file}`);
  }
}
