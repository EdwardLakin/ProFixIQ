import { ImageResponse } from "next/og";
import { ProFixIQInstallIcon, installIconResponseHeaders } from "@/features/shared/components/brand/ProFixIQInstallIcon";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(<ProFixIQInstallIcon size={192} />, {
    width: 192,
    height: 192,
    headers: installIconResponseHeaders,
  });
}
