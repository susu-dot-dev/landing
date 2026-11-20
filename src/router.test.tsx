import { expect, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { createRouter, createTestRouter } from "./router";

const renderAt = (path: string) => render(<App router={createTestRouter([path])} />);

test("home renders Hello, world and a working counter", async () => {
  renderAt("/");
  expect(screen.getByRole("heading", { name: "Hello, world" })).toBeInTheDocument();

  const button = screen.getByRole("button", { name: "Clicked 0 times" });
  await userEvent.click(button);
  expect(screen.getByRole("button", { name: "Clicked 1 times" })).toBeInTheDocument();
});

test("unknown paths render the not-found page, which links home", async () => {
  renderAt("/nope/nothing");
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("link", { name: "Back to home" }));
  expect(screen.getByRole("heading", { name: "Hello, world" })).toBeInTheDocument();
});

test("the layout brand links home", async () => {
  renderAt("/missing");
  await userEvent.click(screen.getByRole("link", { name: "susu" }));
  expect(screen.getByRole("heading", { name: "Hello, world" })).toBeInTheDocument();
});

test("createRouter builds a browser router over the same routes", () => {
  const router = createRouter();
  expect(router.state.location.pathname).toBe("/");
  router.dispose();
});
