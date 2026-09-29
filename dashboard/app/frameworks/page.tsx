import type { Metadata } from "next";

import { CapabilityPage } from "@/components/marketing/capability";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Compliance",
  description:
    "43 controls across seven frameworks — EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP LLM and Agentic, MITRE ATLAS — computed from telemetry rather than attested in a spreadsheet.",
  path: "/frameworks",
});

export default function Page() {
  return (
    <CapabilityPage
      kicker="Compliance"
      title={["Mapped to the decisions,", "not to a spreadsheet"]}
      lede="43 controls across seven frameworks, computed from what actually ran."
      challenge={
        <p>
          Compliance for AI systems is usually a document describing controls somebody
          believes are in place. The gap between that document and the running system is
          invisible until an incident, and then it is the only thing anyone reads.
        </p>
      }
      steps={[
        {
          title: "Seven frameworks, one control set",
          body: (
            <p>
              EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP LLM Top 10, OWASP Agentic
              and MITRE ATLAS. 43 controls, each mapped to the others, so a control
              satisfied for one framework is not re-evidenced by hand for the next.
            </p>
          ),
        },
        {
          title: "Status computed, not asserted",
          body: (
            <p>
              A control&rsquo;s standing comes from telemetry — did the rule exist, did
              it fire, was the detector degraded, is the chain intact. Nobody ticks a box,
              which also means nobody can tick a box.
            </p>
          ),
          code: "agentfox compliance status",
        },
        {
          title: "A pack for high-risk systems",
          body: (
            <p>
              The EU AI Act pack is policy, not prose: human oversight under Article 14,
              logging under Article 12 and the rest expressed as rules that fire on real
              traffic and land in the same record as everything else.
            </p>
          ),
        },
        {
          title: "Export it and let someone else check",
          body: (
            <p>
              Compliance output is an evidence package like any other — verifiable with a
              script that does not import our code. A framework mapping nobody can check
              independently is a mapping nobody should accept.
            </p>
          ),
          code: "agentfox evidence export",
        },
      ]}
      gaps={{
        title: "What this is not",
        body: (
          <p>
            It is not a certification, and nothing here has been reviewed by an auditor,
            a notified body or a regulator. A mapping is our reading of a framework, and
            a reading can be wrong. Treat it as a head start on the evidence an assessor
            will ask for, not as the assessment.
          </p>
        ),
      }}
      related={["/evidence", "/runtime", "/product"]}
    />
  );
}
