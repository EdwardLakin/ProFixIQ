"use client";

import { create } from "zustand";

type VehicleDraft = {
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  submodel: string | null;
  engine: string | null;
  engine_family: string | null;
  engine_type: string | null;
  transmission: string | null;
  transmission_type: string | null;
  fuel_type: string | null;
  drivetrain: string | null;
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
  submodel: null,
  engine: null,
  engine_family: null,
  engine_type: null,
  transmission: null,
  transmission_type: null,
  fuel_type: null,
  drivetrain: null,
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