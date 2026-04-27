import { detectDomain } from "./domains";

export function detectFileDomain(params: { filename?: string | null; headers?: string[]; declaredDomain?: string | null }) {
  if (params.declaredDomain && params.declaredDomain !== "unknown") return params.declaredDomain;
  return detectDomain({ filename: params.filename, headers: params.headers });
}
