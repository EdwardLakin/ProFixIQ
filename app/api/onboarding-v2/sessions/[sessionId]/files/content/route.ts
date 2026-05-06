import { NextResponse } from "next/server";
import { proxyJson, withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;
  const { sessionId } = await context.params;
  const shopId = access.profile.shop_id;
  if (!shopId) return Response.json({ error: "Missing shop context" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file_missing" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    body = { fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, contentBase64: buffer.toString("base64") };
  } else {
    const parsed = (await request.json().catch(() => null)) as { fileName?: string; mimeType?: string; contentBase64?: string } | null;
    if (!parsed?.fileName || !parsed.contentBase64) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const approxBytes = Math.floor((parsed.contentBase64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
    body = { fileName: parsed.fileName, mimeType: (parsed.mimeType ?? "application/octet-stream"), contentBase64: parsed.contentBase64 };
  }

  return proxyJson({ method: "POST", path: `/onboarding/sessions/${encodeURIComponent(sessionId)}/files/content`, shopId, body });
}
