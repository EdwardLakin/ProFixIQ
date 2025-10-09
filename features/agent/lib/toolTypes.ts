import { z } from "zod";

export type ToolContext = { shopId: string; userId: string };

export type ToolDef<TIn, TOut> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
  run: (input: TIn, ctx: ToolContext) => Promise<TOut>;
};