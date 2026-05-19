import "server-only";

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type FindingStatus = "ok" | "fail" | "na";
type Finding = {
  section: string;
  item: string;
  status: FindingStatus;
  notes: string;
  photo_notes?: string;
};

type DB = {
  public: {
    Tables: {
      profiles: { Row: { id: string; shop_id: string | null } };
      property_inspections: {
        Row: {
          id: string;
          shop_id: string;
          property_id: string;
          unit_id: string | null;
          inspection_type: string;
          status: string;
          summary: string | null;
          performed_by_profile_id: string;
          findings: unknown;
          completed_at: string | null;
          created_at: string;
        };
      };
      property_properties: { Row: { id: string; name: string } };
      property_units: { Row: { id: string; unit_label: string } };
      property_maintenance_requests: {
        Row: {
          id: string;
          property_id: string;
          unit_id: string | null;
          source: string;
          title: string;
        };
        Insert: {
          shop_id: string;
          property_id: string;
          unit_id: string | null;
          asset_id: string | null;
          requester_profile_id: string;
          title: string;
          summary: string;
          category: string | null;
          severity: "emergency" | "urgent" | "routine" | "recommended";
          status: "open";
          source: "inspection_failed_finding";
          access_notes: string | null;
          preferred_window: string | null;
          photos: unknown;
        };
      };
    };
  };
};

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const findKey = (finding: Pick<Finding, "section" | "item">) => `${finding.section}::${finding.item}`;
const parseFindings = (value: unknown): Finding[] =>
  Array.isArray(value)
    ? (value.filter((f): f is Finding => !!f && typeof f === "object" && "section" in f && "item" in f && "status" in f) as Finding[])
    : [];

async function createRequestsFromFailedInspectionFindings(formData: FormData) {
  "use server";

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property/inspections?status=validation-error");

  const inspectionId = typeof formData.get("inspection_id") === "string" ? String(formData.get("inspection_id")) : "";
  const selectedKeys = formData.getAll("finding_key").filter((v): v is string => typeof v === "string" && v.trim().length > 0);

  if (!inspectionId) redirect("/property/inspections?status=validation-error");

  const { data: inspection } = await supabase
    .from("property_inspections")
    .select("id,shop_id,property_id,unit_id,inspection_type,findings")
    .eq("id", inspectionId)
    .maybeSingle();

  if (!inspection || inspection.shop_id !== profile.shop_id || !inspection.property_id) {
    redirect(`/property/inspections/${inspectionId}?status=validation-error`);
  }

  const findings = parseFindings(inspection.findings);
  const failedByKey = new Map(findings.filter((f) => f.status === "fail").map((f) => [findKey(f), f]));

  const validFailedSelections = Array.from(new Set(selectedKeys))
    .map((key) => ({ key, finding: failedByKey.get(key) }))
    .filter((x): x is { key: string; finding: Finding } => Boolean(x.finding));

  if (validFailedSelections.length === 0) {
    redirect(`/property/inspections/${inspectionId}?status=no-failed-selected`);
  }

  let created = 0;
  let skipped = 0;

  for (const { finding } of validFailedSelections) {
    const title = `${finding.section}: ${finding.item}`;
    const notes = finding.notes?.trim() ? `\nNotes: ${finding.notes.trim()}` : "";
    const photoNotes = finding.photo_notes?.trim() ? `\nPhoto notes: ${finding.photo_notes.trim()}` : "";
    const summary = `Failed inspection item: ${finding.section} - ${finding.item}\nInspection type: ${inspection.inspection_type}${notes}${photoNotes}\nInspection ID: ${inspection.id}`;

    const { data: existing, error: lookupError } = await supabase
      .from("property_maintenance_requests")
      .select("id,title")
      .eq("property_id", inspection.property_id)
      .eq("unit_id", inspection.unit_id)
      .eq("source", "inspection_failed_finding")
      .ilike("title", `%${title}%`)
      .limit(1);

    if (lookupError) redirect(`/property/inspections/${inspectionId}?status=conversion-error`);

    if ((existing ?? []).length > 0) {
      skipped += 1;
      continue;
    }

    const { error: insertError } = await supabase.from("property_maintenance_requests").insert({
      shop_id: profile.shop_id,
      property_id: inspection.property_id,
      unit_id: inspection.unit_id,
      asset_id: null,
      requester_profile_id: user.id,
      title,
      summary,
      category: "Inspection",
      severity: "routine",
      status: "open",
      source: "inspection_failed_finding",
      access_notes: null,
      preferred_window: null,
      photos: [],
    });

    if (insertError) redirect(`/property/inspections/${inspectionId}?status=conversion-error`);
    created += 1;
  }

  if (created === 0) {
    redirect(`/property/inspections/${inspectionId}?status=no-failed-selected`);
  }

  revalidatePath("/property");
  revalidatePath("/property/inspections");
  revalidatePath(`/property/inspections/${inspectionId}`);
  redirect(`/property/inspections/${inspectionId}?status=requests-created&created=${created}&skipped=${skipped}`);
}

