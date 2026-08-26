/** Shared between the Sources page (server) and its add-flow form (client). */

export const TIER_TONE: Record<string, string> = {
  system_of_record: "ok",
  approved: "",
  unverified: "warn",
  external: "bad",
};

export const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "system_of_record", label: "Official company data, kept up to date" },
  { value: "approved", label: "Reviewed and approved, but not the master copy" },
  { value: "unverified", label: "Reference material — may be outdated" },
  { value: "external", label: "Someone's personal notes, or an outside source" },
];

export const FRESHNESS_OPTIONS: { value: string; label: string }[] = [
  { value: "24", label: "Daily" },
  { value: "168", label: "Weekly" },
  { value: "720", label: "Monthly" },
  { value: "", label: "Rarely / no schedule" },
];

export const inputStyle = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
} as const;
