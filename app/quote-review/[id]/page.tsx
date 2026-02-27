// app/quote-review/[id]/page.tsx
// Standalone wrapper for shared QuoteReviewView.
// IMPORTANT: In this repo, Next's PageProps typing expects `params` as a Promise.

import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <QuoteReviewView workOrderId={id} />;
}