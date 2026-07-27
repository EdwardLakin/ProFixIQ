import { ImageResponse } from "next/og";
import { ProFixIQInstallIcon, installIconResponseHeaders } from "@/features/shared/components/brand/ProFixIQInstallIcon";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(<ProFixIQInstallIcon size={180} />, {
    width: 180,
    height: 180,
    headers: installIconResponseHeaders,
  });
}
