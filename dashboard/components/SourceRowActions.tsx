"use client";

import { useEffect, useRef, useState } from "react";
import { TIER_OPTIONS, FRESHNESS_OPTIONS, inputStyle } from "@/lib/sourceOptions";
import { DatabaseFields, ApiFields } from "./ConnectionFields";

type Panel = "menu" | "edit" | "connect" | null;
type ConnectionType = "database" | "api";

/**
 * Replaces the old actions cell — a bare native `<details>/<summary>` for Edit
 * (which renders unstyled and forces the table row to grow in place) plus two
 * more buttons crammed into the same cell, wrapping unpredictably at narrow
 * widths. This is one "⋯" trigger; its popover swaps between a short menu, an
 * edit form, and a connect form, so the row itself never changes height.
 */
export function SourceRowActions({ source }: { source: any }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [connectionType, setConnectionType] = useState<ConnectionType>("database");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPanel(null);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [panel]);

  const connected = !!source.connection_kind;

  return (
    <div className="row-menu" ref={ref}>
      <button
        type="button"
        className="row-menu-trigger"
        aria-label={`Actions for ${source.key}`}
        aria-expanded={panel !== null}
        onClick={() => setPanel((p) => (p ? null : "menu"))}
      >
        ⋯
      </button>

      {panel === "menu" && (
        <div className="row-menu-popover" role="menu">
          <button type="button" className="row-menu-item" onClick={() => setPanel("edit")}>
            Edit details
          </button>
          <button type="button" className="row-menu-item" onClick={() => setPanel("connect")}>
            {connected ? "Reconnect" : "Connect a database or API"}
          </button>
          <form action="/api/sources/validate" method="POST">
            <input type="hidden" name="key" value={source.key} />
            <button type="submit" className="row-menu-item">
              Validate now
            </button>
          </form>
          <div className="row-menu-divider" />
          {!source.deprecated ? (
            <form action="/api/sources/deprecate" method="POST">
              <input type="hidden" name="key" value={source.key} />
              <button type="submit" className="row-menu-item bad">
                Deprecate
              </button>
            </form>
          ) : (
            <form action="/api/sources/delete" method="POST">
              <input type="hidden" name="key" value={source.key} />
              <button
                type="submit"
                className="row-menu-item bad"
                title="Permanently removes the record. Unlike deprecating, this drops the 'do not trust' signal — an answer grounded in it afterward looks unverified, not flagged"
              >
                Delete permanently
              </button>
            </form>
          )}
        </div>
      )}

      {panel === "edit" && (
        <div className="row-menu-popover row-menu-form">
          <div className="row-menu-form-title">Edit {source.key}</div>
          <form action="/api/sources" method="POST" className="stack">
            <input type="hidden" name="key" value={source.key} />
            <label className="small muted" style={{ display: "block" }}>
              Tier
              <select name="tier" defaultValue={source.tier} style={inputStyle}>
                {TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="small muted" style={{ display: "block" }}>
              Owner (email)
              <input type="email" name="owner" defaultValue={source.owner || ""} style={inputStyle} />
            </label>
            <label className="small muted" style={{ display: "block" }}>
              Domain / corpus
              <input type="text" name="domain" defaultValue={source.domain || ""} style={inputStyle} />
            </label>
            <label className="small muted" style={{ display: "block" }}>
              Freshness SLA
              <select
                name="freshness_sla_hours"
                defaultValue={source.freshness_sla_hours ? String(source.freshness_sla_hours) : ""}
                style={inputStyle}
              >
                {FRESHNESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {source.deprecated && (
              <label className="small muted" style={{ display: "block" }}>
                Status
                <select name="deprecated" defaultValue="true" style={inputStyle}>
                  <option value="true">Stay deprecated</option>
                  <option value="false">Un-deprecate — bring back into rotation</option>
                </select>
              </label>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn-primary" style={{ fontSize: "var(--t-micro)" }}>
                Save
              </button>
              <button type="button" className="btn-cancel" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {panel === "connect" && (
        <div className="row-menu-popover row-menu-form">
          <div className="row-menu-form-title">
            {connected ? "Reconnect" : "Connect"} {source.key}
          </div>
          <form action="/api/sources/connections" method="POST" className="stack">
            <input type="hidden" name="key" value={source.key} />
            <input type="hidden" name="kind" value={connectionType} />
            <div className="segmented" role="radiogroup" style={{ marginBottom: 2 }}>
              <button
                type="button"
                className={`segmented-option${connectionType === "database" ? " active" : ""}`}
                aria-pressed={connectionType === "database"}
                onClick={() => setConnectionType("database")}
              >
                Database
              </button>
              <button
                type="button"
                className={`segmented-option${connectionType === "api" ? " active" : ""}`}
                aria-pressed={connectionType === "api"}
                onClick={() => setConnectionType("api")}
              >
                API / knowledge base
              </button>
            </div>
            {connectionType === "database" ? <DatabaseFields /> : <ApiFields />}
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn-primary" style={{ fontSize: "var(--t-micro)" }}>
                Connect
              </button>
              <button type="button" className="btn-cancel" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
