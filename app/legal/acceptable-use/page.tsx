import type { Metadata } from "next";
import LegalDocumentPage from "@/features/legal/components/LegalDocumentPage";
import { loadLegalDoc } from "@/features/legal/server/loadLegalDoc";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | ProFixIQ",
};

export default function AcceptableUsePolicyPage() {
  return <LegalDocumentPage content={loadLegalDoc("acceptable-use-policy")} />;
}
