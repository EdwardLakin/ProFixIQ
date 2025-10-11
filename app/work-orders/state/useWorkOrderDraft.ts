"use client";
import { create } from "zustand";

type VehicleDraft = {
  vin?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  plate?: string | null;
};

type CustomerDraft = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type DraftState = {
  vehicle: VehicleDraft;
  customer: CustomerDraft;
  setVehicle: (v: Partial<VehicleDraft>) => void;
  setCustomer: (c: Partial<CustomerDraft>) => void;
  reset: () => void;
};

export const useWorkOrderDraft = create<DraftState>((set) => ({
  vehicle: {},
  customer: {},
  setVehicle: (v) =>
    set((state) => ({
      vehicle: { ...state.vehicle, ...v },
    })),
  setCustomer: (c) =>
    set((state) => ({
      customer: { ...state.customer, ...c },
    })),
  reset: () => set({ vehicle: {}, customer: {} }),
}));