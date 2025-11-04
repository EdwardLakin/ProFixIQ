import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type InsertMenuItem = DB["public"]["Tables"]["menu_items"]["Insert"];
type InsertMenuItemPart = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

// Extend the Supabase type to include new column
type InsertMenuItemWithTemplate = InsertMenuItem & {
  inspection_template_id?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json()) as {
      item: {
        name: string;
        description: string | null;
        labor_time: number | null;
        part_cost: number | null;
        total_price: number | null;
        inspection_template_id?: string | null;
      };
      parts: {
        name: string;
        quantity: number;
        unit_cost: number;
      }[];
    };

    // Get user from Supabase auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Build the menu item insert
    const itemInsert: InsertMenuItemWithTemplate = {
      name: body.item.name,
      description: body.item.description,
      labor_time: body.item.labor_time,
      labor_hours: null,
      part_cost: body.item.part_cost,
      total_price: body.item.total_price,
      inspection_template_id: body.item.inspection_template_id ?? null,
      user_id: user?.id ?? null,
      is_active: true,
    };

    console.log("[API] Inserting menu item:", itemInsert);

    const { data: created, error: itemErr } = await supabase
      .from("menu_items")
      .insert(itemInsert)
      .select("id")
      .single();

    if (itemErr || !created) {
      console.error("[API] Menu item insert failed:", itemErr);
      return NextResponse.json(
        { error: itemErr?.message ?? "Insert failed" },
        { status: 400 },
      );
    }

    // Insert related parts
    if (Array.isArray(body.parts) && body.parts.length > 0) {
      const partRows: InsertMenuItemPart[] = body.parts
        .filter((p) => p.name && p.quantity > 0)
        .map((p) => ({
          menu_item_id: created.id,
          name: p.name,
          quantity: p.quantity,
          unit_cost: p.unit_cost,
          user_id: user?.id ?? null,
        }));

      const { error: partsErr } = await supabase
        .from("menu_item_parts")
        .insert(partRows);

      if (partsErr) {
        console.warn("[API] Parts insert failed:", partsErr);
        return NextResponse.json(
          {
            ok: true,
            id: created.id,
            partsError: partsErr.message,
          },
          { status: 200 },
        );
      }
    }

    console.log("[API] Menu item saved successfully:", created.id);
    return NextResponse.json({ ok: true, id: created.id }, { status: 200 });
  } catch (err) {
    console.error("[API] Unexpected error saving menu item:", err);
    return NextResponse.json(
      { error: "Server error saving menu item." },
      { status: 500 },
    );
  }
}