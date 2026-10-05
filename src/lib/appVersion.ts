import packageJson from "../../package.json";

// Versione app mostrata in UI (T-0xx, pagina Supporto): commit corto + data
// del commit, calcolati a BUILD TIME (`next.config.ts`, `env`), non a ogni
// request — nessun accesso a `git`/`child_process` da codice server che
// gira nel runtime di produzione. `NEXT_PUBLIC_APP_COMMIT`/
// `NEXT_PUBLIC_APP_COMMIT_DATE` sono quindi già stringhe statiche inlineate
// dal bundler quando questo modulo viene importato (sia server che client).
export function getAppVersion(): string {
  const commitDate = process.env.NEXT_PUBLIC_APP_COMMIT_DATE;
  return `v${packageJson.version} - ${commitDate}`;
}
