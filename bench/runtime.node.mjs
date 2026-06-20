import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { monotonicFactory } from "ulid";
import { uuidv7 } from "uuidv7";
import { v6 as uuidv6 } from "uuid";
import { coid, createCoidGenerator } from "../dist/index.js";

const DEFAULT_ITERATIONS = 1_000_000;
const WARMUP_ITERATIONS = 20_000;
const iterations = parseIterations();

// Scope: only IDs that are 128-bit (fit a PostgreSQL UUID column) AND time-sortable —
// coid's direct peer group. Each competitor is the real, published npm package,
// installed under bench/ and kept out of the coid package, called via its public API.
const ulid = monotonicFactory(); // ulid's documented multi-ID API; bare ulid() re-detects the PRNG each call
const webCoid = createCoidGenerator({
  now: () => globalThis.performance.timeOrigin + globalThis.performance.now(),
  randomBytes: (bytes) => globalThis.crypto.getRandomValues(bytes),
});

const cases = [
  { name: "coid()", run: () => coid(), note: "ms time + sub-ms + 64b random" },
  { name: "coid() web APIs", run: () => webCoid.generate(), note: "same format, injected Web Performance + Web Crypto" },
  { name: "uuidv7", run: () => uuidv7(), note: "ms time + counter/rand (74b)" },
  { name: "ulid", run: () => ulid(), note: "ms time + 80b random (base32)" },
  { name: "uuid v6", run: () => uuidv6(), note: "reordered-v1 time (base16)" },
];

console.log(`runtime: Node ${process.versions.node}`);
console.log(`iterations: ${iterations.toLocaleString("en-US")}`);
console.log(`libs: ulid@${ver("ulid")} uuidv7@${ver("uuidv7")} uuid@${ver("uuid")}`);
console.log("");

const results = cases.map((benchCase) => ({ ...runBench(benchCase, iterations), note: benchCase.note }));
const fastest = Math.max(...results.map((result) => result.opsPerSecond));

for (const result of results) {
  const relative = result.opsPerSecond / fastest;
  console.log(
    `${result.name.padEnd(22)} ${formatNumber(result.opsPerSecond).padStart(12)} ops/sec  ${
      formatNumber(result.nsPerOp).padStart(8)
    } ns/op  ${relative.toFixed(2).padStart(5)}x  ${result.note}`,
  );
}

console.log("");
console.log("All are 128-bit, UUID-column-storable, time-sortable IDs — the real npm packages");
console.log("(installed under bench/, not shipped with coid), called via their public API.");

function ver(pkg) {
  const url = new URL(`node_modules/${pkg}/package.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")).version;
}

function runBench(benchCase, iterations) {
  let checksum = 0;

  for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
    checksum ^= benchCase.run().charCodeAt(index & 31);
  }

  const started = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    checksum ^= benchCase.run().charCodeAt(index & 31);
  }

  const seconds = (performance.now() - started) / 1000;
  const opsPerSecond = iterations / seconds;

  return {
    name: benchCase.name,
    iterations,
    seconds,
    opsPerSecond,
    nsPerOp: (seconds * 1_000_000_000) / iterations,
    checksum,
  };
}

function parseIterations() {
  const raw = process.argv[2];
  if (raw === undefined) {
    return DEFAULT_ITERATIONS;
  }

  const value = Number.parseInt(raw.replaceAll("_", ""), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid iteration count: ${raw}`);
  }

  return value;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}
