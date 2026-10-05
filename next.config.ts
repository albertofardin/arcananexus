import type { NextConfig } from "next";
import { execSync } from "child_process";

// Versione app (T-0xx, pagina Supporto — `src/lib/appVersion.ts`): commit
// corto + data del commit, risolti UNA VOLTA a build time, mai a ogni
// request. Su Vercel preferisce le env var native del provider
// (`VERCEL_GIT_COMMIT_SHA`/`VERCEL_GIT_COMMIT_MESSAGE`... in realtà qui
// serve la DATA, non nella message — Vercel non espone una var nativa per
// la data del commit, solo lo SHA) — `execSync("git ...")` come fallback
// locale, in try/catch: build su un checkout senza `.git`
// (shallow clone/tarball) non deve mai far fallire la build.
function resolveCommitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

function resolveCommitDate(): string {
  try {
    return execSync('git log -1 --format=%cd --date=format:"%d/%m/%Y"')
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: false,
  experimental: {
    // Router cache lato client: tornare su una pagina dinamica vista da < 30s
    // è istantaneo. I flussi che salvano e poi navigano chiamano
    // `router.refresh()`, che svuota questa cache.
    staleTimes: { dynamic: 30 },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.ufs.sh",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_APP_COMMIT: resolveCommitSha(),
    NEXT_PUBLIC_APP_COMMIT_DATE: resolveCommitDate(),
  },
};

export default nextConfig;
