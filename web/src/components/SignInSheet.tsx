import type { ReactNode } from "react";
import { Sheet } from "./Sheet.tsx";
import { Google, Wallet, X } from "./Icons.tsx";
import { useSession, type Method } from "../lib/session.tsx";

const OPTIONS: { id: Method; label: string; note: string; icon: ReactNode; social: boolean }[] = [
  { id: "google", label: "Continue with Google", note: "one tap, no password", icon: <Google />, social: true },
  { id: "twitter", label: "Continue with X", note: "your handle is your name on the map", icon: <X />, social: true },
  {
    id: "wallet",
    label: "Continue with a wallet",
    note: "MetaMask, Rabby, or any Ethereum wallet · on a phone, open this site inside the wallet app",
    icon: <Wallet />,
    social: false,
  },
];

export function SignInSheet() {
  const { sheetOpen, closeSheet, signIn, busy, error, canSocial } = useSession();
  if (!sheetOpen) return null;
  const options = OPTIONS.filter((o) => canSocial || !o.social);

  return (
    <Sheet
      onClose={closeSheet}
      narrow
      eyebrow="sign in"
      title="Sign in to start"
      lede={
        canSocial
          ? "A wallet on Robinhood Chain is made for you when you sign in with Google or X. No app store, no seed phrase, nothing to pay, ever."
          : "Sign in with any Ethereum wallet. Signing is free and moves nothing: we pay every network fee on Robinhood Chain."
      }
    >
      {error && <p className="err">{error}</p>}
      {options.map((o) => (
        <button key={o.id} type="button" className="signin-opt" disabled={busy} onClick={() => void signIn(o.id)}>
          <span className="ic">{o.icon}</span>
          <span>
            <span className="t">{o.label}</span>
            <br />
            <span className="n">{o.note}</span>
          </span>
          <span className="arr">{busy ? "…" : "→"}</span>
        </button>
      ))}
      <p className="fine">
        Tokenized stocks are not offered to US persons and may not be available where you live. By continuing you agree that the walking
        is guaranteed and the price is not.
      </p>
    </Sheet>
  );
}
