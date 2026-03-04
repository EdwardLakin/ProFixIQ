import React from "react";
import type { IntakeV1 } from "../../types";

export function AuthorizationBlock(props: {
  intake: IntakeV1;
  onChange: (patch: Partial<IntakeV1["authorization"]>) => void;
}) {
  const { intake, onChange } = props;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ fontWeight: 800 }}>Authorization & priority</label>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Priority</label>
        <select
          value={intake.authorization.priority}
          onChange={(e) => onChange({ priority: e.target.value as any })}
          style={{ padding: 12, borderRadius: 10, width: "100%" }}
        >
          <option value="down_urgent">Down / Urgent</option>
          <option value="can_wait">Can wait</option>
          <option value="scheduled_pm">Scheduled PM</option>
        </select>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Diagnostic authorized?</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => onChange({ diag_authorized: true })}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              opacity: intake.authorization.diag_authorized ? 1 : 0.6,
            }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ diag_authorized: false, diag_limit_amount: null })}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              opacity: !intake.authorization.diag_authorized ? 1 : 0.6,
            }}
          >
            No
          </button>
        </div>
        {intake.authorization.diag_authorized && (
          <input
            inputMode="numeric"
            placeholder="Diag limit amount (optional)"
            value={intake.authorization.diag_limit_amount ?? ""}
            onChange={(e) =>
              onChange({
                diag_limit_amount: e.target.value ? Number(e.target.value) : null,
              })
            }
            style={{ padding: 12, borderRadius: 10, width: "100%" }}
          />
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Contact before any repairs?</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => onChange({ contact_before_repairs: true })}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              opacity: intake.authorization.contact_before_repairs ? 1 : 0.6,
            }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ contact_before_repairs: false })}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              opacity: !intake.authorization.contact_before_repairs ? 1 : 0.6,
            }}
          >
            No
          </button>
        </div>

        {!intake.authorization.contact_before_repairs && (
          <input
            inputMode="numeric"
            placeholder="Proceed up to amount (optional)"
            value={intake.authorization.repair_limit_amount ?? ""}
            onChange={(e) =>
              onChange({
                repair_limit_amount: e.target.value ? Number(e.target.value) : null,
              })
            }
            style={{ padding: 12, borderRadius: 10, width: "100%" }}
          />
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontWeight: 700 }}>Preferred contact (optional)</label>
        <select
          value={intake.authorization.preferred_contact ?? ""}
          onChange={(e) => onChange({ preferred_contact: (e.target.value || null) as any })}
          style={{ padding: 12, borderRadius: 10, width: "100%" }}
        >
          <option value="">Use profile default</option>
          <option value="phone">Phone</option>
          <option value="text">Text</option>
          <option value="email">Email</option>
          <option value="portal">Portal</option>
        </select>
      </div>
    </div>
  );
}
