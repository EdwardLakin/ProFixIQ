import "server-only";

import { z } from "zod";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

const nullableTrimmed = z.string().trim().max(500).nullable().optional();
const optionalUuid = z.string().uuid().nullable().optional();

const customerSchema = z.object({
  id: optionalUuid,
  business_name: nullableTrimmed,
  name: nullableTrimmed,
  first_name: nullableTrimmed,
  last_name: nullableTrimmed,
  phone: nullableTrimmed,
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .nullable()
    .optional()
    .or(z.literal("")),
  address: nullableTrimmed,
  city: nullableTrimmed,
  province: nullableTrimmed,
  postal_code: nullableTrimmed,
});

const vinSchema = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((value, context) => {
    if (!value) return null;
    const normalized = normalizeVinInput(value);
    if (!normalized.isValid) {
      context.addIssue({ code: "custom", message: normalized.message });
      return z.NEVER;
    }
    return normalized.vin;
  });

const expiresOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const vehicleSchema = z.object({
  id: optionalUuid,
  year: z.string().trim().max(4).nullable().optional(),
  make: nullableTrimmed,
  model: nullableTrimmed,
  vin: vinSchema,
  license_plate: nullableTrimmed,
  mileage: nullableTrimmed,
  color: nullableTrimmed,
  unit_number: nullableTrimmed,
  engine: nullableTrimmed,
  transmission: nullableTrimmed,
  fuel_type: nullableTrimmed,
  drivetrain: nullableTrimmed,
});

const estimatePartSchema = z.object({
  clientKey: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(10_000),
  partNumber: z.string().trim().max(200).default(""),
  manufacturer: z.string().trim().max(200).default(""),
});

const estimateLineSchema = z.object({
  clientKey: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  customerDescription: z.string().trim().max(4_000).default(""),
  advisorNotes: z.string().trim().max(4_000).default(""),
  laborHours: z.coerce.number().min(0).max(1_000),
  laborRate: z.coerce.number().min(0).max(100_000),
  parts: z.array(estimatePartSchema).max(100),
});

export const createEstimateSchema = z.object({
  customer: customerSchema,
  vehicle: vehicleSchema,
  lines: z.array(estimateLineSchema).min(1).max(50),
  notes: z.string().trim().max(8_000).nullable().optional(),
  expiresOn: expiresOnSchema,
  expiresAt: z.string().datetime().nullable().optional(),
});

export const saveEstimateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  lines: z.array(estimateLineSchema).min(1).max(50),
  notes: z.string().trim().max(8_000).nullable().optional(),
  expiresOn: expiresOnSchema,
  expiresAt: z.string().datetime().nullable().optional(),
});

export const estimateRevisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export const returnEstimateSchema = estimateRevisionSchema.extend({
  quoteLineIds: z.array(z.string().uuid()).min(1).max(50),
  reasonCode: z.enum([
    "lower_cost_option",
    "confirm_availability",
    "correct_quantity",
    "incorrect_application",
    "missing_parts",
    "review_price",
    "customer_alternative",
    "other",
  ]),
  note: z.string().trim().max(4_000).nullable().optional(),
});

export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
export type SaveEstimateInput = z.infer<typeof saveEstimateSchema>;
