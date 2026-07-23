"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, PackageOpen, Wrench } from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

type Vehicle = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "vin" | "license_plate"
>;
type RequestKind = "repair" | "parts_only";

function vehicleLabel(vehicle: Vehicle): string {
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
  const detail = vehicle.license_plate?.trim() || (vehicle.vin ? `VIN ${vehicle.vin.slice(-6)}` : "");
  return [name, detail].filter(Boolean).join(" â€¢ ");
}

const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none focus:border-[var(--accent-copper)]";

export default function QuoteRequestPageClient() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const operationKey = useRef<string>(crypto.randomUUID());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [requestKind, setRequestKind] = useState<RequestKind>("repair");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState("1");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/portal/auth/sign-in");
        return;
      }
      const { data: customer } = await supabase
        .from("customers")
        .select("id, shop_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!customer?.id || !customer.shop_id) {
        if (!cancelled) setError("Your portal account is not linked to a shop.");
        if (!cancelled) setLoading(false);
        return;
      }
      const { data, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id,year,make,model,vin,license_plate")
        .eq("shop_id", customer.shop_id)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (vehicleError) setError("We could not load your vehicles.");
      const rows = (data ?? []) as Vehicle[];
      setVehicles(rows);
      setVehicleId(rows[0]?.id ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router, supabase]);

  async function submit() {
    if (submitting) return;
    setError(null);
    if (!vehicleId) return setError("Choose a vehicle first.");
    if (description.trim().length < 3) return setError("Tell us what you want quoted.");

    setSubmitting(true);
    try {
      const response = await fetch("/api/portal/request/add-quote-only", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey.current,
        },
        body: JSON.stringify({
          vehicleId,
          requestKind,
          description: description.trim(),
          notes: notes.trim() || null,
          qty: requestKind === "parts_only" ? Number(qty) : 1,
        }),
      });
      const json = (await response.json().catch(() => null)) as
        | { workOrderId?: string; error?: string }
        | null;
      if (!response.ok || !json?.workOrderId) {
        setError(json?.error ?? "We could not send the quote request.");
        return;
      }
      operationKey.current = crypto.randomUUID();
      router.replace(`/portal/quotes?requested=${encodeURIComponent(json.workOrderId)}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not send the quote request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 text-[color:var(--theme-text-primary)]">
      <header className="space-y-2">
        <Link href="/portal/quotes" className="text-xs font-semibold text-[var(--accent-copper-light)]">â† My quotes</Link>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">Customer quote request</div>
        <h1 className="text-2xl font-semibold">What would you like priced?</h1>
        <p className="text-sm text-[color:var(--theme-text-secondary)]">
          Ask for a repair estimate or parts for pickup. You can review and approve the shopâ€™s quote here.
        </p>
      </header>

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            { kind: "repair" as const, icon: Wrench, title: "Repair quote", body: "Price work such as front brakes, steering, or exhaust repair." },
            { kind: "parts_only" as const, icon: PackageOpen, title: "Parts for pickup", body: "Ask Parts to price tires or another item for pickup." },
          ]).map((option) => {
            const active = requestKind === option.kind;
            const Icon = option.icon;
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => setRequestKind(option.kind)}
                className={`min-h-32 rounded-2xl border p-4 text-left transition ${active ? "border-[var(--accent-copper)] bg-[color:var(--theme-surface-subtle)]" : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]"}`}
              >
                <Icon className="h-5 w-5 text-[var(--accent-copper-light)]" aria-hidden="true" />
                <div className="mt-3 text-sm font-semibold">{option.title}</div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{option.body}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-4">
          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]"><Car className="h-4 w-4" /> Vehicle</span>
            {loading ? <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading vehiclesâ€¦</div> : vehicles.length ? (
              <select className={inputClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}
              </select>
            ) : (
              <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-4 text-sm">
                Add a vehicle before requesting a quote. <Link href="/portal/vehicles" className="font-semibold text-[var(--accent-copper-light)]">Add vehicle</Link>
              </div>
            )}
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              {requestKind === "repair" ? "Repair to quote" : "Part or tire to quote"}
            </span>
            <input
              className={inputClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={requestKind === "repair" ? "Example: Front brake pads and rotors" : "Example: Four winter tires, 275/65R18"}
            />
          </label>

          {requestKind === "parts_only" ? (
            <label className="block max-w-32 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Quantity</span>
              <input className={inputClass} inputMode="numeric" value={qty} onChange={(event) => setQty(event.target.value)} />
            </label>
          ) : null}

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Helpful details</span>
            <textarea
              className={`${inputClass} min-h-28 resize-none`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={requestKind === "repair" ? "Anything the shop should know about the requested repair" : "Preferred brand, size, budget, or when you need it"}
            />
          </label>

          {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div> : null}

          <Button type="button" className="min-h-12 w-full sm:w-auto" onClick={() => void submit()} disabled={loading || submitting || vehicles.length === 0}>
            {submitting ? "Sending requestâ€¦" : requestKind === "repair" ? "Request repair quote" : "Send to Parts"}
          </Button>
        </div>
      </section>
    </div>
  );
}

