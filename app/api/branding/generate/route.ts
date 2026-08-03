import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  requireBrandShopWriteAccess,
  safeFilePart,
} from "@/features/branding/server/brand";
import {
  OWNER_PIN_PURPOSES,
  requireOwnerPinVerified,
} from "@/features/shared/lib/server/owner-pin";
import {
  buildLogoPrompt,
  getOpenAIClient,
} from "@/features/branding/server/logo-generation";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import {
  enforceAIOperationalPolicy,
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";

type DB = Database;

type GenerateLogoBody = {
  shopId?: string;
  prompt?: string;
  stylePreset?: string | null;
  count?: number;
  transparentBackground?: boolean;
  basedOnAssetId?: string | null;
};

function decodeBase64Image(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const policy = getAIPolicy("branding_generate_logo");
  const body = (await req.json().catch(() => ({}))) as GenerateLogoBody;

  const auth = await requireBrandShopWriteAccess(body.shopId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, {
    shopId: auth.shopId,
    userId: auth.userId,
    allowedPurposes: [
      OWNER_PIN_PURPOSES.BRANDING,
      OWNER_PIN_PURPOSES.PRIVILEGED,
    ],
  });
  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  let userPrompt = String(body.prompt ?? "").trim();
  let stylePreset = body.stylePreset ?? null;
  let transparentBackground = Boolean(body.transparentBackground);
  const count = Math.min(Math.max(Number(body.count ?? 3) || 3, 1), 4);

  if (body.basedOnAssetId?.trim()) {
    const { data: baseAsset } = await auth.supabase
      .from("shop_brand_assets")
      .select("id, generation_prompt, metadata")
      .eq("id", body.basedOnAssetId.trim())
      .eq("shop_id", auth.shopId)
      .single();

    if (baseAsset) {
      const meta = (baseAsset.metadata ?? {}) as Record<string, unknown>;
      userPrompt =
        userPrompt || String(baseAsset.generation_prompt ?? "").trim();
      stylePreset =
        stylePreset ??
        (typeof meta.style_preset === "string" ? meta.style_preset : null);
      transparentBackground =
        body.transparentBackground ?? Boolean(meta.transparent_background);
    }
  }

  if (!userPrompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const { data: shop, error: shopErr } = await auth.supabase
    .from("shops")
    .select("id, shop_name, name")
    .eq("id", auth.shopId)
    .single();

  if (shopErr || !shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const shopName = String(
    shop.shop_name ?? shop.name ?? "ProFixIQ Shop",
  ).trim();
  const finalPrompt = buildLogoPrompt({
    shopName,
    prompt: userPrompt,
    stylePreset,
    transparentBackground,
  });

  try {
    const enforcement = enforceAIOperationalPolicy({
      feature: "branding_generate_logo",
      endpoint: "/api/branding/generate",
      shopId: auth.shopId,
    });
    if (!enforcement.allowed) {
      return NextResponse.json(
        {
          error: "AI branding generation temporarily limited",
          code: enforcement.code,
        },
        { status: 429 },
      );
    }

    const openai = getOpenAIClient();
    const model = "gpt-image-1.5";

    const result = await Promise.race([
      openai.images.generate({
        model,
        prompt: finalPrompt,
        n: count,
        size: "1024x1024",
        quality: "medium",
        output_format: "png",
        background: transparentBackground ? "transparent" : "auto",
        user: auth.userId,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("AI request timed out")),
          policy.timeoutMs,
        ),
      ),
    ]);

    const images = result.data ?? [];
    if (!images.length) {
      return NextResponse.json(
        { error: "No logo images were returned" },
        { status: 502 },
      );
    }

    const createdAssets: Array<
      DB["public"]["Tables"]["shop_brand_assets"]["Row"]
    > = [];

    for (let i = 0; i < images.length; i += 1) {
      const item = images[i];
      if (!item?.b64_json) continue;

      const bytes = decodeBase64Image(item.b64_json);
      const timestamp = Date.now();
      const filename = `${timestamp}_logo_${i + 1}.png`;
      const storagePath = `shops/${safeFilePart(auth.shopId)}/branding/logo/generated/${filename}`;

      const { error: uploadErr } = await auth.supabase.storage
        .from("branding")
        .upload(storagePath, bytes, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadErr) {
        return NextResponse.json({ error: uploadErr.message }, { status: 500 });
      }

      const { data: publicUrlData } = auth.supabase.storage
        .from("branding")
        .getPublicUrl(storagePath);

      const { data: asset, error: insertErr } = await auth.supabase
        .from("shop_brand_assets")
        .insert({
          shop_id: auth.shopId,
          kind: "logo",
          file_url: publicUrlData.publicUrl,
          storage_bucket: "branding",
          storage_path: storagePath,
          source_app: "profixiq",
          generation_provider: "openai",
          generation_prompt: userPrompt,
          mime_type: "image/png",
          file_name: filename,
          file_size_bytes: bytes.length,
          width: 1024,
          height: 1024,
          is_active: false,
          created_by: auth.userId,
          metadata: {
            generated: true,
            style_preset: stylePreset,
            transparent_background: transparentBackground,
            model: "gpt-image-1.5",
            final_prompt: finalPrompt,
            based_on_asset_id: body.basedOnAssetId ?? null,
            normalized_safe_area_percent: 8,
            recommended_logo_zoom: 1.25,
          },
        })
        .select("*")
        .single();

      if (insertErr || !asset) {
        return NextResponse.json(
          { error: insertErr?.message || "Failed to save generated asset" },
          { status: 500 },
        );
      }

      createdAssets.push(asset);
    }

    recordAITelemetry({
      feature: "branding_generate_logo",
      endpoint: "/api/branding/generate",
      shop_id: auth.shopId,
      user_id: auth.userId,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens:
        (result.usage as { input_tokens?: number } | undefined)?.input_tokens ??
        null,
      completion_tokens:
        (result.usage as { output_tokens?: number } | undefined)
          ?.output_tokens ?? null,
      total_tokens:
        (result.usage as { total_tokens?: number } | undefined)?.total_tokens ??
        null,
      estimated_cost_usd: estimateAICostUsd(
        "branding_generate_logo",
        (result.usage as { total_tokens?: number } | undefined)?.total_tokens ??
          null,
      ),
      status: "success",
      error_code: null,
      error_message: null,
    });
    registerAIUsageEvent({
      feature: "branding_generate_logo",
      endpoint: "/api/branding/generate",
      shopId: auth.shopId,
      model,
      totalTokens:
        (result.usage as { total_tokens?: number } | undefined)?.total_tokens ??
        null,
      estimatedCostUsd: estimateAICostUsd(
        "branding_generate_logo",
        (result.usage as { total_tokens?: number } | undefined)?.total_tokens ??
          null,
      ),
      status: "success",
      errorCode: null,
    });

    return NextResponse.json({
      ok: true,
      assets: createdAssets,
      usage: result.usage ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Logo generation failed";
    recordAITelemetry({
      feature: "branding_generate_logo",
      endpoint: "/api/branding/generate",
      shop_id: auth.shopId,
      user_id: auth.userId,
      model: "gpt-image-1.5",
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: 0,
      status: "error",
      error_code: "branding_generate_error",
      error_message: message,
    });
    registerAIUsageEvent({
      feature: "branding_generate_logo",
      endpoint: "/api/branding/generate",
      shopId: auth.shopId,
      model: "gpt-image-1.5",
      totalTokens: null,
      estimatedCostUsd: 0,
      status: "error",
      errorCode: "branding_generate_error",
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
