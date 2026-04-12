"use client";

type Props = {
  title?: string;
  subtitle?: string;
  fullName: string;
  email: string;
  phone: string;
  street?: string;
  city?: string;
  province?: string;
  postal?: string;
  onFullNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onStreetChange?: (v: string) => void;
  onCityChange?: (v: string) => void;
  onProvinceChange?: (v: string) => void;
  onPostalChange?: (v: string) => void;
};

export default function ProfileContactCard({
  title = "Contact details",
  subtitle = "Keep your identity and contact details current.",
  fullName,
  email,
  phone,
  street,
  city,
  province,
  postal,
  onFullNameChange,
  onEmailChange,
  onPhoneChange,
  onStreetChange,
  onCityChange,
  onProvinceChange,
  onPostalChange,
}: Props): JSX.Element {
  const inputClass =
    "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--accent-copper-soft)]";

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-black/35 p-4 shadow-card backdrop-blur-xl">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="text-xs text-neutral-400">{subtitle}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs text-neutral-300">
          <span>Full name</span>
          <input className={inputClass} value={fullName} onChange={(e) => onFullNameChange(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-neutral-300">
          <span>Email</span>
          <input className={inputClass} value={email} onChange={(e) => onEmailChange(e.target.value)} type="email" />
        </label>
        <label className="space-y-1 text-xs text-neutral-300 md:col-span-2">
          <span>Phone</span>
          <input className={inputClass} value={phone} onChange={(e) => onPhoneChange(e.target.value)} />
        </label>
      </div>

      {onStreetChange ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs text-neutral-300 md:col-span-2">
            <span>Street</span>
            <input className={inputClass} value={street ?? ""} onChange={(e) => onStreetChange(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-neutral-300">
            <span>City</span>
            <input className={inputClass} value={city ?? ""} onChange={(e) => onCityChange?.(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-neutral-300">
              <span>State / Province</span>
              <input className={inputClass} value={province ?? ""} onChange={(e) => onProvinceChange?.(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs text-neutral-300">
              <span>Postal</span>
              <input className={inputClass} value={postal ?? ""} onChange={(e) => onPostalChange?.(e.target.value)} />
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}
