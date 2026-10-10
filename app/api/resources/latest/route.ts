import { NextResponse } from "next/server";
import { listPublishedBlogArticles } from "@/features/marketing/blog/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const articles = await listPublishedBlogArticles(3);
  return NextResponse.json(
    { articles },
    { headers: { "Cache-Control": "no-store" } },
  );
}
