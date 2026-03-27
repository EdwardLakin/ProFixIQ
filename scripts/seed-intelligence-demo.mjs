import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const shopIdArg = process.argv[2] || null;

let shopId = shopIdArg;
if (!shopId) {
  const { data: shop } = await supabase.from("shops").select("id").limit(1).maybeSingle();
  shopId = shop?.id ?? null;
}
if (!shopId) throw new Error("No shop id found. Pass one explicitly.");

const now = new Date().toISOString();

const templates = [
  {
    template_key: "brakes_pad_rotor_noise",
    label: "Front brake pads and rotors",
    job_category: "brakes",
    default_labor_hours: 2.0,
    default_parts: [
      { name: "Front brake pads", qty: 1 },
      { name: "Front brake rotors", qty: 2 },
    ],
    usage_count: 9,
    confidence_score: 0.95,
    tags: ["metal_on_metal", "grooved", "noise"],
  },
  {
    template_key: "rear_brake_service_low_measurement",
    label: "Rear brake service",
    job_category: "brakes",
    default_labor_hours: 1.5,
    default_parts: [
      { name: "Rear brake pads", qty: 1 },
      { name: "Rear brake rotors", qty: 2 },
    ],
    usage_count: 6,
    confidence_score: 0.88,
    tags: ["low_measurement", "worn"],
  },
  {
    template_key: "outer_tie_rod_end_loose",
    label: "Outer tie rod end replacement",
    job_category: "suspension",
    default_labor_hours: 1.2,
    default_parts: [
      { name: "Outer tie rod end", qty: 1 },
    ],
    usage_count: 5,
    confidence_score: 0.83,
    tags: ["worn", "pull"],
  },
];

for (const row of templates) {
  const { error } = await supabase
    .from("learned_job_templates")
    .upsert(
      {
        shop_id: shopId,
        ...row,
        last_seen_at: now,
      },
      { onConflict: "shop_id,template_key" },
    );

  if (error) throw error;
}

console.log(`Seeded demo learned_job_templates for shop ${shopId}`);
