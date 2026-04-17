"use client";

export type MobileShiftMode = "none" | "shift" | "break" | "lunch" | "ended";

export type MobileShiftState = {
  shiftId: string | null;
  startTime: string | null;
  mode: MobileShiftMode;
};

type ShiftResponse =
  | {
      ok?: boolean;
      error?: string;
      shiftId?: string | null;
      startTime?: string | null;
      mode?: MobileShiftMode;
    }
  | null;

export async function fetchMobileShiftState(): Promise<MobileShiftState> {
  const res = await fetch("/api/mobile/shifts", { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as ShiftResponse;
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error ?? "Failed to load shift state");
  }

  return {
    shiftId: body.shiftId ?? null,
    startTime: body.startTime ?? null,
    mode: body.mode ?? "none",
  };
}
