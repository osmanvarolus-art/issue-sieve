// Sorting logic, shared by index.html and bench/bench.mjs so the benchmark measures the code the page runs.

export const LEARNED = ["real", "info", "slop"];
export const SEEDS = {
  real: [
    "Crash when opening a project with a custom shader on Vulkan. Steps to reproduce attached, minimal project included.",
    "Regression since 4.3: export fails with error 'invalid path' after upgrading. Worked in 4.2.",
    "Fix null pointer dereference in AudioServer when the output device disconnects",
    "Memory leak in TileMap when changing scenes repeatedly, grows 50 MB per minute",
    "Add support for HDR output on Windows with a project setting and docs",
    "Speed up typed array construction by caching the element type, benchmark shows 2x",
    "Remove dead code in the parser and simplify error handling",
    "Wrong result from Vector3.slerp when vectors are opposite, test case included",
  ],
  info: [
    "it doesnt work", "Help!! error", "bug", "Can't build", "app crashes",
    "something is wrong with the editor please fix", "not working after update", "question",
  ],
  slop: [
    "Update README.md", "Fixed typo", "Added my name to the contributors list", "Update index.html",
    "Improved the code", "Refactored the code to follow best practices and improve readability",
    "Enhanced the project with comprehensive improvements", "Added comments to every function",
    "This PR improves overall code quality, maintainability and performance.", "Create main.py",
  ],
};
export const UNSURE_BELOW = 0.45, DUPE_ABOVE = 0.93, TEMP = 20, OWN_ONLY_AFTER = 3;
export const SHORTLIST = 25, SAME_AUTHOR_DUPE = 0.99, MAYBE_DUPE = 0.85;

export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const mean = (vs) => { const m = new Array(vs[0].length).fill(0); for (const v of vs) for (let i = 0; i < m.length; i++) m[i] += v[i]; const n = Math.hypot(...m); return m.map((x) => x / n); };

// Template parts that say nothing about the problem: versions, system info, logs. Two issues from the
// same person share all of it, which made different bugs look like duplicates.
const SKIP_SECTION = /version|system|environment|hardware|\bos\b|platform|device|reproduction project|logs?\b|screenshots?|checklist|prerequisites|extensions? disabled/i;
const KEY_VALUE = /^\W*[\w .()/-]{0,30}\b(version|os|browser|device|platform|commit|date|electron|chromium|node\.?js|v8|gpu|cpu|ram|memory|driver|renderer|backend|model|build)\b[^:\n]{0,30}:/i;

export function cleanBody(body, boilerplate = new Set()) {
  const out = [];
  let skip = false;
  for (const line of (body || "").replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    const h = line.match(/^\s*#{1,6}\s*(.*)$/) || line.match(/^\s*\*\*([^*]{2,60})\*\*:?\s*$/);
    if (h) { skip = SKIP_SECTION.test(h[1]); continue; }
    const t = line.trim();
    if (skip || !t || KEY_VALUE.test(t) || boilerplate.has(norm(t)) || /^[-*] \[[ x]\]/i.test(t)) continue;
    out.push(t);
  }
  return out.join("\n").trim();
}
const norm = (t) => t.toLowerCase().replace(/\s+/g, " ");

// Lines that recur across many bodies of one repo are its issue template.
export function boilerplate(bodies) {
  const n = new Map();
  for (const b of bodies) for (const l of new Set((b || "").split("\n").map((x) => norm(x.trim())).filter((x) => x.length > 3))) n.set(l, (n.get(l) || 0) + 1);
  const min = Math.max(3, bodies.length * 0.05);
  return new Set([...n].filter(([, c]) => c >= min).map(([l]) => l));
}

export const embedText = (title, body) => `${title}\n${body.slice(0, 400)}`;

export function prototypes(seedVecs, userEx = {}) {
  // Built-in seeds only bootstrap a class; after a few corrections the user's own examples know the repo better.
  return LEARNED.map((k) => {
    const ex = userEx[k] || [];
    return mean(ex.length >= OWN_ONLY_AFTER ? ex : [...seedVecs[k], ...ex]);
  });
}

// An empty template matches every other empty template, and one author's series of reports shares wording;
// for the same author only a near-identical double post counts.
export function isDupe(a, b, above = DUPE_ABOVE) {
  if (a.isPR || b.isPR || a.bodyLen < 40 || b.bodyLen < 40) return false;
  const s = dot(a.v, b.v);
  return s > (a.author && a.author === b.author ? SAME_AUTHOR_DUPE : above) && s;
}

export function decide(item, protos) {
  const s = protos.map((p) => dot(item.v, p) * TEMP);
  const mx = Math.max(...s), e = s.map((x) => Math.exp(x - mx)), z = e.reduce((a, b) => a + b);
  const p = e.map((x) => x / z);
  // A thin body cannot be acted on: an issue needs details, a PR needs a reason.
  if (item.bodyLen < 40) { p[item.isPR ? 2 : 1] += 0.25; const t = p.reduce((a, b) => a + b); p.forEach((_, i) => (p[i] /= t)); }
  const best = p.indexOf(Math.max(...p));
  return { cls: LEARNED[best], conf: p[best] };
}

// Order inside "Worth a look": what people already care about (reactions + comments). The sieve cannot rank importance itself.
export const priority = (it) => (it.reactions || 0) + (it.comments || 0) + it.conf;

async function gh(url, token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) {
    throw new Error(r.status === 403 || r.status === 429 ? "GitHub rate limit reached (60 requests/hour without a token). Add a token or wait."
      : r.status === 404 ? `Repo not found or private: ${url.split("/repos/")[1]?.split("/").slice(0, 2).join("/")}.` : `GitHub answered ${r.status}.`);
  }
  return r.json();
}

export async function fetchIssues(repo, token, pages = 3) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const batch = await gh(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`, token);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}
