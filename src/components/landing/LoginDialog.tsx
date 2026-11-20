import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { login } from "@/lib/login";
import { LOGIN_ERROR_MESSAGES, REGISTER_ERROR_MESSAGES } from "@/lib/passkeyMessages";
import {
  INVITE_CODE_PREFIX,
  isValidCode,
  isValidName,
  MAX_NAME_BYTES,
  register,
} from "@/lib/register";
import { fetchSession, fetchUserName } from "@/lib/session";

export interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

type View = "login" | "register";

/** `idle` is only seen in the login view before the ceremony starts, or after a register. */
type Status = { kind: "idle" } | { kind: "waiting" } | { kind: "error"; message: string };

const IDLE: Status = { kind: "idle" };

/** The code is shown as a prefix and a few trailing characters, never in full. */
function maskCode(code: string): string {
  const tail = code.trim().slice(-4);
  return `${INVITE_CODE_PREFIX}••••${tail}`;
}

export function LoginDialog({ open, onClose, triggerRef }: LoginDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const wasOpenRef = useRef(false);
  // Guards against starting a second ceremony while one is in flight.
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  // Latest onClose, so the passkey effect never restarts when a caller recreates it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const triggerRefRef = useRef(triggerRef);
  triggerRefRef.current = triggerRef;

  const titleId = useId();
  const descId = useId();
  const codeId = useId();
  const nameId = useId();

  const [view, setView] = useState<View>("login");
  const [status, setStatus] = useState<Status>(IDLE);
  const [notice, setNotice] = useState("");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  // Whether the code field is expanded. It collapses once the code has the right shape.
  const [editingCode, setEditingCode] = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Only reachable when nothing is in flight: the open effect fires on a transition and the
  // "Try again" button isn't rendered while waiting.
  const runLogin = useCallback(async () => {
    inFlightRef.current = true;
    setNotice("");
    setStatus({ kind: "waiting" });
    const result = await login();
    inFlightRef.current = false;
    if (!mountedRef.current) return;
    if (!result.ok) {
      setStatus({ kind: "error", message: LOGIN_ERROR_MESSAGES[result.code] });
      return;
    }
    setStatus(IDLE);
    const session = await fetchSession();
    if (session) {
      const userName = await fetchUserName(session.userId);
      // Next steps are not built yet: for now just report who logged in.
      console.log(userName ?? session.userId);
    }
    if (mountedRef.current) onCloseRef.current();
  }, []);

  const runRegister = useCallback(async () => {
    if (inFlightRef.current || !isValidCode(code) || !isValidName(name)) return;
    inFlightRef.current = true;
    setStatus({ kind: "waiting" });
    const result = await register({ code, name });
    inFlightRef.current = false;
    if (!mountedRef.current) return;
    if (!result.ok) {
      // A bad code needs the field back; everything else is a retry of the passkey.
      if (result.code === "invitation_rejected" || result.code === "invalid_invitation") {
        setEditingCode(true);
      }
      setStatus({ kind: "error", message: REGISTER_ERROR_MESSAGES[result.code] });
      return;
    }
    // The code is spent. Registering does not sign in: send them to log in.
    setCode("");
    setName("");
    setEditingCode(true);
    setStatus(IDLE);
    setNotice("Account created. Log in with your passkey to continue.");
    setView("login");
  }, [code, name]);

  // Open/close the native dialog, and kick off the passkey as soon as the dialog opens.
  useEffect(() => {
    const dialog = dialogRef.current as HTMLDialogElement;

    if (open) {
      wasOpenRef.current = true;
      setView("login");
      setNotice("");
      setStatus(IDLE);
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      void runLogin();
    } else {
      if (dialog.open) {
        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.removeAttribute("open");
        }
      }
      setCode("");
      setName("");
      setEditingCode(true);
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        triggerRefRef.current?.current?.focus();
      }
    }
  }, [open, runLogin]);

  const switchView = (next: View) => {
    setView(next);
    setStatus(IDLE);
    setNotice("");
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    if (status.kind === "error") setStatus(IDLE);
  };

  // Once the code looks right, tuck the field away.
  const handleCodeBlur = () => {
    if (isValidCode(code)) setEditingCode(false);
  };

  const handleRegisterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runRegister();
  };

  const waiting = status.kind === "waiting";
  const codeValid = isValidCode(code);
  const codeCollapsed = codeValid && !editingCode;
  const nameFilled = name !== "";
  const canRegister = codeValid && isValidName(name) && !waiting;

  const title = view === "login" ? "Sign in to susu.dev" : "Create your account";
  const description =
    view === "login"
      ? "Use your passkey to continue."
      : "Accounts use a passkey. You'll need an invitation.";

  return (
    <dialog
      ref={dialogRef}
      className="landing-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
    >
      <div className="landing-dialog-inner">
        <div className="landing-dialog-header">
          <div>
            <h2 id={titleId} className="landing-dialog-title">
              {title}
            </h2>
            <p id={descId} className="landing-dialog-desc">
              {description}
            </p>
          </div>
          <button
            type="button"
            className="landing-dialog-close"
            aria-label="Close sign in dialog"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {view === "login" ? (
          <div className="landing-dialog-form">
            {notice !== "" && (
              <p role="status" className="landing-dialog-notice">
                {notice}
              </p>
            )}

            {status.kind === "waiting" && (
              <p role="status" aria-live="polite" className="landing-dialog-status">
                Waiting for your passkey…
                <span className="landing-dialog-hint">
                  Follow the prompt from your browser or passkey provider.
                </span>
              </p>
            )}

            {status.kind === "error" && (
              <p role="alert" className="landing-dialog-status landing-dialog-error">
                {status.message}
              </p>
            )}

            {status.kind !== "waiting" && (
              <button type="button" className="landing-dialog-submit" onClick={() => runLogin()}>
                {status.kind === "error" ? "Try again" : "Log in"}
              </button>
            )}

            <p className="landing-dialog-switch">
              <button
                type="button"
                className="landing-dialog-link"
                disabled={waiting}
                onClick={() => switchView("register")}
              >
                Need to create an account?
              </button>
            </p>
          </div>
        ) : (
          <form className="landing-dialog-form" onSubmit={handleRegisterSubmit} noValidate>
            {codeCollapsed ? (
              <div className="landing-field">
                <span className="landing-field-label">Invitation code</span>
                <div className="landing-code-summary">
                  <span className="landing-code-masked">{maskCode(code)}</span>
                  <button
                    type="button"
                    className="landing-dialog-link"
                    disabled={waiting}
                    onClick={() => setEditingCode(true)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <div className="landing-field">
                <label htmlFor={codeId} className="landing-field-label">
                  Invitation code
                </label>
                <input
                  id={codeId}
                  name="invitation-code"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`${INVITE_CODE_PREFIX}…`}
                  className="landing-field-input"
                  value={code}
                  disabled={waiting}
                  onChange={(event) => handleCodeChange(event.target.value)}
                  onBlur={handleCodeBlur}
                />
                {code.trim() !== "" && !codeValid && (
                  <span className="landing-field-hint">
                    Invitation codes start with {INVITE_CODE_PREFIX} and contain only letters,
                    digits, - and _.
                  </span>
                )}
              </div>
            )}

            <div className="landing-field">
              <label htmlFor={nameId} className="landing-field-label">
                Full name
              </label>
              <input
                id={nameId}
                name="name"
                type="text"
                autoComplete="name"
                className="landing-field-input"
                value={name}
                disabled={waiting}
                onChange={(event) => setName(event.target.value)}
              />
              {nameFilled && !isValidName(name) && (
                <span className="landing-field-hint">
                  Names can be up to {MAX_NAME_BYTES} bytes, with no control or invisible
                  characters.
                </span>
              )}
            </div>

            {status.kind === "waiting" && (
              <p role="status" aria-live="polite" className="landing-dialog-status">
                Waiting for your passkey…
                <span className="landing-dialog-hint">
                  Follow the prompt from your browser or passkey provider to save a new passkey.
                </span>
              </p>
            )}

            {status.kind === "error" && (
              <p role="alert" className="landing-dialog-status landing-dialog-error">
                {status.message}
              </p>
            )}

            <button type="submit" className="landing-dialog-submit" disabled={!canRegister}>
              {status.kind === "error" ? "Try again" : "Create account"}
            </button>

            <p className="landing-dialog-switch">
              <button
                type="button"
                className="landing-dialog-link"
                disabled={waiting}
                onClick={() => switchView("login")}
              >
                Already have an account?
              </button>
            </p>
          </form>
        )}
      </div>
    </dialog>
  );
}
