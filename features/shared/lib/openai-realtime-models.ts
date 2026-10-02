const DEFAULT_LIVE_MODEL = "gpt-live-1";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * GPT-Live is the shared conversational voice transport. Keep its model
 * independent from the app's text/reasoning model controls so voice upgrades
 * never silently change backend reasoning behavior.
 */
export function getOpenAILiveModel(): string {
  return env("OPENAI_LIVE_MODEL") ?? DEFAULT_LIVE_MODEL;
}
