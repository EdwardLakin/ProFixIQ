import type { Metadata } from "next";
import LegalDocumentPage from "@/features/legal/components/LegalDocumentPage";
import { loadLegalDoc } from "@/features/legal/server/loadLegalDoc";

export const metadata: Metadata = {
  title: "AI & Voice Data Policy | ProFixIQ",
};

export default function AiVoiceDataPolicyPage() {
  return <LegalDocumentPage content={loadLegalDoc("ai-voice-data-policy")} />;
}
