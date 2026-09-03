"use client";

import { useState } from "react";
import Link from "next/link";
import { AgentLink, ControlChip, Severity, findingTypeInfo, ts } from "@/components/ui";
import { FindingEvidence } from "@/components/FindingEvidence";

/**
 * The list already carries the full evidence blob (same object the detail page
 * fetches separately) — expanding in place costs no extra request, just a state
 * toggle, so "scan twenty, look closely at one" doesn't force a page jump.
 */
export function ExpandableFindingRow({
  finding,
  agents,
  controlTitles,
}: {
  finding: any;
  agents: any[];
  controlTitles: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const typeInfo = findingTypeInfo(finding.type);

  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        style={{ cursor: "pointer" }}
        className={open ? "row-expanded" : undefined}
      >
        <td><Severity value={finding.severity} /></td>
        <td className="small">
          {finding.agent_slug ? (
            <AgentLink slug={finding.agent_slug} agents={agents} />
          ) : (
            <span className="muted">unattributed</span>
          )}
        </td>
        <td className="small">{typeInfo.label}</td>
        <td className="small wrap">
          <span className="row" style={{ gap: 6, alignItems: "baseline" }}>
            <span className="expand-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
            {finding.title}
          </span>
          {typeInfo.blurb && <div className="small muted">{typeInfo.blurb}</div>}
        </td>
        <td className="small" onClick={(e) => e.stopPropagation()}>
          {(finding.controls || []).map((c: string) => (
            <ControlChip key={c} code={c} titles={controlTitles} />
          ))}
        </td>
        <td className="small muted">{ts(finding.created_at)}</td>
      </tr>
      {open && (
        <tr className="row-expanded">
          <td colSpan={6} style={{ padding: "4px 14px 18px" }}>
            <FindingEvidence finding={finding} />
            <div style={{ marginTop: 10 }}>
              <Link href={`/findings/${finding.id}`} onClick={(e) => e.stopPropagation()}>
                Open full finding →
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
