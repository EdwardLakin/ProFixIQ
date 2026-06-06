"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createBrowserSupabase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // force UI back to unauth side
    router.push("/sign-in");
  };

  return (
    <button
      onClick={handleSignOut}
      className="text-orange-500 hover:underline text-sm"
    >
      Sign Out
    </button>
  );
}