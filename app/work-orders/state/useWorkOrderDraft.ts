"use client";

import { create } from "zustand";

type VehicleDraft = {
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  plate: string | null;
};

type CustomerDraft = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type DraftState = {
  vehicle: VehicleDraft;
  customer: CustomerDraft;
  setVehicle: (v: Partial<VehicleDraft>) => void;
  setCustomer: (c: Partial<CustomerDraft>) => void;
  reset: () => void;
};

const emptyVehicle: VehicleDraft = {
  vin: null,
  year: null,
  make: null,
  model: null,
  trim: null,
  engine: null,
  plate: null,
};

const emptyCustomer: CustomerDraft = {
  first_name: null,
  last_name: null,
  phone: null,
  email: null,
};

export const useWorkOrderDraft = create<DraftState>((set) => ({
  vehicle: { ...emptyVehicle },
  customer: { ...emptyCustomer },

  setVehicle: (v) =>
    set((state) => ({
      vehicle: { ...state.vehicle, ...v },
    })),

  setCustomer: (c) =>
    set((state) => ({
      customer: { ...state.customer, ...c },
    })),

  reset: () => set({ vehicle: { ...emptyVehicle }, customer: { ...emptyCustomer } }),
}));