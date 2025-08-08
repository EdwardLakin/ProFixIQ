#!/usr/bin/env node
/* rewrite-imports.js
 * Usage:
 *   node rewrite-imports.js --check   # show changes only
 *   node rewrite-imports.js --write   # apply changes
 */

const fs = require('fs');
const path = require('path');

const WRITE = process.argv.includes('--write');
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Directories to scan
const ROOTS = ['features', 'app', 'src'].filter((d) => fs.existsSync(d));

// ----------
/** EXACT mappings first (most specific -> least specific) */
const EXACT = [
  // --- INSPECTIONS ---
  ['@/hooks/useInspectionSession', '@inspections/hooks/useInspectionSession'],
  ['@/hooks/useCustomInspection', '@inspections/hooks/useCustomInspection'],
  ['@/hooks/useVoiceInput', '@inspections/hooks/useVoiceInput'],
  ['@/lib/inspection/', '@inspections/lib/inspection/'],
  ['@/components/inspection/', '@inspections/components/inspection/'],
  ['@/lib/getServicesByKeyword', '@inspections/lib/getServicesByKeyword'],

  // --- WORK ORDERS ---
  ['@/lib/work-orders/', '@work-orders/lib/work-orders/'],
  ['@/components/WorkOrder', '@work-orders/components/WorkOrder'],
  ['@/components/workorders/', '@work-orders/components/workorders/'],

  // --- AI / DIAGNOSTICS ---
  ['@/lib/chat/', '@ai/lib/chat/'],
  ['@/lib/ai/', '@ai/lib/ai/'],
  ['@/lib/techBot', '@ai/lib/techBot'],
  ['@/lib/tech', '@ai/lib/tech'],
  ['@/components/Chatbot', '@ai/components/Chatbot'],
  ['@/components/DTCCodeLookup', '@ai/components/DTCCodeLookup'],
  ['@/components/DtcSuggestionPopup', '@ai/components/DtcSuggestionPopup'],
  ['@/lib/parseRepairOutput', '@ai/lib/parseRepairOutput'],
  ['@/lib/formatTechBotPrompt', '@ai/lib/formatTechBotPrompt'],
  ['@/lib/dtc', '@ai/lib/dtc'],

  // --- QUOTES ---
  ['@/components/QuoteViewer', '@quotes/components/QuoteViewer'],
  ['@/lib/quote/', '@quotes/lib/quote/'],

  // --- STRIPE ---
  ['@/actions/getStripePlans', '@stripe/lib/getStripePlans'],
  ['@/lib/stripe/', '@stripe/lib/stripe/'],

  // --- PARTS ---
  ['@/lib/parts/', '@parts/lib/parts/'],
  ['@/components/PartsRequestChat', '@parts/components/PartsRequestChat'],

  // --- DASHBOARD ---
  ['@/components/tabs/DashboardTabs', '@dashboard/components/DashboardTabs'],

  // --- SHARED / UI / UTILS / TYPES / CONTEXT ---
  ['@/components/ui/', '@shared/components/ui/'],
  ['@/components/nav/', '@shared/components/'],
  ['@/components/punch/', '@shared/components/'],
  ['@/components/PlanSelectionPage', '@shared/components/PlanSelectionPage'],
  ['@/components/', '@shared/components/'],

  ['@/lib/config/', '@shared/lib/config/'],
  ['@/lib/stats/', '@shared/lib/stats/'],
  ['@/lib/plan/', '@shared/lib/plan/'],
  ['@/lib/pdf/', '@shared/lib/pdf/'],
  ['@/lib/supabase/', '@shared/lib/supabase/'],
  ['@/lib/utils', '@shared/lib/utils'],
  ['@/lib/queries', '@shared/lib/queries'],
  ['@/lib/upgradeUser', '@shared/lib/upgradeUser'],
  ['@/lib/db', '@shared/lib/db'],
  ['@/lib/menuItems', '@shared/lib/menuItems'],

  ['@/lib/email/', '@shared/lib/email/'],

  ['@/context/', '@shared/context/'],
  ['@/utils/', '@shared/lib/utils/'],
  ['@/types/', '@shared/types/'],
  ['@custom-types/', '@shared/types/'],

  // Old non-@/ aliases some files might have kept
  ['@components/', '@shared/components/'],
  ['@hooks/', '@shared/hooks/'],
  ['@lib/', '@shared/lib/'],
  ['@context/', '@shared/context/'],
  ['@utils/', '@shared/lib/utils/'],
];

/** PREFIX fallbacks (least specific). If nothing exact matched, we try these. */
const PREFIX_FALLBACKS = [
  // If it was any "@/components/*" that slipped through, default to shared
  ['@/components/', '@shared/components/'],
  ['@/hooks/', '@shared/hooks/'],
  ['@/lib/', '@shared/lib/'],
  ['@/context/', '@shared/context/'],
  ['@/utils/', '@shared/lib/utils/'],
  ['@/types/', '@shared/types/'],
];

/** Helpers */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function replaceAllImports(code, from, to) {
  // Handles: import 'x', from 'x', require('x'), import('x')
  const patterns = [
    new RegExp(`(from\\s*['"\`])${escape(from)}`, 'g'),
    new RegExp(`(import\\s*\\(\\s*['"\`])${escape(from)}`, 'g'),
    new RegExp(`(require\\(\\s*['"\`])${escape(from)}`, 'g'),
    new RegExp(`(^\\s*import\\s*['"\`])${escape(from)}`, 'gm'),
  ];
  let out = code;
  for (const re of patterns) out = out.replace(re, `$1${to}`);
  return out;
}

function applyMappings(code) {
  let changed = false;
  let next = code;

  // Exact mappings first
  for (const [from, to] of EXACT) {
    const before = next;
    next = replaceAllImports(next, from, to);
    if (next !== before) changed = true;
  }
  // Fallback prefixes
  for (const [from, to] of PREFIX_FALLBACKS) {
    const before = next;
    next = replaceAllImports(next, from, to);
    if (next !== before) changed = true;
  }

  // Normalize accidental double slashes like @shared//lib
  next = next.replace(/(@[a-z-]+)\/{2,}/g, '$1/');

  return { changed, code: next };
}

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (exts.has(path.extname(name))) {
      files.push(full);
    }
  }
  return files;
}

function run() {
  const targets = ROOTS.flatMap((d) => walk(d));
  let total = 0;
  let modified = 0;

  for (const file of targets) {
    total++;
    const src = fs.readFileSync(file, 'utf8');
    const { changed, code } = applyMappings(src);
    if (changed) {
      modified++;
      if (WRITE) {
        fs.writeFileSync(file, code, 'utf8');
        console.log(`🔧 Updated: ${file}`);
      } else {
        console.log(`▶ Would update: ${file}`);
      }
    }
  }

  console.log(
    WRITE
      ? `✅ Imports updated in ${modified}/${total} files.`
      : `ℹ️  Dry run complete. ${modified}/${total} files would be updated. Use --write to apply.`
  );
}

run();