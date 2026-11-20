import { expect, rs, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { createRouter, createTestRouter } from "./router";

rs.mock("@/lib/login", () => ({
  login: rs.fn(async () => ({ ok: false, code: "cancelled" })),
}));

const renderAt = (path: string) => render(<App router={createTestRouter([path])} />);

test("home renders full-bleed susu.dev landing stage with Log in trigger", async () => {
  renderAt("/");
  expect(screen.getByRole("heading", { level: 1, name: "susu.dev" })).toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();

  const loginButton = screen.getByRole("button", { name: "Log in" });
  await userEvent.click(loginButton);
  expect(screen.getByRole("dialog", { name: "Sign in to susu.dev" })).toBeInTheDocument();
});

test("unknown paths render the not-found page, which links home", async () => {
  renderAt("/nope/nothing");
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("link", { name: "Back to home" }));
  expect(screen.getByRole("heading", { level: 1, name: "susu.dev" })).toBeInTheDocument();
});

test("the layout brand links home from non-root routes", async () => {
  renderAt("/missing");
  await userEvent.click(screen.getByRole("link", { name: "susu.dev" }));
  expect(screen.getByRole("heading", { level: 1, name: "susu.dev" })).toBeInTheDocument();
});

test("createRouter builds a browser router over the same routes", () => {
  const router = createRouter();
  expect(router.state.location.pathname).toBe("/");
  router.dispose();
});
