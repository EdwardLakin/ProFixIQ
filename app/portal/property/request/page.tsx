import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type Severity = "emergency" | "urgent" | "routine" | "recommended";
const ALLOWED_SEVERITIES: Severity[] = [
  "emergency",
  "urgent",
  "routine",
  "recommended",
];

type DB = {
  public: {
    Tables: {
      profiles: { Row: { id: string; shop_id: string | null } };
      property_properties: { Row: { id: string; name: string } };
      property_units: { Row: { id: string; property_id: string; unit_label: string } };
      property_assets: {
        Row: {
          id: string;
          property_id: string;
          unit_id: string | null;
          name: string;
        };
      };
      property_maintenance_requests: {
        Insert: {
          shop_id: string;
          property_id: string;
          unit_id: string | null;
          asset_id: string | null;
          requester_profile_id: string;
          title: string;
          summary: string;
          category: string | null;
          severity: Severity;
          status: "open";
          source: "tenant_preview";
          access_notes: string | null;
          preferred_window: string | null;
          photos: unknown[];
        };
      };
    };
  };
};

const client = () =>
  createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

const clean = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

async function createTenantPreviewRequest(formData: FormData) {
  "use server";

  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const [{ data: profile }, { data: properties }, { data: units }, { data: assets }] =
    await Promise.all([
      supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle(),
      supabase.from("property_properties").select("id,name").order("name"),
      supabase.from("property_units").select("id,property_id,unit_label").order("unit_label"),
      supabase.from("property_assets").select("id,property_id,unit_id,name").order("name"),
    ]);

  if (!profile?.shop_id) {
    redirect(
      "/portal/property/request?error=" +
        encodeURIComponent("Your profile is missing shop context."),
    );
  }

  const propertyId = clean(formData.get("property_id"));
  const unitId = clean(formData.get("unit_id"));
  const assetId = clean(formData.get("asset_id"));
  const requesterName = clean(formData.get("requester_name"));
  const requesterEmail = clean(formData.get("requester_email"));
  const requesterPhone = clean(formData.get("requester_phone"));
  const title = clean(formData.get("title"));
  const summary = clean(formData.get("summary"));
  const category = clean(formData.get("category"));
  const severity = (clean(formData.get("severity")) ?? "routine") as Severity;
  const accessNotes = clean(formData.get("access_notes"));
  const preferredWindow = clean(formData.get("preferred_window"));
  const photoNotes = clean(formData.get("photo_notes"));

  if (!propertyId || !(properties ?? []).some((property) => property.id === propertyId)) {
    redirect(
      "/portal/property/request?error=" +
        encodeURIComponent("Selected property is not visible."),
    );
  }

  if (!title || !summary) {
    redirect(
      "/portal/property/request?error=" +
        encodeURIComponent("Title and summary are required."),
    );
  }

  if (!ALLOWED_SEVERITIES.includes(severity)) {
    redirect(
      "/portal/property/request?error=" + encodeURIComponent("Invalid severity."),
    );
  }

  const unit = unitId ? (units ?? []).find((candidate) => candidate.id === unitId) : null;
  if (unitId && (!unit || unit.property_id !== propertyId)) {
    redirect(
      "/portal/property/request?error=" +
        encodeURIComponent("Selected unit is invalid for the chosen property."),
    );
  }

  const asset = assetId
    ? (assets ?? []).find((candidate) => candidate.id === assetId)
    : null;
  if (assetId && (!asset || asset.property_id !== propertyId)) {
    redirect(
      "/portal/property/request?error=" +
        encodeURIComponent("Selected asset is invalid for the chosen property."),
    );
  }

  if (unit && asset && asset.unit_id !== unit.id && asset.unit_id !== null) {
    redirect(
      "/portal/property/request?error=" +
        encodeURIComponent(
          "Selected asset must belong to selected unit, or be property-level.",
        ),
    );
  }

  const requesterRollup = `Requester: ${requesterName ?? "n/a"} / ${requesterEmail ?? "n/a"} / ${requesterPhone ?? "n/a"}`;
  const summaryWithRequester = `${summary}\n\n${requesterRollup}`;
  const accessNotesCombined = [accessNotes, photoNotes ? `Photo notes: ${photoNotes}` : null]
    .filter(Boolean)
    .join("\n\n");

  const { error } = await supabase.from("property_maintenance_requests").insert({
    shop_id: profile.shop_id,
    property_id: propertyId,
    unit_id: unit?.id ?? null,
    asset_id: asset?.id ?? null,
    requester_profile_id: user.id,
    title,
    summary: summaryWithRequester,
    category,
    severity,
    status: "open",
    source: "tenant_preview",
    access_notes: accessNotesCombined || null,
    preferred_window: preferredWindow,
    photos: [],
  });

  if (error) {
    redirect(
      "/portal/property/request?error=" +
        encodeURIComponent(`Unable to submit request: ${error.message}`),
    );
  }

  redirect("/portal/property/request?status=submitted");
}

export default async function PortalPropertyRequestIntakePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;

  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const [{ data: profile }, { data: properties }, { data: units }, { data: assets }] =
    await Promise.all([
      supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle(),
      supabase.from("property_properties").select("id,name").order("name"),
      supabase.from("property_units").select("id,property_id,unit_label").order("unit_label"),
      supabase.from("property_assets").select("id,property_id,unit_id,name").order("name"),
    ]);

  if (!profile?.shop_id) {
    return (
      <section className="metal-card rounded-3xl p-5">
        <h1 className="text-xl text-neutral-100">Property request intake preview</h1>
        <p className="mt-2 text-sm text-amber-300">Your profile is missing shop context.</p>
      </section>
    );
  }

  if (!(properties ?? []).length) {
    return (
      <section className="metal-card rounded-3xl p-5">
        <h1 className="text-xl text-neutral-100">Property request intake preview</h1>
        <p className="mt-2 text-sm text-neutral-300">
          Tenant request intake preview — full tenant portal access is not wired yet.
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          No properties are visible yet. Internal users can set up properties first.
        </p>
        <Link href="/property/setup" className="mt-4 inline-flex text-sm underline">
          Go to property setup
        </Link>
      </section>
    );
  }

  return (
    <section className="metal-card rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
        Property maintenance request intake
      </p>
      <h1 className="mt-2 text-2xl text-neutral-100">Tenant request intake preview</h1>
      <p className="mt-2 text-sm text-neutral-300">
        Tenant request intake preview — full tenant portal access is not wired yet.
      </p>
      <p className="mt-2 text-sm text-neutral-400">
        Read receipts and two-party request timeline will be added in a later phase.
      </p>

      {status === "submitted" ? (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Request submitted. A property manager can now review it.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <form action={createTenantPreviewRequest} className="mt-5 grid gap-3 md:grid-cols-2">
        <select name="property_id" required className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm md:col-span-2">
          <option value="">Select property</option>
          {(properties ?? []).map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>

        <select name="unit_id" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm">
          <option value="">No unit</option>
          {(units ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.unit_label}
            </option>
          ))}
        </select>

        <select name="asset_id" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm">
          <option value="">No asset</option>
          {(assets ?? []).map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>

        <input name="requester_name" placeholder="Requester name (optional)" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm" />
        <input name="requester_email" placeholder="Requester email (optional)" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm" />
        <input name="requester_phone" placeholder="Requester phone (optional)" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm md:col-span-2" />

        <input name="title" required placeholder="Request title" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm md:col-span-2" />
        <textarea name="summary" required rows={4} placeholder="Describe the issue" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm md:col-span-2" />

        <input name="category" placeholder="Category (optional)" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm" />
        <select name="severity" defaultValue="routine" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm">
          {ALLOWED_SEVERITIES.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>

        <input name="access_notes" placeholder="Access notes (optional)" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm" />
        <input name="preferred_window" placeholder="Preferred window (optional)" className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm" />

        <textarea
          name="photo_notes"
          rows={3}
          placeholder="Describe any photos/videos you would attach. File upload comes later."
          className="rounded-lg border border-neutral-700 bg-black/40 p-2 text-sm md:col-span-2"
        />

        <button
          type="submit"
          className="md:col-span-2 rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase"
        >
          Submit request preview
        </button>
      </form>
    </section>
  );
}
