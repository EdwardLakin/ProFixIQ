// /app/quote-review/[id]/page.tsx
// Standalone wrapper for shared QuoteReviewView.

import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";

export default function Page({ params }: { params: { id: string } }) {
  return <QuoteReviewView workOrderId={params.id} />;
}