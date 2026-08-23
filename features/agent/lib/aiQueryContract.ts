import type { Database } from "@/features/shared/types/types/supabase";

type TableName = keyof Database["public"]["Tables"];
type ColumnName<Table extends TableName> = Extract<
  keyof Database["public"]["Tables"][Table]["Row"],
  string
>;
type Join<
  Values extends readonly string[],
  Separator extends string,
> = Values extends readonly []
  ? ""
  : Values extends readonly [infer Head extends string]
    ? Head
    : Values extends readonly [
          infer Head extends string,
          ...infer Tail extends readonly string[],
        ]
      ? `${Head}${Separator}${Join<Tail, Separator>}`
      : string;

/**
 * Query contract used by the operational assistant. The version intentionally
 * tracks the generated Supabase types and their latest applied migration.
 */
export const AI_QUERY_SCHEMA_VERSION =
  "supabase-types@20260822223500_reject_hidden_quote_decisions";

const AI_QUERY_FIELDS = {
  work_orders: ["id", "custom_id", "status", "created_at", "updated_at"],
  work_order_lines: [
    "id",
    "work_order_id",
    "description",
    "job_type",
    "labor_time",
    "price_estimate",
    "status",
    "approval_state",
    "notes",
    "created_at",
  ],
  work_order_quote_lines: [
    "id",
    "work_order_id",
    "work_order_line_id",
    "description",
    "job_type",
    "labor_hours",
    "est_labor_hours",
    "labor_total",
    "parts_total",
    "subtotal",
    "grand_total",
    "status",
    "stage",
    "approved_at",
    "declined_at",
    "notes",
    "created_at",
  ],
  customers: ["first_name", "last_name"],
  vehicles: [
    "year",
    "make",
    "model",
    "unit_number",
    "license_plate",
  ],
} as const satisfies {
  [Table in
    | "work_orders"
    | "work_order_lines"
    | "work_order_quote_lines"
    | "customers"
    | "vehicles"]: readonly ColumnName<Table>[];
};

type AiQueryTable = keyof typeof AI_QUERY_FIELDS;

export class AiQuerySchemaError extends Error {
  constructor() {
    super(
      "The assistant data request is incompatible with the current schema.",
    );
    this.name = "AiQuerySchemaError";
  }
}

export function validatedAiSelect<
  Table extends AiQueryTable,
  const Fields extends readonly ColumnName<Table>[],
>(
  table: Table,
  fields: Fields,
): Join<Fields, ", "> {
  const allowed = new Set<string>(AI_QUERY_FIELDS[table]);
  if (
    fields.length === 0 ||
    fields.some((field) => !allowed.has(field)) ||
    new Set(fields).size !== fields.length
  ) {
    throw new AiQuerySchemaError();
  }
  return fields.join(", ") as Join<Fields, ", ">;
}
