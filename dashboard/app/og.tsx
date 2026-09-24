/**
 * The social card, shared by app/opengraph-image.tsx and app/twitter-image.tsx.
 *
 * Both metadata routes want the identical 1200x630 image, and Next requires each
 * to be its own file with its own `size`/`contentType`/default export, so the
 * actual drawing lives here once and each route re-exports it.
 *
 * Two constraints shape everything below:
 *
 * 1. `ImageResponse` renders through Satori, which does NOT resolve CSS custom
 *    properties. `var(--mk-accent)` would silently come out as nothing. So every
 *    colour is the literal hex read out of app/marketing.css, with the line it
 *    came from named beside it.
 * 2. Satori supports a subset of CSS. Every container with more than one child
 *    sets `display: "flex"` explicitly, because Satori has no block layout and
 *    throws on a multi-child div without it. No `filter`, no `box-shadow` blur,
 *    no web fonts loaded over the network: next/og ships a default font and using
 *    it is the difference between a card that always renders and one that fails
 *    whenever a font CDN is slow.
 */

import { ImageResponse } from "next/og";

/**
 * The dark palette from app/marketing.css (the `@media (prefers-color-scheme: dark)`
 * block, lines 52-60, which the `[data-theme="dark"]` block at lines 77-80 repeats
 * verbatim). Dark rather than light because a social card is shown at thumbnail size
 * against feed chrome, and the light ground (#faf9f6) disappears into most of it.
 */
const MK = {
  bg: "#100e0b", // --mk-bg
  surface: "#17150f", // --mk-surface
  border: "#2a251c", // --mk-border
  borderStrong: "#392f22", // --mk-border-strong
  text: "#f1ede4", // --mk-text
  muted: "#a89f8f", // --mk-muted
  faint: "#7d7566", // --mk-faint
  accent: "#e08a63", // --mk-accent
} as const;

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** Alt text, reused by the `images` entries in app/layout.tsx. */
export const OG_ALT =
  "Nometria: every call your agent makes, checked and recorded. Open source, Apache-2.0.";

/**
 * The marketing brand mark from components/marketing/brand.tsx, redrawn here
 * because that component is JSX bound to CSS variables and this renderer cannot
 * read them. Same two paths, same 24x24 viewBox: a broken dashed outer shield
 * (detection, which falls) around a solid inner keep (the capability grant, which
 * holds). Scaled by `size` rather than restyled, so the two stay the same mark.
 */
export function BrandMarkStatic({ size = 64, accent = MK.accent }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2.2 20.8 5.8v6.3c0 5.4-3.7 9.2-8.8 10.9C7 21.3 3.2 17.5 3.2 12.1V5.8L12 2.2Z"
        stroke={accent}
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeDasharray="3.2 2.6"
      />
      <path
        d="M12 7.1 17 9.2v3.6c0 3-2.1 5.2-5 6.2-2.9-1-5-3.2-5-6.2V9.2L12 7.1Z"
        fill={accent}
      />
    </svg>
  );
}

export function ogImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 76px",
          backgroundColor: MK.bg,
          // Stands in for the hero's ambient wash. A linear gradient is one of the
          // few backgrounds Satori renders; the blurred radial the site uses is not.
          backgroundImage: `linear-gradient(135deg, ${MK.surface} 0%, ${MK.bg} 46%, ${MK.bg} 100%)`,
          color: MK.text,
        }}
      >
        {/* Lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <BrandMarkStatic size={64} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Nometria
            </span>
            <span style={{ fontSize: 21, color: MK.muted, marginTop: 2 }}>
              Agent control plane
            </span>
          </div>
        </div>

        {/* Headline. The same sentence components/marketing/hero.tsx renders, with
            the same clause carrying the accent, so the card and the page a reader
            lands on say one thing rather than two. */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
            }}
          >
            <span>Every call your agent makes,&nbsp;</span>
            <span style={{ color: MK.accent }}>checked and recorded.</span>
          </div>
          <div style={{ display: "flex", fontSize: 28, color: MK.muted, marginTop: 26, lineHeight: 1.4 }}>
            Guardrails on model traffic, tool calls bounded by capability grants, and a
            tamper-evident record.
          </div>
        </div>

        {/* Footing */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            paddingTop: 26,
            borderTop: `1px solid ${MK.border}`,
            fontSize: 24,
            color: MK.faint,
          }}
        >
          <span
            style={{
              display: "flex",
              padding: "7px 16px",
              borderRadius: 999,
              border: `1px solid ${MK.borderStrong}`,
              color: MK.accent,
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Apache-2.0
          </span>
          <span style={{ display: "flex" }}>Open source</span>
          <span style={{ display: "flex", color: MK.border }}>·</span>
          <span style={{ display: "flex" }}>github.com/architsharm/guardrails</span>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
