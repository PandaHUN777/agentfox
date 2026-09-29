import Link from "next/link";
import type { ReactNode } from "react";

import { MarketingNav } from "@/components/marketing/nav";
import { CTA, Footer } from "@/components/marketing/sections";
import { PRODUCT } from "@/lib/nav";

/**
 * One shape for every "what it does" page.
 *
 * A template rather than five bespoke pages, for the same reason the
 * reference site templates theirs: these five answer the same four questions
 * in the same order — what goes wrong, what we do about it in steps, what we
 * still do not do, and where to go next — and five hand-built variations on
 * that would differ in ways that carry no meaning and drift apart within a
 * month.
 *
 * The part that is not borrowed is `gaps`. It is a required prop, not an
 * optional one: a capability page with nothing in that field does not
 * compile, which is the only way a section like that survives contact with
 * someone writing marketing copy in a hurry.
 */

export type Step = { title: string; body: ReactNode; code?: string };

export type CapabilityPageProps = {
  kicker: string;
  /** Two parts, so the second can carry the accent. */
  title: [string, string];
  lede: string;
  challenge: ReactNode;
  steps: Step[];
  /** What this does not do. Required. */
  gaps: { title: string; body: ReactNode };
  /** Paths into lib/nav's PRODUCT group; the label and note are read from there. */
  related: string[];
};

const BY_HREF = new Map(
  PRODUCT.sections.flatMap((s) => s.items).map((item) => [item.href, item]),
);

export function CapabilityPage({
  kicker,
  title,
  lede,
  challenge,
  steps,
  gaps,
  related,
}: CapabilityPageProps) {
  return (
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section">
          <div className="mk-wrap mk-narrow">
            <p className="mk-kicker">{kicker}</p>
            <h1 className="mk-h1" style={{ marginTop: 14 }}>
              {title[0]} <em>{title[1]}</em>
            </h1>
            <p className="mk-lede" style={{ marginTop: 20 }}>
              {lede}
            </p>
          </div>
        </section>

        <section className="mk-section-tight mk-reveal">
          <div className="mk-wrap">
            <div className="cap-challenge">
              <p className="mk-label">The problem</p>
              <div className="mk-body">{challenge}</div>
            </div>
          </div>
        </section>

        <section className="mk-section mk-band mk-reveal">
          <div className="mk-wrap">
            <ol className="cap-steps mk-stagger">
              {steps.map((step, i) => (
                <li key={step.title}>
                  {/* Numbered because these are a sequence, not a feature
                      grid — each step assumes the one above it happened. */}
                  <span className="cap-step-n">{String(i + 1).padStart(2, "0")}</span>
                  <div className="cap-step-body">
                    <h2>{step.title}</h2>
                    <div className="mk-body">{step.body}</div>
                    {step.code && <code className="cap-step-code">{step.code}</code>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mk-section mk-reveal">
          <div className="mk-wrap">
            <div className="mk-honest">
              <div>
                <h2 className="mk-h3">{gaps.title}</h2>
                <div className="mk-body">{gaps.body}</div>
              </div>
              <Link href="/coverage" className="mk-btn mk-btn-outline">
                Every gap, scored
              </Link>
            </div>

            <div className="cap-related mk-stagger">
              {related.map((href) => {
                const item = BY_HREF.get(href);
                if (!item) return null;
                return (
                  <Link key={href} href={href} className="cap-related-item">
                    <b>{item.label}</b>
                    <span>{item.note}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
