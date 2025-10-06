import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default async function Page() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <pre style={{whiteSpace:"pre-wrap"}}>
      {JSON.stringify({
        serverHasSession: !!session,
        userId: session?.user?.id ?? null,
        exp: session?.expires_at ?? null,
      }, null, 2)}
    </pre>
  );
}