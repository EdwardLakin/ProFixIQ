import type { Metadata } from "next";
import LegalDocumentPage from "@/features/legal/components/LegalDocumentPage";
import { loadLegalDoc } from "@/features/legal/server/loadLegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy | ProFixIQ",
};

export default function PrivacyPolicyPage() {
  return <LegalDocumentPage content={loadLegalDoc("privacy-policy")} />;
}
