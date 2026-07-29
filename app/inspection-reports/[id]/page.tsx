import { notFound, redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getInspectionReportForActor } from "@/features/inspections/server/inspectionReportAccess";
import { InspectionReportView } from "@/features/inspections/components/InspectionReportView";

export const dynamic = "force-dynamic";

export default async function InspectionReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent(`/inspection-reports/${id}`)}`);
  const record = await getInspectionReportForActor({
    actorUserId: user.id,
    inspectionId: id,
    includeEvidencePhotos: true,
  });
  if (!record) notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div className="flex justify-end">
        <a
          href={`/api/inspections/${id}/report/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-[color:var(--theme-border-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]"
        >
          Open PDF
        </a>
      </div>
      <InspectionReportView
        report={record.report}
        technicianName={record.technicianName}
        finalizedAt={record.finalizedAt}
      />
    </main>
  );
}
