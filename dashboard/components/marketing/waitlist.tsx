/*
 * The hosted-cloud waitlist form.
 *
 * A plain HTML form POST with no client JavaScript, which is the pattern every
 * other write action in this app uses (see dashboard/app/api/guardrails/
 * feedback/route.ts and the review actions around it). It matters more here than
 * elsewhere: this is the one form on the public site, it is the first thing a
 * signed-out visitor is ever asked to do, and a form that needs a hydrated
 * client bundle to submit is a form that silently fails for anyone who arrives
 * before that bundle does.
 *
 * `return_to` carries the redirect target back through the proxy route, so a
 * submit lands on the pricing page with a notice rather than on a JSON body.
 *
 * The email goes to this project's own API and nowhere else: no third-party form
 * service, no analytics call, no mail provider. It is stored so the owner knows
 * who to tell when the hosted version opens, which is the only reason to ask.
 */

export function WaitlistForm({ returnTo = "/pricing#editions" }: { returnTo?: string }) {
  return (
    <form action="/api/waitlist" method="POST" className="wl">
      <label className="wl-sr" htmlFor="waitlist-email">
        Work email
      </label>
      <div className="wl-row">
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="wl-input"
        />
        <button type="submit" className="mk-btn mk-btn-primary wl-submit">
          Join
        </button>
      </div>
      <input type="hidden" name="return_to" value={returnTo} />
      <p className="wl-fine">
        We will email you once, when it opens. Nothing else, and no card today.
      </p>
    </form>
  );
}
