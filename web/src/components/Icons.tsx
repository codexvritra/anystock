const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const I = ({ size = 18, children }: { size?: number; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base}>
    {children}
  </svg>
);

export const IcBook = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </I>
);
export const IcShield = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </I>
);
export const IcTrophy = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </I>
);
export const IcBars = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" />
  </I>
);
export const IcHome = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />
  </I>
);
export const IcPin = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </I>
);
export const IcCity = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M3 21h18M5 21V8l5-3v16M14 21V10h5v11M8 11h0M8 14h0M8 17h0M17 13h0M17 16h0" />
  </I>
);
export const IcBack = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M15 5l-7 7 7 7" />
  </I>
);
export const IcChev = ({ size = 14 }: { size?: number }) => (
  <I size={size}>
    <path d="M6 15l6-6 6 6" />
  </I>
);
export const IcNav = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M3 11l18-8-8 18-2-8z" />
  </I>
);
export const Google = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
    <path fill="currentColor" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
    <path fill="currentColor" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6z" />
    <path fill="currentColor" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
  </svg>
);
export const X = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.8 21H1.6l7.4-8.5L1.2 3h6.6l4.5 5.6zm-1.1 16.1h1.8L7.7 4.8H5.8z" />
  </svg>
);
export const Wallet = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect x="2.5" y="5.5" width="19" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="17" cy="12" r="1.6" fill="currentColor" />
  </svg>
);
