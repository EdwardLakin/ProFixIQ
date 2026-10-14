import { NextResponse } from "next/server";
import {
  getPublishedMarketingPageMedia,
  isMarketingPageKey,
} from "@/features/marketing/media/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    return NextResponse.json(
      { slots },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.error("public marketing page media read failed", { pageKey, error });
    return NextResponse.json({ slots: {} }, { status: 200 });
  }
}
