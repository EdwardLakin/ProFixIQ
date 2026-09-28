import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
} from "@/features/shared/hooks/useNotificationPreferences";

describe("notification preferences", () => {
  it("uses quiet, independently switchable defaults for invalid metadata", () => {
    expect(parseNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences({
      messagePopups: false, assistantPopups: false, navigationIndicators: true,
    })).toEqual({
      messagePopups: false, assistantPopups: false, navigationIndicators: true,
    });
    expect(parseNotificationPreferences({ messagePopups: "false" }).messagePopups).toBe(true);
  });

  it("never emits a message popup from an unverified realtime payload", () => {
    const source = readFileSync("features/shared/components/AppShell.tsx", "utf8");
    expect(source).toContain("inboxInitialized.current && unseen");
    expect(source).toContain('claimNotificationPopup(userId, "message", message.id)');
    expect(source).toContain('claimNotificationPopup(userId, "assistant", action.id)');
    expect(source).toContain('fetch("/api/shop-assistant/actions/pending"');
    expect(source).toContain('const conversations = (await response');
    expect(source).toContain("preferences.messagePopups");
    expect(source).toContain("preferences.assistantPopups");
    const realtimeSection = source.split('const channel = supabase')[1].split('cleanup = () =>')[0];
    expect(realtimeSection).not.toContain('toast.info("New inbox message"');
  });
});
