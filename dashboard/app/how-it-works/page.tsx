import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/site";
import Link from "next/link";
import { CATEGORY, REPO } from "./_public";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/sections";
import { RequestPath } from "@/components/marketing/path";

/**
 * Public explainer for someone who has never seen this product, reached from the
 * landing page at "/" and from the public header on every signed-out page.
 *
 * Public because it is useless if it is behind the sign-in wall: it exists for the
 * reader who arrived at the root URL from a link and does not yet know what any of
 * this is. See middleware.ts (PUBLIC_PATHS) and layout.tsx (isChromelessPage).
 *
 * The request path below is the sequence in docs/hld.md §6, which is itself
 * verified against enforcement.py's preflight/evaluate/call_provider and the
 * gateway's chat_completions handler. It is compressed into plain language and
 * loses some ordering detail (budget caps, circuit breaker, attribution graph) on
 * purpose; it does not add anything that is not in that sequence. The six areas
 * are the six pillars in README.md. Numbers appear only where README.md or
 * app/benchmark/page.tsx already publishes them, and everything else links to
 * /benchmark rather than restating a figure.
 */

export const metadata: Metadata = publicPageMetadata({
  title: "How it works",
  description:
    "The path one call takes through the control plane, and what each of the six areas of the product is for.",
  path: "/how-it-works",
});

export default function HowItWorks() {
  return (
    /* The site's own nav and footer, and the hero the other public pages open with.
       This page kept a header of its own from before there was a marketing layer,
       which meant the one page explaining the product was also the one page that did
       not look like the product's site. The article underneath is unchanged. */
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section-tight">
          <div className="mk-wrap">
            <div style={{ maxWidth: 760 }}>
              <h1
                className="mk-h1"
                style={{ marginTop: 12, fontSize: "clamp(2.25rem, 4.4vw, var(--t-display))" }}
              >
                One call, all the way through</h1>
              <p className="mk-lede" style={{ marginTop: 18, maxWidth: "58ch" }}>
                AgentFox is a {CATEGORY}. It sits between your agent and everything it
                can act on.
              </p>
            </div>
          </div>
        </section>

      <div className="mk-wrap">
        <article className="bm-doc">

        <h2>The path one call takes</h2>
        <p>
          Three ways on: one line in Python, an HTTP call from any language, or the
          gateway. The sequence is the same for all three, and three of the eight
          steps can end a call before it reaches anything.
        </p>

        <RequestPath
          stations={[
            {
              title: "A call arrives",
              body: (
                <>
                  Which agent, and which end user it acts for. An agent quarantined by
                  the kill switch stops here and never reaches a model.
                </>
              ),
              stops: true,
            },
            {
              title: "Answerability",
              body: (
                <>
                  A question outside the agent&rsquo;s declared knowledge boundary gets
                  a templated refusal, and no model call is made.
                </>
              ),
              stops: true,
            },
            {
              title: "Retrieval is filtered for the person asking",
              body: <>Documents the end user is not entitled to see never reach the prompt.</>,
            },
            {
              title: "Every piece of text is tagged with where it came from",
              body: (
                <>
                  User, retrieved document, tool result, subagent, memory — and whether
                  that source is trusted. Step 6 reads the tag, which is why it still
                  works after step 5 has failed.
                </>
              ),
            },
            {
              title: "Detectors read the text",
              body: (
                <>
                  Each under a time budget, worst verdict carried forward. This is the
                  layer we trust least, and we{" "}
                  <Link href="/benchmark">publish how well it does</Link> — including
                  where a competing scanner is more precise than ours.
                </>
              ),
            },
            {
              title: "Before a tool runs, the action itself is checked",
              body: (
                <>
                  It reads no text. It asks whether the agent holds a grant for the
                  tool, whether argument values are inside the declared ceilings, where
                  those arguments came from, and whether the tool is irreversible. An
                  irreversible call built out of untrusted content is refused even when
                  nothing flagged the prompt.
                </>
              ),
              stops: true,
              keystone: true,
            },
            {
              title: "What comes back is checked too",
              body: (
                <>
                  An output pass checks the response for things like PII, and the answer
                  is bound to its sources.
                </>
              ),
            },
            {
              title: "Everything lands in a record you can verify",
              body: (
                <>
                  A trace of the whole path and an entry in a tamper-evident audit
                  chain, allowed or blocked, with an independent verifier.
                </>
              ),
            },
          ]}
        />

        <p>
          Steps 1 to 5 are what most products in this space also do. Step 6 is what the
          design rests on, because an attacker who keeps trying eventually gets past
          step 5. <Link href="/benchmark">The measurements for both are here &rarr;</Link>
        </p>

        <p>
          Those eight steps are the product&rsquo;s runtime. The six areas around
          them — discovery, access, guardrails, evaluation, audit and compliance —
          each have their own screens once you have signed in.{" "}
          <Link href="/product">What each area does &rarr;</Link>
        </p>

<h2 id="limits">What this does not do</h2>
        <ul>
          <li>
            It does not make your agent robust to attack. Detection loses to an
            attacker who is allowed to adapt, ours included, and we measure that against
            ourselves.
          </li>
          <li>
            It does not know anything you have not declared. An irreversible tool
            recorded as read-only is invisible to the check that would have stopped it.
          </li>
          <li>
            It does not grant or revoke access in your own systems. It bounds what an
            agent does with access you already gave it.
          </li>
          <li>
            It does not block anything you have not asked it to block. The policy that
            governs model traffic ships in observe mode: it records what it would have
            done and lets the call through.
          </li>
          <li>
            One exception is on from the first day. A tool that can move money, delete
            something or send an email will not accept an argument that came out of a web
            page, a retrieved document or another tool&rsquo;s output. Those calls stop
            for a human.
          </li>
        </ul>
        <ul>
          <li>
            <strong>Detection is the weakest layer.</strong> 66.7% recall on a held-out
            set, and an attacker who reads the verdict and retries gets 73% of what we do
            catch through. Published, not rounded.
          </li>
          <li>
            <strong>You declare the estate yourself.</strong> There is no Okta connector
            and no DataHub connector. Principals, grants and source tiers live in
            AgentFox. The seams exist; the integrations do not.
          </li>
          <li>
            <strong>Version 0.3, and the gaps are listed in the repository</strong> No single sign-on, one organisation, text
            only. The full list is in the README.
          </li>
        </ul>

        <div className="note-panel">
          <strong>What all of this rests on.</strong> Grants, impact tiers, ceilings and
          downstream triggers are declared by whoever operates the agent, and the checks
          above believe them. A tool recorded as read-only that is not read-only is not
          covered.{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            The source, the licence and the limits are all in the repository.
          </a>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
          <Link
            href="/playground"
            className="btn-primary"
            style={{ height: "auto", minHeight: 32, padding: "7px 16px", textDecoration: "none" }}
          >
            Try it, no account
          </Link>
          <Link
            href="/benchmark"
            className="btn-scan"
            style={{
              height: "auto",
              minHeight: 32,
              padding: "7px 16px",
              whiteSpace: "normal",
              textDecoration: "none",
            }}
          >
            The numbers, and where a competitor beats us
          </Link>
        </div>
        </article>
      </div>
      </main>
      <Footer />
    </div>
  );
}
