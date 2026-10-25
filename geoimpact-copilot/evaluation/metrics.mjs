/** Wilson score interval for a binomial proportion (95% by default). */
export function wilson(successes, total, z = 1.96) {
  if (total === 0) return { rate: null, low: null, high: null, n: 0 };
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  const round = (value) => Math.round(value * 10000) / 10000;
  return { rate: round(p), low: round(Math.max(0, centre - half)), high: round(Math.min(1, centre + half)), successes, n: total };
}

export function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  const round = (value) => Math.round(value * 100) / 100;
  return { n: sorted.length, median: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1)) };
}

export function tally() {
  const counts = new Map();
  return {
    add(key, ok) {
      const entry = counts.get(key) ?? { passed: 0, total: 0 };
      entry.total += 1;
      if (ok) entry.passed += 1;
      counts.set(key, entry);
    },
    toObject() {
      return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, { passed, total }]) => [key, wilson(passed, total)]));
    },
    get(key) {
      return counts.get(key) ?? { passed: 0, total: 0 };
    }
  };
}
