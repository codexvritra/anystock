import { lazy, Suspense } from "react";
import { Header, TabBar } from "./components/Chrome.tsx";
import { SignInSheet } from "./components/SignInSheet.tsx";
import { useRoute } from "./lib/hooks.ts";
import { Home } from "./pages/Home.tsx";
import { ComingSoon, HowItWorks, LegendaryPanel, ProofPanel, StatsPanel } from "./pages/Panels.tsx";

// maplibre is the heaviest thing we ship; only load it when someone opens the map
const MapView = lazy(() => import("./pages/MapView.tsx").then((m) => ({ default: m.MapView })));

export function App() {
  const route = useRoute();

  return (
    <>
      {route !== "map" && <Header route={route} />}
      {route === "map" ? (
        <Suspense fallback={<div className="mapwrap" aria-busy="true" />}>
          <MapView />
        </Suspense>
      ) : (
        <Home />
      )}
      {route === "how" && <HowItWorks />}
      {route === "proof" && <ProofPanel />}
      {route === "legendary" && <LegendaryPanel />}
      {route === "soon" && <ComingSoon />}
      {route === "stats" && <StatsPanel />}
      {route !== "map" && <TabBar route={route} />}
      <SignInSheet />
    </>
  );
}
