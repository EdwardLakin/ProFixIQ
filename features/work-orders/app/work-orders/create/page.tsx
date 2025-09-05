"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MenuItem = DB["public"]["Tables"]["menu_items"]["Row"];

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<DB>();

  // IDs (via query params or user selection)
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);

  // WO form fields
  const [type, setType] = useState<"inspection" | "maintenance" | "diagnosis">("inspection");
  const [notes, setNotes] = useState("");

  // labels for UI only
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");

  // menu items / selection
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // --- Read query params on mount -------------------------------------------
  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    const i = searchParams.get("inspectionId");
    if (v) setVehicleId(v);
    if (c) setCustomerId(c);
    if (i) {
      setInspectionId(i);
      setType("inspection");
    }
  }, [searchParams]);

  // --- Fetch labels & user menu items (plus realtime) ------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // vehicle label
      if (vehicleId) {
        const { data } = await supabase
          .from("vehicles")
          .select("year, make, model")
          .eq("id", vehicleId)
          .single();

        if (!cancelled) {
          setVehicleLabel(
            data ? `${data.year ?? ""} ${data.make ?? ""} ${data.model ?? ""}`.trim() : "",
          );
        }
      } else if (!cancelled) {
        setVehicleLabel("");
      }

      // customer label
      if (customerId) {
        const { data } = await supabase
          .from("customers")
          .select("first_name, last_name, email")
          .eq("id", customerId)
          .single();

        if (!cancelled) {
          const name = [data?.first_name ?? "", data?.last_name ?? ""].filter(Boolean).join(" ");
          setCustomerLabel(
            data ? `${name || "Customer"}${data.email ? ` (${data.email})` : ""}`.trim() : "",
          );
        }
      } else if (!cancelled) {
        setCustomerLabel("");
      }

      // menu items for current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data: items, error } = await supabase
          .from("menu_items")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!cancelled) {
          if (error) console.error("Failed to fetch menu items:", error);
          setMenuItems(items ?? []);
        }

        // realtime on this user's menu items
        const channel = supabase
          .channel("menu-items-create-quickpick")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "menu_items", filter: `user_id=eq.${user.id}` },
            async () => {
              const { data: refetch } = await supabase
                .from("menu_items")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });
              if (!cancelled) setMenuItems(refetch ?? []);
            },
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vehicleId, customerId, supabase]);

  // --- Derived picks ---------------------------------------------------------
  const selectedItems = useMemo(
    () => menuItems.filter((m) => selectedIds.includes(m.id)),
    [menuItems, selectedIds],
  );

  function togglePick(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // --- Submit ---------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!vehicleId || !customerId) {
      setError("Vehicle and Customer must be selected.");
      setLoading(false);
      return;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      setError("You must be signed in to create a work order.");
      setLoading(false);
      return;
    }

    const newId = uuidv4();

    // 1) create the work order (no location)
    const { error: insertWOError } = await supabase.from("work_orders").insert({
      id: newId,
      vehicle_id: vehicleId,
      customer_id: customerId,
      inspection_id: inspectionId,
      type,
      notes,
      user_id: user.id,
    });

    if (insertWOError) {
      console.error(insertWOError);
      setError("Failed to create work order.");
      setLoading(false);
      return;
    }

    // 2) add staged service menu items as work_order_lines
    if (selectedItems.length > 0) {
      const lineRows = selectedItems.map((m) => ({
        work_order_id: newId,
        vehicle_id: vehicleId,
        user_id: user.id,
        description: m.name ?? null,
        labor_time: m.labor_time ?? null,
        complaint: m.complaint ?? null,
        cause: m.cause ?? null,
        correction: m.correction ?? null,
        tools: m.tools ?? null,
        status: "new" as const,
        job_type: type,
      }));

      const { error: lineErr } = await supabase.from("work_order_lines").insert(lineRows);
      if (lineErr) {
        console.error("Failed to add menu items as lines:", lineErr);
      }
    }

    // 3) OPTIONAL: import inspection jobs — call API route (server-only work)
    if (inspectionId) {
      try {
        const res = await fetch("/api/work-orders/import-from-inspection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: newId,
            inspectionId,
            vehicleId,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          console.error("Import from inspection failed:", j?.error || res.statusText);
        }
      } catch (err) {
        console.error("Import from inspection errored:", err);
      }
    }

    router.push(`/work-orders/${newId}`);
  }

  // --- Render ---------------------------------------------------------------
  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <h1 className="mb-6 text-2xl font-bold">Create Work Order</h1>

      {error ? (
        <div className="mb-4 rounded bg-red-100 px-4 py-2 text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_360px]">
        {/* Left: Work Order Form */}
        <form onSubmit={handleSubmit} className="space-y-5 rounded border border-neutral-700 bg-neutral-900 p-4">

          {/* Customer & Vehicle pickers */}
          <section className="rounded border border-neutral-700 p-3">
            <h2 className="mb-3 text-lg font-semibold text-orange-400">Customer & Vehicle</h2>

            {/* Customer */}
            <div className="mb-3">
              <label className="block text-sm font-medium">Customer ID</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={customerId ?? ""}
                  onChange={(e) => setCustomerId(e.target.value.trim() || null)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Paste customer ID or use picker"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setCustomerId(null)}
                  className="rounded border border-neutral-600 px-2 text-sm hover:bg-neutral-800"
                  disabled={loading}
                >
                  Clear
                </button>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {customerLabel || (customerId ? customerId : "No customer selected")}
              </div>
              {/* If you have a real picker route, wire it here */}
              <div className="mt-1 text-xs">
                <Link
                  href="/dashboard/management/customers?return=/work-orders/create"
                  className="text-orange-400 hover:underline"
                >
                  Browse customers →
                </Link>
              </div>
            </div>

            {/* Vehicle */}
            <div>
              <label className="block text-sm font-medium">Vehicle ID</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={vehicleId ?? ""}
                  onChange={(e) => setVehicleId(e.target.value.trim() || null)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Paste vehicle ID or use picker"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setVehicleId(null)}
                  className="rounded border border-neutral-600 px-2 text-sm hover:bg-neutral-800"
                  disabled={loading}
                >
                  Clear
                </button>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {vehicleLabel || (vehicleId ? vehicleId : "No vehicle selected")}
              </div>
              <div className="mt-1 text-xs">
                <Link
                  href="/dashboard/parts/vehicles?return=/work-orders/create"
                  className="text-orange-400 hover:underline"
                >
                  Browse vehicles →
                </Link>
              </div>
            </div>
          </section>

          {/* Optional import from inspection */}
          <section className="rounded border border-neutral-700 p-3">
            <h2 className="mb-3 text-lg font-semibold text-orange-400">Optional: Import from Inspection</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={inspectionId ?? ""}
                onChange={(e) => setInspectionId(e.target.value.trim() || null)}
                className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                placeholder="Paste inspection ID (optional)"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setInspectionId(null)}
                className="rounded border border-neutral-600 px-2 text-sm hover:bg-neutral-800"
                disabled={loading}
              >
                Clear
              </button>
            </div>
            <div className="mt-1 text-xs">
              <Link
                href="/dashboard/inspections/created?return=/work-orders/create"
                className="text-orange-400 hover:underline"
              >
                View recent inspections →
              </Link>
            </div>
          </section>

          {/* WO basics */}
          <section className="rounded border border-neutral-700 p-3">
            <h2 className="mb-3 text-lg font-semibold text-orange-400">Work Order</h2>

            <div className="mb-3">
              <label className="block font-medium">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                disabled={loading}
              >
                <option value="inspection">Inspection</option>
                <option value="maintenance">Maintenance</option>
                <option value="diagnosis">Diagnosis</option>
              </select>
            </div>

            <div>
              <label className="block font-medium">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                rows={3}
                placeholder="Optional notes for technician"
                disabled={loading}
              />
            </div>

            <div className="mt-3 space-y-1 text-sm text-neutral-400">
              <p>
                <strong>Vehicle:</strong> {vehicleLabel || vehicleId || "—"}
              </p>
              <p>
                <strong>Customer:</strong> {customerLabel || customerId || "—"}
              </p>
              {inspectionId ? (
                <p>
                  <strong>Inspection ID:</strong> {inspectionId}
                </p>
              ) : null}
            </div>
          </section>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create Work Order"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/work-orders")}
              className="text-sm text-neutral-400 hover:underline"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Right: Quick Add from Service Menu */}
        <aside className="rounded border border-neutral-700 bg-neutral-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-orange-400">Service Menu</h2>
          {menuItems.length === 0 ? (
            <p className="text-sm text-neutral-400">No saved items yet. Add some in /menu.</p>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {menuItems.map((m) => {
                const picked = selectedIds.includes(m.id);
                return (
                  <li key={m.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.name}</div>
                      <div className="truncate text-xs text-neutral-400">
                        {typeof m.labor_time === "number" ? `${m.labor_time}h` : "—"}{" "}
                        {m.tools ? `• Tools: ${m.tools}` : ""} {m.complaint ? `• Complaint: ${m.complaint}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePick(m.id)}
                      className={`ml-3 rounded px-3 py-1 text-sm ${
                        picked ? "bg-neutral-700 text-white" : "bg-orange-600 text-black hover:bg-orange-700"
                      }`}
                    >
                      {picked ? "Remove" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedItems.length > 0 && (
            <div className="mt-3 text-xs text-neutral-300">
              <strong>Selected:</strong> {selectedItems.map((s) => s.name).join(", ")}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}