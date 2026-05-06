import { NextResponse } from "next/server";
import { proxyJson, withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";
import { isAllowedUploadType, MAX_BYTES, parseApproxBase64Bytes } from "@/features/onboarding-v2/server/fileUpload";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;
  const { sessionId } = await context.params;
  const shopId = access.profile.shop_id;
  if (!shopId) return Response.json({ error: "Missing shop context" }, { status: 403 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES + 256_000) {
    return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file_missing" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });

    const mimeType = file.type || "application/octet-stream";
    const allowed = isAllowedUploadType(mimeType, file.name);
    if (!allowed.ok) return NextResponse.json({ error: allowed.message }, { status: 415 });

    const buffer = Buffer.from(await file.arrayBuffer());
    body = { originalFilename: file.name, mimeType, contentBase64: buffer.toString("base64") };
  } else {
    const parsed = (await request.json().catch(() => null)) as { originalFilename?: string; mimeType?: string; contentBase64?: string } | null;
    if (!parsed?.originalFilename || !parsed.contentBase64 || !parsed.mimeType) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

    const allowed = isAllowedUploadType(parsed.mimeType, parsed.originalFilename);
    if (!allowed.ok) return NextResponse.json({ error: allowed.message }, { status: 415 });

    if (parseApproxBase64Bytes(parsed.contentBase64) > MAX_BYTES) return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });

    body = { originalFilename: parsed.originalFilename, mimeType: parsed.mimeType, contentBase64: parsed.contentBase64 };
  }

  return proxyJson({ method: "POST", path: `/onboarding/sessions/${encodeURIComponent(sessionId)}/files/content`, shopId, body });
}

