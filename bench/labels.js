// Maps a maintainer's label to a column; the benchmark's ground truth, never shown to the sieve.
export function labelClass(name) {
  const l = name.toLowerCase();
  if (/(needs?|more|repro)[\s:_-]*(more[\s_-]*)?(info|information|repro)|info[\s_-]*needed|repro[\s_-]*steps[\s_-]*needed|waiting for (response|author|info)/.test(l)) return "info";
  if (/needed|pending|requested|found|un(confirmed|verified)/.test(l)) return null;
  if (/^\W*(confirmed|verified)$|regression|has reproducible steps/.test(l)) return "real";
  if (/^\W*(spam|invalid)$|resolution: invalid|^r: invalid/.test(l)) return "slop";
  return null;
}
export const itemClass = (labels) => {
  const c = new Set(labels.map((l) => labelClass(l.name || l)).filter(Boolean));
  return c.size === 1 ? [...c][0] : null;
};
