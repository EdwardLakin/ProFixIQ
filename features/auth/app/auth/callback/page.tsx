// app/auth/callback/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    // Preserve all incoming params (code, session_id, etc.)
    const qs = sp.toString();
    router.replace(`/confirm${qs ? `?${qs}` : ""}`);
  }, [router, sp]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white font-blackops">
      <div className="flex flex-col items-center">
        <p className="text-orange-400 text-lg mb-2">Finishing sign-in…</p>
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}