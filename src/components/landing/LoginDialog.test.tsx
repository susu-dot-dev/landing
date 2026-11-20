import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import * as actualRegister from "@/lib/register" with { rstest: "importActual" };
import { LoginDialog } from "./LoginDialog";

const mocks = rs.hoisted(() => ({
  login: rs.fn(),
  register: rs.fn(),
  fetchSession: rs.fn(),
  fetchUserName: rs.fn(),
}));

rs.mock("@/lib/login", () => ({ login: mocks.login }));
rs.mock("@/lib/session", () => ({
  fetchSession: mocks.fetchSession,
  fetchUserName: mocks.fetchUserName,
}));
rs.mock("@/lib/register", () => ({
  ...actualRegister,
  register: mocks.register,
}));

const CODE = `susu_inv_${"x".repeat(43)}`;

/** A promise the test settles by hand, to hold a ceremony "waiting". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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

let logSpy: ReturnType<typeof rs.spyOn>;

beforeEach(() => {
  mocks.login.mockReset();
  mocks.register.mockReset();
  mocks.fetchSession.mockReset();
  mocks.fetchUserName.mockReset();
  logSpy = rs.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

test("opening the dialog launches the passkey immediately and shows the waiting text", async () => {
  const pending = deferred<{ ok: true }>();
  mocks.login.mockReturnValue(pending.promise);
  render(<DialogHarness />);

  await userEvent.click(screen.getByRole("button", { name: "Log in" }));

  expect(mocks.login).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog", { name: "Sign in to susu.dev" })).toBeInTheDocument();
  expect(screen.getByText("Waiting for your passkey…")).toBeInTheDocument();
  // Nothing to click while the browser owns the prompt.
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Need to create an account?" })).toBeDisabled();

  await act(async () => pending.resolve({ ok: true }));
});

test("a successful login console.logs the user's name and closes the dialog", async () => {
  mocks.login.mockResolvedValue({ ok: true });
  mocks.fetchSession.mockResolvedValue({ userId: "u1", role: "member" });
  mocks.fetchUserName.mockResolvedValue("Ada Lovelace");
  render(<DialogHarness />);

  const trigger = screen.getByRole("button", { name: "Log in" });
  await userEvent.click(trigger);

  await waitFor(() => expect(logSpy).toHaveBeenCalledWith("Ada Lovelace"));
  expect(mocks.fetchUserName).toHaveBeenCalledWith("u1");
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

test("login falls back to the user id when the name isn't readable", async () => {
  mocks.login.mockResolvedValue({ ok: true });
  mocks.fetchSession.mockResolvedValue({ userId: "u1", role: "member" });
  mocks.fetchUserName.mockResolvedValue(null);
  render(<DialogHarness />);

  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(logSpy).toHaveBeenCalledWith("u1"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("a login failure shows the error, and Try again re-launches the passkey", async () => {
  mocks.login.mockResolvedValueOnce({ ok: false, code: "cancelled" });
  render(<DialogHarness />);

  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The passkey prompt was dismissed.");

  mocks.login.mockResolvedValueOnce({ ok: false, code: "network" });
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server.");
  expect(mocks.login).toHaveBeenCalledTimes(2);
});

test("the dialog switches between login and register views and back", async () => {
  mocks.login.mockResolvedValue({ ok: false, code: "cancelled" });
  render(<DialogHarness />);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("alert");

  await userEvent.click(screen.getByRole("button", { name: "Need to create an account?" }));
  expect(screen.getByRole("dialog", { name: "Create your account" })).toBeInTheDocument();
  expect(screen.getByLabelText("Invitation code")).toBeInTheDocument();
  expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  // The login error doesn't follow the user into the register view.
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Already have an account?" }));
  expect(screen.getByRole("dialog", { name: "Sign in to susu.dev" })).toBeInTheDocument();
  // Switching views doesn't launch a passkey by itself.
  expect(mocks.login).toHaveBeenCalledTimes(1);
});

async function openRegister() {
  mocks.login.mockResolvedValue({ ok: false, code: "cancelled" });
  render(<DialogHarness />);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Need to create an account?" }));
}

test("register validates only the code's shape, then collapses the code field", async () => {
  await openRegister();
  const submit = screen.getByRole("button", { name: "Create account" });
  const codeInput = screen.getByLabelText("Invitation code");

  await userEvent.type(codeInput, "not-a-code");
  expect(screen.getByText(/Invitation codes start with susu_inv_/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Full name"), "Ada");
  expect(submit).toBeDisabled();

  await userEvent.clear(codeInput);
  await userEvent.type(codeInput, CODE);
  expect(screen.queryByText(/Invitation codes start with/)).not.toBeInTheDocument();
  // Still expanded until focus leaves.
  expect(screen.getByLabelText("Invitation code")).toBeInTheDocument();

  await userEvent.click(screen.getByLabelText("Full name"));
  expect(screen.queryByLabelText("Invitation code")).not.toBeInTheDocument();
  expect(screen.getByText("susu_inv_••••xxxx")).toBeInTheDocument();
  // The full code is never rendered once collapsed.
  expect(screen.queryByText(CODE)).not.toBeInTheDocument();
  expect(submit).toBeEnabled();

  // Edit expands it again with the value intact.
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Invitation code")).toHaveValue(CODE);
});

test("a successful register sends the user back to login with a notice and no auto sign-in", async () => {
  mocks.register.mockResolvedValue({ ok: true, userId: "u1", role: "member" });
  await openRegister();

  await userEvent.type(screen.getByLabelText("Invitation code"), CODE);
  await userEvent.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(mocks.register).toHaveBeenCalledWith({ code: CODE, name: "Ada Lovelace" });
  expect(await screen.findByText(/Account created/)).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Sign in to susu.dev" })).toBeInTheDocument();
  // Only the open-time attempt: registering doesn't log in.
  expect(mocks.login).toHaveBeenCalledTimes(1);
  expect(mocks.fetchSession).not.toHaveBeenCalled();
});

test("a rejected invitation shows the error and re-expands the code field", async () => {
  mocks.register.mockResolvedValue({ ok: false, code: "invitation_rejected" });
  await openRegister();

  await userEvent.type(screen.getByLabelText("Invitation code"), CODE);
  await userEvent.type(screen.getByLabelText("Full name"), "Ada");
  expect(screen.queryByLabelText("Invitation code")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("That invitation code isn't valid.");
  expect(screen.getByLabelText("Invitation code")).toHaveValue(CODE);
});

test("a passkey failure during register keeps the code collapsed and shows waiting text meanwhile", async () => {
  const pending = deferred<{ ok: false; code: "cancelled" }>();
  mocks.register.mockReturnValue(pending.promise);
  await openRegister();

  await userEvent.type(screen.getByLabelText("Invitation code"), CODE);
  await userEvent.type(screen.getByLabelText("Full name"), "Ada");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(screen.getByText("Waiting for your passkey…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Already have an account?" })).toBeDisabled();

  await act(async () => pending.resolve({ ok: false, code: "cancelled" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The passkey prompt was dismissed.");
  expect(screen.queryByLabelText("Invitation code")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("closing and reopening resets to the login view and forgets typed values", async () => {
  await openRegister();
  await userEvent.type(screen.getByLabelText("Full name"), "Ada");

  await userEvent.click(screen.getByRole("button", { name: "Close sign in dialog" }));
  mocks.login.mockResolvedValue({ ok: false, code: "cancelled" });
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Need to create an account?" }));
  expect(screen.getByLabelText("Full name")).toHaveValue("");
});

test("LoginDialog closes on Escape, native cancel, and backdrop click only", async () => {
  mocks.login.mockResolvedValue({ ok: false, code: "cancelled" });
  const user = userEvent.setup();
  render(<DialogHarness />);
  const trigger = screen.getByRole("button", { name: "Log in" });

  trigger.focus();
  await user.keyboard(" ");
  const dialog = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  await screen.findByRole("alert");
  fireEvent.keyDown(dialog, { key: "Enter" });
  expect(dialog).toHaveAttribute("open");
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(document.activeElement).toBe(trigger);

  await user.click(trigger);
  const second = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  fireEvent(second, new Event("cancel", { cancelable: true }));
  expect(document.activeElement).toBe(trigger);

  await user.click(trigger);
  const third = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(third).toHaveAttribute("open");
  fireEvent.click(third);
  expect(document.activeElement).toBe(trigger);
});

test("LoginDialog gracefully falls back when showModal and close are unavailable", async () => {
  mocks.login.mockResolvedValue({ ok: false, code: "cancelled" });
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
    await screen.findByRole("alert");

    rerender(<LoginDialog open={true} onClose={onClose} triggerRef={{ current: null }} />);
    expect(dialog).toHaveAttribute("open");
    // Re-rendering while open must not restart the passkey.
    expect(mocks.login).toHaveBeenCalledTimes(1);

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

test("editing the name or code after an error clears the error; invalid names get a hint", async () => {
  mocks.register.mockResolvedValue({ ok: false, code: "cancelled" });
  await openRegister();

  await userEvent.type(screen.getByLabelText("Invitation code"), CODE);
  await userEvent.type(screen.getByLabelText("Full name"), "bad\u200bname");
  expect(screen.getByText(/Names can be up to 128 bytes/)).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Full name"));
  await userEvent.type(screen.getByLabelText("Full name"), "Ada");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.type(screen.getByLabelText("Invitation code"), "y");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a second Enter while a ceremony is in flight doesn't start another", async () => {
  const pending = deferred<{ ok: false; code: "cancelled" }>();
  mocks.register.mockReturnValue(pending.promise);
  await openRegister();
  await userEvent.type(screen.getByLabelText("Invitation code"), CODE);
  await userEvent.type(screen.getByLabelText("Full name"), "Ada");
  const form = screen.getByLabelText("Full name").closest("form") as HTMLFormElement;

  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(mocks.register).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ ok: false, code: "cancelled" }));
});

test("a login that finishes after the dialog unmounts does nothing further", async () => {
  const pending = deferred<{ ok: true }>();
  mocks.login.mockReturnValue(pending.promise);
  const { unmount } = render(<LoginDialog open={true} onClose={() => {}} />);
  unmount();
  await act(async () => pending.resolve({ ok: true }));
  expect(mocks.fetchSession).not.toHaveBeenCalled();
});

test("a register that finishes after the dialog unmounts does nothing further", async () => {
  const pending = deferred<{ ok: true; userId: string; role: string }>();
  mocks.register.mockReturnValue(pending.promise);
  mocks.login.mockResolvedValue({ ok: false, code: "cancelled" });
  const { unmount } = render(<DialogHarness />);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Need to create an account?" }));
  await userEvent.type(screen.getByLabelText("Invitation code"), CODE);
  await userEvent.type(screen.getByLabelText("Full name"), "Ada");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  unmount();
  await act(async () => pending.resolve({ ok: true, userId: "u", role: "member" }));
});

test("a login whose session lookup outlives the dialog doesn't close it again", async () => {
  const session = deferred<{ userId: string; role: string }>();
  mocks.login.mockResolvedValue({ ok: true });
  mocks.fetchSession.mockReturnValue(session.promise);
  mocks.fetchUserName.mockResolvedValue("Ada");
  const onClose = rs.fn();
  const { unmount } = render(<LoginDialog open={true} onClose={onClose} />);
  await waitFor(() => expect(mocks.fetchSession).toHaveBeenCalled());
  unmount();
  await act(async () => session.resolve({ userId: "u", role: "member" }));
  expect(logSpy).toHaveBeenCalledWith("Ada");
  expect(onClose).not.toHaveBeenCalled();
});
