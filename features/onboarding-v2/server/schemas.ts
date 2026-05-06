import { z } from "zod";

export const StartSessionRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  sourceSystem: z.string().trim().min(1).max(120).optional(),
});

export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;
