import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const AttachPhotoIn = z.object({
  workOrderId: z.string().uuid(),
  imageUrl: z.string().url(),
  kind: z.string().default("photo"),
});
export type AttachPhotoIn = z.infer<typeof AttachPhotoIn>;

export const AttachPhotoOut = z.object({
  success: z.boolean(),
  id: z.string().uuid().optional(),
});
export type AttachPhotoOut = z.infer<typeof AttachPhotoOut>;

export const toolAttachPhoto: ToolDef<AttachPhotoIn, AttachPhotoOut> = {
  name: "attach_photo_to_work_order",
  description:
    "Attaches an uploaded image (e.g. driver licence or registration) to a work order in Supabase storage.",
  inputSchema: AttachPhotoIn,
  outputSchema: AttachPhotoOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();
    const { workOrderId, imageUrl, kind } = input;

    const { data, error } = await supabase
      .from("work_order_media")
      .insert({
        shop_id: ctx.shopId,
        work_order_id: workOrderId,
        user_id: ctx.userId,
        url: imageUrl,
        kind,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { success: true, id: data.id };
  },
};