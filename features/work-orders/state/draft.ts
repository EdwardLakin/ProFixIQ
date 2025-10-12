// features/work-orders/state/draft.ts
// Small, SSR-safe helpers to stash decoded VIN → Create page (no Zustand).
// Uses localStorage when available, falls back to sessionStorage.

export type VehicleDraft = {
  vin?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  plate?: string | null;
};

const KEY = "woDraft:vehicle";

function getStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? window.sessionStorage ?? null;
  } catch {
    try {
      return window.sessionStorage ?? null;
    } catch {
      return null;
    }
  }
}

export function setVehicleDraft(v: VehicleDraft) {
  const s = getStore();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(v));
  } catch { /* ignore quota */ }
}

export function getVehicleDraft(): VehicleDraft | null {
  const s = getStore();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    return raw ? (JSON.parse(raw) as VehicleDraft) : null;
  } catch {
    return null;
  }
}

export function clearVehicleDraft() {
  const s = getStore();
  try { s?.removeItem(KEY); } catch { /* noop */ }
}