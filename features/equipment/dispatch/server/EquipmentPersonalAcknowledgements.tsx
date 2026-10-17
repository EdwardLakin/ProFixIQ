import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { EquipmentVisitAcknowledge } from "@/features/equipment/dispatch/components/EquipmentDispatchActions";
import { loadPersonalEquipmentAcknowledgements } from "./loadPersonalEquipmentAcknowledgements";
import { WORKSPACE_PANEL } from "@/features/workspace/components";

/** Mounted only after the Equipment Field page's existing access gates pass. */
export default async function EquipmentPersonalAcknowledgements({
  shopId,
  actorId,
}: {
  shopId: string;
  actorId: string;
}) {
  try {
    const data = await loadPersonalEquipmentAcknowledgements({
      admin: createAdminSupabase(),
      shopId,
      actorId,
    });
    return (
      <section
        className={`${WORKSPACE_PANEL} space-y-3 p-4`}
        aria-label="My dispatch acknowledgements"
      >
        <h2 className="font-semibold">My dispatch acknowledgements</h2>
        <p className="text-sm">
          Confirm receipt of your own field assignments. Acknowledgement does
          not start work or change visit status.
        </p>
        {data.partial ? (
          <p role="status" className="text-sm">
            Your pending assignment scan reached its limit. More assignments may
            remain.
          </p>
        ) : null}
        {!data.rows.length ? (
          <p className="text-sm">
            No pending Equipment acknowledgements in the loaded assignments.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.rows.map((row) => (
              <li
                key={row.visitId}
                className="space-y-2 border-t border-[color:var(--theme-border-soft)] pt-3"
              >
                <p className="text-sm">
                  {row.role === "lead" ? "Lead" : "Supporting"} assignment ·{" "}
                  {new Date(row.addedAt).toLocaleString("en-CA", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC · Visit {row.visitId.slice(0, 8)}
                </p>
                <EquipmentVisitAcknowledge visitId={row.visitId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  } catch {
    return (
      <section className={`${WORKSPACE_PANEL} p-4`} role="alert">
        Your dispatch acknowledgements could not be loaded. Refresh to try
        again.
      </section>
    );
  }
}
