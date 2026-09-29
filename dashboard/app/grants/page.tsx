import type { Metadata } from "next";

import { CapabilityPage } from "@/components/marketing/capability";
import { publicPageMetadata } from "@/lib/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Capability grants",
  description:
    "What an agent may do, declared up front and checked on every call — so a model that has been talked into something still cannot do it.",
  path: "/grants",
});

export default function Page() {
  return (
    <CapabilityPage
      kicker="Capability grants"
      title={["Your agent can be fooled.", "Its grants cannot"]}
      lede="Detection is a probability. A grant is a fact about the call."
      challenge={
        <p>
          Every text-based guard has the same ceiling: it is trying to decide whether a
          string is an attack, and attackers get a fresh attempt every request. A
          capability check asks a different question — was this agent ever allowed to do
          this? — and the answer does not change because the prose was persuasive.
        </p>
      }
      steps={[
        {
          title: "Declare what each tool actually does",
          body: (
            <p>
              A tool is <code>read</code>, <code>write</code>, <code>high_impact</code>{" "}
              or <code>irreversible</code>. That is the floor for what a call can be
              reasoned about as — and for a shell tool it really is only the floor,
              because <code>ls</code> and <code>rm -rf</code> are the same tool.
            </p>
          ),
          code: "agentfox tools declare",
        },
        {
          title: "Grant the capability, with its limits",
          body: (
            <p>
              A grant carries constraints — a value ceiling, an environment, a maximum
              taint for the data that may reach it. Anything not granted is refused;
              that is the default, not a rule somebody has to remember to write.
            </p>
          ),
        },
        {
          title: "Track where each argument came from",
          body: (
            <p>
              Arguments are tainted by origin: something the operator typed, something a
              document said, something a tool returned. A transfer whose amount came out
              of a retrieved page is a different call from one the user asked for, and
              the record says which it was.
            </p>
          ),
        },
        {
          title: "Untrusted content may fill a value, never choose an action",
          body: (
            <p>
              This is the line the whole model rests on. A retrieved document can supply
              an account number that then gets checked; it cannot decide that a transfer
              is the next step. Control flow belongs to the operator&rsquo;s intent, and
              data belongs to the data.
            </p>
          ),
        },
        {
          title: "Read the chain, not only the step",
          body: (
            <p>
              Two harmless calls can compose into a privilege escalation, and a
              destructive action is often reached rather than requested. Cascades,
              blast radius and loops are evaluated across the run, so an outcome nobody
              asked for in one step is still caught.
            </p>
          ),
        },
      ]}
      gaps={{
        title: "What grants do not do",
        body: (
          <p>
            A grant is only as good as the declaration behind it, and the impact we infer
            for an undeclared tool is a guess we label as one. We also cannot bound what
            a tool does on the other side of its own API: if a tool you declared as a
            read deletes something, containment believed you.
          </p>
        ),
      }}
      related={["/runtime", "/discovery", "/control-points"]}
    />
  );
}
