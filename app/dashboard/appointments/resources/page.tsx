"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";

type ResourceType = "capacity" | "bay" | "technician" | "service_vehicle";
type ResourceMode = "shop" | "mobile" | "both";

type SchedulerResource = {
  id: string;
  code: string;
  name: string;
  resourceType: ResourceType;
  mode: ResourceMode;
  profileId?: string | null;
  serviceVehicleId?: string | null;
  stockLocationId?: string | null;
  publicBookable: boolean;
  isFallback: boolean;
  active: boolean;
  sortOrder: number;
};

type ResourceForm = {
  code: string;
  name: string;
  resourceType: "capacity" | "bay";
  mode: "shop" | "mobile" | "both";
  publicBookable: boolean;
  active: boolean;
  sortOrder: number;
};

const EMPTY_FORM: ResourceForm = {
  code: "",
  name: "",
  resourceType: "bay",
  mode: "shop",
  publicBookable: true,
  active: true,
  sortOrder: 100,
};

function labelType(type: ResourceType): string {
  if (type === "service_vehicle") return "Service vehicle";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function managedAutomatically(resource: SchedulerResource): boolean {
  return (
    resource.isFallback ||
    resource.resourceType === "technician" ||
    resource.resourceType === "service_vehicle"
  );
}

export default function SchedulingResourcesPage() {
  const [resources, setResources] = useState<SchedulerResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ResourceForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/scheduling/resources", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        resources?: SchedulerResource[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Unable to load resources.");
      setResources(Array.isArray(body.resources) ? body.resources : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load resources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activePrimaryCapacity = useMemo(
    () =>
      resources.filter(
        (resource) =>
          resource.active &&
          !resource.isFallback &&
          ["capacity", "bay", "service_vehicle"].includes(resource.resourceType),
      ),
    [resources],
  );

  async function createResource() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Resource code and name are required.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/scheduling/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Unable to create resource.");
      toast.success("Scheduling resource created.");
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create resource.");
    } finally {
      setSaving(false);
    }
  }

  async function updateResource(
    resource: SchedulerResource,
    patch: Partial<Pick<SchedulerResource, "publicBookable" | "active" | "sortOrder">>,
  ) {
    if (managedAutomatically(resource)) return;
    const next = { ...resource, ...patch };
    try {
      const response = await fetch(`/api/scheduling/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: next.code,
          name: next.name,
          resourceType: next.resourceType,
          mode: next.mode,
          publicBookable: next.publicBookable,
          active: next.active,
          sortOrder: next.sortOrder,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Unable to update resource.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update resource.");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
          Universal Scheduler
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[color:var(--theme-text-primary)]">
          Bays & capacity
        </h1>
        <p className="max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
          Define the physical capacity ProFixIQ can book. Bays and generic capacity are
          managed here; technician and service-vehicle resources are synchronized from
          their canonical records automatically.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-4">
          <div className="text-xs uppercase tracking-[0.13em] text-[color:var(--theme-text-muted)]">
            Real capacity
          </div>
          <div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            {activePrimaryCapacity.length}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-4">
          <div className="text-xs uppercase tracking-[0.13em] text-[color:var(--theme-text-muted)]">
            Public-bookable
          </div>
          <div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            {resources.filter((resource) => resource.active && resource.publicBookable).length}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-4">
          <div className="text-xs uppercase tracking-[0.13em] text-[color:var(--theme-text-muted)]">
            Total resources
          </div>
          <div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            {resources.length}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Add bookable capacity
          </h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            Use Bay for named shop bays. Generic capacity is useful when you only care
            about how many simultaneous jobs can be accepted.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs text-[color:var(--theme-text-secondary)] xl:col-span-2">
            Name
            <Input
              className="mt-1"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Bay 1"
            />
          </label>
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Code
            <Input
              className="mt-1"
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
              placeholder="bay-1"
            />
          </label>
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Type
            <select
              className="mt-1 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm"
              value={form.resourceType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  resourceType: event.target.value as ResourceForm["resourceType"],
                }))
              }
            >
              <option value="bay">Bay</option>
              <option value="capacity">Capacity</option>
            </select>
          </label>
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Mode
            <select
              className="mt-1 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm"
              value={form.mode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  mode: event.target.value as ResourceForm["mode"],
                }))
              }
            >
              <option value="shop">Shop</option>
              <option value="mobile">Mobile</option>
              <option value="both">Both</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button className="w-full" disabled={saving} onClick={() => void createResource()}>
              {saving ? "Adding…" : "Add resource"}
            </Button>
          </div>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
          <input
            type="checkbox"
            checked={form.publicBookable}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                publicBookable: event.target.checked,
              }))
            }
          />
          Customers can book this capacity online
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] shadow-sm">
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Scheduling resources
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-[color:var(--theme-text-muted)]">Loading resources…</div>
        ) : resources.length === 0 ? (
          <div className="p-6 text-sm text-[color:var(--theme-text-muted)]">No resources found.</div>
        ) : (
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {resources.map((resource) => {
              const automatic = managedAutomatically(resource);
              return (
                <div
                  key={resource.id}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[color:var(--theme-text-primary)]">
                        {resource.name}
                      </span>
                      <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[0.68rem] uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">
                        {labelType(resource.resourceType)}
                      </span>
                      <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[0.68rem] uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">
                        {resource.mode}
                      </span>
                      {resource.isFallback ? (
                        <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[0.68rem] text-amber-700 dark:text-amber-200">
                          Compatibility fallback
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                      {resource.code}
                      {automatic ? " · managed automatically" : ""}
                      {resource.stockLocationId ? " · truck inventory linked" : ""}
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                    <input
                      type="checkbox"
                      disabled={automatic}
                      checked={resource.publicBookable}
                      onChange={(event) =>
                        void updateResource(resource, {
                          publicBookable: event.target.checked,
                        })
                      }
                    />
                    Public
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                    <input
                      type="checkbox"
                      disabled={automatic}
                      checked={resource.active}
                      onChange={(event) =>
                        void updateResource(resource, { active: event.target.checked })
                      }
                    />
                    Active
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
