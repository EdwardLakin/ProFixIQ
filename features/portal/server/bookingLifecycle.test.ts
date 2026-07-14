import { describe, expect, it } from "vitest";
import {
  canTransitionBookingStatus,
  normalizeBookingStatus,
} from "./bookingLifecycle";

describe("booking lifecycle", () => {
  it("allows staff to approve or cancel a pending request", () => {
    expect(canTransitionBookingStatus("pending", "confirmed")).toBe(true);
    expect(canTransitionBookingStatus("pending", "cancelled")).toBe(true);
  });

  it("allows confirmed appointments to complete", () => {
    expect(canTransitionBookingStatus("confirmed", "completed")).toBe(true);
  });

  it("keeps terminal states terminal", () => {
    expect(canTransitionBookingStatus("cancelled", "confirmed")).toBe(false);
    expect(canTransitionBookingStatus("completed", "pending")).toBe(false);
  });

  it("rejects unknown statuses", () => {
    expect(normalizeBookingStatus("approved")).toBeNull();
    expect(canTransitionBookingStatus("pending", "approved")).toBe(false);
  });
});
