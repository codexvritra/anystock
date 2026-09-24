import { useId } from "react";

/**
 * Our own mark: a map pin sprinting forward on neon speed lines, with a rising arrow for
 * the stock. Drawn in SVG so it stays sharp at every size and costs no image requests.
 */
export function Mark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 96 64" aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#159b45" />
          <stop offset=".55" stopColor="#2be36a" />
          <stop offset="1" stopColor="#a8e832" />
        </linearGradient>
      </defs>
      {/* speed lines */}
      <g stroke={`url(#g${id})`} strokeLinecap="round">
        <path d="M4 30h22" strokeWidth="5" />
        <path d="M10 40h18" strokeWidth="4.5" opacity=".8" />
        <path d="M2 50h22" strokeWidth="4" opacity=".6" />
      </g>
      {/* the pin, leaning into the run */}
      <g transform="rotate(12 52 34)">
        <path d="M52 6c-11.6 0-21 9-21 20.2C31 41.4 52 60 52 60s21-18.6 21-33.8C73 15 63.6 6 52 6z" fill={`url(#g${id})`} />
        <circle cx="52" cy="26" r="8.5" fill="#04140b" />
      </g>
      {/* rising arrow */}
      <path d="M58 44l14-12 7 5 13-15" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82 20h11v11" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Word({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 330 44" aria-label="Streetstock" role="img">
      <defs>
        <linearGradient id={`w${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#2be36a" />
          <stop offset="1" stopColor="#a8e832" />
        </linearGradient>
      </defs>
      <text
        x="4"
        y="37"
        fontFamily="Fredoka, 'Trebuchet MS', sans-serif"
        fontWeight="700"
        fontSize="42"
        fontStyle="italic"
        letterSpacing="-0.5"
        transform="skewX(-10)"
      >
        <tspan fill="#fff">STREET</tspan>
        <tspan fill={`url(#w${id})`}>STOCK</tspan>
      </text>
    </svg>
  );
}

/** The large centred logo on the landing stage. */
export function BigLogo({ className }: { className?: string }) {
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4%" }}>
      <Mark className="big-logo-mark" />
      <Word className="big-logo-word" />
    </div>
  );
}
