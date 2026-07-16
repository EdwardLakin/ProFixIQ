// app/quote-review/[id]/page.tsx
// Stable standalone work-order quote review.
// Authentication is enforced by middleware before this page renders.

import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <QuoteReviewView workOrderId={id} />;
}