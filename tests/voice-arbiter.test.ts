import { describe, expect, it, vi } from "vitest";
import {
  claimVoice,
  getVoiceHolder,
  releaseVoice,
  subscribeVoiceHolder,
} from "@/features/shared/voice/voiceArbiter";

describe("voiceArbiter", () => {
  it("preempts the previous holder and ignores stale releases", () => {
    const stopCopilot = vi.fn();
    const stopInspection = vi.fn();
    const seen: Array<string | null> = [];
    const off = subscribeVoiceHolder((o) => seen.push(o));

    claimVoice("copilot", stopCopilot);
    claimVoice("inspection", stopInspection);
    expect(stopCopilot).toHaveBeenCalledTimes(1);
    expect(getVoiceHolder()).toBe("inspection");

    releaseVoice("copilot"); // preempted owner cleaning up: must not free the mic
    expect(getVoiceHolder()).toBe("inspection");

    releaseVoice("inspection");
    expect(getVoiceHolder()).toBeNull();
    expect(stopInspection).not.toHaveBeenCalled();
    expect(seen).toEqual(["copilot", "inspection", null]);
    off();
  });
});
