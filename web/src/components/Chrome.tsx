import type { ReactNode } from "react";
import { Chart, Crown, Home, MapIcon, PinMark, Shield } from "./Icons.tsx";
import { href, type Route } from "../lib/hooks.ts";
import { useSession } from "../lib/session.tsx";
import { short, usd } from "../lib/format.ts";

const NAV: { r: Route; label: string; cls?: string }[] = [
  { r: "how", label: "How it works" },
  { r: "proof", label: "Proof" },
  { r: "legendary", label: "Legendary", cls: "legend" },
  { r: "soon", label: "Coming soon" },
  { r: "stats", label: "Stats" },
];

export function Logo() {
  return (
    <a className="logo" href={href("home")} aria-label="Streetstock home">
      <PinMark />
      <span>
        street<b>stock</b>
      </span>
    </a>
  );
}

export function WalletChip() {
  const { wallet, me, openSheet, signOut, ready } = useSession();
  if (!ready) return null;
  if (!wallet)
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={openSheet}>
        Sign in
      </button>
    );
  return (
    <button type="button" className="chip-wallet" title="Sign out" onClick={() => confirm("Sign out?") && void signOut()}>
      <span className="dot" />
      <span>{me.handle ?? short(wallet)}</span>
      {me.totalUsd ? <span className="num green">{usd(me.totalUsd)}</span> : null}
    </button>
  );
}

export function Header({ route }: { route: Route }) {
  return (
    <header className="header">
      <Logo />
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.r} href={href(n.r)} className={n.cls} aria-current={route === n.r ? "page" : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="header-right">
        <a className="btn btn-green btn-sm open-map" href={href("map")}>
          Open the map
        </a>
        <WalletChip />
      </div>
    </header>
  );
}

export function TabBar({ route }: { route: Route }) {
  const tab = (r: Route, label: string, icon: ReactNode, cls?: string) => (
    <a href={href(r)} className={cls} aria-current={route === r ? "page" : undefined}>
      {cls === "map-tab" ? <span className="bub">{icon}</span> : icon}
      {label}
    </a>
  );
  return (
    <nav className="tabbar" aria-label="Tabs">
      {tab("home", "Home", <Home />)}
      {tab("proof", "Proof", <Shield />)}
      {tab("map", "Map", <MapIcon size={26} />, "map-tab")}
      {tab("legendary", "Legendary", <Crown />)}
      {tab("stats", "Stats", <Chart />)}
    </nav>
  );
}
