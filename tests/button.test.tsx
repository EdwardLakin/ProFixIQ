import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

function DemoButton() {
  return <button>Save</button>;
}

describe("DemoButton", () => {
  it("renders", () => {
    render(<DemoButton />);
    expect(
      screen.getByRole("button", { name: "Save" })
    ).toBeInTheDocument();
  });
});