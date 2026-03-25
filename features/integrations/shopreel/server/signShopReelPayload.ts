import crypto from "crypto";

export function signShopReelPayload(payload: string, timestamp: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}
