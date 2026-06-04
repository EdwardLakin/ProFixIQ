"use client";

import React from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { Database } from "@shared/types/types/supabase";
import { createVehicleAction, type CreateVehicleState } from "@/features/vehicles/app/vehicles/actions";

type CustomerOption = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number">;

const INITIAL_STATE: CreateVehicleState = { ok: false, message: null };

function customerLabel(customer: CustomerOption): string {
  return (
    customer.business_name?.trim() ||
    customer.name?.trim() ||
    [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim() ||
    customer.email ||
    customer.phone ||
    customer.phone_number ||
    "Customer"
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[linear-gradient(135deg,rgba(197,122,74,0.28),rgba(197,122,74,0.16))] px-4 py-2 text-sm font-semibold text-orange-50 hover:border-[var(--accent-copper)] disabled:opacity-55">
      {pending ? "Adding…" : "Add vehicle"}
    </button>
  );
}

export function VehicleCreateForm({ customers }: { customers: CustomerOption[] }) {
  const [state, formAction] = useFormState(createVehicleAction, INITIAL_STATE);

  return (
    <form id="add-vehicle" action={formAction} className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Add vehicle</h2>
          <p className="mt-1 text-sm text-neutral-400">Create an unlinked unit or connect it to an existing same-shop customer.</p>
        </div>
        <SubmitButton />
      </div>

      {state.message ? <div className={`mt-4 rounded-xl border p-3 text-sm ${state.ok ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-100" : "border-red-500/30 bg-red-950/25 text-red-100"}`}>{state.message}</div> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Unit number<input name="unit_number" className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--accent-copper-soft)]" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">VIN<input name="vin" className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--accent-copper-soft)]" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">License plate<input name="license_plate" className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--accent-copper-soft)]" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Year<input name="year" inputMode="numeric" className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--accent-copper-soft)]" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Make<input name="make" className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--accent-copper-soft)]" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Model<input name="model" className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--accent-copper-soft)]" /></label>
        <label className="md:col-span-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Customer link<select name="customer_id" className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--accent-copper-soft)]"><option value="">No customer linked</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerLabel(customer)}</option>)}</select></label>
      </div>
    </form>
  );
}
