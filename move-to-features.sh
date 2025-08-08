#!/bin/bash

# === INSPECTIONS ===
mv app/inspection features/inspections/app/
mv src/hooks/useInspectionSession.ts features/inspections/hooks/
mv src/components/inspection features/inspections/components/
mv src/lib/inspection features/inspections/lib/
mv src/utils/getServicesByKeyword.ts features/inspections/lib/

# === WORK ORDERS ===
mv app/work-orders features/work-orders/app/
mv src/lib/work-orders features/work-orders/lib/
mv src/components/workorders features/work-orders/components/

# === AI ===
mv app/ai features/ai/app/
mv app/api/ai features/ai/api/
mv src/components/chat features/ai/components/
mv src/components/TechBot.tsx features/ai/components/
mv src/components/DtcSuggestionPopup.tsx features/ai/components/
mv src/lib/ai.ts features/ai/lib/
mv src/lib/ai features/ai/lib/
mv src/lib/chatgptHandler.ts features/ai/lib/
mv src/lib/analyze* features/ai/lib/

# === STRIPE ===
mv app/actions/getStripePlans.ts features/stripe/lib/
mv app/api/stripe features/stripe/api/
mv src/lib/stripe features/stripe/lib/

# === QUOTES ===
mv app/api/quote features/quotes/api/
mv app/quote-review features/quotes/app/
mv src/components/QuoteViewer.tsx features/quotes/components/
mv src/lib/quote features/quotes/lib/
mv src/lib/generateQuotePdf.ts features/quotes/lib/

# === DASHBOARD ===
mv app/dashboard features/dashboard/app/
mv src/components/tabs/DashboardTabs.tsx features/dashboard/components/
mv src/context/TabsProvider.tsx features/dashboard/context/
mv app/dashboard/layout.tsx features/dashboard/layout/

# === AUTH ===
mv app/auth features/auth/app/
mv app/signup features/auth/app/
mv app/forgot-password features/auth/app/
mv app/reset-password features/auth/app/
mv src/hooks/useUser.ts features/auth/hooks/
mv src/hooks/useFeatureAccess.ts features/auth/hooks/
mv src/components/SignIn.tsx features/auth/components/
mv src/components/SignOutButton.tsx features/auth/components/
mv app/api/auth features/auth/api/

# === PARTS ===
mv app/parts features/parts/app/
mv app/dashboard/parts/page.tsx features/parts/app/
mv src/lib/parts features/parts/lib/
mv src/components/PartsRequestChat.tsx features/parts/components/
mv src/components/vehicles/VehiclePhotoUploader.tsx features/parts/components/
mv src/components/vehicles/VehiclePhotoGallery.tsx features/parts/components/

# === SHARED ===
mv src/components/ui features/shared/components/
mv src/components/sidebar/DynamicRoleSidebar.tsx features/shared/components/
mv src/layout.tsx features/shared/layout/
mv src/types features/shared/types/
mv src/lib/utils.ts features/shared/lib/
mv src/lib/supabase features/shared/lib/
mv src/utils/formatters.ts features/shared/lib/

# === REMAINING CLEANUP ===
mv src/hooks/useVoiceInput.ts features/shared/hooks/
mv src/hooks/useVehicleInfo.ts features/shared/hooks/
mv src/lib/getUserSession.ts features/shared/lib/
mv src/lib/db.ts features/shared/lib/
mv src/lib/menuItems.ts features/shared/lib/

echo "✅ Feature-based reorganization complete!"