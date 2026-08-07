import { describe, expectTypeOf, it } from "vitest";
import type { Database } from "@/features/shared/types/types/supabase";

type Tables = Database["public"]["Tables"];
type Functions = Database["public"]["Functions"];
type Enums = Database["public"]["Enums"];
type RowOf<TableName extends keyof Tables> = Tables[TableName]["Row"];
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;
type HasForeignKey<
  TableName extends keyof Tables,
  ForeignKeyName extends string,
> = Extract<
  Tables[TableName]["Relationships"][number],
  { foreignKeyName: ForeignKeyName }
> extends never
  ? false
  : true;

describe("generated Supabase clean-replay contract", () => {
  it("excludes every retired bootstrap column", () => {
    expectTypeOf<
      HasKey<RowOf<"demo_shop_boosts">, "updated_at">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<RowOf<"email_logs">, "email" | "error" | "event_type">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<RowOf<"email_logs">, "sg_event_id" | "timestamp">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<RowOf<"fleet_members">, "id">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<RowOf<"invoices">, "due_at">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<RowOf<"messages">, "chat_id">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<
        RowOf<"payments">,
        "invoice_id" | "payment_method" | "processor" | "processor_payment_id"
      >
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<RowOf<"work_order_lines">, "void_note" | "void_reason">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<
        RowOf<"work_order_quote_lines">,
        "inspection_item_id" | "menu_item_id"
      >
    >().toEqualTypeOf<false>();
  });

  it("excludes relationships and the RPC removed with those columns", () => {
    expectTypeOf<
      HasForeignKey<"messages", "messages_chat_id_fkey">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasForeignKey<"payments", "payments_invoice_id_fkey">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasForeignKey<
        "work_order_quote_lines",
        "work_order_quote_lines_inspection_item_id_fkey"
      >
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasForeignKey<
        "work_order_quote_lines",
        "work_order_quote_lines_menu_item_id_fkey"
      >
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<Functions, "chat_post_message">
    >().toEqualTypeOf<false>();
  });

  it("retains the broader production schema surface", () => {
    expectTypeOf<
      HasKey<Tables, "workforce_document_requirements">
    >().toEqualTypeOf<true>();
    expectTypeOf<
      HasKey<Functions, "work_order_financial_lock_state">
    >().toEqualTypeOf<true>();
    expectTypeOf<HasKey<Enums, "user_role_enum">>().toEqualTypeOf<true>();
  });
});
