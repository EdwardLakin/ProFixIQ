import { describe, expect, it } from "vitest";
import { hasOperationalEventVolumeDropped } from "./syncOperationalObservabilityAlerts";

describe("operational observability alert thresholds", () => {
  it("requires an installed pipeline and current business activity", () => {
    expect(
      hasOperationalEventVolumeDropped({
        installed: false,
        recentBusinessWrites: 10,
        eventsLast24h: 0,
        eventsPrevious24h: 100,
      }),
    ).toBe(false);

    expect(
      hasOperationalEventVolumeDropped({
        installed: true,
        recentBusinessWrites: 0,
        eventsLast24h: 0,
        eventsPrevious24h: 100,
      }),
    ).toBe(false);
  });

  it("ignores low-volume shops where normal variance is noisy", () => {
    expect(
      hasOperationalEventVolumeDropped({
        installed: true,
        recentBusinessWrites: 3,
        eventsLast24h: 0,
        eventsPrevious24h: 19,
      }),
    ).toBe(false);
  });

  it("alerts only when current volume is at or below twenty-five percent", () => {
    expect(
      hasOperationalEventVolumeDropped({
        installed: true,
        recentBusinessWrites: 8,
        eventsLast24h: 25,
        eventsPrevious24h: 100,
      }),
    ).toBe(true);

    expect(
      hasOperationalEventVolumeDropped({
        installed: true,
        recentBusinessWrites: 8,
        eventsLast24h: 26,
        eventsPrevious24h: 100,
      }),
    ).toBe(false);
  });
});
