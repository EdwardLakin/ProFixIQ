export type FieldServiceAccessDecision =
  | "ready"
  | "setup_required"
  | "plan_required"
  | "forbidden";

export type FieldServiceAccessCode =
  | "FIELD_SERVICE_READY"
  | "FIELD_SERVICE_SETUP_REQUIRED"
  | "FIELD_SERVICE_PLAN_REQUIRED"
  | "FIELD_SERVICE_OPERATOR_REQUIRED";

export type FieldServiceAccessContract = {
  decision: FieldServiceAccessDecision;
  code: FieldServiceAccessCode;
  productEntitled: boolean;
  configurationComplete: boolean;
  fieldServiceEnabled: boolean;
  isFieldOperator: boolean;
  canConfigure: boolean;
  canAccessFieldService: boolean;
};

export function resolveFieldServiceAccessContract(input: {
  serviceModel: string | null | undefined;
  onboardingCompletedAt: string | null | undefined;
  isFieldOperator: boolean;
  canonicalRole: string;
  productEntitled: boolean;
}): FieldServiceAccessContract {
  const canConfigure = ["owner", "admin"].includes(input.canonicalRole);
  const configurationComplete = Boolean(
    input.onboardingCompletedAt &&
    ["mobile", "both"].includes(input.serviceModel ?? ""),
  );
  const fieldServiceEnabled = input.productEntitled && configurationComplete;

  if (!input.productEntitled) {
    return {
      decision: "plan_required",
      code: "FIELD_SERVICE_PLAN_REQUIRED",
      productEntitled: false,
      configurationComplete,
      fieldServiceEnabled: false,
      isFieldOperator: input.isFieldOperator,
      canConfigure,
      canAccessFieldService: false,
    };
  }

  if (!configurationComplete) {
    return {
      decision: "setup_required",
      code: "FIELD_SERVICE_SETUP_REQUIRED",
      productEntitled: true,
      configurationComplete: false,
      fieldServiceEnabled: false,
      isFieldOperator: input.isFieldOperator,
      canConfigure,
      canAccessFieldService: false,
    };
  }

  if (!input.isFieldOperator) {
    return {
      decision: "forbidden",
      code: "FIELD_SERVICE_OPERATOR_REQUIRED",
      productEntitled: true,
      configurationComplete: true,
      fieldServiceEnabled: true,
      isFieldOperator: false,
      canConfigure,
      canAccessFieldService: false,
    };
  }

  return {
    decision: "ready",
    code: "FIELD_SERVICE_READY",
    productEntitled: true,
    configurationComplete: true,
    fieldServiceEnabled,
    isFieldOperator: true,
    canConfigure,
    canAccessFieldService: true,
  };
}

export function isFieldServiceAccessDecision(
  value: unknown,
): value is FieldServiceAccessDecision {
  return (
    value === "ready" ||
    value === "setup_required" ||
    value === "plan_required" ||
    value === "forbidden"
  );
}
