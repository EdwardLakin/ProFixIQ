import { POST as handleMarketingChatbotPost } from "@/features/ai/api/chatbot/route";

// Public mutating route. The delegated feature handler uses a service-role
// backed, atomic quota RPC before any billable provider call.
export async function POST(req: Request) {
  return handleMarketingChatbotPost(req);
}

export const runtime = "nodejs";
