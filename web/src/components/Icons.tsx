const s = { width: 18, height: 18, viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const PinMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 6c-10.5 0-19 8.3-19 18.6C13 38.5 32 58 32 58s19-19.5 19-33.4C51 14.3 42.5 6 32 6z" fill="#2be36a" />
    <path d="M23 30l7-7 5.5 4.5L43 19" stroke="#03140a" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Google = () => (
  <svg {...s}>
    <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
    <path fill="currentColor" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
    <path fill="currentColor" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6z" />
    <path fill="currentColor" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
  </svg>
);

export const X = () => (
  <svg {...s}>
    <path fill="currentColor" d="M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.8 21H1.6l7.4-8.5L1.2 3h6.6l4.5 5.6zm-1.1 16.1h1.8L7.7 4.8H5.8z" />
  </svg>
);

export const Wallet = () => (
  <svg {...s}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="17" cy="12" r="1.6" fill="currentColor" />
  </svg>
);

export const MapIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5c-4 0-7 3-7 6.9 0 5.2 7 12.1 7 12.1s7-6.9 7-12.1c0-3.9-3-6.9-7-6.9z" fill="currentColor" />
    <circle cx="12" cy="9.5" r="2.6" fill="var(--green)" />
  </svg>
);

export const Home = () => (
  <svg {...s} width={22} height={22}>
    <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
export const Shield = () => (
  <svg {...s} width={22} height={22}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
export const Crown = () => (
  <svg {...s} width={22} height={22}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
export const Chart = () => (
  <svg {...s} width={22} height={22}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
export const Back = () => (
  <svg {...s}>
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Locate = () => (
  <svg {...s}>
    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
