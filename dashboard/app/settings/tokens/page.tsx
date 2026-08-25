import { TokenManager } from "@/components/TokenManager";

export const dynamic = "force-dynamic";

export default function TokensPage() {
  return (
    <>
      <h1>API tokens</h1>
      <p className="sub">
        For the CLI and SDK — a token acts as you, scoped to your workspace. Set it as{" "}
        <code className="mono">NOMETRIA_API_TOKEN</code> or pass it as a bearer token to
        the gateway directly.
      </p>
      <TokenManager />
    </>
  );
}
