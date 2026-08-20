import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "@/features/auth/components/SignIn";

const mocks = vi.hoisted(() => ({
  claimAcquisition: vi.fn(),
  getUser: vi.fn(),
  navigateAfterAuthentication: vi.fn(),
  signInWithIdentifier: vi.fn(),
}));

const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/auth/components/AuthShell", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/auth/lib/signInClient", () => ({
  signInWithIdentifier: mocks.signInWithIdentifier,
}));

vi.mock("@/features/auth/lib/postAuthNavigation", () => ({
  navigateAfterAuthentication: mocks.navigateAfterAuthentication,
}));

vi.mock("@/features/stripe/lib/client/claim-acquisition", () => ({
  claimStripeAcquisitionAfterAuth: mocks.claimAcquisition,
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getUser: mocks.getUser,
      resend: vi.fn(),
      signInWithOAuth: vi.fn(),
      signUp: vi.fn(),
    },
  }),
}));

describe("Shop sign-in shell transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams.forEach((_value, key) => searchParams.delete(key));
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.claimAcquisition.mockResolvedValue({ linked: true });
    mocks.signInWithIdentifier.mockResolvedValue({
      ok: true,
      destination: "/dashboard/operations",
    });
  });

  it("performs a document navigation after a successful sign-in", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText("Email or username"), "owner");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(
      screen.getByRole("button", { name: "Sign in to ProFixIQ Shop" }),
    );

    await waitFor(() => {
      expect(mocks.navigateAfterAuthentication).toHaveBeenCalledWith(
        "/dashboard/operations",
      );
    });
    expect(mocks.signInWithIdentifier).toHaveBeenCalledWith({
      identifier: "owner",
      password: "password123",
      surface: "shop",
      acquisitionSessionId: undefined,
    });
  });

  it("uses location replacement to rebuild the protected root layout", async () => {
    const { navigateAfterAuthentication } = await vi.importActual<
      typeof import("@/features/auth/lib/postAuthNavigation")
    >("@/features/auth/lib/postAuthNavigation");
    const replaceDocument = vi.fn();

    navigateAfterAuthentication("/dashboard/operations", replaceDocument);

    expect(replaceDocument).toHaveBeenCalledOnce();
    expect(replaceDocument).toHaveBeenCalledWith("/dashboard/operations");
  });
});
