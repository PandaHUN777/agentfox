import Link from "next/link";
import { MarketingNav } from "@/components/marketing/nav";
import {
  Pillars,
  Guardrails,
  Containment,
  Discovery,
  Assurance,
  Evidence2,
} from "@/components/marketing/pillars";
import { Evidence, HowItWorks, FAQ, CTA, Footer } from "@/components/marketing/sections";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "What Nometria does: the six pillars, on real screens",
  description:
    "Every layer of the control plane, with the screen that shows it: guardrails on model traffic, tool calls bounded by capability grants, agent discovery, evals and red-teaming, the tamper-evident chain, and compliance computed from telemetry.",
};

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
          <div className="mk-wrap" style={{ textAlign: "center" }}>
            <span className="mk-eyebrow mk-up">The long version</span>
            <h1 className="mk-h1 mk-up mk-d1" style={{ margin: "18px auto 0", maxWidth: "17ch" }}>
              Every layer, on a <em>real screen</em>.
            </h1>
            <p className="mk-lede mk-up mk-d2" style={{ margin: "20px auto 0", maxWidth: "58ch" }}>
              Six pillars, each with the part of the product that does the work. The
              screenshots are captures of a running instance, not drawings of one.
            </p>
            <p className="mk-fine mk-up mk-d3" style={{ marginTop: 18 }}>
              Prefer to watch it happen? <Link href="/playground">The playground</Link> needs no
              account.
            </p>
          </div>
        </section>
        <Pillars />
        <Guardrails />
        <Containment />
        <Discovery />
        <Assurance />
        <Evidence2 />
        <Evidence />
        <HowItWorks />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
