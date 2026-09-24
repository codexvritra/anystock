import { lazy, Suspense } from "react";
import { Dock, Header } from "./components/Chrome.tsx";
import { SignInSheet } from "./components/SignInSheet.tsx";
import { useRoute } from "./lib/hooks.ts";
import { ComingSoon, HowItWorks, LegendaryPopup, ProofPopup, StatsPopup } from "./pages/Popups.tsx";

// the stage carries maplibre, the heaviest thing we ship; the header paints while it loads
const Stage = lazy(() => import("./stage/Stage.tsx").then((m) => ({ default: m.Stage })));

export function App() {
  const route = useRoute();
  return (
    <>
      <Header />
      <main className="app-main">
        <Suspense fallback={<section className="stage" />}>
          <Stage open={route === "map"} />
        </Suspense>
      </main>
      {route === "how" && <HowItWorks />}
      {route === "proof" && <ProofPopup />}
      {route === "legendary" && <LegendaryPopup />}
      {route === "soon" && <ComingSoon />}
      {route === "stats" && <StatsPopup />}
      <Dock route={route} />
      <SignInSheet />
    </>
  );
}
