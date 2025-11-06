"use client";

import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

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