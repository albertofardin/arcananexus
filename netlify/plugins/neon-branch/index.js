const NEON_API = "https://console.neon.tech/api/v2";

async function neonFetch(path, { headers, ...init } = {}) {
  const res = await fetch(`${NEON_API}${path}`, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.message || body?.raw || res.statusText;
    throw new Error(`Neon API ${res.status} on ${path}: ${msg}`);
  }
  return body;
}

module.exports = {
  async onPreBuild({ netlifyConfig, utils }) {
    const {
      CONTEXT,
      REVIEW_ID,
      NEON_API_KEY,
      NEON_PROJECT_ID,
      NEON_PARENT_BRANCH_ID,
      NEON_DATABASE_NAME,
      NEON_ROLE_NAME,
    } = process.env;

    if (CONTEXT !== "deploy-preview") return;

    if (!REVIEW_ID) {
      return utils.build.failBuild(
        "REVIEW_ID is not set; cannot resolve a Neon branch for this preview."
      );
    }
    const required = {
      NEON_API_KEY,
      NEON_PROJECT_ID,
      NEON_PARENT_BRANCH_ID,
      NEON_DATABASE_NAME,
      NEON_ROLE_NAME,
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      return utils.build.failBuild(
        `Missing required env vars for Neon branching: ${missing.join(", ")}`
      );
    }

    const branchName = `pr-${REVIEW_ID}`;
    const headers = {
      Authorization: `Bearer ${NEON_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const list = await neonFetch(`/projects/${NEON_PROJECT_ID}/branches`, {
      headers,
    });
    let branch = list.branches?.find(b => b.name === branchName);

    if (!branch) {
      console.log(`[neon-branch] creating branch ${branchName}`);
      const created = await neonFetch(`/projects/${NEON_PROJECT_ID}/branches`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          branch: {
            name: branchName,
            parent_id: NEON_PARENT_BRANCH_ID,
          },
          endpoints: [{ type: "read_write" }],
        }),
      });
      branch = created.branch;
    } else {
      console.log(`[neon-branch] reusing branch ${branchName} (${branch.id})`);
    }

    const buildUri = pooled =>
      `/projects/${NEON_PROJECT_ID}/connection_uri?branch_id=${encodeURIComponent(
        branch.id
      )}&database_name=${encodeURIComponent(
        NEON_DATABASE_NAME
      )}&role_name=${encodeURIComponent(NEON_ROLE_NAME)}&pooled=${pooled}`;

    const [pooled, direct] = await Promise.all([
      neonFetch(buildUri(true), { headers }),
      neonFetch(buildUri(false), { headers }),
    ]);

    netlifyConfig.build.environment.DATABASE_URL = pooled.uri;
    netlifyConfig.build.environment.DIRECT_URL = direct.uri;
    process.env.DATABASE_URL = pooled.uri;
    process.env.DIRECT_URL = direct.uri;

    console.log(
      `[neon-branch] DATABASE_URL/DIRECT_URL injected for branch ${branch.id}`
    );
  },
};
