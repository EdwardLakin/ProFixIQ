import "server-only";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import {
  resolveWorkOrderProductAuthority,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import {
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { createAdminClient } from "@/features/integrations/shopreel/server/createAdminClient";
import {
  getActorCapabilities,
  hasAnyRole,
  ROLE_GROUPS,
} from "@/features/shared/lib/rbac";

type SupportedInvoiceDocumentKind = "invoice_pdf" | "inspection_report";
const SUPPORTED_KINDS: ReadonlySet<SupportedInvoiceDocumentKind> = new Set([
  "invoice_pdf",
  "inspection_report",
]);

function extract(req: NextRequest): {
  invoiceId: string | null;
  kind: string | null;
} {
  const m = req.nextUrl.pathname.match(
    /\/api\/invoices\/([^/]+)\/documents\/([^/]+)\/signed$/,
  );
  return { invoiceId: m?.[1] ?? null, kind: m?.[2] ?? null };
}

function isSupportedKind(kind: string): kind is SupportedInvoiceDocumentKind {
  return SUPPORTED_KINDS.has(kind as SupportedInvoiceDocumentKind);
}

function isExpectedDocumentStorage(args: {
  kind: SupportedInvoiceDocumentKind;
  bucket: string;
  path: string;
  shopId: string;
  invoiceId: string;
}): boolean {
  if (args.bucket !== "inspection_pdfs") return false;
  if (!args.path || args.path.startsWith("/")) return false;
  if (args.path.includes("..") || args.path.includes("//")) return false;
  if (!args.path.endsWith(".pdf")) return false;
  return args.path.startsWith(
    `shops/${args.shopId}/invoices/${args.invoiceId}/`,
  );
}

export async function GET(req: NextRequest) {
  const { invoiceId, kind } = extract(req);
  if (!invoiceId || !kind)
    return NextResponse.json(
      { ok: false, error: "Missing params" },
      { status: 400 },
    );
  if (!isSupportedKind(kind)) {
    return NextResponse.json(
      { ok: false, error: "Invalid kind" },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, customer_id, shop_id, work_order_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr)
    return NextResponse.json(
      { ok: false, error: invErr.message },
      { status: 400 },
    );
  if (!invoice?.id) {
    return NextResponse.json(
      { ok: false, error: "Invoice not found" },
      { status: 404 },
    );
  }

  const { profile, error: profileError } =
    await resolveAuthenticatedStaffProfile(supabase, user.id);
  const staffActor = getActorCapabilities({ role: profile?.role });
  let isStaff = false;
  if (
    !profileError &&
    profile !== null &&
    profile.shop_id === invoice.shop_id &&
    staffActor.isKnownRole &&
    staffActor.canonicalRole !== "customer" &&
    hasAnyRole(profile.role, ROLE_GROUPS.billingOperators)
  ) {
    try {
      if (invoice.work_order_id) {
        const access: ShopAccess = {
          ok: true,
          profile: { ...profile, shop_id: invoice.shop_id },
          canonicalRole: staffActor.canonicalRole,
          authUserId: user.id,
          supabase: supabase as ShopAccess["supabase"],
        };
        const authority = await resolveWorkOrderProductAuthority(
          access,
          invoice.work_order_id,
        );
        isStaff = authority.authorized;
      } else {
        const shopProduct = await resolveShopProductAccess({
          supabase,
          shopId: invoice.shop_id,
          capabilities: SHOP_PRODUCT_CAPABILITIES,
        });
        isStaff = shopProduct.entitled;
      }
    } catch {
      isStaff = false;
    }
  }

  let customer: { id: string; shop_id: string } | null = null;
  if (!isStaff) {
    if (!invoice.customer_id) {
      return NextResponse.json(
        { ok: false, error: "Invoice not found" },
        { status: 404 },
      );
    }
    const { data, error: customerErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("id", invoice.customer_id)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; shop_id: string }>();
    if (customerErr) {
      return NextResponse.json(
        { ok: false, error: customerErr.message },
        { status: 400 },
      );
    }
    customer = data ?? null;
    if (!customer?.id || invoice.shop_id !== customer.shop_id) {
      return NextResponse.json(
        { ok: false, error: "Invoice not found" },
        { status: 404 },
      );
    }
  }

  if (invoice.work_order_id) {
    const { data: workOrder, error: workOrderErr } = await supabase
      .from("work_orders")
      .select("id, customer_id, shop_id")
      .eq("id", invoice.work_order_id)
      .maybeSingle();

    if (workOrderErr)
      return NextResponse.json(
        { ok: false, error: workOrderErr.message },
        { status: 400 },
      );
    if (!workOrder?.id) {
      return NextResponse.json(
        { ok: false, error: "Invoice not found" },
        { status: 404 },
      );
    }

    if (
      workOrder.customer_id !== invoice.customer_id ||
      workOrder.shop_id !== invoice.shop_id ||
      (!isStaff &&
        (workOrder.customer_id !== customer?.id ||
          workOrder.shop_id !== customer?.shop_id))
    ) {
      return NextResponse.json(
        { ok: false, error: "Invoice not found" },
        { status: 404 },
      );
    }
  }

  // invoice_documents is intentionally staff-RLS-only. Portal access is
  // authorized above, then the admin client is limited to the exact verified
  // invoice/shop/document tuple.
  const admin = createAdminClient();
  const { data: doc, error } = await admin
    .from("invoice_documents")
    .select("storage_bucket, storage_path, shop_id, invoice_id")
    .eq("invoice_id", invoiceId)
    .eq("kind", kind)
    .maybeSingle();

  if (error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );
  if (!doc?.storage_bucket || !doc?.storage_path)
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );
  if (
    doc.invoice_id !== invoice.id ||
    doc.shop_id !== invoice.shop_id ||
    (!isStaff && doc.shop_id !== customer?.shop_id)
  ) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );
  }
  if (
    !isExpectedDocumentStorage({
      kind,
      bucket: doc.storage_bucket,
      path: doc.storage_path,
      shopId: invoice.shop_id,
      invoiceId: invoice.id,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );
  }

  const { data: signed, error: sErr } = await admin.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, 60 * 10); // 10 minutes

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: sErr?.message ?? "Signed URL failed" },
      { status: 500 },
    );
  }

  if (req.nextUrl.searchParams.get("redirect") === "1") {
    return NextResponse.redirect(signed.signedUrl);
  }
  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
