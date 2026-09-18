import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

export const runtime = "nodejs";

type DeleteDraftQuoteResult = {
  ok?: boolean;
  reason?: string;
  error?: string;
  quoteLineId?: string;
  workOrderId?: string;
  deletedPartItems?: number;
  cancelledPartRequests?: number;
};

type RpcClient = {
  rpc(
    fn: "delete_work_order_quote_line_draft",
    args: { p_quote_line_id: string },
  ): Promise<{ data: DeleteDraftQuoteResult | null; error: { message?: string } | null }>;
};

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id, role")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.shop_id) {
      return NextResponse.json(
        { error: "Unable to resolve actor profile" },
        { status: 403 },
      );
    }

    const actor = getActorCapabilities({ role: profile.role });
    if (!actor.isKnownRole || !actor.canAuthorizeQuotes) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 2];

    if (!id) {
      return NextResponse.json(
        { error: "Missing quote line id" },
        { status: 400 },
      );
    }

    const { data: quoteLine, error: quoteLineError } = await supabase
      .from("work_order_quote_lines")
      .select("id, shop_id, work_order_id")
      .eq("id", id)
      .maybeSingle();

    if (quoteLineError) {
      return NextResponse.json(
        { error: quoteLineError.message },
        { status: 500 },
      );
    }
    if (!quoteLine) {
      return NextResponse.json({ error: "Quote line not found" }, { status: 404 });
    }
    if (quoteLine.shop_id !== profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rpc = supabase as unknown as RpcClient;
    const { data, error } = await rpc.rpc("delete_work_order_quote_line_draft", {
      p_quote_line_id: id,
    });

    if (error) {
      const message = error.message || "Could not delete quote line.";
      const forbidden = message.includes("QUOTE_DELETE_FORBIDDEN");
      return NextResponse.json(
        { error: forbidden ? "Forbidden" : message },
        { status: forbidden ? 403 : 409 },
      );
    }

    if (!data?.ok) {
      return NextResponse.json(
        {
          error: data?.error || "This quote line cannot be deleted.",
          reason: data?.reason ?? null,
        },
        { status: data?.reason === "not_found" ? 404 : 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      quoteLineId: data.quoteLineId ?? id,
      workOrderId: data.workOrderId ?? quoteLine.work_order_id,
      deletedPartItems: data.deletedPartItems ?? 0,
      cancelledPartRequests: data.cancelledPartRequests ?? 0,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not delete quote line." },
      { status: 500 },
    );
  }
}
