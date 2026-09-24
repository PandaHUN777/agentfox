/**
 * The same card again for the `summary_large_image` Twitter/X tag. Twitter reads
 * `twitter:image` in preference to `og:image`, and its absence is the usual reason
 * a link unfurls on every other platform but not that one.
 *
 * Identical output to opengraph-image.tsx on purpose: both slots are 1200x630 and
 * there is no reason for the two to disagree. The handler is shared rather than
 * copied so they cannot drift.
 */

import { ogImage, OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from "./og";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage();
}
