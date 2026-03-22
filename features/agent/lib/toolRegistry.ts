// features/agent/lib/toolRegistry.ts
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

import {
  toolCreateCustomInspection,
  type CreateCustomInspectionIn,
  type CreateCustomInspectionOut,
} from "../tools/createCustomInspection";

import {
  toolFindOrCreateFleet,
  type FindOrCreateFleetIn,
  type FindOrCreateFleetOut,
} from "../tools/findOrCreateFleet";

import {
  toolFindOrCreateFleetProgram,
  type FindOrCreateFleetProgramIn,
  type FindOrCreateFleetProgramOut,
} from "../tools/findOrCreateFleetProgram";

import {
  toolGenerateFleetWorkOrders,
  type GenerateFleetWorkOrdersIn,
  type GenerateFleetWorkOrdersOut,
} from "../tools/generateFleetWorkOrders";

import {
  toolListPendingApprovals,
  type ListPendingApprovalsIn,
  type ListPendingApprovalsOut,
} from "../tools/listPendingApprovals";

import {
  toolSetLineApproval,
  type SetLineApprovalIn,
  type SetLineApprovalOut,
} from "../tools/setLineApproval";

import {
  toolRecordWorkOrderApproval,
  type RecordWorkOrderApprovalIn,
  type RecordWorkOrderApprovalOut,
} from "../tools/recordWorkOrderApproval";

/* new ops tools */
import { runGetCustomerVisitHistory as runGetCustomerVisitHistoryTool } from "../tools/getCustomerVisitHistory";
import { runGetVehicleHistory as runGetVehicleHistoryTool } from "../tools/getVehicleHistory";
import { runGetShopCurrentStatus as runGetShopCurrentStatusTool } from "../tools/getShopCurrentStatus";
import { runGetStalledWorkOrders as runGetStalledWorkOrdersTool } from "../tools/getStalledWorkOrders";
import { runGetBookings as runGetBookingsTool } from "../tools/getBookings";
import { runRescheduleBooking as runRescheduleBookingTool } from "../tools/rescheduleBooking";
import { runGetWorkOrderStatusSummary as runGetWorkOrderStatusSummaryTool } from "../tools/getWorkOrderStatusSummary";

/** Register schema-backed tools here */
export const TOOLSET = [
  toolCreateWorkOrder,
  toolAddWorkOrderLine,
  toolFindCustomerVehicle,
  toolGenerateInvoiceHtml,
  toolEmailInvoice,
  toolCreateCustomer,
  toolCreateVehicle,
  toolAttachPhoto,
  toolCreateCustomInspection,
  toolFindOrCreateFleet,
  toolFindOrCreateFleetProgram,
  toolGenerateFleetWorkOrders,
  toolListPendingApprovals,
  toolSetLineApproval,
  toolRecordWorkOrderApproval,
] as const;

export type ToolName = (typeof TOOLSET)[number]["name"];

export const TOOL_MAP = Object.fromEntries(
  TOOLSET.map((t) => [t.name, t]),
) as Record<ToolName, (typeof TOOLSET)[number]>;

