import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { getMarketingMediaLibraryAsset } from "@/features/marketing/media/library-server";
import {
  clearMarketingPageMediaDraft,
  getMarketingPageMediaDocument,
  isMarketingPageKey,
  publishMarketingPageMediaDraft,
  saveMarketingPageMediaDraft,
} from "@/features/marketing/media/server";
import {
  MARKETING_PAGE_REGISTRY,
  MarketingMediaAssetSchema,
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

  const { slotKey, action, assetId } = parsed.data;
  if (!Object.prototype.hasOwnProperty.call(MARKETING_PAGE_REGISTRY[pageKey].slots, slotKey)) {
    return NextResponse.json({ error: "Unknown media slot" }, { status: 404 });
  }

  try {
    if (action === "save-draft") {
      if (!assetId) {
        return NextResponse.json({ error: "Choose media before saving the draft" }, { status: 400 });
      }
      const libraryAsset = await getMarketingMediaLibraryAsset(assetId);
      if (!libraryAsset) {
        return NextResponse.json({ error: "That media asset is no longer available" }, { status: 404 });
      }
      const asset = MarketingMediaAssetSchema.safeParse(libraryAsset);
      if (!asset.success) {
        return NextResponse.json(
          { error: "Add alt text to this media before attaching it to a landing page" },
          { status: 400 },
        );
      }
      await saveMarketingPageMediaDraft(pageKey, slotKey, asset.data);
    } else if (action === "clear-draft") {
      await clearMarketingPageMediaDraft(pageKey, slotKey);
    } else {
      const published = await publishMarketingPageMediaDraft(pageKey, slotKey);
      if (!published) {
        return NextResponse.json({ error: "Save a draft before publishing" }, { status: 400 });
      }
      revalidatePath(`/api/public/marketing/pages/${pageKey}`);
      revalidatePath(MARKETING_PAGE_REGISTRY[pageKey].href);
    }

    const document = await getMarketingPageMediaDocument(pageKey);
    return NextResponse.json({ document });
  } catch (error) {
    console.error("ops marketing page media update failed", { pageKey, error });
    return NextResponse.json({ error: "Unable to update marketing page" }, { status: 500 });
  }
}
