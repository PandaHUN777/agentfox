/*
 * The request path, drawn.
 *
 * /how-it-works existed to answer one question — what happens to a call between
 * the agent and the thing it acts on — and it answered it with an <ol> of eight
 * paragraphs. A sequence is the one kind of content a diagram is unambiguously
 * better at than prose: the reader wants to see the order, where the stops are,
 * and which stop still works after the one before it has failed. None of that is
 * visible in a list.
 *
 * So: a rail with eight stations, the three that can stop a call marked in the
 * stop colour, and a pulse that travels the rail so the direction of travel is
 * not something the reader has to infer from the numbering.
 *
 * The motion is CSS-only and decorative. Everything is legible with the animation
 * removed, the page is complete at rest before the first frame plays, and
 * `prefers-reduced-motion` turns it off — a security product that makes a reader
 * wait for an animation to learn what it does has failed twice.
 *
 * The sequence is docs/hld.md §6, which is itself verified against
 * enforcement.py's preflight/evaluate/call_provider and the gateway's
 * chat_completions handler. Nothing here is added to that sequence.
 */

import type { ReactNode } from "react";

export type Station = {
  title: string;
  body: ReactNode;
  /** A call can end here. Three of the eight can; that is the point of the drawing. */
  stops?: boolean;
  /** The one the product rests on, per the section copy. */
  keystone?: boolean;
};

export function RequestPath({ stations }: { stations: Station[] }) {
  return (
    <ol className="rp" aria-label="The path one call takes">
      {/* The travelling pulse is one absolutely-positioned element on the rail
          rather than per-station animation, so adding a station cannot leave the
          motion out of step with the content. */}
      <span className="rp-pulse" aria-hidden />
      {stations.map((s, i) => (
        <li
          key={s.title}
          className={
            "rp-station" +
            (s.stops ? " rp-station-stop" : "") +
            (s.keystone ? " rp-station-key" : "")
          }
          style={{ ["--i" as string]: String(i) }}
        >
          <span className="rp-mark" aria-hidden>
            {i + 1}
          </span>
          <div className="rp-body">
            <h3 className="mk-h3">
              {s.title}
              {s.stops && <span className="rp-tag">can end here</span>}
            </h3>
            <p className="mk-body">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
