import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getEquipmentClassification,
  getKnownEquipmentClassification,
  getRememberedViewerProfileId,
  rememberViewerProfileId,
  resetEquipmentClassificationForTests,
} from "@/features/equipment/lib/equipmentClassification";

const scope = { userId: "user-1", shopId: "shop-1" };
const otherShop = { userId: "user-1", shopId: "shop-2" };

function endpoint(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

beforeEach(() => {
  resetEquipmentClassificationForTests();
  vi.useRealTimers();
});

describe("Equipment classification", () => {
  it("asks the authoritative entitlement endpoint", async () => {
    const fetchMock = endpoint({ enabled: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getEquipmentClassification(scope)).toBe("equipment");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/equipment/entitlement");
  });

  it("reports a shop without the add-on as standard", async () => {
    vi.stubGlobal("fetch", endpoint({ enabled: false }));
    expect(await getEquipmentClassification(scope)).toBe("standard");
  });

  it("reuses a fresh answer instead of asking again", async () => {
    const fetchMock = endpoint({ enabled: true });
    vi.stubGlobal("fetch", fetchMock);
    await getEquipmentClassification(scope);
    await getEquipmentClassification(scope);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the last known answer when the endpoint cannot be reached (offline)", async () => {
    vi.stubGlobal("fetch", endpoint({ enabled: true }));
    await getEquipmentClassification(scope);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60 * 60_000); // answer is stale now
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await getEquipmentClassification(scope)).toBe("equipment");
  });

  it("is unknown, never guessed, when there is no answer to fall back on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await getEquipmentClassification(scope)).toBe("unknown");
    expect(getKnownEquipmentClassification(scope)).toBe("unknown");
  });

  it("does not touch the network while the browser is offline, and uses the last known answer", async () => {
    vi.stubGlobal("fetch", endpoint({ enabled: true }));
    await getEquipmentClassification(scope);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60 * 60_000);
    const fetchMock = endpoint({ enabled: false });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    try {
      expect(await getEquipmentClassification(scope)).toBe("equipment");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    }
  });

  it("is unknown for a failing or malformed endpoint", async () => {
    vi.stubGlobal("fetch", endpoint({ error: "no" }, false));
    expect(await getEquipmentClassification(scope)).toBe("unknown");
    vi.stubGlobal("fetch", endpoint({ enabled: "yes" }));
    expect(await getEquipmentClassification(scope)).toBe("unknown");
  });

  it("is unknown without a shop scope, and one shop's answer never leaks into another", async () => {
    vi.stubGlobal("fetch", endpoint({ enabled: true }));
    await getEquipmentClassification(scope);
    expect(getKnownEquipmentClassification(otherShop)).toBe("unknown");
    expect(getKnownEquipmentClassification(null)).toBe("unknown");
  });

  it("remembers the viewer's profile id per shop and user", () => {
    rememberViewerProfileId(scope, "profile-9");
    expect(getRememberedViewerProfileId(scope)).toBe("profile-9");
    expect(getRememberedViewerProfileId(otherShop)).toBeNull();
  });
});
