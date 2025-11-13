// app/portal/auth/confirm/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function PortalConfirmPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      router.replace(session?.user ? "/portal/profile" : "/portal/signin");
    })();
  }, [router, supabase]);

  return (
    <div className="mx-auto flex max-w-md items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 text-sm text-neutral-200">
      Completing sign-in…
    </div>
  );
}