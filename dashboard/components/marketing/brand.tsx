/**
 * The marketing brand mark and lockup.
 *
 * The signed-in app keeps its solid shield (components/Logo.tsx). This is the same
 * family a step further: the outer line is drawn broken and never filled, and a solid
 * shape sits inside it. That is the product's argument as a picture. Detection is the
 * outer line and it falls; the inner keep is what the action actually has to pass, and
 * it holds after the model has already been convinced.
 *
 * Drawn inline rather than loaded from a file so it inherits the accent token and is
 * correct in both themes without a second asset.
 */

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flex: `0 0 ${size}px` }}
    >
      <path
        d="M12 2.2 20.8 5.8v6.3c0 5.4-3.7 9.2-8.8 10.9C7 21.3 3.2 17.5 3.2 12.1V5.8L12 2.2Z"
        stroke="var(--mk-accent)"
        strokeOpacity=".36"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeDasharray="3.2 2.6"
      />
      <path
        d="M12 7.1 17 9.2v3.6c0 3-2.1 5.2-5 6.2-2.9-1-5-3.2-5-6.2V9.2L12 7.1Z"
        fill="var(--mk-accent)"
      />
    </svg>
  );
}

/** Mark plus name. `sub` prints the parent-brand line under it for the footer lockup. */
export function BrandLockup({ size = 28, sub = false }: { size?: number; sub?: boolean }) {
  return (
    <span className="mk-brand">
      <BrandMark size={size} />
      <span style={{ display: "grid", lineHeight: 1.15 }}>
        <span className="mk-brand-name">Nometria</span>
        {sub && <span className="mk-brand-sub">Agent control plane</span>}
      </span>
    </span>
  );
}
