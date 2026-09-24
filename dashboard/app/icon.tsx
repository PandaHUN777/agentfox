/**
 * The favicon. The app had none at all: no favicon.ico, no icon file, nothing in
 * public/, so every tab and every bookmark showed the browser's blank-page glyph
 * and Google had no icon to put beside the result.
 *
 * Generated from the same mark as the social card rather than shipped as a binary,
 * so there is one definition of the brand mark's geometry in this repository and a
 * change to it cannot leave a stale .ico behind.
 *
 * At 32px the dashed outer shield of components/marketing/brand.tsx is below the
 * resolution that can render a 1.4px dashed stroke legibly, so the favicon draws
 * the solid inner keep alone, scaled to fill. That is the same shape, not a
 * different mark, and it is the half that stays readable at tab size.
 */

import { ImageResponse } from "next/og";

// app/marketing.css: --mk-accent (dark) on --mk-bg (dark). Literal hex because
// ImageResponse renders through Satori, which does not resolve CSS variables.
const ACCENT = "#e08a63";
const BG = "#100e0b";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
        }}
      >
        <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3.2 20 6.6v6c0 5-3.4 8.7-8 10.2-4.6-1.5-8-5.2-8-10.2v-6L12 3.2Z"
            fill={ACCENT}
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
