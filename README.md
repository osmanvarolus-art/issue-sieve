# Issue Sieve

Triage every open issue and PR of a GitHub repo in under a second, in your browser.

Type `owner/repo`, press **Sieve**. Up to 300 open items stream into five columns:
**Worth a look**, **Needs info**, **Low effort**, **Duplicate**, and **Unsure — you decide**.
Move a card to another column and the sieve learns from it: the whole board re-sorts in about 1 ms.

- No server, no account, no install. One HTML file.
- Your data stays in the browser. The only network calls go to GitHub's public API and, once, to download the model (about 33 MB, cached afterwards).
- It does not hide its doubt. When it is not sure, the item goes to **Unsure** instead of a confident wrong column.

## Measured

On an RTX 5070 Ti with WebGPU in Brave, 2026-10-09:

| repo | items | first pass | per decision | re-sort after a correction |
|---|---|---|---|---|
| godotengine/godot | 300 | 0.58 s | 1.9 ms | 0.8 ms |
| microsoft/vscode | 300 | 0.62 s | 2.1 ms | 1.0 ms |

Without WebGPU it falls back to WebAssembly on the CPU. In a headless CPU-only browser that was about 100-170 ms per item.

**Accuracy, honestly.** We tested "needs info" against "real bug" on 200 closed VS Code issues that the maintainers had labelled `info-needed` or `bug` + `verified`. Results are averaged over 20 random splits:

| corrections per class | accuracy |
|---|---|
| 0 (built-in examples only) | 49% |
| 3 | 70% |
| 5 | 76% |
| 10 | 80% |
| 20 | 82% |

Out of the box the sieve is a coin flip on VS Code. A few corrections make it useful. That is the design: the built-in examples only start you off, and after 3 corrections in a column the sieve uses your own examples for that column alone. Corrections are stored per repo in your browser (`localStorage`).

**Trained on a repo's own label history** (closed issues the maintainers labelled "needs info" against confirmed bugs, 150 per class, tested on the rest, 10 random splits):

| repo | accuracy | items it is confident about | accuracy on those |
|---|---|---|---|
| microsoft/vscode | 84% | 56% | 92% |
| kubernetes/kubernetes | 70% | 17% | 92% |
| flutter/flutter | 67% | 20% | 88% |
| microsoft/TypeScript | 69% | 22% | 85% |

More history barely helps: 20 examples per class are within 2-4 points of 150. Adding a trained decision layer and text signals (steps, version, code block, error text) did not move the ceiling either. Whether a maintainer asks for more information depends on context that the text alone does not carry, and labels are applied unevenly. Where the sieve is confident it is right about 9 times in 10. Everything else belongs in **Unsure**.

**Two models that must agree.** The small model plus a larger hosted decision model (Jev, about 0.3 s per item). An item is decided only when both models give the same answer. Otherwise it goes to a human. Measured on 200 held-out labelled issues per repo, 150 history examples per class:

| repo | small model alone: decided / right | both agree: decided / right | larger model alone |
|---|---|---|---|
| microsoft/vscode | 56% / 92% | 82% / 90% | 80% |
| kubernetes/kubernetes | 17% / 92% | 63% / 85% | 72% |
| flutter/flutter | 20% / 88% | 62% / 86% | 82% |
| microsoft/TypeScript | 22% / 85% | 72% / 87% | 78% |

The agreement rule has no tuned threshold. It lets the sieve settle two to three times more items on its own at roughly the same accuracy. This needs a server holding an API key, so it is not in the browser page. It is the plan for a GitHub App version.

## How it works

1. Template parts that say nothing about the problem (versions, system info, logs, checklists, lines repeated across many of the repo's issues) are stripped from each body.
2. The title and the first 400 characters of what is left are embedded with [bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) through [transformers.js](https://github.com/huggingface/transformers.js), on WebGPU when available.
3. Each column is the average of its example vectors. An item goes to the nearest column. If the top probability is under 45%, it goes to **Unsure** instead.
4. A body under 40 characters pushes an issue toward **Needs info** and a PR toward **Low effort**.
5. An issue more than 93% similar to an earlier open issue goes to **Duplicate**. Two issues by the same author need 99% (a double post). Empty bodies are never matched. Between 85% and 93% the card only says "maybe same as #N".
6. **Worth a look** shows 25 items first, ordered by reactions + comments. The sieve does not judge importance itself; that order is what people already care about.

## Measured on live repos (2026-10-09)

`bench/bench.mjs` runs `sieve.js`, the same code as the page, on the 300 newest open items. Truth is the labels maintainers already put on them; the sieve never sees labels.

| repo | accuracy before → after | false duplicates before → after |
|---|---|---|
| godotengine/godot | 78% → 78% (45 labelled) | 1 → 0 |
| microsoft/vscode | 77% → 77% (13 labelled) | 1 → 0 (a real double post is still found) |
| facebook/react | no matching labels | 13 → 0 (empty bug templates, now in Needs info) |
| flutter/flutter | 67% → 74% (43 labelled) | 0 → 0 |

`bench/dupes.mjs` checks 91 Godot issues the maintainers closed as duplicates against the issue they pointed to. Real duplicates are less alike than one would think: median similarity 0.80. At 93% the sieve finds 2 of 91, at 85% 16 of 91. So the **Duplicate** column catches double posts and near copies, and "maybe same as" is a hint worth a click, not a verdict.

Tried and dropped: learning from a repo's closed, labelled issues at start-up. On live open items it lowered accuracy (vscode 77% → 38%, flutter 67% → 47%) and moved 68 normal Godot PRs into Low effort.

Run it yourself: `cd bench && npm install --ignore-scripts && GITHUB_TOKEN=$(gh auth token) node bench.mjs godotengine/godot`.

## Run it

Open `index.html` from any static server (`python3 -m http.server`), or link straight to a repo with `?repo=owner/name`.
Without a token GitHub allows 60 requests per hour, and one run uses up to 3.
A token raises that limit. The token is only sent to api.github.com.

## Limits

- English-centric model. Only open items, and only the most recent 300.
- Duplicate detection compares open issues only. It misses duplicates of closed issues, and it finds only a small share of real duplicates (see above).
- The accuracy numbers come from one repo and one pair of classes. "Low effort" has no labelled benchmark yet.

MIT licence.
