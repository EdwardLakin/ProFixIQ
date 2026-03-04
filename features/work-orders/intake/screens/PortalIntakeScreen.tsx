import React, { useMemo, useState } from "react";
import type { IntakeV1 } from "../types";
import { IntakeV1Schema } from "../schema.zod";
import { portalFlow } from "../flows/portal.flow";
import { IntakeShell } from "../components/IntakeShell";
import { VehicleSelect } from "../components/subject/VehicleSelect";
import { ProfileAutofillBanner } from "../components/subject/ProfileAutofillBanner";
import { ConcernBlock } from "../components/blocks/ConcernBlock";
import { SymptomsBlock } from "../components/blocks/SymptomsBlock";
import { DuplicationBlock } from "../components/blocks/DuplicationBlock";
import { ConditionsBlock } from "../components/blocks/ConditionsBlock";
import { AuthorizationBlock } from "../components/blocks/AuthorizationBlock";
import { AttachmentsBlock } from "../components/blocks/AttachmentsBlock";
import { ReviewSubmitBlock } from "../components/blocks/ReviewSubmitBlock";
import { makeVehicleLabel } from "../mappers";

type Vehicle = { vehicle_id: string; label?: string | null; unit_number?: string | null };

export function PortalIntakeScreen(props: {
  initialIntake: IntakeV1;
  customerName?: string | null;
  vehicles: Vehicle[];
  onSaveDraft?: (intake: IntakeV1) => void;
  onSubmit: (intake: IntakeV1) => void;
}) {
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<IntakeV1>(props.initialIntake);

  const stepDef = portalFlow[step];
  const stepCount = portalFlow.length;

  const vehicles = props.vehicles.map((v) => ({
    vehicle_id: v.vehicle_id,
    label: makeVehicleLabel({ ...v, vehicle_id: v.vehicle_id }),
  }));

  const selectedVehicleLabel =
    vehicles.find((v) => v.vehicle_id === intake.subject.vehicle_id)?.label ?? null;

  const persist = (next: IntakeV1) => {
    setIntake(next);
    props.onSaveDraft?.(next);
  };

  const nextDisabled = useMemo(() => {
    if (stepDef.key === "vehicle") return !intake.subject.vehicle_id;
    if (stepDef.key === "concern") return intake.concern.primary_text.trim().length === 0;
    if (stepDef.key === "symptoms") return intake.symptoms.types.length === 0;
    return false;
  }, [stepDef.key, intake]);

  const goNext = () => setStep((s) => Math.min(s + 1, stepCount - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = () => {
    const parsed = IntakeV1Schema.parse(intake);
    props.onSubmit(parsed);
  };

  return (
    <IntakeShell
      title="Work Order Intake"
      stepTitle={stepDef.title}
      stepIndex={step}
      stepCount={stepCount}
      onBack={step > 0 ? goBack : undefined}
      onNext={step < stepCount - 1 ? goNext : undefined}
      nextDisabled={nextDisabled}
      primaryActionLabel={step === stepCount - 1 ? "Done" : "Next"}
    >
      <ProfileAutofillBanner
        customerName={props.customerName ?? null}
        vehicleLabel={selectedVehicleLabel}
        onChangeVehicle={props.vehicles.length > 1 ? () => setStep(0) : undefined}
      />

      {stepDef.key === "vehicle" && (
        <>
          {props.vehicles.length <= 1 ? (
            <div style={{ opacity: 0.75 }}>Vehicle auto-selected from your profile.</div>
          ) : (
            <VehicleSelect
              vehicles={vehicles}
              value={intake.subject.vehicle_id ?? null}
              onChange={(vehicle_id) =>
                persist({ ...intake, subject: { ...intake.subject, vehicle_id } })
              }
            />
          )}
        </>
      )}

      {stepDef.key === "concern" && (
        <ConcernBlock
          intake={intake}
          onChange={(patch) =>
            persist({ ...intake, concern: { ...intake.concern, ...patch } })
          }
        />
      )}

      {stepDef.key === "symptoms" && (
        <SymptomsBlock
          intake={intake}
          onChange={(patch) =>
            persist({ ...intake, symptoms: { ...intake.symptoms, ...patch } })
          }
        />
      )}

      {stepDef.key === "duplication" && (
        <DuplicationBlock
          intake={intake}
          onChange={(patch) =>
            persist({ ...intake, duplication: { ...intake.duplication, ...patch } })
          }
        />
      )}

      {stepDef.key === "conditions" && (
        <ConditionsBlock
          intake={intake}
          onChange={(conditions) =>
            persist({ ...intake, duplication: { ...intake.duplication, conditions } })
          }
        />
      )}

      {stepDef.key === "authorization" && (
        <AuthorizationBlock
          intake={intake}
          onChange={(patch) =>
            persist({ ...intake, authorization: { ...intake.authorization, ...patch } })
          }
        />
      )}

      {stepDef.key === "review" && (
        <div style={{ display: "grid", gap: 12 }}>
          <AttachmentsBlock
            intake={intake}
            onChange={(attachments) => persist({ ...intake, attachments })}
          />
          <ReviewSubmitBlock intake={intake} submitLabel="Submit intake" onSubmit={onSubmit} />
        </div>
      )}
    </IntakeShell>
  );
}
