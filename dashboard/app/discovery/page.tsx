import type { Metadata } from "next";

import { CapabilityPage } from "@/components/marketing/capability";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Find the agents before you govern them",
  description:
    "Static scanning, running-session detection, MCP snapshots and skill analysis — with an owner attached to each, because an agent nobody owns is a finding.",
  path: "/discovery",
});

export default function Page() {
  return (
    <CapabilityPage
      kicker="Discovery and registry"
      title={["Find the agents", "before you govern them"]}
      lede="You cannot write a policy for something nobody has told you exists."
      challenge={
        <p>
          Agents arrive the way scripts always have: one engineer, one afternoon, one
          API key that still works six months later. By the time anyone asks what is
          running, the answer lives in four repositories and somebody&rsquo;s laptop.
        </p>
      }
      steps={[
        {
          title: "Read the code without running it",
          body: (
            <p>
              Point it at a repository and it reports every model client, tool call and
              agent framework it can find, with the file and line. Static analysis, so a
              scan costs nothing and cannot have side effects.
            </p>
          ),
          code: "agentfox check .",
        },
        {
          title: "Find what is actually running",
          body: (
            <p>
              Committed code is a poor proxy for live behaviour. Local coding-assistant
              session state is a second signal, and it catches the agent somebody is
              using today that was never committed anywhere.
            </p>
          ),
          code: "agentfox quickscan .",
        },
        {
          title: "Snapshot the tool servers",
          body: (
            <p>
              Every MCP server&rsquo;s tools are recorded with a digest, which is what
              makes a later change detectable. Hygiene problems in the descriptions are
              raised at the same time.
            </p>
          ),
          code: "agentfox scan mcp",
        },
        {
          title: "Read the skills, including the parts nobody proofreads",
          body: (
            <p>
              A skill file is instructions the model will follow. They are parsed for
              planted directives and shell fences — and frontmatter that will not parse
              is reported and kept, not silently discarded, because discarding it is how
              a poisoned skill scans clean.
            </p>
          ),
        },
        {
          title: "Attach an owner, or raise a finding",
          body: (
            <p>
              Every agent in the registry has a state — active, quarantined or killed —
              and an owner. An agent with no owner is a reportable finding rather than a
              row in a table, because the first question after an incident is who
              operates this.
            </p>
          ),
          code: "agentfox agents discover",
        },
      ]}
      gaps={{
        title: "What discovery does not do",
        body: (
          <p>
            It reads repositories and local session state. It does not sweep employee
            laptops through an EDR or MDM, so an agent on a machine nobody points it at
            stays invisible — that is a distribution gap, not a detection one. Static
            analysis also cannot see an agent assembled at runtime from configuration it
            has never been shown.
          </p>
        ),
      }}
      related={["/grants", "/mcp", "/hooks"]}
    />
  );
}
