import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/site";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/nav";
import {
  Pillars,
  Guardrails,
  Containment,
  Discovery,
  Assurance,
} from "@/components/marketing/pillars";
import { Evidence, HowItWorks, FAQ, CTA, Footer } from "@/components/marketing/sections";

export const dynamic = "force-dynamic";

// layout.tsx appends " | AgentFox", so the name is not repeated here. The previous
// description ran to 244 characters and was cut mid-clause in every search result
// and every unfurl; this one says the same six things inside the ~160 that get shown.
export const metadata: Metadata = publicPageMetadata({
  title: "What AgentFox does, on real screens",
  description:
    "The six pillars of the control plane, each with the screen that runs it: guardrails, capability grants, agent discovery, evals, the audit chain and compliance.",
  path: "/product",
});

/**
 * The long version.
 *
 * These sections used to be the homepage, which measured 4,932 words and 36
 * viewports. That is a reference page, and a reference page in the homepage slot
 * loses the reader who only wanted to know what this is. The material was not the
 * problem; the slot was. It lives here, one click from six cards on the homepage
 * and from the nav, and the homepage keeps the job of getting someone to the
 * playground or the repository.
 */
export default function Product() {
  return (
    <div className="mk">
      <MarketingNav />
      <main>
        <section className="mk-section" style={{ paddingBottom: 0 }}>
          <div className="mk-wrap">
            <h1 className="mk-h1 mk-up" style={{ maxWidth: "17ch" }}>
              Every layer, on a <em>real screen</em>
            </h1>
            <p className="mk-lede mk-up mk-d1" style={{ marginTop: 18, maxWidth: "52ch" }}>
              Six areas, each shown with the part of the product that does the work.{" "}
              <Link href="/playground">The playground</Link> needs no account.
            </p>
          </div>
        </section>
        <Pillars />
        <Guardrails />
        <Containment />
        <Discovery />
        <Assurance />
        <Evidence />
        <HowItWorks />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
