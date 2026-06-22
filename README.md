# coid

**Human-readable, time-sortable UUID-style IDs for TypeScript, JavaScript, Node.js, and PostgreSQL.**

`coid` is basically **UUIDv7 for humans**: a 128-bit, UUID-shaped identifier that
sorts chronologically like UUIDv7/ULID, fits naturally in PostgreSQL `UUID`
columns, and starts with a UTC timestamp you can read without decoding.

Use it where you'd normally reach for **UUIDv7**, **ULID**, or another
**time-sortable ID**, but still want identifiers that explain themselves in logs,
URLs, support tickets, analytics events, and database rows — with no coordination,
no machine IDs, and a full **64-bit cryptographic random tail**.

```ts
import { coid, parseCoid } from "@codician-team/coid";

const id = coid();
// 26061912-5549-9998-a1b2-c3d4e5f60718

parseCoid(id).date.toISOString();
// 2026-06-19T12:55:49.999Z
```

## Why coid?

- **Human-readable timestamp** — the ID starts with UTC date and time.
- **Chronologically sortable** — string order matches time order.
- **UUID-shaped 128-bit format** — works naturally anywhere UUID-like IDs are expected.
- **PostgreSQL-friendly** — suitable for sortable `UUID` primary keys and indexes.
- **64-bit cryptographic random tail** — coordination-free uniqueness without machine IDs.
- **TypeScript-first** — typed API, ESM-only, zero runtime dependencies.
- **Fast** — optimized generator with batched CSPRNG usage and minimal allocations.

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
| `x` | sub-millisecond fraction, 1/16 ms ≈ 62.5 µs | hex, clock-derived |
| group 4 + 5 | 64-bit cryptographic random tail | hex |

The entire left half is plain decimal, so:

```text
26061912-5549-999
```

reads directly as:

```text
2026-06-19 12:55:49.999 UTC
```

Comparing two coids as strings orders them by time, then the sub-millisecond
fraction, then random. This is also the order PostgreSQL gives a `UUID` column,
so coids can be used as drop-in sortable UUID-style keys.

The sub-ms nibble follows the same general idea as PostgreSQL 18's `uuidv7()`:
extra clock precision is stored in otherwise timestamp-adjacent bits to improve
ordering for IDs generated within the same millisecond.

See [`SPEC.md`](./SPEC.md) for the bit layout, collision analysis, validation
rules, and sorting guarantees.

> Years are two digits: coid covers UTC **2000–2099**. Generating outside that
> range throws.

## Usage

```ts
import {
  coid,
  isCoid,
  parseCoid,
  assertCoid,
  dateFromCoid,
  randomFromCoid
} from "@codician-team/coid";

const id = coid();
// 26061912-5549-9998-a1b2-c3d4e5f60718

coid(new Date("2030-01-01T00:00:00.000Z"));
// 30010100-0000-0000-...

isCoid("not-an-id");
// false

isCoid("26023012-5549-9998-a1b2-c3d4e5f60718");
// false — impossible date, February 30

assertCoid(id);
// narrows the value to Coid or throws CoidError

const parsed = parseCoid(id);

parsed.date.toISOString();
// 2026-06-19T12:55:49.999Z

parsed.year;
// 2026

parsed.month;
// 6

parsed.day;
// 19

parsed.hour;
// 12

parsed.minute;
// 55

parsed.second;
// 49

parsed.millisecond;
// 999

parsed.fraction;
// 8

parsed.random;
// bigint, 64-bit random tail

dateFromCoid(id);
// Date

randomFromCoid(id);
// bigint
```

Call `coid()` with no argument for sub-millisecond precision.

Passing a `Date` or a clock based on `Date.now()` has only millisecond precision,
so the `x` nibble is always `0`.

## Independent generators

The module-level `coid()` shares one default generator.

For tests, deterministic environments, custom runtimes, or Web Crypto-based
generation, create an independent generator:

```ts
import { createCoidGenerator } from "@codician-team/coid";

const gen = createCoidGenerator({
  now: () => performance.timeOrigin + performance.now(),
  randomBytes: (buffer) => crypto.getRandomValues(buffer)
});

const id = gen.generate();
```

You can also generate from a specific instant:

```ts
const id = gen.generate(new Date("2030-01-01T00:00:00.000Z"));
```

