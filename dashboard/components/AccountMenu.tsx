/**
 * Was a bare "Sign out" text link — no avatar, name, email, or workspace shown
 * anywhere, in a product that is clearly multi-user. `<details>` gives a real
 * dropdown with zero client JS, consistent with the rest of this shell.
 */
export function AccountMenu({
  email,
  workspace,
  role,
}: {
  email: string;
  workspace?: string | null;
  role?: string;
}) {
  const initial = (email || "?").trim()[0]?.toUpperCase() || "?";
  return (
    <details className="account-menu">
      <summary>
        <span className="avatar">{initial}</span>
        <span className="account-summary">
          <span className="account-email">{email}</span>
          {workspace && <span className="account-workspace">{workspace}</span>}
        </span>
      </summary>
      <div className="account-menu-body">
        <div className="account-menu-row">
          <span className="muted small">Signed in as</span>
          <span className="small mono">{email}</span>
        </div>
        {workspace && (
          <div className="account-menu-row">
            <span className="muted small">Workspace</span>
            <span className="small mono">{workspace}</span>
          </div>
        )}
        {role && (
          <div className="account-menu-row">
            <span className="muted small">Role</span>
            <span className="small">{role}</span>
          </div>
        )}
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="account-menu-signout">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
