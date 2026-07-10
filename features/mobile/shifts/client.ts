"use client";

import type { PunchEventType, ShiftActivity, ShiftStatus } from "@/features/workforce/lib/shift-status";

export type MobileShiftMode = "none" | "shift" | "break" | "lunch" | "ended";

export type MobileShiftState = {
  shiftId: string | null;
  shiftStatus: ShiftStatus | null;
  activity: ShiftActivity;
  startTime: string | null;
  endTime: string | null;
  latestEventType: PunchEventType | null;
  latestEventAt: string | null;
  mode: MobileShiftMode;
};

type ShiftResponse = ({ ok?: boolean; error?: string } & Partial<MobileShiftState>) | null;

function modeFromActivity(activity: ShiftActivity | undefined, shiftStatus?: ShiftStatus | null): MobileShiftMode {
  if (shiftStatus === "completed") return "ended";
  if (activity === "working") return "shift";
  if (activity === "on_break") return "break";
  if (activity === "on_lunch") return "lunch";
  return "none";
}

export async function fetchMobileShiftState(): Promise<MobileShiftState> {
  const res = await fetch("/api/mobile/shifts", { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as ShiftResponse;
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Failed to load shift state");

  const activity = body.activity ?? "off_shift";
  return {
    shiftId: body.shiftId ?? null,
    shiftStatus: body.shiftStatus ?? null,
    activity,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    latestEventType: body.latestEventType ?? null,
    latestEventAt: body.latestEventAt ?? null,
    mode: body.mode ?? modeFromActivity(activity, body.shiftStatus),
  };
}
