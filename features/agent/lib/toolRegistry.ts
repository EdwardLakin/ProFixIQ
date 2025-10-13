import { z } from "zod";
import type { ToolContext } from "./toolTypes";

import {
  toolCreateWorkOrder,
  type CreateWorkOrderIn,
  type CreateWorkOrderOut,
} from "../tools/createWorkOrder";

import {
  toolAddWorkOrderLine,
  type AddWorkOrderLineIn,
  type AddWorkOrderLineOut,
} from "../tools/addWorkOrderLine";

import {
  toolFindCustomerVehicle,
  type FindCustomerVehicleIn,
  type FindCustomerVehicleOut,
} from "../tools/findCustomerVehicle";

import {
  toolGenerateInvoiceHtml,
  type GenerateInvoiceHtmlIn,
  type GenerateInvoiceHtmlOut,
} from "../tools/generateInvoiceHtml";

import {
  toolEmailInvoice,
  type EmailInvoiceIn,
  type EmailInvoiceOut,
} from "../tools/emailInvoice";

import {
  toolCreateCustomer,
  type CreateCustomerIn,
  type CreateCustomerOut,
} from "../tools/createCustomer";

import {
  toolCreateVehicle,
  type CreateVehicleIn,
  type CreateVehicleOut,
} from "../tools/createVehicle";

import {
  toolAttachPhoto,
  type AttachPhotoIn,
  type AttachPhotoOut,
} from "../tools/toolAttachPhoto";

/* 🔶 NEW: Custom inspection tool */
import {
  toolCreateCustomInspection,
  type CreateCustomInspectionIn,
  type CreateCustomInspectionOut,
} from "../tools/createCustomInspection";

/** Register all tools here (order doesn't matter) */
export const TOOLSET = [
  toolCreateWorkOrder,
  toolAddWorkOrderLine,
  toolFindCustomerVehicle,
  toolGenerateInvoiceHtml,
  toolEmailInvoice,
  toolCreateCustomer,
  toolCreateVehicle,
  toolAttachPhoto,
  toolCreateCustomInspection, // ← NEW
] as const;

export type ToolName = (typeof TOOLSET)[number]["name"];

export const TOOL_MAP = Object.fromEntries(
  TOOLSET.map((t) => [t.name, t])
) as Record<ToolName, (typeof TOOLSET)[number]>;

/* -------------------------------------------------------------------------- */
/* Overloads (kept for external callers)                                      */
/* -------------------------------------------------------------------------- */

export async function validateAndRun(
  name: "create_work_order",
  input: CreateWorkOrderIn,
  ctx: ToolContext
): Promise<CreateWorkOrderOut>;

export async function validateAndRun(
  name: "add_work_order_line",
  input: AddWorkOrderLineIn,
  ctx: ToolContext
): Promise<AddWorkOrderLineOut>;

export async function validateAndRun(
  name: "find_customer_vehicle",
  input: FindCustomerVehicleIn,
  ctx: ToolContext
): Promise<FindCustomerVehicleOut>;

export async function validateAndRun(
  name: "generate_invoice_html",
  input: GenerateInvoiceHtmlIn,
  ctx: ToolContext
): Promise<GenerateInvoiceHtmlOut>;

export async function validateAndRun(
  name: "email_invoice",
  input: EmailInvoiceIn,
  ctx: ToolContext
): Promise<EmailInvoiceOut>;

export async function validateAndRun(
  name: "create_customer",
  input: CreateCustomerIn,
  ctx: ToolContext
): Promise<CreateCustomerOut>;

export async function validateAndRun(
  name: "create_vehicle",
  input: CreateVehicleIn,
  ctx: ToolContext
): Promise<CreateVehicleOut>;

export async function validateAndRun(
  name: "attach_photo_to_work_order",
  input: AttachPhotoIn,
  ctx: ToolContext
): Promise<AttachPhotoOut>;

/* 🔶 NEW overload */
export async function validateAndRun(
  name: "create_custom_inspection",
  input: CreateCustomInspectionIn,
  ctx: ToolContext
): Promise<CreateCustomInspectionOut>;

/** Generic implementation (types above resolve to this) */
export async function validateAndRun(
  name: ToolName,
  input: unknown,
  ctx: ToolContext
): Promise<unknown> {
  const tool = TOOL_MAP[name];
  const parsed = (tool.inputSchema as z.ZodType<unknown>).parse(input);
  const out = await tool.run(parsed as never, ctx);
  return (tool.outputSchema as z.ZodType<unknown>).parse(out);
}

/* -------------------------------------------------------------------------- */
/* Thin, concrete wrappers (handy inside planners)                            */
/* -------------------------------------------------------------------------- */

export const runCreateWorkOrder = (input: CreateWorkOrderIn, ctx: ToolContext) =>
  validateAndRun("create_work_order", input, ctx) as Promise<CreateWorkOrderOut>;

export const runAddWorkOrderLine = (input: AddWorkOrderLineIn, ctx: ToolContext) =>
  validateAndRun("add_work_order_line", input, ctx) as Promise<AddWorkOrderLineOut>;

export const runFindCustomerVehicle = (input: FindCustomerVehicleIn, ctx: ToolContext) =>
  validateAndRun("find_customer_vehicle", input, ctx) as Promise<FindCustomerVehicleOut>;

export const runGenerateInvoiceHtml = (input: GenerateInvoiceHtmlIn, ctx: ToolContext) =>
  validateAndRun("generate_invoice_html", input, ctx) as Promise<GenerateInvoiceHtmlOut>;

export const runEmailInvoice = (input: EmailInvoiceIn, ctx: ToolContext) =>
  validateAndRun("email_invoice", input, ctx) as Promise<EmailInvoiceOut>;

export const runCreateCustomer = (input: CreateCustomerIn, ctx: ToolContext) =>
  validateAndRun("create_customer", input, ctx) as Promise<CreateCustomerOut>;

export const runCreateVehicle = (input: CreateVehicleIn, ctx: ToolContext) =>
  validateAndRun("create_vehicle", input, ctx) as Promise<CreateVehicleOut>;

export const runAttachPhoto = (input: AttachPhotoIn, ctx: ToolContext) =>
  validateAndRun("attach_photo_to_work_order", input, ctx) as Promise<AttachPhotoOut>;

/* 🔶 NEW thin wrapper */
export const runCreateCustomInspection = (
  input: CreateCustomInspectionIn,
  ctx: ToolContext
) =>
  validateAndRun("create_custom_inspection", input, ctx) as Promise<CreateCustomInspectionOut>;

/* -------------------------------------------------------------------------- */

export const ToolCallSchema = z.object({
  name: z.enum(Object.keys(TOOL_MAP) as [ToolName, ...ToolName[]]),
  input: z.unknown(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;