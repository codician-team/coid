# coid

`coid` is basically **UUIDv7 for humans**: a 128-bit, UUID-shaped identifier that
sorts chronologically in database indexes, but starts with a UTC timestamp you
can read without decoding.

Use it where you'd reach for UUIDv7/ULID, but still want IDs that explain
themselves in logs, URLs, support tickets, and database rows — coordination-free,
no machine IDs, and a full **64-bit cryptographic random tail**.

```ts
import { coid, parseCoid } from "@codician-team/coid";

const id = coid();
// 26061912-5549-9998-a1b2-c3d4e5f60718

parseCoid(id).date.toISOString();
// 2026-06-19T12:55:49.999Z
```

With UUIDv7 you get sortable time. With `coid`, you get sortable time you can
read:

```text
coid    26061912-5549-9998-a1b2-c3d4e5f60718  -> 2026-06-19 12:55:49.999 UTC
uuidv7  01978f77-dbcf-7a50-9f9a-8c0f0d8f8b4a  -> decode it first
```

## Install

```sh
npm install @codician-team/coid
```

Node.js 20+, ESM-only. No runtime dependencies.

## The format

```text
26061912-5549-9998-a1b2-c3d4e5f60718
YYMMDDHH-mmss-MMMx-rrrr-rrrrrrrrrrrr
date    time  ms │ random tail
                 └ sub-ms fraction (1/16 ms)
```

| Group | Meaning | Encoding |
|-------|---------|----------|
| `YYMMDDHH` | year (`20xx`), month, day, hour | decimal, UTC |
| `mmss` | minute, second | decimal |
| `MMM` | millisecond (`000`–`999`) | decimal |
| `x` | sub-millisecond fraction (1/16 ms ≈ 62.5 µs), clock-derived | hex |
| group 4 + 5 | 64-bit cryptographic random | hex |

The entire left half is plain decimal, so `26061912-5549-999` reads directly as
`2026-06-19 12:55:49.999`. Comparing two coids as strings orders them by time,
then the sub-ms fraction, then random — the same order PostgreSQL gives a `UUID`
column, so they're a drop-in sortable key. The sub-ms nibble follows PostgreSQL
18's `uuidv7()` approach (extra clock precision). See [`SPEC.md`](./SPEC.md) for
the bit layout, collision analysis, and sorting guarantees.

> Years are two digits: coid covers UTC **2000–2099**. Generating outside that
> range throws.

## Usage

```ts
import { coid, isCoid, parseCoid, assertCoid } from "@codician-team/coid";

coid();                              // now
coid(new Date("2030-01-01T00:00Z")); // a specific UTC instant

isCoid("not-an-id");                 // false (also rejects impossible dates like Feb 30)
assertCoid(value);                   // throws CoidError if invalid, else narrows to Coid

const p = parseCoid(id);
p.date; p.year; p.month; /* … */ p.fraction; p.random; // fraction: 0–15, random: bigint
```

### Independent generators

The module-level `coid()` shares one default generator. To inject a clock or
random source (handy in tests or custom runtimes), create your own:

```ts
import { createCoidGenerator } from "@codician-team/coid";

const gen = createCoidGenerator({
  now: () => performance.timeOrigin + performance.now(), // fractional Unix ms
  randomBytes: (b) => crypto.getRandomValues(b)          // CSPRNG (e.g. Web Crypto)
});

gen.generate();
```

## API

| Export | Returns | Notes |
|--------|---------|-------|
| `coid(date?)` | `Coid` | Generate from the shared default generator. |
| `createCoidGenerator(options?)` | `CoidGenerator` | Independent generator. |
| `CoidGenerator#generate(date?)` | `Coid` | Generate the next id. |
| `parseCoid(value)` | `ParsedCoid` | Decode all fields. Throws on invalid. |
| `isCoid(value)` | `value is Coid` | Type guard; calendar-validated. |
| `assertCoid(value)` | `asserts … is Coid` | Throws `CoidError` if invalid. |
| `dateFromCoid(value)` | `Date` | Shorthand accessor. |
| `randomFromCoid(value)` | `bigint` | Shorthand accessor (64-bit). |
| `CoidError` | — | Thrown for malformed/impossible input. |

Parsing is case-insensitive; output is always canonical. Validation is exact — a
string must name a real UTC instant in 2000–2099, not merely match the shape.

## Performance

The engine is one inlined clock read, a per-ms timestamp cache, one draw from a
batched CSPRNG pool, written into a reused scratch buffer and decoded once. The
bundled benchmark pits `coid()` against its direct peers (the **real npm
packages** for IDs that are both **128-bit / fit a PostgreSQL `UUID` column** and
**time-sortable**):

```text
$ npm run bench                      # Node 24, Apple Silicon — indicative
coid()                  ~21M ops/sec   1.00x   ms time + sub-ms + 64b random
coid() web APIs         ~16M ops/sec   0.73x   injected Web Performance + Web Crypto
uuidv7                  ~3.4M ops/sec   0.16x   ms time + counter/rand (uuidv7)
ulid                    ~3.2M ops/sec   0.15x   ms time + 80b random (ulid)
uuid v6                 ~1.3M ops/sec   0.06x   reordered-v1 time (uuid)
```

Every competitor is the actual published library, called through its recommended
API. They live in `bench/`'s own `package.json`, so the package itself ships
with **zero dependencies** and none reach consumers. Run `npm run bench` on your
own hardware for real numbers (it installs the bench deps on first run).

## License

MIT
