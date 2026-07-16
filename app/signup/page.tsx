import { Suspense } from "react";
import AuthPage from "@/features/auth/components/SignIn";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] grid place-items-center text-[color:var(--theme-text-primary)]">
          <div className="text-center">
            <h1 className="text-xl font-semibold">Loading sign-up…</h1>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">One moment.</p>
          </div>
        </div>
      }
    >
      <AuthPage initialMode="sign-up" />
    </Suspense>
  );
}
