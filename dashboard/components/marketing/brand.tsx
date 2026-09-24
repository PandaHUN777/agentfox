/**
 * The marketing brand mark and lockup.
 *
 * The mark is the supplied artwork at `public/brand/mark.webp`, not a redrawing of
 * it. It is a geometric fox head in the two brand colours, and hand-tracing that
 * into SVG paths produces something subtly wrong in a way nobody notices until it
 * sits next to the real file. The same artwork is the favicon and the apple-touch
 * icon (`app/icon.png`, `app/apple-icon.png`), so the tab, the home screen and the
 * page header are one image rather than three near-misses.
 *
 * Being a raster with its own colours, it does not follow the theme. That is right
 * for a logo: the mark's navy and orange both read on white and on black.
 *
 * The naming is "AgentFox by Nometria", matching the supplied lockup. `sub` prints
 * the parent-brand line, which belongs anywhere the lockup stands alone and is off
 * in the navigation bar, where the row is already tight.
 */

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/brand/mark.webp"
      alt=""
      width={size}
      height={size}
      decoding="async"
      style={{ flex: `0 0 ${size}px`, width: size, height: size, display: "block" }}
    />
  );
}

/** Mark plus name. `sub` adds the "by Nometria" line underneath. */
export function BrandLockup({ size = 28, sub = false }: { size?: number; sub?: boolean }) {
  return (
    <span className="mk-brand">
      <BrandMark size={size} />
      <span style={{ display: "grid", lineHeight: 1.15 }}>
        <span className="mk-brand-name">AgentFox</span>
        {sub && <span className="mk-brand-sub">by Nometria</span>}
      </span>
    </span>
  );
}
