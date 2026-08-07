export type AgentMissionPlanStep = {
  position: number | null;
  title: string;
  description: string | null;
  ownerStage: string | null;
};

export type AgentMissionReview = {
  id?: string;
  status?: string;
  title?: string | null;
  desiredOutcome?: string | null;
  problemStatement?: string | null;
  acceptanceCriteria?: string[];
  constraints?: string[];
  risks?: string[];
  planSteps?: AgentMissionPlanStep[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isMissionReviewComplete(
  mission: AgentMissionReview | null | undefined,
): boolean {
  return Boolean(
    mission?.id &&
      isNonEmptyString(mission.problemStatement) &&
      isNonEmptyString(mission.desiredOutcome) &&
      Array.isArray(mission.acceptanceCriteria) &&
      mission.acceptanceCriteria.length > 0 &&
      Array.isArray(mission.constraints) &&
      Array.isArray(mission.risks) &&
      Array.isArray(mission.planSteps) &&
      mission.planSteps.length > 0,
  );
}

function MissionList({
  emptyLabel,
  items,
  title,
}: {
  emptyLabel: string;
  items: string[];
  title: string;
}) {
  return (
    <section className="space-y-1" aria-label={title}>
      <h4 className="font-semibold text-[color:var(--theme-text-primary)]">
        {title}
      </h4>
      {items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-[color:var(--theme-text-secondary)]">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[color:var(--theme-text-muted)]">{emptyLabel}</p>
      )}
    </section>
  );
}

export function AgentMissionDetails({ mission }: { mission: AgentMissionReview }) {
  const complete = isMissionReviewComplete(mission);
  const acceptanceCriteria = mission.acceptanceCriteria ?? [];
  const constraints = mission.constraints ?? [];
  const risks = mission.risks ?? [];
  const planSteps = mission.planSteps ?? [];

  return (
    <details
      className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3"
      open={mission.status === "awaiting_approval"}
    >
      <summary className="cursor-pointer font-semibold text-[color:var(--theme-text-primary)]">
        Full mission review: {mission.title ?? mission.id ?? "Engineering mission"}
      </summary>

      <div className="mt-3 space-y-4 text-xs">
        <section className="space-y-1" aria-label="Diagnosis">
          <h4 className="font-semibold text-[color:var(--theme-text-primary)]">
            Diagnosis
          </h4>
          <p className="whitespace-pre-wrap text-[color:var(--theme-text-secondary)]">
            {mission.problemStatement ?? "Diagnosis is not available."}
          </p>
        </section>

        <section className="space-y-1" aria-label="Desired outcome">
          <h4 className="font-semibold text-[color:var(--theme-text-primary)]">
            Desired outcome
          </h4>
          <p className="whitespace-pre-wrap text-[color:var(--theme-text-secondary)]">
            {mission.desiredOutcome ?? "Desired outcome is not available."}
          </p>
        </section>

        <MissionList
          title="Acceptance criteria"
          items={acceptanceCriteria}
          emptyLabel="No acceptance criteria were provided."
        />

        <section className="space-y-1" aria-label="Engineering plan">
          <h4 className="font-semibold text-[color:var(--theme-text-primary)]">
            Engineering plan
          </h4>
          {planSteps.length > 0 ? (
            <ol className="list-decimal space-y-2 pl-5 text-[color:var(--theme-text-secondary)]">
              {planSteps.map((step, index) => (
                <li key={`${step.position ?? index + 1}-${step.title}`}>
                  <span className="font-medium text-[color:var(--theme-text-primary)]">
                    {step.title}
                  </span>
                  {step.description ? ` — ${step.description}` : ""}
                  {step.ownerStage ? (
                    <span className="block text-[color:var(--theme-text-muted)]">
                      Owner stage: {step.ownerStage.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[color:var(--theme-text-muted)]">
              No engineering plan was provided.
            </p>
          )}
        </section>

        <MissionList
          title="Constraints"
          items={constraints}
          emptyLabel="No additional constraints were recorded."
        />

        <MissionList
          title="Risks"
          items={risks}
          emptyLabel="No risks were recorded."
        />

        {mission.status === "awaiting_approval" && !complete ? (
          <p role="alert" className="font-medium text-amber-300">
            Approval is disabled until the complete mission contract is available.
          </p>
        ) : null}
      </div>
    </details>
  );
}
