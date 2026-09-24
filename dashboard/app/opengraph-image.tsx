/**
 * The 1200x630 card Reddit, Slack, X, Discord, LinkedIn and Google all read.
 * The drawing itself is in app/og.tsx, shared with twitter-image.tsx.
 *
 * Next requires the `size`, `contentType` and default export to be declared in
 * this file; re-exporting them from the shared module is enough.
 */

import { ogImage, OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from "./og";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage();
}
