import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  onClose: () => void;
  eyebrow?: string;
  title?: ReactNode;
  lede?: ReactNode;
  tone?: "green" | "gold" | "blue" | "epic";
  narrow?: boolean;
  label?: string;
  children: ReactNode;
}

/** Modal panel: centred on desktop, a bottom sheet on phones. Escape and the scrim close it. */
export function Sheet({ onClose, eyebrow, title, lede, tone = "green", narrow, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        className={`sheet tone-${tone} ${narrow ? "narrow" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : eyebrow)}
      >
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {title && <h2>{title}</h2>}
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </>
  );
}
