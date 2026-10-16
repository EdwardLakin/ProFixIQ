// Provider receipts currently use either an rtc_ identifier or a UUID.
const CALL_ID_PATTERN = /^(?:rtc_[a-zA-Z0-9_-]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

export function isOpenAIRealtimeCallId(value: string): boolean {
  return CALL_ID_PATTERN.test(value);
}

export function openAIRealtimeCallIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  try {
    const url = new URL(location, "https://api.openai.com");
    if (url.origin !== "https://api.openai.com") return null;
    const match = /^\/v1\/realtime\/calls\/([^/]+)$/.exec(url.pathname);
    return match && isOpenAIRealtimeCallId(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}
