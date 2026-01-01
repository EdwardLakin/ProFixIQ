"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type FleetVehicleInsert = DB["public"]["Tables"]["fleet_vehicles"]["Insert"];

type Mode = "new_vehicle" | "existing_vehicle";



export default function FleetUnitNewPage(): JSX.Element {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [creatorShopId, setCreatorShopId] = useState<string | null>(null);
  const [fleets, setFleets] = useState<FleetRow[]>([]);

  const [mode, setMode] = useState<Mode>("new_vehicle");

  const [fleetId, setFleetId] = useState<string>("");
  const [existingVehicleId, setExistingVehicleId] = useState<string>("");

  const [nickname, setNickname] = useState<string>("");
  const [unitNumber, setUnitNumber] = useState<string>("");
  const [vin, setVin] = useState<string>("");
  const [plate, setPlate] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [make, setMake] = useState<string>("");
  const [model, setModel] = useState<string>("");

  const [customKm, setCustomKm] = useState<string>("");
  const [customHours, setCustomHours] = useState<string>("");
  const [customDays, setCustomDays] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("You must be signed in to add fleet units.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.shop_id) {
        setError("Unable to resolve your shop. Check your profile settings.");
        setLoading(false);
        return;
      }

      const shopId = profile.shop_id;
      setCreatorShopId(shopId);

      const { data: fleetRows, error: fleetError } = await supabase
        .from("fleets")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: true });

      if (fleetError) {
        setError("Failed to load fleets for this shop.");
        setLoading(false);
        return;
      }

      setFleets(fleetRows ?? []);
      if ((fleetRows ?? []).length > 0 && !fleetId) {
        setFleetId((fleetRows ?? [])[0].id);
      }

      setLoading(false);
    };

    void load();
  }, [fleetId]);

  async function handleSubmit(): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!creatorShopId) {
        throw new Error("Missing shop context.");
      }

      if (!fleetId) {
        throw new Error("Select a fleet program before adding a unit.");
      }

      let vehicleId: string | null = null;

      if (mode === "existing_vehicle") {
        const trimmed = existingVehicleId.trim();
        if (!trimmed) {
          throw new Error("Enter an existing Vehicle ID or switch to New vehicle.");
        }
        vehicleId = trimmed;
      } else {
        // create new vehicle
        if (!unitNumber.trim() && !vin.trim() && !plate.trim()) {
          throw new Error(
            "Provide at least a unit number, VIN, or plate for the new vehicle.",
          );
        }

        const yearTrim = year.trim();
        const yearValue =
          yearTrim.length > 0 ? Number.parseInt(yearTrim, 10) : null;

        const vehicleInsert: VehicleInsert = {
          shop_id: creatorShopId,
          unit_number: unitNumber.trim() || null,
          vin: vin.trim() || null,
          license_plate: plate.trim() || null,
          year: Number.isNaN(yearValue) ? null : yearValue,
          make: make.trim() || null,
          model: model.trim() || null,
        };

        const { data: insertedVehicle, error: vehicleError } = await supabase
          .from("vehicles")
          .insert(vehicleInsert)
          .select("id")
          .single();

        if (vehicleError || !insertedVehicle) {
          throw new Error("Failed to create vehicle record.");
        }

        vehicleId = insertedVehicle.id;
      }

      if (!vehicleId) {
        throw new Error("Unable to resolve vehicle for fleet unit.");
      }

      const kmTrim = customKm.trim();
      const hoursTrim = customHours.trim();
      const daysTrim = customDays.trim();

      const kmVal =
        kmTrim.length > 0 ? Number.parseInt(kmTrim, 10) : null;
      const hoursVal =
        hoursTrim.length > 0 ? Number.parseInt(hoursTrim, 10) : null;
      const daysVal =
        daysTrim.length > 0 ? Number.parseInt(daysTrim, 10) : null;

      const fleetVehicleInsert: FleetVehicleInsert = {
        fleet_id: fleetId,
        vehicle_id: vehicleId,
        active: true,
        nickname: nickname.trim() || null,
        custom_interval_km: Number.isNaN(kmVal) ? null : kmVal,
        custom_interval_hours: Number.isNaN(hoursVal) ? null : hoursVal,
        custom_interval_days: Number.isNaN(daysVal) ? null : daysVal,
      };

      const { error: fvError } = await supabase
        .from("fleet_vehicles")
        .insert(fleetVehicleInsert);

      if (fvError) {
        throw new Error("Failed to link vehicle into fleet.");
      }

      setSuccess("Fleet unit added.");
      setExistingVehicleId("");
      setNickname("");
      if (mode === "new_vehicle") {
        setUnitNumber("");
        setVin("");
        setPlate("");
        setYear("");
        setMake("");
        setModel("");
      }

      // send them back to units list
      router.push("/fleet/units");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || fleets.length === 0;

  return (
    <PageShell
      title="Add fleet unit"
      description="Enroll a vehicle into a fleet program so it appears in the tower, pre-trips, and service requests."
    >
      <div className="space-y-6 text-white">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-[0_24px_70px_rgba(0,0,0,0.85)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Fleet & vehicle</h2>
              <p className="text-xs text-neutral-400">
                Choose the fleet program and either link an existing vehicle or
                create a new asset.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/fleet/units")}
              className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-200 hover:bg-black/80"
            >
              <span aria-hidden>←</span>
              Back to units
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-400">Loading fleet data…</p>
          ) : fleets.length === 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-3 text-xs text-amber-100">
              No fleet programs found for this shop. Create a fleet in the
              database (or future Fleet Programs screen) before adding units.
            </div>
          ) : null}

          {error && (
            <div className="mt-3 rounded-xl border border-red-500/60 bg-red-950/60 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.45)]">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-3 rounded-xl border border-emerald-500/60 bg-emerald-950/60 px-3 py-2 text-xs text-emerald-100 shadow-[0_0_18px_rgba(6,95,70,0.45)]">
              {success}
            </div>
          )}

          <div className="mt-4 space-y-5 opacity-100">
            {/* Fleet selection */}
            <div className="space-y-1 text-sm">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Fleet program
              </label>
              <select
                disabled={disabled}
                className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                value={fleetId}
                onChange={(e) => setFleetId(e.target.value)}
              >
                {fleets.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-neutral-500">
                Units enrolled here show up together in the Fleet Control Tower.
              </p>
            </div>

            {/* Mode toggle */}
            <div className="space-y-2 text-sm">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Vehicle mode
              </label>
              <div className="inline-flex rounded-full border border-white/14 bg-black/70 p-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMode("new_vehicle")}
                  className={`flex-1 rounded-full px-3 py-1 uppercase tracking-[0.18em] transition ${
                    mode === "new_vehicle"
                      ? "bg-[color:var(--accent-copper)] text-black font-semibold shadow-[0_0_18px_rgba(197,122,74,0.85)]"
                      : "text-neutral-300 hover:bg-black/60"
                  }`}
                >
                  New vehicle
                </button>
                <button
                  type="button"
                  onClick={() => setMode("existing_vehicle")}
                  className={`flex-1 rounded-full px-3 py-1 uppercase tracking-[0.18em] transition ${
                    mode === "existing_vehicle"
                      ? "bg-[color:var(--accent-copper)] text-black font-semibold shadow-[0_0_18px_rgba(197,122,74,0.85)]"
                      : "text-neutral-300 hover:bg-black/60"
                  }`}
                >
                  Existing vehicle
                </button>
              </div>
            </div>

            {/* Existing vehicle ID */}
            {mode === "existing_vehicle" && (
              <div className="space-y-1 text-sm">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                  Existing Vehicle ID
                </label>
                <input
                  disabled={disabled}
                  className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Paste vehicles.id"
                  value={existingVehicleId}
                  onChange={(e) => setExistingVehicleId(e.target.value)}
                />
                <p className="text-[11px] text-neutral-500">
                  Later you can replace this with a VIN / plate search picker.
                </p>
              </div>
            )}

            {/* New vehicle details */}
            {mode === "new_vehicle" && (
              <div className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                      Unit #
                    </label>
                    <input
                      disabled={disabled}
                      className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Truck / trailer ID"
                      value={unitNumber}
                      onChange={(e) => setUnitNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                      Plate
                    </label>
                    <input
                      disabled={disabled}
                      className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="License plate"
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                      VIN
                    </label>
                    <input
                      disabled={disabled}
                      className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="VIN"
                      value={vin}
                      onChange={(e) => setVin(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                      Year
                    </label>
                    <input
                      disabled={disabled}
                      className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="YYYY"
                      inputMode="numeric"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                      Make
                    </label>
                    <input
                      disabled={disabled}
                      className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Make"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                      Model
                    </label>
                    <input
                      disabled={disabled}
                      className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Model / trim"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fleet meta */}
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                  Display nickname
                </label>
                <input
                  disabled={disabled}
                  className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Optional label (e.g. Linehaul 12)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                  Custom intervals (optional)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    disabled={disabled}
                    className="w-full rounded-lg border border-white/12 bg-black/70 px-2 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="km"
                    inputMode="numeric"
                    value={customKm}
                    onChange={(e) => setCustomKm(e.target.value)}
                  />
                  <input
                    disabled={disabled}
                    className="w-full rounded-lg border border-white/12 bg-black/70 px-2 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="hours"
                    inputMode="numeric"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                  />
                  <input
                    disabled={disabled}
                    className="w-full rounded-lg border border-white/12 bg-black/70 px-2 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="days"
                    inputMode="numeric"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-neutral-500">
                  Used later to drive next inspection dates and reminders.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={disabled || saving}
                onClick={() => void handleSubmit()}
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.2em] text-black shadow-[0_0_26px_rgba(197,122,74,0.85)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Add fleet unit"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}