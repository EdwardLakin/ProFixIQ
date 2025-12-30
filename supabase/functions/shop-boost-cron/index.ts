// supabase/functions/shop-boost-cron/index.ts
// Deno + Supabase Edge Function

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

type ShopBoostIntakeRow = {
  id: string;
  shop_id: string;
  status: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Your app URL, e.g. https://profixiq.app or Vercel URL
const APP_BASE_URL = Deno.env.get("SHOP_BOOST_APP_BASE_URL")!;
// Shared secret so only this function can call the internal route
const SHOP_BOOST_SECRET = Deno.env.get("SHOP_BOOST_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function queueAllPendingIntakes(): Promise<{ processed: number }> {
  const { data, error } = await admin
    .from("shop_boost_intakes")
    .select("id, shop_id, status")
    .eq("status", "pending")
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const row of data as ShopBoostIntakeRow[]) {
    const response = await fetch(
      `${APP_BASE_URL}/api/internal/shop-boost/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shop-Boost-Secret": SHOP_BOOST_SECRET,
        },
        body: JSON.stringify({
          shopId: row.shop_id,
          intakeId: row.id,
        }),
      },
    );

    if (response.ok) {
      processed += 1;
    } else {
      const text = await response.text().catch(() => "");
      console.error("Shop boost run failed", {
        intakeId: row.id,
        status: response.status,
        body: text,
      });
    }
  }

  return { processed };
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
    const message =
      error instanceof Error ? error.message : "Unknown error in cron worker";
    console.error("shop-boost-cron error", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});