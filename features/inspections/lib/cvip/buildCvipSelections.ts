// features/inspections/lib/cvip/buildCvipSelections.ts
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";

type Selections = Record<string, string[]>;

export function buildCvipSelections(mode: "air" | "hyd"): Selections {
  const wanted = new Set<string>();

  // COMMON always
  for (const code of CVIP_TRUCK_TRACTOR_COMMON_CODES) wanted.add(code);

  // System block
  const sys = mode === "air" ? CVIP_TRUCK_TRACTOR_AIR_CODES : CVIP_TRUCK_TRACTOR_HYD_CODES;
  for (const code of sys) wanted.add(code);

  const out: Selections = {};
  for (const sec of masterInspectionList) {
    const picks = sec.items
      .filter((it) => it.cvipCode && wanted.has(it.cvipCode))
      .map((it) => it.item);

    if (picks.length) out[sec.title] = picks;
  }
  return out;
}

export const CVIP_TRUCK_TRACTOR_COMMON_CODES = [
  "1.1","1.2","1.3","1.4","1.5","1.6","1.7","1.8","1.9","1.10",
  "2.1","2.2","2.3","2.4","2.5","2.6","2.7",
  "4.1","4.2","4.3",
  "5.1","5.2","5.3","5.4","5.5","5.6","5.7","5.8",
  "6.1","6.2","6.3","6.4","6.5","6.6","6.7","6.8","6.9","6.10","6.11","6.12",
  "7.1","7.2","7.3",
  "8.1","8.2","8.3","8.4","8.5","8.6","8.7","8.8","8.9","8.10",
  "9.1","9.2","9.3","9.4","9.5","9.6","9.7","9.8",
  "10.1","10.2","10.3",
] as const;

export const CVIP_TRUCK_TRACTOR_AIR_CODES = [
  "3A.1","3A.2","3A.4","3A.5","3A.6","3A.7","3A.8","3A.9","3A.10",
  "3A.13","3A.14","3A.15","3A.16","3A.17","3A.18","3A.19","3A.21","3A.23",
] as const;

export const CVIP_TRUCK_TRACTOR_HYD_CODES = [
  "3H.1","3H.3","3H.4","3H.5","3H.6",
  "3H.11","3H.12","3H.13","3H.14","3H.15","3H.16","3H.17","3H.18","3H.19",
] as const;