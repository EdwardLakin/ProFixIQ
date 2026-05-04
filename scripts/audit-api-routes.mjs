#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_MD = path.join(ROOT, 'docs/audits/api-route-boundary-inventory.md');
const OUTPUT_JSON = path.join(ROOT, 'docs/audits/api-route-boundary-inventory.json');
const METHOD_NAMES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') {
        continue;
      }
      files.push(...(await walk(fullPath)));
      continue;
    }

    if (entry.isFile() && (entry.name === 'route.ts' || entry.name === 'route.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

function getMethods(content) {
  const methods = [];
  for (const method of METHOD_NAMES) {
    const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
    if (pattern.test(content)) methods.push(method);
  }
  return methods;
}

function classifyRoute(routePath, content) {
  const normalizedPath = routePath.toLowerCase();
  const text = content.toLowerCase();
  if (normalizedPath.includes('/webhook') || text.includes('stripe-signature') || text.includes('x-signature')) return 'webhook';
  if (normalizedPath.includes('/internal') || text.includes('x-internal') || text.includes('internal secret')) return 'internal';
  if (normalizedPath.includes('/portal') || normalizedPath.includes('/customer') || text.includes('customer')) return 'customer_or_portal';
  if (normalizedPath.includes('/public') || normalizedPath.includes('/token') || text.includes('public')) return 'public_or_token';
  return 'staff_or_admin';
}

function detectCapability(content) {
  return /(capabilit|role|isOwner|isAdmin|hasPermission|permission)/i.test(content);
}

function analyzeRoute(relativePath, content) {
  const methods = getMethods(content);
  const isMutating = methods.some((method) => MUTATING_METHODS.has(method));
  const hasRequireShopScopedApiAccess = /requireShopScopedApiAccess/.test(content);
  const hasRouteHandlerSupabaseAuthClient = /createRouteHandlerClient|createServerClient|createClient\(/.test(content);
  const hasAuthGetUser = /auth\.getUser\s*\(/.test(content);
  const hasShopReference = /\bshop_id\b|\bshopId\b/.test(content);
  const hasRoleOrCapabilityReference = detectCapability(content);
  const hasServiceRolePattern = /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient|service role|service-role|createClient\([^\n]{0,140}(SERVICE|service)[^\n]{0,140}KEY/.test(content);
  const routeClassGuess = classifyRoute(relativePath, content);

  const riskFlags = [];

  const hasAuthMarker = hasRequireShopScopedApiAccess || hasAuthGetUser;
  const hasBoundaryMarker = hasAuthMarker || routeClassGuess === 'webhook' || routeClassGuess === 'internal';

  if (isMutating && hasServiceRolePattern && !hasBoundaryMarker) {
    riskFlags.push('mutating_with_service_role_without_obvious_auth_or_boundary');
  }

  if (hasServiceRolePattern && !hasShopReference && routeClassGuess === 'staff_or_admin') {
    riskFlags.push('service_role_without_shop_reference_on_staff_route');
  }

  if (isMutating && !hasBoundaryMarker && routeClassGuess === 'staff_or_admin') {
    riskFlags.push('mutating_without_obvious_auth_marker');
  }

  if (hasServiceRolePattern && /\bshop_id\b|\bshopId\b/.test(content)) {
    riskFlags.push('service_role_with_shop_identifier_input_or_reference');
  }

  if ((hasRequireShopScopedApiAccess || routeClassGuess === 'webhook' || routeClassGuess === 'internal') && riskFlags.length === 0) {
    riskFlags.push('has_stronger_boundary_signal');
  }

  let riskLevel = 'low';
  if (riskFlags.some((flag) => flag.includes('without_obvious_auth_or_boundary'))) riskLevel = 'high';
  else if (riskFlags.some((flag) => flag.includes('without_shop_reference') || flag.includes('without_obvious_auth_marker'))) riskLevel = 'high';
  else if (riskFlags.some((flag) => flag.includes('service_role_with_shop_identifier'))) riskLevel = 'medium';

  return {
    path: relativePath,
    methods,
    isMutating,
    hasRequireShopScopedApiAccess,
    hasRouteHandlerSupabaseAuthClient,
    hasAuthGetUser,
    hasServiceRolePattern,
    hasShopReference,
    hasRoleOrCapabilityReference,
    routeClassGuess,
    riskFlags,
    riskLevel,
  };
}

function generateMarkdown(results) {
  const totalRoutes = results.length;
  const methodCounts = Object.fromEntries(METHOD_NAMES.map((m) => [m, 0]));
  for (const route of results) {
    for (const method of route.methods) methodCounts[method] += 1;
  }

  const serviceRoleRoutes = results.filter((r) => r.hasServiceRolePattern);
  const highRisk = results.filter((r) => r.riskLevel === 'high');
  const mediumRisk = results.filter((r) => r.riskLevel === 'medium');
  const missingAuthMarkers = results.filter(
    (r) => !r.hasRequireShopScopedApiAccess && !r.hasAuthGetUser && r.routeClassGuess === 'staff_or_admin',
  );

  const lines = [
    '# API Route Boundary Inventory (Static Heuristic)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Total route count: **${totalRoutes}**`,
    ...METHOD_NAMES.map((m) => `- Routes exporting ${m}: **${methodCounts[m]}**`),
    `- Routes with service-role pattern: **${serviceRoleRoutes.length}**`,
    `- Routes using requireShopScopedApiAccess: **${results.filter((r) => r.hasRequireShopScopedApiAccess).length}**`,
    `- Routes with auth.getUser references: **${results.filter((r) => r.hasAuthGetUser).length}**`,
    '',
    '## High-Risk Routes',
    ...formatRouteList(highRisk),
    '',
    '## Medium-Risk Routes',
    ...formatRouteList(mediumRisk),
    '',
    '## Service-Role Route List',
    ...formatRouteList(serviceRoleRoutes),
    '',
    '## Routes Missing Obvious Auth Markers (staff/admin guess)',
    ...formatRouteList(missingAuthMarkers),
    '',
    '## Notes',
    '- This inventory is static heuristic analysis and **not** a complete security proof.',
    '- Route classification and risk levels are deterministic best-effort signals for triage.',
    '- Use this report to prioritize manual review, not to infer exploitability by itself.',
  ];

  return lines.join('\n') + '\n';
}

function formatRouteList(routes) {
  if (routes.length === 0) return ['- None'];
  return routes
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((r) => `- \`${r.path}\` | methods: ${r.methods.join(', ') || 'none'} | riskFlags: ${r.riskFlags.join(', ') || 'none'}`);
}

async function main() {
  const candidates = [];
  for (const base of ['app/api', 'src/app/api']) {
    const full = path.join(ROOT, base);
    try {
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        candidates.push(...(await walk(full)));
      }
    } catch {
      // base path not present
    }
  }

  const results = [];
  for (const file of candidates) {
    const content = await fs.readFile(file, 'utf8');
    const rel = path.relative(ROOT, file).replaceAll('\\', '/');
    results.push(analyzeRoute(rel, content));
  }

  results.sort((a, b) => a.path.localeCompare(b.path));

  await fs.mkdir(path.dirname(OUTPUT_MD), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(results, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUTPUT_MD, generateMarkdown(results), 'utf8');

  console.log(`Audit complete. Routes analyzed: ${results.length}`);
  console.log(`Markdown report: ${path.relative(ROOT, OUTPUT_MD)}`);
  console.log(`JSON report: ${path.relative(ROOT, OUTPUT_JSON)}`);
}

main().catch((error) => {
  console.error('API route audit failed.');
  console.error(error);
  process.exitCode = 1;
});
