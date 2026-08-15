import { numeric } from "./truckInventoryContracts";

export type TruckInventoryView = "stock" | "load" | "receive" | "history";

export type IdentityDraft = {
  code: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  unitCost: string;
  unitSellPrice: string;
};

export const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-sm font-bold text-[color:var(--theme-text-primary)] disabled:cursor-not-allowed disabled:opacity-45";
export const primaryClass = `${actionClass} border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)] text-white`;

export function quantityLabel(value: unknown): string {
  const number = numeric(value);
  return Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2);
}
