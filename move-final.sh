#!/bin/bash

echo "🔁 Moving remaining files into feature-based structure..."

# HOOKS
mv src/hooks/useCustomInspection.ts features/inspections/hooks/
mv src/hooks/useVehicleInfo.ts features/shared/hooks/
mv src/hooks/useVoiceInput.ts features/inspections/hooks/

# CONTEXT
mv src/context/TabsProvider.tsx features/shared/context/

# COMPONENTS
mv src/components/AIAssistantPanel.tsx features/ai/components/
mv src/components/Chatbot.tsx features/ai/components/
mv src/components/DTCCodeLookup.tsx features/ai/components/
mv src/components/SignaturePad.tsx features/shared/components/
mv src/components/SubscribeBanner.tsx features/shared/components/
mv src/components/QuickActions.tsx features/work-orders/components/
mv src/components/RecentWorkOrders.tsx features/work-orders/components/
mv src/components/TechJobScreen.tsx features/work-orders/components/
mv src/components/WorkOrder*.tsx features/work-orders/components/
mv src/components/Vehicle*.tsx features/shared/components/
mv src/components/InspectionGroupList.tsx features/inspections/components/
mv src/components/*.ts features/shared/components/
mv src/components/*.tsx features/shared/components/

# LIB
mv src/lib/chat features/ai/lib/
mv src/lib/email/sendQuoteEmail.ts features/quotes/lib/email/
mv src/lib/email features/shared/lib/email/
mv src/lib/pdf/generateStatsPDF.ts features/shared/lib/pdf/
mv src/lib/dtc.ts features/ai/lib/
mv src/lib/formatTechBotPrompt.ts features/ai/lib/
mv src/lib/parseRepairOutput.ts features/ai/lib/
mv src/lib/tech.ts features/ai/lib/
mv src/lib/techBot.ts features/ai/lib/
mv src/lib/saveWorkOrderLines.ts features/work-orders/lib/
mv src/lib/sendEmail.ts features/shared/lib/email/
mv src/lib/sendInvoiceEmail.ts features/shared/lib/email/
mv src/lib/updateLineStatus.ts features/work-orders/lib/
mv src/lib/upgradeUser.ts features/shared/lib/
mv src/lib/getNextJob.ts features/work-orders/lib/
mv src/lib/plan/features.ts features/shared/lib/plan/
mv src/lib/stats/getShopStats.ts features/shared/lib/stats/
mv src/lib/config/userSettings.ts features/shared/lib/config/
mv src/lib/config/userTier.ts features/shared/lib/config/
mv src/lib/queries.ts features/shared/lib/
mv src/lib/types.ts features/shared/types/
mv src/lib/utils/supabase/server.ts features/shared/lib/supabase/

# UTILS (deprecated folder)
mv src/utils features/shared/lib/utils/

echo "✅ Final move complete!"