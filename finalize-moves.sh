#!/usr/bin/env bash
set -euo pipefail

echo "➡️  Creating missing feature folders..."
mkdir -p features/shared/api/email/confirm
mkdir -p features/ai/api/stats/summarize
mkdir -p features/ai/api/vin
mkdir -p features/work-orders/api/fromInspection
mkdir -p features/work-orders/api/update-status/{[id],create,list}

echo "➡️  Moving remaining API routes into features/..."
[ -f app/api/confirm-email/route.ts ] && mv app/api/confirm-email/route.ts features/shared/api/email/confirm/route.ts
[ -f app/api/summarize-stats/route.ts ] && mv app/api/summarize-stats/route.ts features/ai/api/stats/summarize/route.ts
[ -f app/api/vin/route.ts ] && mv app/api/vin/route.ts features/ai/api/vin/route.ts

[ -f app/api/work-orders/insertFromInspection/from-inspection.ts ] && mv app/api/work-orders/insertFromInspection/from-inspection.ts features/work-orders/api/fromInspection/from-inspection.ts
[ -f app/api/work-orders/insertFromInspection/route.ts ] && mv app/api/work-orders/insertFromInspection/route.ts features/work-orders/api/fromInspection/route.ts

[ -f app/api/workOrders/update-status/[id]/route.ts ] && mv app/api/workOrders/update-status/[id]/route.ts features/work-orders/api/update-status/[id]/route.ts
[ -f app/api/workOrders/update-status/create/route.ts ] && mv app/api/workOrders/update-status/create/route.ts features/work-orders/api/update-status/create/route.ts
[ -f app/api/workOrders/update-status/list/route.ts ] && mv app/api/workOrders/update-status/list/route.ts features/work-orders/api/update-status/list/route.ts
[ -f app/api/workOrders/update-status/route.ts ] && mv app/api/workOrders/update-status/route.ts features/work-orders/api/update-status/route.ts

echo "🧹 Removing duplicates that already exist in features/shared ..."
rm -f src/lib/config/userSettings.ts || true
rm -f src/lib/config/userTier.ts || true
rm -f src/lib/pdf/generateStatsPDF.ts || true
rm -f src/lib/plan/features.ts || true
rm -f src/lib/stats/getShopStats.ts || true
rm -f src/lib/tech/index.ts || true
rm -f src/lib/uploadSignature.ts || true

echo "🗑  Deleting duplicate/legacy components to avoid conflicts..."
rm -f app/components/QuoteViewer.tsx || true
rm -rf app/chat || true

echo "🧽 Cleaning up now-empty folders under src/..."
find src -type d -empty -delete

echo "✅ Done. Re-run your import rewrite if needed, then build."