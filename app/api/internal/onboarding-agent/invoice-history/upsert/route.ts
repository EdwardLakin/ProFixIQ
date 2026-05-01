import { handleSkippedInvoiceHistory } from "@/features/onboarding-agent/server/connector/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleSkippedInvoiceHistory(request as Request);
}
