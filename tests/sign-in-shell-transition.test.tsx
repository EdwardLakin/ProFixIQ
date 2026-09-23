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
  signUp: vi.fn(),
  fetch: vi.fn(),
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

vi.mock("@/features/stripe/lib/client/claim-acquisition", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/stripe/lib/client/claim-acquisition")
    >();

  return {
    ...actual,
    claimStripeAcquisitionAfterAuth: mocks.claimAcquisition,
  };
});

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getUser: mocks.getUser,
      resend: vi.fn(),
      signInWithOAuth: vi.fn(),
      signUp: mocks.signUp,
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
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          email: "owner@example.com",
          surface: "shop",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", mocks.fetch);
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

  it("hands an existing acquisition account back to sign-in instead of verification", async () => {
    searchParams.set("flow", "acquisition");
    searchParams.set("session_id", "cs_existing_account_test");

    mocks.signUp.mockResolvedValue({
      data: {
        session: null,
        user: { identities: [] },
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<AuthPage initialMode="sign-up" />);

    const ownerEmail = await screen.findByLabelText("Owner email");
    expect(ownerEmail).toHaveValue("owner@example.com");

    await user.type(screen.getByLabelText("Password"), "verysecure123");
    const createOwnerButtons = screen.getAllByRole("button", {
      name: "Create owner account",
    });
    const submitButton = createOwnerButtons.find(
      (button) => button.getAttribute("type") === "submit",
    );
    expect(submitButton).toBeTruthy();
    await user.click(submitButton!);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Welcome back" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Continue by signing in with this email to attach the completed checkout. If you don't remember the password, use Forgot password.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email or username")).toHaveValue(
      "owner@example.com",
    );
    expect(
      screen.queryByRole("heading", { name: "Verify your email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resend verification email" }),
    ).not.toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "verysecure123",
      options: {
        emailRedirectTo: expect.stringContaining(
          "/auth/callback?session_id=cs_existing_account_test&flow=acquisition",
        ),
      },
    });
  });

  it("routes a stranded completed acquisition to exact billing recovery", async () => {
    searchParams.set("flow", "acquisition");
    searchParams.set("session_id", "cs_recovery_test");

    mocks.getUser.mockResolvedValue({
      data: { user: { id: "owner-user" } },
    });
    mocks.claimAcquisition.mockResolvedValue({
      required: true,
      linked: false,
      surface: null,
      recoveryRequired: true,
    });

    render(<AuthPage />);

    await waitFor(() => {
      expect(mocks.navigateAfterAuthentication).toHaveBeenCalledWith(
        "/account/billing?session_id=cs_recovery_test&billing_link_error=1",
      );
    });

    expect(mocks.claimAcquisition).toHaveBeenCalled();
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
