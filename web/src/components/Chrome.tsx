import { Mark, Word } from "./Brand.tsx";
import { IcBars, IcBook, IcHome, IcPin, IcShield, IcTrophy } from "./Icons.tsx";
import { href, type Route } from "../lib/hooks.ts";
import { useSession } from "../lib/session.tsx";
import { short, usd } from "../lib/format.ts";

export function Header() {
  const { wallet, me, openSheet, signOut, ready } = useSession();
  return (
    <header className="hdr">
      <div className="hdr-inner">
        <a className="brand" href={href("home")} aria-label="Streetstock home">
          <Mark className="brand-mark" />
          <Word className="brand-word" />
        </a>
        <nav className="hdr-nav" aria-label="Main">
          <a className="linkish hdr-link t-green" href={href("how")}>
            <IcBook /> How it works
          </a>
          <a className="linkish hdr-link t-cyan" href={href("proof")}>
            <IcShield /> Proof
          </a>
          <a className="linkish hdr-link t-gold" href={href("legendary")}>
            <IcTrophy /> Legendary
          </a>
          <a className="linkish hdr-link t-lime" href={href("stats")}>
            <IcBars /> Stats
          </a>
        </nav>
        <div className="hdr-actions">
          <a className="btn sm ghost map-btn" href={href("map")}>
            Open the map
          </a>
          {!ready ? null : wallet ? (
            <button type="button" className="btn sm me-btn" title="Sign out" onClick={() => confirm("Sign out?") && void signOut()}>
              <span className="me-avatar">{(me.handle ?? wallet.slice(2, 3)).slice(0, 1).toUpperCase()}</span>
              <span>{me.handle ?? short(wallet)}</span>
              {me.totalUsd ? <span className="num">· {usd(me.totalUsd)}</span> : null}
            </button>
          ) : (
            <button type="button" className="btn sm" onClick={openSheet}>
              <span className="auth-long">Sign in to start</span>
              <span className="auth-short">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function Dock({ route }: { route: Route }) {
  const tab = (r: Route, label: string, icon: React.ReactNode, tone: string) => (
    <a href={href(r)} className={`tab ${tone} ${route === r ? "on" : ""}`} aria-current={route === r ? "page" : undefined}>
      <span className="tab-icon">{icon}</span>
      <span className="tab-label">{label}</span>
    </a>
  );
  return (
    <nav className="dock" aria-label="Tabs">
      {tab("home", "Home", <IcHome size={17} />, "t-green")}
      {tab("proof", "Proof", <IcShield size={17} />, "t-cyan")}
      {tab("map", "Map", <IcPin size={18} />, "map")}
      {tab("legendary", "Legendary", <IcTrophy size={17} />, "t-gold")}
      {tab("stats", "Stats", <IcBars size={17} />, "t-lime")}
    </nav>
  );
}
