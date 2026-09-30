import type { Metadata } from "next";

import { CapabilityPage } from "@/components/marketing/capability";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Find the agents before you govern them",
  description:
    "Static scanning, running-session detection, MCP snapshots and skill analysis — with an owner attached to each, because an agent nobody owns is a finding.",
  path: "/discovery",
});

const FINDS = [
  {
    what: "Agents",
    how: "agentfox check .",
    why: "Model clients and agent frameworks in committed code, with the file and line.",
  },
  {
    what: "What is running now",
    how: "agentfox quickscan .",
    why: "Local coding-assistant session state — the agent someone is using today that was never committed.",
  },
  {
    what: "MCP servers and tools",
    how: "agentfox scan mcp",
    why: "Recorded with a digest, which is the only thing that makes a later change detectable.",
  },
  {
    what: "Skills",
    how: "included in the repo scan",
    why: "Instructions the model will follow, read for planted directives and shell fences.",
  },
] as const;

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
      feature={{
        title: "Four kinds of thing, four ways of finding them",
        lede: "Each one is found differently, and each one is a different sort of blind spot when it is missing.",
        body: (
          <div className="find-grid mk-stagger">
            {FINDS.map((f) => (
              <div key={f.what} className="find">
                <b>{f.what}</b>
                <code>{f.how}</code>
                <p>{f.why}</p>
              </div>
            ))}
          </div>
        ) }}
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
        ) }}
      related={["/grants", "/mcp", "/hooks"]}
    />
  );
}
