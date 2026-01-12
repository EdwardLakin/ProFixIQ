// supabase/functions/shop-boost-cron/index.ts
// Deno + Supabase Edge Function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

type ShopBoostIntakeRow = {
  id: string;
  shop_id: string;
  status: string;
};

type RunResponse =
  | { ok: true; snapshot: unknown }
  | { ok: false; snapshot: null; error?: string }
  | { error: string };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Your app URL, e.g. https://profixiq.app or Vercel URL
const APP_BASE_URL = Deno.env.get("SHOP_BOOST_APP_BASE_URL")!;

// Shared secret so only this function can call the internal route
const SHOP_BOOST_SECRET = Deno.env.get("SHOP_BOOST_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function cleanBaseUrl(url: string): string {
  const s = (url ?? "").trim();
  if (!s) return s;
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

async function queueAllPendingIntakes(): Promise<{
  attempted: number;
  processed: number;
  failed: number;
}> {
  const { data, error } = await admin
    .from("shop_boost_intakes")
    .select("id, shop_id, status")
    .eq("status", "pending")
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return { attempted: 0, processed: 0, failed: 0 };
  }

  const base = cleanBaseUrl(APP_BASE_URL);
  const url = `${base}/api/internal/shop-boost/run`;

  let attempted = 0;
  let processed = 0;
  let failed = 0;

  for (const row of data as ShopBoostIntakeRow[]) {
    attempted += 1;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // ✅ must match your internal route handler:
          // req.headers.get("x-shop-boost-secret")
          "X-Shop-Boost-Secret": SHOP_BOOST_SECRET,
        },
        body: JSON.stringify({
          shopId: row.shop_id,
          intakeId: row.id,
          runImport: true, // ✅ run operational import as well
        }),
      });

      const json = (await response.json().catch(() => null)) as RunResponse | null;

      // Count only real successes (ok + snapshot present)
      if (response.ok && json && "ok" in json && json.ok === true && "snapshot" in json && json.snapshot) {
        processed += 1;
        continue;
      }

      failed += 1;

      // Best-effort logging payload
      console.error("Shop boost run failed", {
        intakeId: row.id,
        shopId: row.shop_id,
        status: response.status,
        body: json,
      });
    } catch (err) {
      failed += 1;

      const message = err instanceof Error ? err.message : "Unknown fetch error";
      console.error("Shop boost cron fetch error", {
        intakeId: row.id,
        shopId: row.shop_id,
        error: message,
      });
    }
  }

  return { attempted, processed, failed };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const result = await queueAllPendingIntakes();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error in cron worker";
    console.error("shop-boost-cron error", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});