import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  notifyWorkOrderPartsRefresh,
  useWorkOrderPartsRefresh,
} from "@/features/work-orders/workspace/useWorkOrderPartsRefresh";

function PartsRefreshHarness({
  lineId,
  refresh,
}: {
  lineId: string;
  refresh: () => void | Promise<void>;
}) {
  useWorkOrderPartsRefresh(lineId, refresh);
  return null;
}

afterEach(() => cleanup());

describe("Work Order Workspace Parts refresh", () => {
  it("refreshes only the selected line and cleans up when selection changes", () => {
    const refresh = vi.fn();
    const view = render(
      <PartsRefreshHarness lineId="line-1" refresh={refresh} />,
    );

    act(() => notifyWorkOrderPartsRefresh("line-2"));
    expect(refresh).not.toHaveBeenCalled();

    act(() => notifyWorkOrderPartsRefresh("line-1"));
    expect(refresh).toHaveBeenCalledTimes(1);

    view.rerender(
      <PartsRefreshHarness lineId="line-2" refresh={refresh} />,
    );
    act(() => notifyWorkOrderPartsRefresh("line-1"));
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => notifyWorkOrderPartsRefresh("line-2"));
    expect(refresh).toHaveBeenCalledTimes(2);

    view.unmount();
    act(() => notifyWorkOrderPartsRefresh("line-2"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
