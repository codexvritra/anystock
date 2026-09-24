import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  onClose: () => void;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  /** accent for the eyebrow dot and the phone-sheet neon edge */
  color?: string;
  wide?: boolean;
  children: ReactNode;
}

/** Info panel: centred card on desktop, a sheet above the tab dock on phones. */
export function Popup({ onClose, eyebrow, title, lede, color = "var(--accent)", wide, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="popup"
        style={{ ["--pop-c" as string]: color, width: wide ? "min(1060px, 100%)" : undefined }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : eyebrow}
        tabIndex={-1}
      >
        <div className="pop-head">
          <div className="pop-headtext">
            <span className="eyebrow">
              <span className="dot" /> {eyebrow}
            </span>
            <h2 className="pop-title">{title}</h2>
            {lede && <p className="pop-lede">{lede}</p>}
          </div>
          <button type="button" className="pop-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="pop-body">{children}</div>
      </div>
    </div>
  );
}

export function Sec({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="sec">
      {title && <h3 className="h2">{title}</h3>}
      {note && <p className="sec-note">{note}</p>}
      {children}
    </section>
  );
}
