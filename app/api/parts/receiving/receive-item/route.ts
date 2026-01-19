// app/api/parts/receiving/receive-item/route.ts
import { NextResponse } from "next/server";

type Body = {
  part_request_item_id: string;
  qty: number;
  location_id: string;
  po_id?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const id = String(body.part_request_item_id ?? "").trim();
    const loc = String(body.location_id ?? "").trim();
    const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);

    const poId =
      typeof body.po_id === "string" && body.po_id.trim().length > 0 ? body.po_id.trim() : null;

    if (!id || !loc || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "Missing or invalid input" }, { status: 400 });
    }

    // Forward to canonical item-scoped route (which calls receive_part_request_item RPC)
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/parts/requests/items/${encodeURIComponent(id)}/receive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body: JSON.stringify({ location_id: loc, qty, po_id: poId }),
      },
    );

    const text = await res.text().catch(() => "");
    return new NextResponse(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}