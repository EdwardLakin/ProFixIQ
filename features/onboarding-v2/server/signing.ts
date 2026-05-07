import crypto from "node:crypto";

export function signOnboardingAgentPayload(input: { secret: string; shopId: string; timestampMs: number; rawBody: string }): string {
  const payload = `${input.shopId}.${input.timestampMs}`;
  return crypto.createHmac("sha256", input.secret).update(payload).digest("hex");
}
