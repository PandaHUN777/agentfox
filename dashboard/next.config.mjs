/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deliberately no `env` block: putting NOMETRIA_API_URL there would inline it at
  // build time, so one built image could never be pointed at a different control
  // plane. All pages are server-rendered, so lib/api.ts reads process.env at
  // request time instead — which is what makes the same container work in dev,
  // docker-compose and a customer's VPC without a rebuild.
  output: "standalone",
};
export default nextConfig;
