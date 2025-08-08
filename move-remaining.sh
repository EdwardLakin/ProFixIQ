#!/bin/bash

# === AI DIAGNOSTICS ===
mkdir -p features/ai/api/{analyze,chat,diagnose,chatbot,get-messages,send-message}
mv app/api/analyze/route.ts features/ai/api/analyze/route.ts
mv app/api/chat/route.ts features/ai/api/chat/route.ts
mv app/api/diagnose/route.ts features/ai/api/diagnose/route.ts
mv app/api/chatbot/route.ts features/ai/api/chatbot/route.ts
mv app/api/get-messages/route.ts features/ai/api/get-messages/route.ts
mv app/api/send-message/route.ts features/ai/api/send-message/route.ts

# === INSPECTIONS ===
mkdir -p features/inspections/api/generate-inspection
mkdir -p features/inspections/api/inspection/submit/pdf
mv app/api/generate-inspection/route.ts features/inspections/api/generate-inspection/route.ts
mv app/api/inspection/submit/route.ts features/inspections/api/inspection/submit/route.ts
mv app/api/inspection/submit/pdf/route.ts features/inspections/api/inspection/submit/pdf/route.ts

# === SHARED - EMAIL ===
mkdir -p features/shared/lib/email
mv app/api/send-confirmation-email.ts features/shared/lib/email/sendConfirmation.ts
mv app/api/send-email/route.ts features/shared/lib/email/sendEmail.ts

# === AUTH ===
mkdir -p features/auth/api/{send-reset,set-role-cookie}
mv app/api/send-reset/route.ts features/auth/api/send-reset/route.ts
mv app/api/set-role-cookie/route.ts features/auth/api/set-role-cookie/route.ts

echo "✅ Remaining API files moved to appropriate features."