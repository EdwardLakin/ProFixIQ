"use client";

import { useEffect, useState } from "react";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/supabase";

const supabase = createClientComponentClient<Database>();

export default function OwnerSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);

  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const [laborRate, setLaborRate] = useState("");
  const [suppliesPercent, setSuppliesPercent] = useState("");
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [taxRate, setTaxRate] = useState("");

  const [useAi, setUseAi] = useState(false);
  const [requireCauseCorrection, setRequireCauseCorrection] = useState(false);
  const [requireAuthorization, setRequireAuthorization] = useState(false);

  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [emailOnComplete, setEmailOnComplete] = useState(false);

  const [autoGeneratePdf, setAutoGeneratePdf] = useState(false);
  const [autoSendQuoteEmail, setAutoSendQuoteEmail] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .single();

      if (!profile?.shop_id) return;

      setShopId(profile.shop_id);

      const { data: shop } = await supabase
        .from("shops")
        .select("*")
        .eq("id", profile.shop_id)
        .single();

      if (shop) {
        setShopName(shop.name || "");
        setAddress(shop.address || "");
        setCity(shop.city || "");
        setProvince(shop.province || "");
        setPostalCode(shop.postal_code || "");
        setPhone(shop.phone_number || "");
        setEmail(shop.email || "");
        setLogoUrl(shop.logo_url || "");

        setLaborRate(shop.labor_rate?.toString() || "");
        setSuppliesPercent(shop.supplies_percent?.toString() || "");
        setDiagnosticFee(shop.diagnostic_fee?.toString() || "");
        setTaxRate(shop.tax_rate?.toString() || "");

        setUseAi(shop.use_ai || false);
        setRequireCauseCorrection(shop.require_cause_correction || false);
        setRequireAuthorization(shop.require_authorization || false);

        setInvoiceTerms(shop.invoice_terms || "");
        setInvoiceFooter(shop.invoice_footer || "");
        setEmailOnComplete(shop.email_on_complete || false);

        setAutoGeneratePdf(shop.auto_generate_pdf || false);
        setAutoSendQuoteEmail(shop.auto_send_quote_email || false);
      }

      setLoading(false);
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!shopId) return;

    const { error } = await supabase
      .from("shops")
      .update({
        name: shopName,
        address,
        city,
        province,
        postal_code: postalCode,
        phone_number: phone,
        email,
        logo_url: logoUrl,
        labor_rate: parseFloat(laborRate),
        supplies_percent: parseFloat(suppliesPercent),
        diagnostic_fee: parseFloat(diagnosticFee),
        tax_rate: parseFloat(taxRate),
        use_ai: useAi,
        require_cause_correction: requireCauseCorrection,
        require_authorization: requireAuthorization,
        invoice_terms: invoiceTerms,
        invoice_footer: invoiceFooter,
        email_on_complete: emailOnComplete,
        auto_generate_pdf: autoGeneratePdf,
        auto_send_quote_email: autoSendQuoteEmail,
      })
      .eq("id", shopId);

    if (error) toast.error(error.message);
    else toast.success("Settings saved.");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filePath = `logos/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("logos")
      .upload(filePath, file, { upsert: true });

    if (error) {
      toast.error(error.message);
    } else {
      const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
      setLogoUrl(data.publicUrl);
      toast.success("Logo uploaded!");
    }
  };

  const handleGenerateLogo = () => {
    // Placeholder: integrate OpenAI API to generate a logo
    toast.info("AI Logo generation coming soon...");
  };

  if (loading) return <div className="p-4">Loading shop settings...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-10 text-white">
      <h1 className="text-3xl font-bold text-orange-400">Shop Settings</h1>

      {/* Shop Info */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Shop Info</h2>
        <Input
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder="Shop Name"
        />
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address"
        />
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
        />
        <Input
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          placeholder="Province/State"
        />
        <Input
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="Postal Code"
        />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone Number"
        />
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="Logo URL"
        />
        <Input type="file" accept="image/*" onChange={handleLogoUpload} />
        <Button onClick={handleGenerateLogo} variant="secondary">
          Generate Logo with AI
        </Button>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            className="w-32 h-32 object-contain border mt-2 bg-white p-1"
          />
        )}
      </section>

      {/* Billing Defaults */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Billing Defaults</h2>
        <Input
          value={laborRate}
          onChange={(e) => setLaborRate(e.target.value)}
          placeholder="Labor Rate ($/hr)"
        />
        <Input
          value={suppliesPercent}
          onChange={(e) => setSuppliesPercent(e.target.value)}
          placeholder="Shop Supplies (%)"
        />
        <Input
          value={diagnosticFee}
          onChange={(e) => setDiagnosticFee(e.target.value)}
          placeholder="Diagnostic Fee ($)"
        />
        <Input
          value={taxRate}
          onChange={(e) => setTaxRate(e.target.value)}
          placeholder="Tax Rate (%)"
        />
      </section>

      {/* Workflow Settings */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Workflow Settings</h2>
        <label>
          <input
            type="checkbox"
            checked={useAi}
            onChange={(e) => setUseAi(e.target.checked)}
          />{" "}
          Use AI features
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={requireCauseCorrection}
            onChange={(e) => setRequireCauseCorrection(e.target.checked)}
          />{" "}
          Require cause/correction
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={requireAuthorization}
            onChange={(e) => setRequireAuthorization(e.target.checked)}
          />{" "}
          Require customer authorization
        </label>
      </section>

      {/* Communication & Branding */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Communication & Branding</h2>
        <Input
          value={invoiceTerms}
          onChange={(e) => setInvoiceTerms(e.target.value)}
          placeholder="Invoice Terms"
        />
        <Input
          value={invoiceFooter}
          onChange={(e) => setInvoiceFooter(e.target.value)}
          placeholder="Invoice Footer Note"
        />
        <label>
          <input
            type="checkbox"
            checked={emailOnComplete}
            onChange={(e) => setEmailOnComplete(e.target.checked)}
          />{" "}
          Email customer when job is complete
        </label>
      </section>

      {/* Live Invoice Preview */}
      <section className="space-y-2 bg-neutral-800 p-4 rounded-md">
        <h2 className="text-xl font-semibold text-white">
          Live Invoice Preview
        </h2>
        <div className="bg-white text-black p-4 rounded shadow space-y-2">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-16" />}
          <div className="text-sm text-gray-700">{shopName}</div>
          <div className="text-xs">
            {address}, {city}, {province}, {postalCode}
          </div>
          <div className="text-xs">
            {phone} • {email}
          </div>
          <hr />
          <div className="text-sm font-bold">Invoice Terms:</div>
          <p className="text-xs">{invoiceTerms}</p>
          <div className="text-sm font-bold">Footer:</div>
          <p className="text-xs">{invoiceFooter}</p>
        </div>
      </section>

      {/* Automation */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Automation</h2>
        <label>
          <input
            type="checkbox"
            checked={autoGeneratePdf}
            onChange={(e) => setAutoGeneratePdf(e.target.checked)}
          />{" "}
          Auto-generate quote PDF
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={autoSendQuoteEmail}
            onChange={(e) => setAutoSendQuoteEmail(e.target.checked)}
          />{" "}
          Auto-send quote email
        </label>
      </section>

      <Button onClick={handleSave} className="mt-6">
        Save Settings
      </Button>
    </div>
  );
}
