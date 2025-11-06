// app/work-orders/queue/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import QueuePage from "@/features/work-orders/app/work-orders/queue/page";

export default function Page({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  return <QueuePage searchParams={searchParams ?? {}} />;
}