import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createWalletClient, custom, getAddress, type EIP1193Provider } from "viem";
import { createSiweMessage } from "viem/siwe";
import { getJson, postJson, type Me } from "./api.ts";
import { PRIVY_APP_ID } from "./chain.ts";

/**
 * Sign-in. Every path ends the same way: a wallet signs a Sign-In With Ethereum message
 * and the server sets an httpOnly session cookie.
 *  - Google / X: Privy makes an embedded wallet at sign-in (no seed phrase, no app store)
 *  - Wallet: any injected EIP-1193 wallet (MetaMask, Rabby, Robinhood Wallet's browser…)
 * Signing costs nothing and needs no network switch: the server pays every gas fee.
 */

export type Method = "google" | "twitter" | "wallet";

/** Filled in by <PrivyBridge/> when a Privy app id is configured. */
export interface PrivyHandle {
  login: (provider: "google" | "twitter") => Promise<void>;
  sign: (message: string) => Promise<{ address: string; signature: `0x${string}` }>;
  logout: () => Promise<void>;
  embeddedAddress: () => string | null;
  authenticated: () => boolean;
}

interface Session {
  ready: boolean;
  me: Me;
  wallet: string | null;
  busy: boolean;
  error: string | null;
  canSocial: boolean;
  signIn: (m: Method) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  /** internal: PrivyBridge registers itself here */
  privy: React.MutableRefObject<PrivyHandle | null>;
  completeSocial: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

async function siwe(address: string, sign: (message: string) => Promise<`0x${string}`>) {
  const { nonce, chainId, domain } = await getJson<{ nonce: string; chainId: number; domain: string }>("/auth/nonce");
  const message = createSiweMessage({
    address: getAddress(address),
    chainId,
    domain,
    nonce,
    uri: window.location.origin,
    version: "1",
    statement: "Sign in to Streetstock. This costs nothing and moves nothing.",
  });
  const signature = await sign(message);
  await postJson("/auth/verify", { message, signature });
}

function injected(): EIP1193Provider | null {
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  return eth ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>({ wallet: null });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const privy = useRef<PrivyHandle | null>(null);
  const completing = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setMe(await getJson<Me>("/me"));
    } catch {
      setMe({ wallet: null });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
        setSheetOpen(false);
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
        setError(/reject|denied|cancel/i.test(msg) ? "Cancelled. Nothing happened." : msg);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  /** After a Google/X redirect: Privy is authenticated, the embedded wallet exists, sign in to our server. */
  const completeSocial = useCallback(async () => {
    const p = privy.current;
    if (!p || completing.current || me.wallet || !p.authenticated() || !p.embeddedAddress()) return;
    completing.current = true;
    await run(async () => {
      await siwe(p.embeddedAddress()!, async (message) => (await p.sign(message)).signature);
    });
    completing.current = false;
  }, [me.wallet, run]);

  const signIn = useCallback(
    async (m: Method) => {
      if (m === "wallet") {
        return run(async () => {
          const eth = injected();
          if (!eth) throw new Error("No wallet in this browser. Continue with Google or X instead, or open this site in your wallet app.");
          const client = createWalletClient({ transport: custom(eth) });
          const [address] = await client.requestAddresses();
          await siwe(address, (message) => client.signMessage({ account: address, message }));
        });
      }
      const p = privy.current;
      if (!p) return setError("Google and X sign-in are not set up on this server.");
      setBusy(true);
      setError(null);
      try {
        await p.login(m); // redirects; completeSocial finishes on return
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    },
    [run],
  );

  const signOut = useCallback(async () => {
    await postJson("/auth/logout", {}).catch(() => {});
    await privy.current?.logout().catch(() => {});
    setMe({ wallet: null });
  }, []);

  const value = useMemo<Session>(
    () => ({
      ready,
      me,
      wallet: me.wallet,
      busy,
      error,
      canSocial: Boolean(PRIVY_APP_ID),
      signIn,
      signOut,
      refresh,
      sheetOpen,
      openSheet: () => {
        setError(null);
        setSheetOpen(true);
      },
      closeSheet: () => setSheetOpen(false),
      privy,
      completeSocial,
    }),
    [ready, me, busy, error, signIn, signOut, refresh, sheetOpen, completeSocial],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
