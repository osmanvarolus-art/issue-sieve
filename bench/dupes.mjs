// Recall check for duplicates: Godot issues the maintainers closed as duplicates, paired with the issue
// a comment points to. Usage: GITHUB_TOKEN=$(gh auth token) node dupes.mjs   (caches to dupes.json)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pipeline } from "@huggingface/transformers";
import * as S from "../sieve.js";

const repo = "godotengine/godot", file = new URL("./dupes.json", import.meta.url);
const gh = async (path) => { const r = await fetch(`https://api.github.com/${path}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }); if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json(); };
const pick = (r) => ({ n: r.number, title: r.title, body: r.body || "", author: r.user.login });

let pairs;
if (existsSync(file)) pairs = JSON.parse(readFileSync(file));
else {
  pairs = [];
  const found = await gh(`search/issues?q=${encodeURIComponent(`repo:${repo} is:issue reason:duplicate`)}&per_page=100`);
  for (const d of found.items) {
    const cs = await gh(`repos/${repo}/issues/${d.number}/comments?per_page=30`);
    const ref = cs.map((c) => c.body.match(/(?:godotengine\/godot\/issues\/|(?:^|[\s(])#)(\d{4,6})/)).find(Boolean);
    if (!ref || +ref[1] === d.number) continue;
    try { pairs.push({ dup: pick(d), orig: pick(await gh(`repos/${repo}/issues/${ref[1]}`)) }); } catch { /* deleted or a PR */ }
  }
  writeFileSync(file, JSON.stringify(pairs));
}

const embed = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "fp32" });
const vec = async (t) => (await embed(t, { pooling: "cls", normalize: true })).tolist();
const bp = S.boilerplate(pairs.flatMap((p) => [p.dup.body, p.orig.body]));
const raw = (b) => b.replace(/<!--[\s\S]*?-->/g, "").trim();

for (const [name, txt] of [["raw", raw], ["clean", (b) => S.cleanBody(b, bp)]]) {
  const prep = (x) => ({ ...x, text: txt(x.body), v: null });
  const ps = pairs.map((p) => ({ dup: prep(p.dup), orig: prep(p.orig) }));
  const all = ps.flatMap((p) => [p.dup, p.orig]);
  const vs = await vec(all.map((x) => S.embedText(x.title, x.text)));
  all.forEach((x, i) => { x.v = vs[i]; x.bodyLen = x.text.length; });
  const sims = ps.map((p) => S.dot(p.dup.v, p.orig.v)).sort((a, b) => a - b);
  const line = [0.85, 0.88, 0.9, 0.93].map((t) => {
    const rule = (a, b) => (name === "clean" ? S.isDupe(a, b, t) : S.dot(a.v, b.v) > t);
    const hit = ps.filter((p) => rule(p.dup, p.orig)).length;
    // False alarm: a dup matched to some other pair's issue.
    let fa = 0; for (const p of ps) for (const q of ps) if (p !== q && rule(p.dup, q.orig) && q.orig.n !== p.orig.n) fa++;
    return `>${t}: found ${hit}/${ps.length}, false ${fa}`;
  });
  console.log(`${name.padEnd(5)} median sim ${sims[sims.length >> 1].toFixed(2)} | ${line.join(" | ")}`);
}
