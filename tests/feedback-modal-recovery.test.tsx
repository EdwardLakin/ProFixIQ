import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: { id: "user-1" }, upload: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/portal" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    storage: { from: () => ({ upload: mocks.upload }) },
  }),
}));
vi.mock("@shared/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? children : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
import FeedbackModal from "@/features/feedback/components/FeedbackModal";
beforeEach(() => {
  localStorage.clear();
  mocks.user = { id: "user-1" };
  vi.restoreAllMocks();
});
describe("durable feedback draft and operation", () => {
  it("replays the identical persisted operation after a lost response and reload", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, matchedExisting: false }), {
          status: 200,
        }),
      );
    const first = render(<FeedbackModal open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/What were you trying/)).toBeEnabled(),
    );
    fireEvent.change(screen.getByPlaceholderText(/What were you trying/), {
      target: { value: "Improve portal navigation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Feedback" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry Feedback" }),
      ).toBeEnabled(),
    );
    const original = fetchMock.mock.calls[0][1]?.body;
    expect(JSON.parse(String(original)).submissionKey).toBeTruthy();
    first.unmount();
    render(<FeedbackModal open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry Feedback" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry Feedback" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][1]?.body).toBe(original);
    await waitFor(() =>
      expect(
        localStorage.getItem("profixiq:feedback-draft:v1:user-1"),
      ).toBeNull(),
    );
  });
  it("never restores another signed-in user's draft", async () => {
    localStorage.setItem(
      "profixiq:feedback-draft:v1:other-user",
      JSON.stringify({
        version: 1,
        description: "private draft",
        submissionKey: "private",
      }),
    );
    render(<FeedbackModal open onOpenChange={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByPlaceholderText(/What were you trying/)).toHaveValue("");
  });
});
