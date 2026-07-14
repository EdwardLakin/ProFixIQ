import "server-only";

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import PrintButton from "./PrintButton";

type Finding = { section: string; item: string; status: "ok" | "fail" | "na"; notes: string; photos?: Array<{ storage_bucket: string; storage_path: string; original_filename: string; content_type: string; size_bytes: number; uploaded_at: string }> };
type DB = { public: { Tables: { profiles: { Row: { id: string; shop_id: string | null } }; property_inspections: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; inspection_type: string; status: string; summary: string | null; performed_by_profile_id: string; findings: unknown; completed_at: string | null; created_at: string } }; property_properties: { Row: { id: string; name: string } }; property_units: { Row: { id: string; unit_label: string } }; property_inspection_signatures: { Row: { id: string; inspection_id: string; signer_profile_id: string | null; signer_name: string; signer_email: string | null; signer_role: string; signature_type: string; signature_text: string | null; signed_at: string } } } } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const parseFindings = (value: unknown): Finding[] => (Array.isArray(value) ? value.filter((f): f is Finding => !!f && typeof f === "object" && "section" in f && "item" in f && "status" in f) : []);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) return <main className="p-6 text-[color:var(--theme-text-primary)]">Missing shop context.</main>;

  const { data: inspection } = await supabase.from("property_inspections").select("id,shop_id,property_id,unit_id,inspection_type,status,summary,performed_by_profile_id,findings,completed_at,created_at").eq("id", id).maybeSingle();
  if (!inspection || inspection.shop_id !== profile.shop_id) return <main className="p-6 text-[color:var(--theme-text-primary)]">Inspection not found.</main>;

  const [{ data: property }, { data: unit }, { data: signatures }] = await Promise.all([
    supabase.from("property_properties").select("id,name").eq("id", inspection.property_id).maybeSingle(),
    inspection.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", inspection.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("property_inspection_signatures").select("id,inspection_id,signer_profile_id,signer_name,signer_email,signer_role,signature_type,signature_text,signed_at").eq("inspection_id", inspection.id).order("signed_at", { ascending: false }),
  ]);

  const findings = parseFindings(inspection.findings);
  const bySection = findings.reduce<Record<string, Finding[]>>((acc, finding) => {
    acc[finding.section] = acc[finding.section] ?? [];
    acc[finding.section].push(finding);
    return acc;
  }, {});

  const signedUrls = new Map<string, string>();
  for (const finding of findings) {
    for (const photo of finding.photos ?? []) {
      const res = await supabase.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, 600);
      if (res.data?.signedUrl) signedUrls.set(photo.storage_path, res.data.signedUrl);
    }
  }

  const counts = findings.reduce((acc, finding) => ({ ...acc, [finding.status]: acc[finding.status] + 1 }), { ok: 0, fail: 0, na: 0 });

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-panel-strong)] p-6 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/property/inspections/${inspection.id}`} className="text-sm underline">Back to inspection</Link>
          <PrintButton />
        </div>
        <header className="border-b border-[color:var(--theme-border-soft)] pb-4">
          <h1 className="text-3xl font-semibold">Property Inspection Report</h1>
          <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">Browser print/export only. No generated PDF service.</p>
        </header>

        <section className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="font-semibold">Inspection Type:</span> {inspection.inspection_type}</div>
          <div><span className="font-semibold">Property:</span> {property?.name ?? "Unknown"}</div>
          <div><span className="font-semibold">Unit:</span> {unit?.unit_label ?? "—"}</div>
          <div><span className="font-semibold">Completed:</span> {inspection.completed_at ? new Date(inspection.completed_at).toLocaleString() : "—"}</div>
          <div><span className="font-semibold">Performed By Profile ID:</span> {inspection.performed_by_profile_id}</div>
          <div><span className="font-semibold">Summary:</span> {inspection.summary || "—"}</div>
        </section>

        <section className="grid grid-cols-3 gap-3 rounded border border-[color:var(--theme-border-soft)] p-3 text-sm">
          <div><span className="font-semibold">OK:</span> {counts.ok}</div>
          <div><span className="font-semibold">Fail:</span> {counts.fail}</div>
          <div><span className="font-semibold">N/A:</span> {counts.na}</div>
        </section>

        {Object.entries(bySection).map(([section, items]) => (
          <section key={section} className="break-inside-avoid rounded border border-[color:var(--theme-border-soft)] p-4">
            <h2 className="mb-3 text-lg font-semibold">{section}</h2>
            <div className="space-y-3">
              {items.map((finding) => (
                <article key={`${finding.section}-${finding.item}`} className="rounded border border-[color:var(--theme-border-soft)] p-3 text-sm">
                  <div className="flex justify-between gap-4"><div className="font-medium">{finding.item}</div><div className="uppercase">{finding.status}</div></div>
                  <div className="mt-1 text-[color:var(--theme-text-muted)]">{finding.notes || "No notes"}</div>
                  {(finding.photos ?? []).length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {finding.photos?.map((photo) => (
                        <div key={photo.storage_path} className="w-32 rounded border border-[color:var(--theme-border-soft)] p-1">
                          {signedUrls.get(photo.storage_path) ? <Image src={signedUrls.get(photo.storage_path) ?? ""} alt={photo.original_filename} width={120} height={120} className="h-24 w-full object-cover" unoptimized /> : null}
                          <div className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">{photo.original_filename}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}

        <section className="break-inside-avoid rounded border border-[color:var(--theme-border-soft)] p-4">
          <h2 className="mb-3 text-lg font-semibold">Signatures</h2>
          {(signatures ?? []).length === 0 ? <p className="text-sm text-[color:var(--theme-text-muted)]">No signatures recorded.</p> : (
            <div className="space-y-2 text-sm">
              {signatures?.map((sig) => (
                <div key={sig.id} className="rounded border border-[color:var(--theme-border-soft)] p-2">
                  <div><span className="font-semibold">Signer:</span> {sig.signer_name}</div>
                  <div><span className="font-semibold">Role:</span> {sig.signer_role}</div>
                  <div><span className="font-semibold">Signature Type:</span> {sig.signature_type}</div>
                  <div><span className="font-semibold">Signature Text:</span> {sig.signature_text || "—"}</div>
                  <div><span className="font-semibold">Signed At:</span> {new Date(sig.signed_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
