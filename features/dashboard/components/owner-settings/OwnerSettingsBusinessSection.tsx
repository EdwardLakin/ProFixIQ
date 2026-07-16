"use client";

import Image from "next/image";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { OwnerSettingsPanel } from "@/features/dashboard/components/owner-settings/OwnerSettingsPanels";

type FileInputChangeEvent = {
  target: {
    files: FileList | null;
  };
};

type CountryCode = "US" | "CA";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Edmonton",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Halifax",
] as const;

type Props = {
  isUnlocked: boolean;
  country: CountryCode;
  timezone: string;
  shopName: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  logoUrl: string;
  provinceLabel: string;
  postalLabel: string;
  selectClass: string;
  labelClass: string;
  onCountryChange: (value: CountryCode) => void;
  onTimezoneChange: (value: string) => void;
  onShopNameChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onProvinceChange: (value: string) => void;
  onPostalCodeChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onLogoUrlChange: (value: string) => void;
  onLogoUpload: (e: FileInputChangeEvent) => void;
};

export default function OwnerSettingsBusinessSection({
  isUnlocked,
  country,
  timezone,
  shopName,
  address,
  city,
  province,
  postalCode,
  phone,
  email,
  logoUrl,
  provinceLabel,
  postalLabel,
  selectClass,
  labelClass,
  onCountryChange,
  onTimezoneChange,
  onShopNameChange,
  onAddressChange,
  onCityChange,
  onProvinceChange,
  onPostalCodeChange,
  onPhoneChange,
  onEmailChange,
  onLogoUrlChange,
  onLogoUpload,
}: Props) {
  return (
    <OwnerSettingsPanel
      id="shop-info"
      tone="secondary"
      title="Business profile"
      description="Business identity, contact details, and location defaults."
    >
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <div className={labelClass}>Country</div>
          <select
            value={country}
            onChange={(e) => onCountryChange(e.target.value as CountryCode)}
            className={selectClass}
            disabled={!isUnlocked}
          >
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className={labelClass}>Timezone</div>
          <select
            value={timezone}
            onChange={(e) => onTimezoneChange(e.target.value)}
            className={selectClass}
            disabled={!isUnlocked}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <label className="block space-y-1.5">
          <span className={labelClass}>Shop name</span>
          <Input
            value={shopName}
            onChange={(e) => onShopNameChange(e.target.value)}
            placeholder="Downtown Diesel"
            disabled={!isUnlocked}
          />
        </label>
        <label className="block space-y-1.5">
          <span className={labelClass}>Street address</span>
          <Input
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="123 Service Road"
            disabled={!isUnlocked}
          />
        </label>

        <div className="grid gap-2 md:grid-cols-3">
          <label className="block space-y-1.5">
            <span className={labelClass}>City</span>
            <Input
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              placeholder="City"
              disabled={!isUnlocked}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>{provinceLabel}</span>
            <Input
              value={province}
              onChange={(e) => onProvinceChange(e.target.value)}
              placeholder={provinceLabel}
              disabled={!isUnlocked}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>{postalLabel}</span>
            <Input
              value={postalCode}
              onChange={(e) => onPostalCodeChange(e.target.value)}
              placeholder={postalLabel}
              disabled={!isUnlocked}
            />
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={labelClass}>Phone number</span>
            <Input
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="(555) 555-0100"
              disabled={!isUnlocked}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>Public email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="service@example.com"
              disabled={!isUnlocked}
            />
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={labelClass}>Logo URL</span>
            <Input
              value={logoUrl}
              onChange={(e) => onLogoUrlChange(e.target.value)}
              placeholder="https://…"
              disabled={!isUnlocked}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>Upload logo</span>
            <Input
              type="file"
              accept="image/*"
              onChange={
                onLogoUpload as unknown as React.ChangeEventHandler<HTMLInputElement>
              }
              disabled={!isUnlocked}
            />
          </label>
        </div>

        <Button variant="secondary" className="mt-1" disabled>
          AI logo maker · Coming soon
        </Button>

        {logoUrl ? (
          <Image
            src={logoUrl}
            alt="Logo"
            width={128}
            height={80}
            unoptimized
            className="mt-2 h-20 w-32 rounded bg-[color:var(--theme-surface-panel-strong)] p-1 object-contain"
          />
        ) : null}
      </div>
    </OwnerSettingsPanel>
  );
}
