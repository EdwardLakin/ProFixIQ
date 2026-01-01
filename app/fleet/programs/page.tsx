"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type FleetRow = DB["public"]["Tables"]["fleets"]["Row"];
type FleetInsert = DB["public"]["Tables"]["fleets"]["Insert"];

type FormMode = "create" | "edit";

const COPPER = "#C57A4A";

type FleetFormState = {
  id: string | null;
  name: string;
  contact_name: string;
  contact_email: string;
  notes: string;
};

export default function FleetProgramsPage(): JSX.Element {
  const router = useRouter();
  const [shopId, setShopId] = useState<string | null>(null);
  const [fleets, setFleets] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<FormMode>("create");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<FleetFormState>({
    id: null,
    name: "",
    contact_name: "",
    contact_email: "",
    notes: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("You must be signed in to manage fleet programs.");
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

      const resolvedShopId = profile.shop_id;
      setShopId(resolvedShopId);

      const { data: fleetRows, error: fleetsError } = await supabase
        .from("fleets")
        .select("*")
        .eq("shop_id", resolvedShopId)
        .order("created_at", { ascending: true });

      if (fleetsError) {
        setError("Failed to load fleets for this shop.");
        setLoading(false);
        return;
      }

      setFleets(fleetRows ?? []);
      setLoading(false);
    };

    void load();
  }, []);

  function resetForm() {
    setMode("create");
    setForm({
      id: null,
      name: "",
      contact_name: "",
      contact_email: "",
      notes: "",
    });
  }

  function startEdit(fleet: FleetRow) {
    setMode("edit");
    setForm({
      id: fleet.id,
      name: fleet.name ?? "",
      contact_name: fleet.contact_name ?? "",
      contact_email: fleet.contact_email ?? "",
      notes: fleet.notes ?? "",
    });
    setSuccess(null);
    setError(null);
  }

  async function handleSubmit(): Promise<void> {
    if (!shopId) {
      setError("Missing shop context.");
      return;
    }

    if (!form.name.trim()) {
      setError("Fleet name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === "create") {
        const insertPayload: FleetInsert = {
          shop_id: shopId,
          name: form.name.trim(),
          contact_name: form.contact_name.trim() || null,
          contact_email: form.contact_email.trim() || null,
          notes: form.notes.trim() || null,
        };

        const { data: inserted, error: insertError } = await supabase
          .from("fleets")
          .insert(insertPayload)
          .select("*")
          .single();

        if (insertError || !inserted) {
          throw new Error("Failed to create fleet program.");
        }

        setFleets((prev) => [...prev, inserted]);
        setSuccess("Fleet program created.");
        resetForm();
      } else {
        if (!form.id) {
          throw new Error("Missing fleet id for edit.");
        }

        const { data: updated, error: updateError } = await supabase
          .from("fleets")
          .update({
            name: form.name.trim(),
            contact_name: form.contact_name.trim() || null,
            contact_email: form.contact_email.trim() || null,
            notes: form.notes.trim() || null,
          })
          .eq("id", form.id)
          .eq("shop_id", shopId)
          .select("*")
          .single();

        if (updateError || !updated) {
          throw new Error("Failed to update fleet program.");
        }

        setFleets((prev) =>
          prev.map((f) => (f.id === updated.id ? updated : f)),
        );
        setSuccess("Fleet program updated.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="Fleet programs"
      description="Organize your units into fleets like Linehaul, Local P&D, and Trailers."
    >
      <div className="space-y-6 text-white">
        {/* Top header card */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-[0_24px_70px_rgba(0,0,0,0.85)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Programs / groups</h2>
              <p className="text-xs text-neutral-400">
                Create fleets to group tractors, trailers, buses, or other units.
                These fleets power the{" "}
                <span style={{ color: COPPER }}>Fleet Control Tower</span> and
                unit list.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/fleet")}
              className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-200 hover:bg-black/80"
            >
              <span aria-hidden>←</span>
              Back to fleet
            </button>
          </div>

          {(error || success) && (
            <div className="mb-3 space-y-2 text-xs">
              {error && (
                <div className="rounded-xl border border-red-500/60 bg-red-950/60 px-3 py-2 text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.45)]">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-xl border border-emerald-500/60 bg-emerald-950/60 px-3 py-2 text-emerald-100 shadow-[0_0_18px_rgba(6,95,70,0.45)]">
                  {success}
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                  Fleet name
                </label>
                <input
                  className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                  placeholder="e.g. Linehaul, Local P&D, Trailers"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                    Contact name
                  </label>
                  <input
                    className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                    placeholder="Dispatcher / supervisor"
                    value={form.contact_name}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        contact_name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                    Contact email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                    placeholder="contact@example.com"
                    value={form.contact_email}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        contact_email: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                  Notes
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-white/12 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                  placeholder="Optional: program notes, maintenance rules, or contract details."
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={saving || loading || !shopId}
                  className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.2em] text-black shadow-[0_0_26px_rgba(197,122,74,0.85)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? mode === "create"
                      ? "Creating…"
                      : "Saving…"
                    : mode === "create"
                      ? "Create program"
                      : "Save changes"}
                </button>
                {mode === "edit" && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </div>

            {/* Helper copy */}
            <div className="space-y-2 text-xs text-neutral-400">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                <h3 className="mb-1 text-sm font-semibold text-white">
                  How programs are used
                </h3>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    Each fleet groups a set of units via{" "}
                    <span style={{ color: COPPER }}>fleet_vehicles</span>.
                  </li>
                  <li>
                    Units enrolled here show up in the Fleet Control Tower and
                    the fleet units list.
                  </li>
                  <li>
                    You can have multiple fleets per shop: Linehaul, Local P&D,
                    Trailers, etc.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Existing fleets list */}
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.8)] sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Existing programs
          </h2>
          {loading ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : fleets.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No fleet programs yet. Create your first one above.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              {fleets.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => startEdit(f)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-left hover:border-[color:var(--accent-copper-soft)] hover:bg-black/60"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {f.name || "Unnamed fleet"}
                      </span>
                      <span className="rounded-full border border-white/16 bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">
                        Tap to edit
                      </span>
                    </div>
                    {f.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-400">
                        {f.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-neutral-500">
                    {f.contact_name && <div>{f.contact_name}</div>}
                    {f.contact_email && <div>{f.contact_email}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}