## API

| Export | Returns | Notes |
|--------|---------|-------|
| `coid(date?)` | `Coid` | Generate from the shared default generator. |
| `createCoidGenerator(options?)` | `CoidGenerator` | Create an independent generator. |
| `CoidGenerator#generate(date?)` | `Coid` | Generate the next ID. |
| `parseCoid(value)` | `ParsedCoid` | Decode all fields. Throws on invalid input. |
| `isCoid(value)` | `value is Coid` | Type guard; calendar-validated. |
| `assertCoid(value)` | `asserts value is Coid` | Throws `CoidError` if invalid. |
| `dateFromCoid(value)` | `Date` | Shorthand accessor for the embedded UTC timestamp. |
| `randomFromCoid(value)` | `bigint` | Shorthand accessor for the 64-bit random tail. |
| `CoidError` | — | Thrown for malformed or impossible input. |

Parsing is case-insensitive; output is always canonical lowercase.

Validation is exact: a string must name a real UTC instant in 2000–2099, not
merely match the shape.

## coid vs UUIDv7 vs ULID

| Feature | coid | UUIDv7 | ULID |
|---------|------|--------|------|
| Time-sortable | Yes | Yes | Yes |
| Human-readable timestamp | Yes | No, must decode | Partially, must decode |
| UUID-shaped | Yes | Yes | No |
| Fits PostgreSQL `UUID` column | Yes | Yes | No |
| 128-bit identifier | Yes | Yes | Yes |
| Coordination-free | Yes | Yes | Yes |
| Random tail | 64-bit CSPRNG | implementation-dependent | 80-bit random |
| TypeScript-first package | Yes | depends on library | depends on library |

`coid` is not trying to replace every UUID variant. It is for cases where you
want the operational benefits of sortable UUID-style IDs, while keeping the
timestamp readable directly inside the identifier.

## Database usage

Because coids are UUID-shaped, they can be stored in a PostgreSQL `UUID` column:

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Generated coids sort chronologically in PostgreSQL UUID order:

```sql
SELECT id
FROM events
ORDER BY id ASC;
```

This makes coid useful for append-heavy tables, logs, events, audit records,
analytics rows, job IDs, support-ticket references, and other places where
random UUIDv4 ordering is inconvenient.

## Performance

The generator uses:

- one inlined clock read,
- a per-millisecond timestamp cache,
- one draw from a batched CSPRNG pool,
- a reused scratch buffer,
- and a single decode step.

The bundled benchmark compares `coid()` against direct peers: real npm packages
for identifiers that are **128-bit**, **time-sortable**, and, where applicable,
fit PostgreSQL-style UUID workflows.

```text
$ npm run bench                      # Node 24, Apple Silicon — indicative

coid()                  ~21M ops/sec   1.00x   ms time + sub-ms + 64b random
coid() web APIs         ~16M ops/sec   0.73x   injected Web Performance + Web Crypto
uuidv7                  ~3.4M ops/sec  0.16x   ms time + counter/rand
ulid                    ~3.2M ops/sec  0.15x   ms time + 80b random
uuid v6                 ~1.3M ops/sec  0.06x   reordered-v1 time
```

Every competitor is the actual published library, called through its recommended
API. Benchmark dependencies live in `bench/`'s own `package.json`, so the package
itself ships with **zero runtime dependencies** and none reach consumers.

Run the benchmark on your own hardware for real numbers:

```sh
npm run bench
```

## Design goals

`coid` is designed to be:

- readable in logs and support tickets,
- sortable in databases and object stores,
- UUID-shaped for compatibility,
- coordination-free across machines and processes,
- safe for distributed systems,
- simple to validate and parse,
- small enough to use as a normal application dependency.

It intentionally does **not** include machine IDs, process IDs, counters, shard
IDs, or external coordination.

## Limitations

- coid covers UTC years **2000–2099**.
- coid is not RFC UUIDv7, although it is UUID-shaped and time-sortable.
- coid embeds a readable timestamp, so it is not suitable when creation time must
  be hidden.
- coid is optimized for chronological ordering, not cryptographic secrecy.
- Passing a `Date` gives millisecond precision only; sub-ms precision is available
  when using the default clock or a fractional `now()` source.

## License

MIT
