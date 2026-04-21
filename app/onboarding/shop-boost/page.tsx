$(git show :2:app/onboarding/shop-boost/page.tsx | python3 - <<'PY'
import sys
text = sys.stdin.read()
old = """      if (typeof window !== "undefined") {
        window.localStorage.removeItem(UPLOAD_SESSION_STORAGE_KEY);
      }

<<<<<<< HEAD
      if (billingIntentExists) {
        const started = await launchSubscriptionCheckout();
        if (!started) {
          setStepStatus("error");
        }
        return;
      }

      router.replace("/dashboard/operations?setup=shop-boost");
=======
      router.replace(buildDashboardSetupHref(searchParams, json.intakeId));
>>>>>>> e12b62f6c (updated auth sign up)"""
new = """      if (typeof window !== "undefined") {
        window.localStorage.removeItem(UPLOAD_SESSION_STORAGE_KEY);
      }

      if (billingIntentExists) {
        const started = await launchSubscriptionCheckout();
        if (!started) {
          setStepStatus("error");
        }
        return;
      }

      router.replace(buildDashboardSetupHref(searchParams, json.intakeId));"""
if old not in text:
    print(text, end="")
else:
    print(text.replace(old, new), end="")
PY
)
