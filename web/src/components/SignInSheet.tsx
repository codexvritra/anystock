import { useEffect, type ReactNode } from "react";
import { Google, Wallet, X } from "./Icons.tsx";
import { useSession, type Method } from "../lib/session.tsx";

const OPTIONS: { id: Method; label: string; note: string; icon: ReactNode; social: boolean }[] = [
  { id: "google", label: "Continue with Google", note: "one tap, no password", icon: <Google />, social: true },
  { id: "twitter", label: "Continue with X", note: "your handle is your name on the map", icon: <X />, social: true },
  {
    id: "wallet",
    label: "Continue with a wallet",
    note: "MetaMask, Rabby or any Ethereum wallet · on a phone this opens the site inside the wallet app",
    icon: <Wallet />,
    social: false,
  },
];

export function SignInSheet() {
  const { sheetOpen, closeSheet, signIn, busy, error, canSocial } = useSession();

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen) return null;
  const options = OPTIONS.filter((o) => canSocial || !o.social);

  return (
    <>
      <div className="si-scrim" onClick={closeSheet} aria-hidden="true" />
      <div className="si-sheet" role="dialog" aria-modal="true" aria-label="Sign in">
        <button type="button" className="pop-x" onClick={closeSheet} aria-label="Close">
          ✕
        </button>
        <span className="eyebrow">sign in</span>
        <h2 className="si-title">Sign in to start</h2>
        <p className="si-lead">
          {canSocial
            ? "A wallet on Robinhood Chain is made for you when you sign in with Google or X. No app store, no seed phrase, nothing to pay, ever. On a phone pick one of those two: you stay in this browser and location just works."
            : "Sign in with any Ethereum wallet. Signing is free and moves nothing: we pay every network fee on Robinhood Chain."}
        </p>
        {error && <p className="problem" style={{ margin: "0 0 10px" }}>{error}</p>}
        <div className="si-options">
          {options.map((o) => (
            <button key={o.id} type="button" className="si-option" disabled={busy} onClick={() => void signIn(o.id)}>
              <span className="si-icon">{o.icon}</span>
              <span className="si-text">
                <b>{o.label}</b>
                <small>{o.note}</small>
              </span>
              <span className="si-arrow">{busy ? "…" : "→"}</span>
            </button>
          ))}
        </div>
        <p className="si-fine">
          Tokenized stocks are not offered to US persons. By continuing you agree that the walking is guaranteed and the price is not.
        </p>
      </div>
    </>
  );
}
