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

## How it works

1. Each item's title and the first 400 characters of its body are embedded with [bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) through [transformers.js](https://github.com/huggingface/transformers.js), on WebGPU when available.
2. Each column is the average of its example vectors. An item goes to the nearest column. If the top probability is under 45%, it goes to **Unsure** instead.
3. A body under 40 characters pushes an issue toward **Needs info** and a PR toward **Low effort**.
4. An issue more than 93% similar to an earlier open issue goes to **Duplicate**, with a link to that issue.

## Run it

Open `index.html` from any static server (`python3 -m http.server`), or link straight to a repo with `?repo=owner/name`.
Without a token GitHub allows 60 requests per hour, and one run uses up to 3.
A token raises that limit. The token is only sent to api.github.com.

## Limits

- English-centric model. Only open items, and only the most recent 300.
- Duplicate detection compares open issues only. It misses duplicates of closed issues.
- The accuracy numbers come from one repo and one pair of classes. "Low effort" has no labelled benchmark yet.

MIT licence.
