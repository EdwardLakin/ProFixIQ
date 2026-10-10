import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CollapsibleSearchList, { filterBySearch } from "./CollapsibleSearchList";

const items = Array.from({ length: 10 }, (_, i) => ({
  id: `id-${i}`,
  name: i === 7 ? "Brake fluid flush" : `Service ${i}`,
}));

function renderList() {
  return render(
    <CollapsibleSearchList
      title="Services"
      items={items}
      getKey={(i) => i.id}
      getSearchText={(i) => i.name}
      renderItem={(i) => <div>{i.name}</div>}
    />,
  );
}

describe("filterBySearch", () => {
  it("matches every term case-insensitively", () => {
    expect(filterBySearch(items, "FLUID brake", (i) => i.name)).toHaveLength(1);
    expect(filterBySearch(items, "  ", (i) => i.name)).toHaveLength(10);
  });
});

describe("CollapsibleSearchList", () => {
  it("shows only the top 3 on load and expands on demand", () => {
    renderList();
    expect(screen.getAllByText(/^Service \d$/)).toHaveLength(3);
    expect(screen.getByText("Service 0")).toBeTruthy();
    expect(screen.queryByText("Service 5")).toBeNull();

    fireEvent.click(screen.getByText("Show all 10"));
    expect(screen.getByText("Service 5")).toBeTruthy();

    fireEvent.click(screen.getByText("Show less"));
    expect(screen.queryByText("Service 5")).toBeNull();
  });

  it("searches across hidden items", () => {
    renderList();
    fireEvent.change(screen.getByLabelText("Search Services"), {
      target: { value: "brake" },
    });
    expect(screen.getByText("Brake fluid flush")).toBeTruthy();
    expect(screen.queryByText("Service 0")).toBeNull();
  });

  it("collapses and re-opens from the header", () => {
    renderList();
    const toggle = screen.getByRole("button", { name: /Services/ });
    fireEvent.click(toggle);
    expect(screen.queryByText("Service 0")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText("Service 0")).toBeTruthy();
  });
});
