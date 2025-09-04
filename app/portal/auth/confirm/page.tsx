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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.replace("/portal/profile");
      } else {
        router.replace("/portal/auth/sign-in");
      }
    })();
  }, [router, supabase]);

  return <div className="p-6 text-white">Finishing sign up…</div>;
}
