// app/quote-review/[id]/page.tsx
// Stable standalone work-order quote review.

import { redirect } from "next/navigation";

import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/quote-review/${id}`)}`);
  }

  return <QuoteReviewView workOrderId={id} />;
}