export default async function PropertyInspectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const status = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const created = Number(Array.isArray(sp.created) ? sp.created[0] : sp.created ?? "0");
  const skipped = Number(Array.isArray(sp.skipped) ? sp.skipped[0] : sp.skipped ?? "0");

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Profile is missing shop context.</div></main>;
  }

  const { data: row } = await supabase
    .from("property_inspections")
    .select("id,shop_id,property_id,unit_id,inspection_type,status,summary,performed_by_profile_id,findings,completed_at,created_at")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.shop_id !== profile.shop_id) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Inspection not found.</div></main>;
  }

  const [{ data: property }, { data: unit }] = await Promise.all([
    supabase.from("property_properties").select("id,name").eq("id", row.property_id).maybeSingle(),
    row.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", row.unit_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const findings = parseFindings(row.findings);
  const failedFindings = findings.filter((f) => f.status === "fail");
  const grouped = findings.reduce<Record<string, Finding[]>>((acc, finding) => {
    if (!acc[finding.section]) acc[finding.section] = [];
    acc[finding.section].push(finding);
    return acc;
  }, {});

  const counts = findings.reduce((acc, f) => ({ ...acc, [f.status]: acc[f.status] + 1 }), { ok: 0, fail: 0, na: 0 });

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-5xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><div className="mb-4 flex items-start justify-between"><div><h1 className="text-2xl font-semibold">Property inspection detail</h1><p className="text-sm text-neutral-400">Internal-only property maintenance inspection record.</p></div><Link href="/property/inspections" className="text-xs underline">Back to inspections</Link></div>
    {status === "requests-created" ? <div className="mb-4 rounded border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm">Created {Number.isFinite(created) ? created : 0} maintenance request(s). Skipped {Number.isFinite(skipped) ? skipped : 0} duplicate(s). <Link href="/property" className="underline">View maintenance dashboard</Link></div> : null}
    {status === "no-failed-selected" ? <div className="mb-4 rounded border border-amber-400/40 bg-amber-500/10 p-3 text-sm">No valid failed items were selected for conversion.</div> : null}
    {status === "conversion-error" ? <div className="mb-4 rounded border border-rose-400/40 bg-rose-500/10 p-3 text-sm">Unable to create maintenance requests from failed items. Please try again.</div> : null}
    {status === "validation-error" ? <div className="mb-4 rounded border border-rose-400/40 bg-rose-500/10 p-3 text-sm">Validation failed while converting failed inspection items.</div> : null}

    <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-[color:var(--metal-border-soft)] p-3 text-sm"><div>Type: {row.inspection_type}</div><div>Status: {row.status}</div><div>Summary: {row.summary || "—"}</div><div>Property: {property?.name ?? "Unknown"}</div><div>Unit: {unit?.unit_label ?? "—"}</div><div>Completed: {row.completed_at ? new Date(row.completed_at).toLocaleString() : "—"}</div><div>Created: {new Date(row.created_at).toLocaleString()}</div><div>Performed by profile: {row.performed_by_profile_id}</div></div><div className="rounded-xl border border-[color:var(--metal-border-soft)] p-3 text-sm"><div className="font-semibold">Finding totals</div><div className="mt-2">OK: {counts.ok}</div><div className="text-amber-300">Fail: {counts.fail}</div><div>N/A: {counts.na}</div></div></div>

    <section className="mt-4 rounded-xl border border-[color:var(--metal-border-soft)] p-4">
      <h2 className="text-sm font-semibold">Create maintenance requests from failed items</h2>
      <p className="mt-1 text-xs text-neutral-400">This creates property maintenance requests only. It does not create quotes or work orders.</p>
      {failedFindings.length === 0 ? <p className="mt-3 text-sm text-neutral-300">No failed items to convert.</p> : <form action={createRequestsFromFailedInspectionFindings} className="mt-3 space-y-3"><input type="hidden" name="inspection_id" value={row.id} required /><div className="space-y-2">{failedFindings.map((finding) => { const key = findKey(finding); return <label key={key} className="flex items-start gap-2 rounded-lg bg-black/30 p-2 text-sm"><input type="checkbox" name="finding_key" value={key} className="mt-1" /><span><span className="font-medium text-amber-200">{finding.section}: {finding.item}</span><span className="block text-neutral-300">Notes: {finding.notes || "—"}</span>{finding.photo_notes ? <span className="block text-neutral-400">Photo notes: {finding.photo_notes}</span> : null}</span></label>; })}</div><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Create maintenance requests</button></form>}
    </section>

    <div className="mt-4 space-y-3">{Object.entries(grouped).map(([section, sectionFindings]) => <section key={section} className="rounded-xl border border-[color:var(--metal-border-soft)] p-3"><h2 className="text-sm font-semibold">{section}</h2><div className="mt-2 space-y-2">{sectionFindings.map((finding, idx) => <article key={`${section}-${idx}`} className="rounded-lg bg-black/30 p-2 text-sm"><div className="font-medium">{finding.item} · <span className={`uppercase text-xs ${finding.status === "fail" ? "text-amber-300" : ""}`}>{finding.status}</span></div><div className="text-neutral-300">Notes: {finding.notes || "—"}</div>{finding.photo_notes ? <div className="text-neutral-400">Photo notes: {finding.photo_notes}</div> : null}</article>)}</div></section>)}</div></div></main>;
}
