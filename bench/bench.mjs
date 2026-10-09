// Before/after benchmark on live repos, using the page's own logic (../sieve.js).
// Usage: GITHUB_TOKEN=$(gh auth token) node bench.mjs owner/repo ...
// Truth = labels the maintainers already put on open items; the sieve never sees labels.
import { pipeline } from "@huggingface/transformers";
import * as S from "../sieve.js";
import { itemClass } from "./labels.js";

const token = process.env.GITHUB_TOKEN;
const embed = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "fp32" });
const vec = async (texts) => { const out = []; for (let i = 0; i < texts.length; i += 32) out.push(...(await embed(texts.slice(i, i + 32), { pooling: "cls", normalize: true })).tolist()); return out; };
const seedVecs = {}; for (const k of S.LEARNED) seedVecs[k] = await vec(S.SEEDS[k]);

function sieve(raw, vs, protos, newDupes) {
  const items = [];
  raw.forEach((r, j) => {
    const it = { n: r.number, title: r.title, isPR: !!r.pull_request, bodyLen: r._body.length, v: vs[j], truth: itemClass(r.labels), author: r.user.login, reactions: r.reactions?.total_count, comments: r.comments };
    if (newDupes) {
      for (const o of items) { const s = S.isDupe(it, o); if (s && s > (it.dupeSim || 0)) { it.dupeOf = o.n; it.dupeSim = s; } }
    } else if (!it.isPR) {
      let best = 0, bestN = null;
      for (const o of items) if (!o.isPR) { const s = S.dot(it.v, o.v); if (s > best) { best = s; bestN = o.n; } }
      if (best > 0.93) { it.dupeOf = bestN; it.dupeSim = best; }
    }
    Object.assign(it, S.decide(it, protos));
    it.col = it.dupeOf ? "dupe" : it.conf < S.UNSURE_BELOW ? "unsure" : it.cls;
    items.push(it);
  });
  return items;
}

function report(name, items) {
  const cols = {}; for (const it of items) cols[it.col] = (cols[it.col] || 0) + 1;
  const lab = items.filter((i) => i.truth && i.truth !== "slop");
  const right = lab.filter((i) => i.cls === i.truth).length;
  const sure = lab.filter((i) => i.col !== "unsure" && i.col !== "dupe");
  const sureRight = sure.filter((i) => i.cls === i.truth).length;
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "–");
  console.log(`  ${name.padEnd(28)} accuracy ${pct(right, lab.length).padStart(4)} of ${lab.length} labelled | placed ${pct(sure.length, lab.length).padStart(4)}, right ${pct(sureRight, sure.length).padStart(4)} | ` +
    ["real", "info", "slop", "dupe", "unsure"].map((k) => `${k} ${cols[k] || 0}`).join(" "));
  return items;
}

for (const repo of process.argv.slice(2)) {
  const raw = await S.fetchIssues(repo, token);
  const truth = {}; for (const r of raw) { const c = itemClass(r.labels); if (c) truth[c] = (truth[c] || 0) + 1; }
  console.log(`\n${repo}: ${raw.length} open, labelled ${JSON.stringify(truth)}`);

  const rawBodies = raw.map((r) => (r.body || "").replace(/<!--[\s\S]*?-->/g, "").trim());
  const bp = S.boilerplate(raw.map((r) => r.body || ""));
  const clean = raw.map((r) => S.cleanBody(r.body, bp));

  const vRaw = await vec(raw.map((r, j) => S.embedText(r.title, rawBodies[j])));
  const vClean = await vec(raw.map((r, j) => S.embedText(r.title, clean[j])));

  raw.forEach((r, j) => (r._body = rawBodies[j]));
  const before = report("before", sieve(raw, vRaw, S.prototypes(seedVecs), false));
  raw.forEach((r, j) => (r._body = clean[j]));
  const after = report("after", sieve(raw, vClean, S.prototypes(seedVecs), true));
  // Shortlist: are confirmed bugs pulled to the top of "Worth a look"?
  for (const [name, its, key] of [["before", before, (i) => i.conf], ["after", after, S.priority]]) {
    const col = its.filter((i) => i.col === "real").sort((a, b) => key(b) - key(a));
    const top = col.slice(0, S.SHORTLIST), share = (xs) => xs.filter((i) => i.truth === "real").length;
    console.log(`  top ${S.SHORTLIST} ${name}: ${share(top)} confirmed (column has ${share(col)} of ${col.length})`);
  }

  for (const [name, its] of [["before", before], ["after", after]]) {
    const d = its.filter((i) => i.dupeOf).map((i) => `#${i.n}≈#${i.dupeOf} ${(i.dupeSim * 100).toFixed(0)}%`);
    console.log(`  duplicates ${name}: ${d.join(", ") || "none"}`);
  }
  const hints = []; for (let a = 0; a < after.length; a++) for (let b = 0; b < a; b++) { const x = after[a], y = after[b]; const s = S.dot(x.v, y.v); if (!x.dupeOf && S.isDupe(x, y, S.MAYBE_DUPE) && s <= S.DUPE_ABOVE) hints.push(`#${x.n}~#${y.n} ${(s * 100).toFixed(0)}%`); }
  console.log(`  maybe-duplicate hints (${hints.length}): ${hints.slice(0, 12).join(", ")}`);
  const prs = (its) => ["real", "info", "slop", "unsure", "dupe"].map((k) => `${k} ${its.filter((i) => i.isPR && i.col === k).length}`).join(" ");
  console.log(`  PRs before: ${prs(before)}\n  PRs after:  ${prs(after)}`);
}
