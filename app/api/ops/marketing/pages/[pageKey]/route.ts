import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import {
  getMarketingPageMediaDocument,
  isMarketingPageKey,
  writeMarketingPageMediaDocument,
} from "@/features/marketing/media/server";
import {
  MARKETING_PAGE_REGISTRY,
  MarketingMediaUpdateSchema,
} from "@/features/marketing/media/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function invalidPage() {
  return NextResponse.json({ error: "Unknown marketing page" }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ pageKey: string }> },
) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const { pageKey } = await context.params;
  if (!isMarketingPageKey(pageKey)) return invalidPage();

  try {
    const document = await getMarketingPageMediaDocument(pageKey);
    return NextResponse.json({
      document,
      definition: MARKETING_PAGE_REGISTRY[pageKey],
    });
  } catch (error) {
    console.error("ops marketing page media read failed", { pageKey, error });
    return NextResponse.json({ error: "Unable to load marketing page" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ pageKey: string }> },
) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const { pageKey } = await context.params;
  if (!isMarketingPageKey(pageKey)) return invalidPage();

  const payload = await request.json().catch(() => null);
  const parsed = MarketingMediaUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the media slot update and try again", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!Object.prototype.hasOwnProperty.call(MARKETING_PAGE_REGISTRY[pageKey].slots, parsed.data.slotKey)) {
    return NextResponse.json({ error: "Unknown media slot" }, { status: 404 });
  }

  try {
    const current = await getMarketingPageMediaDocument(pageKey);
    const previous = current.slots[parsed.data.slotKey] ?? {
      draft: null,
      published: null,
      publishedAt: null,
    };
    const now = new Date().toISOString();

    if (parsed.data.action === "save-draft" && !parsed.data.media) {
      return NextResponse.json({ error: "Choose media before saving the draft" }, { status: 400 });
    }

    const nextSlot =
      parsed.data.action === "publish"
        ? {
            ...previous,
            published: previous.draft,
            publishedAt: previous.draft ? now : null,
          }
        : parsed.data.action === "clear-draft"
          ? { ...previous, draft: null }
          : { ...previous, draft: parsed.data.media ?? null };

    if (parsed.data.action === "publish" && !previous.draft) {
      return NextResponse.json({ error: "Save a draft before publishing" }, { status: 400 });
    }

    const document = {
      ...current,
      slots: { ...current.slots, [parsed.data.slotKey]: nextSlot },
      updatedAt: now,
    };
    await writeMarketingPageMediaDocument(document);
    return NextResponse.json({ document });
  } catch (error) {
    console.error("ops marketing page media update failed", { pageKey, error });
    return NextResponse.json({ error: "Unable to update marketing page" }, { status: 500 });
  }
}
