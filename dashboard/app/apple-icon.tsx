/**
 * The 180x180 touch icon iOS and iPadOS use when someone adds the site to their
 * home screen. Same mark as app/icon.tsx, but at this size there is room for the
 * full lockup from components/marketing/brand.tsx: the dashed outer shield that
 * detection is, around the solid inner keep that the capability grant is.
 *
 * Apple does not honour transparency here and composites onto white, so the
 * background is painted explicitly rather than left to the default.
 */

import { ImageResponse } from "next/og";

// app/marketing.css, dark block: --mk-accent / --mk-bg. Literal hex because
// ImageResponse renders through Satori, which does not resolve CSS variables.
const ACCENT = "#e08a63";
const BG = "#100e0b";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <svg width={132} height={132} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2.2 20.8 5.8v6.3c0 5.4-3.7 9.2-8.8 10.9C7 21.3 3.2 17.5 3.2 12.1V5.8L12 2.2Z"
            stroke={ACCENT}
            strokeOpacity="0.45"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeDasharray="3.2 2.6"
          />
          <path
            d="M12 7.1 17 9.2v3.6c0 3-2.1 5.2-5 6.2-2.9-1-5-3.2-5-6.2V9.2L12 7.1Z"
            fill={ACCENT}
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
