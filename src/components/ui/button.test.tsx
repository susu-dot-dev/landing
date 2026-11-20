import { expect, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

test("renders a button, or the child element with asChild", () => {
  const { rerender } = render(<Button>Save</Button>);
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

  rerender(
    <Button asChild>
      <a href="/x">Go</a>
    </Button>,
  );
  expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/x");
});
