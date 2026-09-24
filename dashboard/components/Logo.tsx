/**
 * The one piece of visual identity the shell had none of — a plain text wordmark
 * with no mark, no accent shape, nothing distinguishing it from an internal admin
 * tool. The glyph is a shield with a checked notch: governance as "watching and
 * clearing," not a lock (restriction) or an eye (surveillance) — the two marks
 * every other tool in the category already reaches for.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2.5 20.5 6v6c0 5.2-3.6 8.9-8.5 10.5C7.1 20.9 3.5 17.2 3.5 12V6L12 2.5Z"
        fill="var(--accent)"
      />
      <path
        d="M8.3 12.2 11 14.9l4.9-5.4"
        stroke="var(--panel)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark">
      <Logo size={size} />
      <span>AgentFox</span>
    </span>
  );
}
