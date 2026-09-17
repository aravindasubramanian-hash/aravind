/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @moss-dev/moss-core ships a native (non-JS) addon. Bundling it through
  // Turbopack/webpack fails ("non-ecmascript placeable asset"), so it's kept
  // external and resolved by Node at runtime instead — standard practice for
  // native addons in Next.js server code.
  serverExternalPackages: ["@moss-dev/moss", "@moss-dev/moss-core"],
};

export default nextConfig;
