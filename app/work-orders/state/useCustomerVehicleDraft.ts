"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type SessionCustomer = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
};

export type SessionVehicle = {
  year: string | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  mileage: string | null;
  color: string | null;
  unit_number: string | null;
  engine_hours: string | null;
};

type DraftState = {
  customer: SessionCustomer;
  vehicle: SessionVehicle;
  setCustomerField: <K extends keyof SessionCustomer>(k: K, v: SessionCustomer[K]) => void;
  setVehicleField: <K extends keyof SessionVehicle>(k: K, v: SessionVehicle[K]) => void;
  bulkSet: (p: Partial<{ customer: Partial<SessionCustomer>; vehicle: Partial<SessionVehicle> }>) => void;
  reset: () => void;
};

const emptyCustomer: SessionCustomer = {
  first_name: null,
  last_name: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  province: null,
  postal_code: null,
};

const emptyVehicle: SessionVehicle = {
  year: null,
  make: null,
  model: null,
  vin: null,
  license_plate: null,
  mileage: null,
  color: null,
  unit_number: null,
  engine_hours: null,
};

export const useCustomerVehicleDraft = create<DraftState>()(
  persist(
    (set) => ({
      customer: emptyCustomer,
      vehicle: emptyVehicle,
      setCustomerField: (k, v) => set((s) => ({ customer: { ...s.customer, [k]: v } })),
      setVehicleField: (k, v) => set((s) => ({ vehicle: { ...s.vehicle, [k]: v } })),
      bulkSet: (p) =>
        set((s) => ({
          customer: { ...s.customer, ...(p.customer ?? {}) },
          vehicle: { ...s.vehicle, ...(p.vehicle ?? {}) },
        })),
      reset: () => set({ customer: emptyCustomer, vehicle: emptyVehicle }),
    }),
    {
      name: "cv_draft_v1",
      storage: createJSONStorage(() => sessionStorage), // survives route changes in the same tab
      version: 1,
    }
  )
);