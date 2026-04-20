import React from "react";
import type { IntakeV1 } from "../../types";

/**
 * Placeholder v1.
 * Store attachment references (id/kind/created_at). Do not embed blobs in intake JSON.
 */
export function AttachmentsBlock(props: {
  intake: IntakeV1;
  onChange: (attachments: NonNullable<IntakeV1["attachments"]>) => void;
}) {
  const attachments = props.intake.attachments ?? [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ fontWeight: 800 }}>Attachments (optional)</label>
      <div style={{ fontSize: 13, opacity: 0.75 }}>
        Attachments are currently unavailable in intake. Continue the intake flow
        and add supporting media from the work-order record after intake.
      </div>

      {!!attachments.length ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {attachments.map((a) => (
            <li key={a.id} style={{ marginBottom: 6 }}>
              {a.kind} • {a.label ?? a.id}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ opacity: 0.7 }}>No attachments added yet.</div>
      )}

      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Intake attachments are not yet available."
        style={{ padding: 12, borderRadius: 10, opacity: 0.55, cursor: "not-allowed" }}
      >
        Attachment upload unavailable
      </button>
    </div>
  );
}
