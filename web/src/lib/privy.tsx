import { useEffect, type ReactNode } from "react";
import { PrivyProvider, useLoginWithOAuth, usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth";
import { PRIVY_APP_ID, robinhoodChain } from "./chain.ts";
import { useSession } from "./session.tsx";

/**
 * Google / X sign-in through Privy, with an Ethereum wallet made for the player at
 * sign-in. Loaded only when VITE_PRIVY_APP_ID is set; otherwise the app offers browser
 * wallets alone and none of this code is in the bundle.
 */

function Bridge() {
  const { privy, completeSocial } = useSession();
  const { ready, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();
  const { initOAuth } = useLoginWithOAuth();
  const { signMessage } = useSignMessage();
  const embedded = wallets.find((w) => w.walletClientType === "privy");

  privy.current = {
    login: (provider) => initOAuth({ provider }),
    sign: async (message) => {
      if (!embedded) throw new Error("Your wallet is still being made. This takes a few seconds the first time.");
      const { signature } = await signMessage({ message }, { address: embedded.address, uiOptions: { showWalletUIs: false } });
      return { address: embedded.address, signature: signature as `0x${string}` };
    },
    logout,
    embeddedAddress: () => embedded?.address ?? null,
    authenticated: () => ready && authenticated,
  };

  useEffect(() => {
    if (ready && authenticated && embedded) void completeSocial();
  }, [ready, authenticated, embedded, completeSocial]);

  return null;
}

export default function PrivyLayer({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={{
        loginMethods: ["google", "twitter"],
        appearance: { theme: "dark", accentColor: "#2be36a", walletChainType: "ethereum-only" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],
      }}
    >
      <Bridge />
      {children}
    </PrivyProvider>
  );
}
