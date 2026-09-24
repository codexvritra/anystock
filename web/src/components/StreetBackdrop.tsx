import { useMemo } from "react";

/**
 * The hero background: a stylised street grid with drops pulsing on it and one walker
 * heading for the nearest. Pure SVG, so it costs nothing and never asks for location.
 */
export function StreetBackdrop() {
  const { streets, drops } = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const streets: string[] = [];
    for (let i = 0; i < 16; i++) {
      const y = i * 70 + rnd() * 30;
      streets.push(`M-50 ${y} C 300 ${y + rnd() * 80 - 40}, 900 ${y + rnd() * 80 - 40}, 1650 ${y + rnd() * 60 - 30}`);
    }
    for (let i = 0; i < 20; i++) {
      const x = i * 85 + rnd() * 40;
      streets.push(`M${x} -50 C ${x + rnd() * 80 - 40} 300, ${x + rnd() * 80 - 40} 700, ${x + rnd() * 60 - 30} 1150`);
    }
    const tickers = ["NVDA", "TSLA", "AAPL", "NVDA", "AAPL", "TSLA", "NVDA", "AMZN", "META"];
    const drops = tickers.map((t, i) => ({
      t,
      x: 700 + rnd() * 850,
      y: 80 + rnd() * 850,
      rare: i % 4 === 3,
      delay: rnd() * 3,
    }));
    return { streets, drops };
  }, []);

  return (
    <svg className="hero-bg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="glow">
          <stop offset="0" stopColor="#2be36a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2be36a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="1000" fill="#040806" />
      <g stroke="#1a2a21" strokeWidth="9" fill="none" strokeLinecap="round">
        {streets.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g stroke="#0f1a14" strokeWidth="3" fill="none">
        {streets.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <path
        d="M 980 760 C 1030 700, 1090 690, 1120 610"
        stroke="#35c6f4"
        strokeWidth="4"
        strokeDasharray="2 12"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-56" dur="1.6s" repeatCount="indefinite" />
      </path>
      <circle cx="980" cy="760" r="9" fill="#35c6f4" stroke="#fff" strokeWidth="3" />
      {drops.map((d, i) => (
        <g key={i} transform={`translate(${d.x} ${d.y})`}>
          <circle r="60" fill="url(#glow)" opacity="0.5">
            <animate attributeName="opacity" values="0.15;0.6;0.15" dur="3s" begin={`${d.delay}s`} repeatCount="indefinite" />
          </circle>
          <g transform="rotate(-45)">
            <rect x="-17" y="-17" width="34" height="34" rx="17" ry="17" fill="#0f1d15" stroke={d.rare ? "#35c6f4" : "#2be36a"} strokeWidth="2.5" />
            <rect x="-17" y="0" width="17" height="17" fill="#0f1d15" stroke="none" />
          </g>
          <text y="4" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="11" fill={d.rare ? "#35c6f4" : "#2be36a"}>
            {d.t}
          </text>
        </g>
      ))}
    </svg>
  );
}
