import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  punch: vi.fn(),
  postOffline: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  storyFetches: 0,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ lineId: "line-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: async () => ({ profile: null, error: null }),
}));
// Run the queued runner inline, like the real queue does when online.
vi.mock("@/features/shared/lib/offline/mutations", () => ({
  runMutationWithOfflineQueue: async (args: { runner: () => Promise<void> }) => {
    await args.runner();
    return { queued: false, conflicted: false };
  },
}));
vi.mock("@/features/shared/lib/offline/server-mutations", () => ({
  postOfflineServerMutation: (...args: unknown[]) => mocks.postOffline(...args),
}));
vi.mock("@/features/work-orders/lib/jobPunchTransitionsClient", () => ({
  runJobPunchTransition: (...args: unknown[]) => mocks.punch(...args),
}));
vi.mock("@/features/work-orders/mobile/MobileFocusedJob", () => ({ default: () => null }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess, warning: mocks.toastWarning },
}));
// Behaves like the real dialog: a throwing submit keeps it open and shows the message.
vi.mock("@/features/work-orders/components/workorders/CauseCorrectionModal", () => ({
  default: function Modal(props: {
    onSubmit: (cause: string, correction: string) => Promise<void>;
    onClose: () => void;
    onDraftChange?: (cause: string, correction: string) => void;
    initialCause?: string;
  }) {
    const [error, setError] = React.useState<string | null>(null);
    const [cause, setCause] = React.useState(props.initialCause ?? "");
    return (
      <div role="dialog">
        <textarea aria-label="cause" value={cause} onChange={(e) => {
          setCause(e.target.value);
          props.onDraftChange?.(e.target.value, "Replaced seal");
        }} />
        <button type="button" onClick={async () => {
          setError(null);
          try {
            await props.onSubmit(cause, "Replaced seal");
            props.onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "failed");
          }
        }}>Submit story</button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    );
  },
}));

import MobileJobPage from "../app/mobile/jobs/[lineId]/page";

function storyResponse(): Response {
  mocks.storyFetches += 1;
  return new Response(
    JSON.stringify({
      lines: [
        {
          id: "line-1",
          work_order_id: "wo-1",
          complaint: "Hydraulic leak",
          description: "Replace seal",
          cause: null,
          correction: null,
          status: "in_progress",
          updated_at: "2026-10-17T12:00:00.000Z",
        },
      ],
    }),
    { status: 200 },
  );
}

async function openAndSubmit() {
  render(<MobileJobPage />);
  const open = await screen.findByRole("button", { name: "Open cause and correction editor" });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  fireEvent.change(await screen.findByLabelText("cause"), { target: { value: "Worn seal" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit story" }));
}

describe("a non-final punch-off whose story cannot be saved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storyFetches = 0;
    vi.stubGlobal("fetch", vi.fn(async () => storyResponse()));
    mocks.punch.mockResolvedValue({
      lineClosed: false,
      remaining: [{ technicianId: "t2", state: "running" }],
    });
  });

  it("keeps the dialog open with the text, says what happened, and does not reload over it", async () => {
    mocks.postOffline.mockRejectedValue(new Error("Network lost."));
    await openAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You are punched off, but your story was not saved");
    expect(alert).toHaveTextContent("Your text is still here");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((screen.getByLabelText("cause") as HTMLTextAreaElement).value).toBe("Worn seal");
    expect(mocks.punch).toHaveBeenCalledTimes(1);
    // No success message and no reload of the line (which would replace the text).
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("retries only the save: it does not punch off a second time, and succeeds", async () => {
    mocks.postOffline.mockRejectedValueOnce(new Error("Network lost.")).mockResolvedValue(undefined);
    await openAndSubmit();
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Submit story" }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Punched off. 1 other technician is still on this job.",
      ),
    );
    expect(mocks.punch).toHaveBeenCalledTimes(1);
    expect(mocks.postOffline).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("saves the story straight away when nothing goes wrong", async () => {
    mocks.postOffline.mockResolvedValue(undefined);
    await openAndSubmit();
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.punch).toHaveBeenCalledTimes(1);
    expect(mocks.postOffline).toHaveBeenCalledTimes(1);
  });

  it("a finish that closes the line is unchanged and never tries a separate story save", async () => {
    mocks.punch.mockResolvedValue({ lineClosed: true });
    await openAndSubmit();
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Job completed."));
    expect(mocks.postOffline).not.toHaveBeenCalled();
  });
});
