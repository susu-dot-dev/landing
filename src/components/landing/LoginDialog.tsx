import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function LoginDialog({ open, onClose, triggerRef }: LoginDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);

  const titleId = useId();
  const descId = useId();
  const emailId = useId();
  const passphraseId = useId();

  const [email, setEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current as HTMLDialogElement;
    const emailInput = emailInputRef.current as HTMLInputElement;

    if (open) {
      wasOpenRef.current = true;
      setStatusMessage("");
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      }
      emailInput.focus();
    } else {
      if (dialog.open) {
        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.removeAttribute("open");
        }
      }
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        if (triggerRef?.current) {
          triggerRef.current.focus();
        }
      }
    }
  }, [open, triggerRef]);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setStatusMessage("Please enter your email address.");
      (emailInputRef.current as HTMLInputElement).focus();
      return;
    }
    setStatusMessage("Sign-in is invite-only while susu.dev is in preview.");
  };

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
              Sign in to susu.dev
            </h2>
            <p id={descId} className="landing-dialog-desc">
              Enter your studio credentials to continue.
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

        <form className="landing-dialog-form" onSubmit={handleSubmit} noValidate>
          <div className="landing-field">
            <label htmlFor={emailId} className="landing-field-label">
              Email
            </label>
            <input
              ref={emailInputRef}
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              className="landing-field-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="landing-field">
            <label htmlFor={passphraseId} className="landing-field-label">
              Passphrase
            </label>
            <input
              id={passphraseId}
              name="passphrase"
              type="password"
              autoComplete="current-password"
              className="landing-field-input"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </div>

          <button type="submit" className="landing-dialog-submit">
            Sign in
          </button>

          <p role="status" aria-live="polite" className="landing-dialog-status">
            {statusMessage}
          </p>
        </form>
      </div>
    </dialog>
  );
}