export async function validateAndRun(
  name: "create_work_order",
  input: CreateWorkOrderIn,
  ctx: ToolContext,
): Promise<CreateWorkOrderOut>;
export async function validateAndRun(
  name: "add_work_order_line",
  input: AddWorkOrderLineIn,
  ctx: ToolContext,
): Promise<AddWorkOrderLineOut>;
export async function validateAndRun(
  name: "find_customer_vehicle",
  input: FindCustomerVehicleIn,
  ctx: ToolContext,
): Promise<FindCustomerVehicleOut>;
export async function validateAndRun(
  name: "generate_invoice_html",
  input: GenerateInvoiceHtmlIn,
  ctx: ToolContext,
): Promise<GenerateInvoiceHtmlOut>;
export async function validateAndRun(
  name: "email_invoice",
  input: EmailInvoiceIn,
  ctx: ToolContext,
): Promise<EmailInvoiceOut>;
export async function validateAndRun(
  name: "create_customer",
  input: CreateCustomerIn,
  ctx: ToolContext,
): Promise<CreateCustomerOut>;
export async function validateAndRun(
  name: "create_vehicle",
  input: CreateVehicleIn,
  ctx: ToolContext,
): Promise<CreateVehicleOut>;
export async function validateAndRun(
  name: "attach_photo_to_work_order",
  input: AttachPhotoIn,
  ctx: ToolContext,
): Promise<AttachPhotoOut>;
export async function validateAndRun(
  name: "create_custom_inspection",
  input: CreateCustomInspectionIn,
  ctx: ToolContext,
): Promise<CreateCustomInspectionOut>;
export async function validateAndRun(
  name: "find_or_create_fleet",
  input: FindOrCreateFleetIn,
  ctx: ToolContext,
): Promise<FindOrCreateFleetOut>;
export async function validateAndRun(
  name: "find_or_create_fleet_program",
  input: FindOrCreateFleetProgramIn,
  ctx: ToolContext,
): Promise<FindOrCreateFleetProgramOut>;
export async function validateAndRun(
  name: "generate_fleet_work_orders",
  input: GenerateFleetWorkOrdersIn,
  ctx: ToolContext,
): Promise<GenerateFleetWorkOrdersOut>;
export async function validateAndRun(
  name: "list_pending_approvals",
  input: ListPendingApprovalsIn,
  ctx: ToolContext,
): Promise<ListPendingApprovalsOut>;
export async function validateAndRun(
  name: "set_line_approval",
  input: SetLineApprovalIn,
  ctx: ToolContext,
): Promise<SetLineApprovalOut>;
export async function validateAndRun(
  name: "record_work_order_approval",
  input: RecordWorkOrderApprovalIn,
  ctx: ToolContext,
): Promise<RecordWorkOrderApprovalOut>;

export async function validateAndRun(
  name: ToolName,
  input: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = TOOL_MAP[name];
  const parsed = (tool.inputSchema as z.ZodType<unknown>).parse(input);
  const out = await tool.run(parsed as never, ctx);
  return (tool.outputSchema as z.ZodType<unknown>).parse(out);
}

/* existing concrete wrappers */
export const runCreateWorkOrder = (
  input: CreateWorkOrderIn,
  ctx: ToolContext,
): Promise<CreateWorkOrderOut> =>
  validateAndRun("create_work_order", input, ctx) as Promise<CreateWorkOrderOut>;

export const runAddWorkOrderLine = (
  input: AddWorkOrderLineIn,
  ctx: ToolContext,
): Promise<AddWorkOrderLineOut> =>
  validateAndRun("add_work_order_line", input, ctx) as Promise<AddWorkOrderLineOut>;

export const runFindCustomerVehicle = (
  input: FindCustomerVehicleIn,
  ctx: ToolContext,
): Promise<FindCustomerVehicleOut> =>
  validateAndRun("find_customer_vehicle", input, ctx) as Promise<FindCustomerVehicleOut>;

export const runGenerateInvoiceHtml = (
  input: GenerateInvoiceHtmlIn,
  ctx: ToolContext,
): Promise<GenerateInvoiceHtmlOut> =>
  validateAndRun("generate_invoice_html", input, ctx) as Promise<GenerateInvoiceHtmlOut>;

export const runEmailInvoice = (
  input: EmailInvoiceIn,
  ctx: ToolContext,
): Promise<EmailInvoiceOut> =>
  validateAndRun("email_invoice", input, ctx) as Promise<EmailInvoiceOut>;

export const runCreateCustomer = (
  input: CreateCustomerIn,
  ctx: ToolContext,
): Promise<CreateCustomerOut> =>
  validateAndRun("create_customer", input, ctx) as Promise<CreateCustomerOut>;

export const runCreateVehicle = (
  input: CreateVehicleIn,
  ctx: ToolContext,
): Promise<CreateVehicleOut> =>
  validateAndRun("create_vehicle", input, ctx) as Promise<CreateVehicleOut>;

