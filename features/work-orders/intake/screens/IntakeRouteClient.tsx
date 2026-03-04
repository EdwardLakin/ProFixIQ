"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { IntakeMode, IntakeV1 } from "../types";
import { PortalIntakeScreen } from "./PortalIntakeScreen";
import { AppIntakeScreen } from "./AppIntakeScreen";
import { FleetIntakeScreen } from "./FleetIntakeScreen";

type Vehicle = { vehicle_id: string; label?: string | null; unit_number?: string | null };

type IntakeGetResponse = {
  workOrderId: string;
  mode: IntakeMode;
  displayName: string | null;
  vehicles: Vehicle[];
  intake: IntakeV1;
};

export default function IntakeRouteClient(props: { mode: IntakeMode }) {
  const params = useParams<{ id: string }>();
  const workOrderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IntakeGetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const titleName = useMemo(() => {
    if (!data?.displayName) return null;
    return data.displayName;
  }, [data?.displayName]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);

        if (!workOrderId) throw new Error("Missing work order id.");

        const res = await fetch(
          `/api/work-orders/${encodeURIComponent(workOrderId)}/intake?mode=${encodeURIComponent(
            props.mode,
          )}`,
          { method: "GET" },
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Failed to load intake (${res.status})`);
        }

        const json = (await res.json()) as IntakeGetResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [workOrderId, props.mode]);

  const saveDraft = async (intake: IntakeV1) => {
    if (!workOrderId) return;

    // best-effort draft save (no toast dependency)
    await fetch(`/api/work-orders/${encodeURIComponent(workOrderId)}/intake`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: props.mode, intake }),
    }).catch(() => {});
  };

  const submit = async (intake: IntakeV1) => {
    if (!workOrderId) return;

    const res = await fetch(`/api/work-orders/${encodeURIComponent(workOrderId)}/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: props.mode, intake }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Submit failed (${res.status})`);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 16, maxWidth: 860, margin: "0 auto" }}>
        Loading intake…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, maxWidth: 860, margin: "0 auto" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Intake error</div>
        <div style={{ opacity: 0.8 }}>{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 16, maxWidth: 860, margin: "0 auto" }}>
        No data returned.
      </div>
    );
  }

  if (props.mode === "portal") {
    return (
      <PortalIntakeScreen
        initialIntake={data.intake}
        customerName={titleName}
        vehicles={data.vehicles}
        onSaveDraft={saveDraft}
        onSubmit={async (intake) => {
          await submit(intake);
          // Optional: redirect after submit (you can add router.push here later)
          alert("Submitted. Thank you!");
        }}
      />
    );
  }

  if (props.mode === "fleet") {
    return (
      <FleetIntakeScreen
        initialIntake={data.intake}
        fleetName={titleName}
        vehicles={data.vehicles}
        onSaveDraft={saveDraft}
        onSubmit={async (intake) => {
          await submit(intake);
          alert("Submitted. Thank you!");
        }}
      />
    );
  }

  // app (internal)
  return (
    <AppIntakeScreen
      initialIntake={data.intake}
      customerName={titleName}
      vehicles={data.vehicles}
      onSaveDraft={saveDraft}
      onSave={async (intake) => {
        // for app: treat save as PUT draft (you can later add "save & attach to WO" flow)
        await saveDraft(intake);
        alert("Saved.");
      }}
    />
  );
}
