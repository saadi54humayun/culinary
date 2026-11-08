// Programmatic Vercel config: the API project has its own deployment URL.
// Set CULINARY_BACKEND_ORIGIN in the FRONTEND Vercel project's Environment Variables.
// Keep browser API calls relative (/api/...) so session cookies remain same-origin.
const rawOrigin = process.env.CULINARY_BACKEND_ORIGIN;
let backendOrigin;
try {
  const parsed = new URL(rawOrigin || "");
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("URL must be an HTTPS origin without paths or credentials");
  }
  backendOrigin = parsed.origin;
} catch {
  throw new Error("Set CULINARY_BACKEND_ORIGIN to the backend HTTPS origin, for example https://culinary-api.vercel.app");
}

export const config = {
  framework: "vite",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  rewrites: [
    { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
    // Client-side routing for React Router. Vercel serves real static assets first.
    { source: "/:path*", destination: "/index.html" }
  ],
  headers: [
    { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "no-cache" }] }
  ]
};
