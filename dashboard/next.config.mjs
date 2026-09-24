/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deliberately no `env` block: putting NOMETRIA_API_URL there would inline it at
  // build time, so one built image could never be pointed at a different control
  // plane. All pages are server-rendered, so lib/api.ts reads process.env at
  // request time instead — which is what makes the same container work in dev,
  // docker-compose and a customer's VPC without a rebuild.
  output: "standalone",
  // A dev server and a production build in the same working tree otherwise share
  // one `.next`, and whichever writes second leaves the other serving a directory
  // whose manifests have just been deleted — the symptom is a live page suddenly
  // 500ing with ENOENT on `routes-manifest.json`, or rendering completely
  // unstyled. `NEXT_DIST_DIR=.next-dev npm run dev` keeps them apart. Unset, this
  // is exactly the previous behaviour, so CI and Vercel are unaffected.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
