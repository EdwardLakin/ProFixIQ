import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { parseCsvFileFromFormData } from "@/features/shared/lib/import/csv";
import {
  createInvoiceImportJob,
  INVOICE_IMPORT_MAX_ROWS,
} from "@/features/billing/server/invoice-import-job";
import {
  normalizeInvoiceImportRow,
  type InvoiceImportRow,
} from "@/features/billing/lib/invoice-import-normalizer";

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });
    if (!access.ok) return access.response;
    if (
      !(req.headers.get("content-type")?.toLowerCase() ?? "").includes(
        "multipart/form-data",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice import requires multipart/form-data with a CSV file field.",
        },
        { status: 415 },
      );
    }

    const formData = await req.formData();
    let parsed;
    try {
      parsed = await parseCsvFileFromFormData<InvoiceImportRow>({
        formData,
        maxRows: INVOICE_IMPORT_MAX_ROWS,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to parse invoice CSV.",
        },
        { status: 400 },
      );
    }

    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    if (!shopId)
      return NextResponse.json(
        { error: "No active shop is selected." },
        { status: 400 },
      );

    const userId = profile.id ?? null;
    const result = await createInvoiceImportJob({
      supabase,
      shopId,
      rows: parsed.rows.map(normalizeInvoiceImportRow),
      createdBy: userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to import invoice CSV.",
      },
      { status: 500 },
    );
  }
}
