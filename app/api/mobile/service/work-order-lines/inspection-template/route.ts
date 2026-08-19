import { NextResponse } from "next/server";

import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";
import type { Database } from "@shared/types/types/supabase";

type WorkOrderLineUpdate =
  Database["public"]["Tables"]["work_order_lines"]["Update"];

type AttachInspectionTemplateBody = {
  workOrderLineId?: unknown;
  templateId?: unknown;
};

type WorkOrderLineLink = {
  id: string;
  work_order_id: string;
  shop_id: string;
  status: string;
  line_status: string | null;
  voided_at: string | null;
  inspection_template_id: string | null;
  template_id: string | null;
};

type InspectionIdentity = {
  id: string;
  template_id: string | null;
};

const LOCKED_LINE_STATUSES = [
  "completed",
  "ready_to_invoice",
  "invoiced",
  "declined",
  "deferred",
  "cancelled",
  "canceled",
  "closed",
  "void",
  "voided",
] as const;

const LOCKED_PARENT_STATUSES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
  "cancelled",
  "canceled",
  "closed",
  "paid",
  "void",
  "voided",
  "archived",
]);

const LOCKED_LINE_STATUS_SET = new Set<string>(LOCKED_LINE_STATUSES);

function normalizedStatus(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function currentTemplateIds(line: WorkOrderLineLink): string[] {
  return [
    ...new Set(
      [line.inspection_template_id, line.template_id].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
}

export async function PUT(request: Request) {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;
  if (!access.managementRole) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request
    .json()
    .catch(() => null)) as AttachInspectionTemplateBody | null;
  if (!body || !isUuid(body.workOrderLineId) || !isUuid(body.templateId)) {
    return NextResponse.json(
      {
        error: "A valid work-order line and inspection template are required.",
      },
      { status: 400 },
    );
  }

  const workOrderLineId = body.workOrderLineId.trim();
  const templateId = body.templateId.trim();
  const shopId = access.profile.shop_id;

  const lineResult = await access.supabase
    .from("work_order_lines")
    .select(
      "id,work_order_id,shop_id,status,line_status,voided_at,inspection_template_id,template_id",
    )
    .eq("id", workOrderLineId)
    .eq("shop_id", shopId)
    .maybeSingle<WorkOrderLineLink>();
  if (lineResult.error) {
    return NextResponse.json(
      { error: "Unable to load the work-order line." },
      { status: 500 },
    );
  }
  if (!lineResult.data) {
    return NextResponse.json(
      { error: "Work-order line not found." },
      { status: 404 },
    );
  }

  const line = lineResult.data;
  const attachedIds = currentTemplateIds(line);
  const [workOrderResult, templateResult, inspectionResult] = await Promise.all(
    [
      access.supabase
        .from("work_orders")
        .select("id,status")
        .eq("id", line.work_order_id)
        .eq("shop_id", shopId)
        .maybeSingle<{ id: string; status: string | null }>(),
      access.supabase
        .from("inspection_templates")
        .select("id,template_name")
        .eq("id", templateId)
        .eq("shop_id", shopId)
        .maybeSingle<{ id: string; template_name: string | null }>(),
      access.supabase
        .from("inspections")
        .select("id,template_id")
        .eq("work_order_line_id", line.id)
        .eq("shop_id", shopId)
        .limit(1)
        .maybeSingle<InspectionIdentity>(),
    ],
  );

  if (workOrderResult.error || templateResult.error || inspectionResult.error) {
    return NextResponse.json(
      { error: "Unable to verify the inspection assignment." },
      { status: 500 },
    );
  }
  if (!workOrderResult.data || !templateResult.data) {
    return NextResponse.json(
      { error: "Work order or inspection template not found." },
      { status: 404 },
    );
  }
  if (inspectionResult.data && attachedIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "This job line already has inspection progress and needs template-link repair.",
      },
      { status: 409 },
    );
  }
  if (
    inspectionResult.data?.template_id &&
    attachedIds.some((id) => id !== inspectionResult.data?.template_id)
  ) {
    return NextResponse.json(
      { error: "Existing inspection progress has a different template." },
      { status: 409 },
    );
  }
  if (
    line.voided_at ||
    LOCKED_LINE_STATUS_SET.has(normalizedStatus(line.status)) ||
    LOCKED_LINE_STATUS_SET.has(normalizedStatus(line.line_status)) ||
    LOCKED_PARENT_STATUSES.has(normalizedStatus(workOrderResult.data.status))
  ) {
    return NextResponse.json(
      { error: "Inactive or completed job lines cannot be changed." },
      { status: 409 },
    );
  }

  if (attachedIds.some((id) => id !== templateId)) {
    return NextResponse.json(
      { error: "This job line already has a different inspection template." },
      { status: 409 },
    );
  }
  if (
    line.inspection_template_id === templateId &&
    line.template_id === templateId
  ) {
    return NextResponse.json({
      ok: true,
      attached: false,
      workOrderId: line.work_order_id,
      workOrderLineId: line.id,
      templateId,
      templateName: templateResult.data.template_name,
    });
  }

  const update: WorkOrderLineUpdate = {
    inspection_template_id: templateId,
    template_id: templateId,
    updated_at: new Date().toISOString(),
  };
  const updateResult = await access.supabase
    .from("work_order_lines")
    .update(update)
    .eq("id", line.id)
    .eq("work_order_id", line.work_order_id)
    .eq("shop_id", shopId)
    .is("voided_at", null)
    .or(`status.is.null,status.not.in.(${LOCKED_LINE_STATUSES.join(",")})`)
    .or(
      `line_status.is.null,line_status.not.in.(${LOCKED_LINE_STATUSES.join(",")})`,
    )
    .or(
      `inspection_template_id.is.null,inspection_template_id.eq.${templateId}`,
    )
    .or(`template_id.is.null,template_id.eq.${templateId}`)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateResult.error) {
    const conflict = ["23503", "23514", "40001", "40P01"].includes(
      updateResult.error.code ?? "",
    );
    return NextResponse.json(
      { error: "Unable to attach the inspection template." },
      { status: conflict ? 409 : 500 },
    );
  }
  if (!updateResult.data) {
    return NextResponse.json(
      { error: "The job line changed before the template could be attached." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    attached: true,
    workOrderId: line.work_order_id,
    workOrderLineId: line.id,
    templateId,
    templateName: templateResult.data.template_name,
  });
}
