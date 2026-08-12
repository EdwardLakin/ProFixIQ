export type CustomerAccountType =
  | "individual"
  | "business"
  | "fleet"
  | "enterprise";

export type CustomerDuplicateCandidate = {
  id: string;
  display_name: string;
  account_type: CustomerAccountType;
  email: string | null;
  phone: string | null;
  reasons: Array<"name" | "phone" | "email" | "vin">;
  score: number;
};

export type CustomerAccountCreateInput = {
  accountType: CustomerAccountType;
  name: string | null;
  businessName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  vin?: string | null;
  matchExisting?: boolean;
  allowDuplicate?: boolean;
  operationKey?: string;
};

export type CustomerAccountCreateResult = {
  ok: boolean;
  matched_existing?: boolean;
  customer?: { id: string } & Record<string, unknown>;
  duplicate_candidates?: CustomerDuplicateCandidate[];
  code?: string;
  error?: string;
};

export class CustomerDuplicateReviewError extends Error {
  readonly candidates: CustomerDuplicateCandidate[];

  constructor(candidates: CustomerDuplicateCandidate[]) {
    super(
      "Review possible duplicate customer accounts before creating another.",
    );
    this.name = "CustomerDuplicateReviewError";
    this.candidates = candidates;
  }
}

export async function createCustomerAccount(
  input: CustomerAccountCreateInput,
): Promise<CustomerAccountCreateResult> {
  const operationKey = input.operationKey ?? crypto.randomUUID();
  const response = await fetch("/api/customers/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": operationKey,
    },
    body: JSON.stringify({ ...input, operationKey }),
  });
  const result = (await response
    .json()
    .catch(() => null)) as CustomerAccountCreateResult | null;

  if (
    response.status === 409 &&
    result?.code === "CUSTOMER_DUPLICATE_REVIEW_REQUIRED"
  ) {
    throw new CustomerDuplicateReviewError(result.duplicate_candidates ?? []);
  }
  if (!response.ok || !result?.ok || !result.customer?.id) {
    throw new Error(result?.error ?? "Customer account could not be resolved.");
  }
  return result;
}