export const runAttachPhoto = (
  input: AttachPhotoIn,
  ctx: ToolContext,
): Promise<AttachPhotoOut> =>
  validateAndRun("attach_photo_to_work_order", input, ctx) as Promise<AttachPhotoOut>;

export const runCreateCustomInspection = (
  input: CreateCustomInspectionIn,
  ctx: ToolContext,
): Promise<CreateCustomInspectionOut> =>
  validateAndRun("create_custom_inspection", input, ctx) as Promise<CreateCustomInspectionOut>;

export const runFindOrCreateFleet = (
  input: FindOrCreateFleetIn,
  ctx: ToolContext,
): Promise<FindOrCreateFleetOut> =>
  validateAndRun("find_or_create_fleet", input, ctx) as Promise<FindOrCreateFleetOut>;

export const runFindOrCreateFleetProgram = (
  input: FindOrCreateFleetProgramIn,
  ctx: ToolContext,
): Promise<FindOrCreateFleetProgramOut> =>
  validateAndRun("find_or_create_fleet_program", input, ctx) as Promise<FindOrCreateFleetProgramOut>;

export const runGenerateFleetWorkOrders = (
  input: GenerateFleetWorkOrdersIn,
  ctx: ToolContext,
): Promise<GenerateFleetWorkOrdersOut> =>
  validateAndRun("generate_fleet_work_orders", input, ctx) as Promise<GenerateFleetWorkOrdersOut>;

export const runListPendingApprovals = (
  input: ListPendingApprovalsIn,
  ctx: ToolContext,
): Promise<ListPendingApprovalsOut> =>
  validateAndRun("list_pending_approvals", input, ctx) as Promise<ListPendingApprovalsOut>;

export const runSetLineApproval = (
  input: SetLineApprovalIn,
  ctx: ToolContext,
): Promise<SetLineApprovalOut> =>
  validateAndRun("set_line_approval", input, ctx) as Promise<SetLineApprovalOut>;

export const runRecordWorkOrderApproval = (
  input: RecordWorkOrderApprovalIn,
  ctx: ToolContext,
): Promise<RecordWorkOrderApprovalOut> =>
  validateAndRun("record_work_order_approval", input, ctx) as Promise<RecordWorkOrderApprovalOut>;

/* new direct ops wrappers */
export const runGetCustomerVisitHistory = (
  input: {
    customerId?: string;
    customerQuery?: string;
    plateOrVin?: string;
    limit?: number;
  },
  ctx: ToolContext,
) => runGetCustomerVisitHistoryTool(input, ctx);

export const runGetVehicleHistory = (
  input: {
    vehicleId?: string;
    customerQuery?: string;
    plateOrVin?: string;
    limit?: number;
  },
  ctx: ToolContext,
) => runGetVehicleHistoryTool(input, ctx);

export const runGetShopCurrentStatus = (
  input: {},
  ctx: ToolContext,
) => runGetShopCurrentStatusTool(input, ctx);

export const runGetStalledWorkOrders = (
  input: {},
  ctx: ToolContext,
) => runGetStalledWorkOrdersTool(input, ctx);

export const runGetBookings = (
  input: {
    customerId?: string;
    customerQuery?: string;
    plateOrVin?: string;
    status?: string;
    limit?: number;
  },
  ctx: ToolContext,
) => runGetBookingsTool(input, ctx);

export const runRescheduleBooking = (
  input: {
    bookingId: string;
    startsAt: string;
    endsAt?: string;
    notes?: string;
  },
  ctx: ToolContext,
) => runRescheduleBookingTool(input, ctx);

export const runGetWorkOrderStatusSummary = (
  input: { workOrderId: string },
  ctx: ToolContext,
) => runGetWorkOrderStatusSummaryTool(input, ctx);

export const ToolCallSchema = z.object({
  name: z.enum(Object.keys(TOOL_MAP) as [ToolName, ...ToolName[]]),
  input: z.unknown(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;
