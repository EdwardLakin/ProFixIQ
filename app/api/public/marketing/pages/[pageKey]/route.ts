import { NextResponse } from "next/server";
import {
  getPublishedMarketingPageMedia,
  isMarketingPageKey,
} from "@/features/marketing/media/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ pageKey: string }> },
) {
  const { pageKey } = await context.params;
  if (!isMarketingPageKey(pageKey)) {
    return NextResponse.json({ error: "Unknown marketing page" }, { status: 404 });
  }

  try {
    const slots = await getPublishedMarketingPageMedia(pageKey);
    return NextResponse.json({ slots }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("public marketing page media read failed", { pageKey, error });
    return NextResponse.json(
      { slots: {} },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
