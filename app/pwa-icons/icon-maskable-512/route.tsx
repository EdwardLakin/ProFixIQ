import { ImageResponse } from "next/og";
import { ProFixIQInstallIcon, installIconResponseHeaders } from "@/features/shared/components/brand/ProFixIQInstallIcon";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(<ProFixIQInstallIcon size={512} maskable />, {
    width: 512,
    height: 512,
    headers: installIconResponseHeaders,
  });
}
