import { StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { SessionProvider } from "./lib/session.tsx";
import { PRIVY_APP_ID } from "./lib/chain.ts";
import "./styles.css";

// Privy (Google / X sign-in) is only bundled in when an app id is configured
const PrivyLayer = PRIVY_APP_ID ? lazy(() => import("./lib/privy.tsx")) : null;

function Auth({ children }: { children: ReactNode }) {
  if (!PrivyLayer) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <PrivyLayer>{children}</PrivyLayer>
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <Auth>
        <App />
      </Auth>
    </SessionProvider>
  </StrictMode>,
);
