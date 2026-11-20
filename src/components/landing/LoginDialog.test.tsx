import { expect, rs, test } from "@rstest/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { LoginDialog } from "./LoginDialog";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Log in
      </button>
      <LoginDialog open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} />
    </div>
  );
}

test("LoginDialog opens via keyboard, exposes accessible labels/status, and restores focus on close", async () => {
  const user = userEvent.setup();
  render(<DialogHarness />);

  const trigger = screen.getByRole("button", { name: "Log in" });
  trigger.focus();
  await user.keyboard("{Enter}");

  const dialog = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  expect(dialog).toBeInTheDocument();

  const emailInput = screen.getByLabelText("Email");
  const passphraseInput = screen.getByLabelText("Passphrase");
  expect(document.activeElement).toBe(emailInput);

  const status = screen.getByRole("status");
  expect(status).toHaveAttribute("aria-live", "polite");

  // Empty submission reports validation error
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(status).toHaveTextContent("Please enter your email address.");
  expect(document.activeElement).toBe(emailInput);

  // Filled submission announces preview status
  await user.type(emailInput, "artist@susu.dev");
  await user.type(passphraseInput, "ink-and-paper");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(status).toHaveTextContent("Sign-in is invite-only while susu.dev is in preview.");

  // Close with close button restores focus to trigger
  await user.click(screen.getByRole("button", { name: "Close sign in dialog" }));
  expect(document.activeElement).toBe(trigger);
});

test("LoginDialog closes on Escape key, native cancel event, and backdrop click only", async () => {
  const user = userEvent.setup();
  render(<DialogHarness />);

  const trigger = screen.getByRole("button", { name: "Log in" });

  // Open via Space, close via Escape keydown
  trigger.focus();
  await user.keyboard(" ");
  const dialog = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  fireEvent.keyDown(dialog, { key: "Enter" });
  expect(dialog).toHaveAttribute("open");
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(document.activeElement).toBe(trigger);

  // Open again, close via native cancel event
  await user.click(trigger);
  const reopenedDialog = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  fireEvent(reopenedDialog, new Event("cancel", { cancelable: true }));
  expect(document.activeElement).toBe(trigger);

  // Open again, clicking inside does not close; clicking backdrop closes
  await user.click(trigger);
  const dialogForClick = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  fireEvent.click(screen.getByLabelText("Email"));
  expect(dialogForClick).toHaveAttribute("open");
  fireEvent.click(dialogForClick);
  expect(document.activeElement).toBe(trigger);
});

test("LoginDialog gracefully falls back when showModal and close are unavailable", () => {
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;

  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: undefined,
  });

  try {
    const onClose = rs.fn();
    const { rerender, container } = render(<LoginDialog open={true} onClose={onClose} />);
    const dialog = container.querySelector("dialog");
    expect(dialog).toHaveAttribute("open");

    // Re-rendering while already open keeps dialog open without re-invoking showModal
    rerender(<LoginDialog open={true} onClose={onClose} triggerRef={{ current: null }} />);
    expect(dialog).toHaveAttribute("open");

    rerender(<LoginDialog open={false} onClose={onClose} />);
    expect(dialog).not.toHaveAttribute("open");
  } finally {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: originalShowModal,
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: originalClose,
    });
  }
});
