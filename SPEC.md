# coid Specification v1.0

## Overview

coid is a 128-bit, lexicographically sortable, human-readable identifier designed for internal distributed systems.

It combines:

- Human-readable UTC timestamps
- Excellent database locality
- High write throughput
- A coordination-free generation model
- UUID-compatible textual shape
- Full utilization of the 128-bit identifier space

coid is intended as an alternative to UUIDv7, ULID, and similar time-ordered identifiers for systems where operational simplicity and timestamp readability are prioritized.

---

# Design Goals

## Primary Goals

- Human-readable creation time
- Naturally sortable identifiers
- PostgreSQL `UUID` column compatibility
- No centralized coordination, no machine IDs, no process IDs
- High insertion locality in B-Tree indexes

## Non-Goals

- RFC UUID compliance
- Interoperability with UUID version semantics
- Cryptographic secrecy / unguessability
- Beating purely-random schemes on collision probability at extreme fan-out

---

# Format

Canonical textual representation:

```text
YYMMDDHH-mmss-MMMx-rrrr-rrrrrrrrrrrr
```

Example:

```text
26061912-5549-9998-a1b2-c3d4e5f60718
```

The same letter repeats across groups in this mnemonic; the table below is
authoritative. Note that `MM` (group 1) is the **month** while `MMM` (group 3) is
the **millisecond**.

## Field legend

| Symbol | Group | Bits | Encoding | Meaning |
|--------|-------|------|----------|---------|
| `YY` | 1 | 8 | decimal | Year within century (`year − 2000`), `00`–`99` |
| `MM` | 1 | 8 | decimal | Month, `01`–`12` |
| `DD` | 1 | 8 | decimal | Day of month, `01`–`31` |
| `HH` | 1 | 8 | decimal | Hour (UTC), `00`–`23` |
| `mm` | 2 | 8 | decimal | Minute, `00`–`59` |
| `ss` | 2 | 8 | decimal | Second, `00`–`59` |
| `MMM` | 3 | 12 | decimal | Millisecond, `000`–`999` |
| `x` | 3 | 4 | hex (lower) | Sub-millisecond fraction, `0`–`f` = 0…15/16 of a ms (≈ 62.5 µs) |
| `rrrr` | 4 | 16 | hex (lower) | Random |
| `rrrrrrrrrrrr` | 5 | 48 | hex (lower) | Random |

All time fields are interpreted in **UTC**. Total: `32 + 16 + 12 + 4 + 16 + 48 = 128 bits`.

---

# Timestamp Encoding

The first three groups are the UTC wall-clock at creation, in plain
zero-padded **decimal**, readable to the millisecond with no decoding:

```text
26061912-5549-999   ->   2026-06-19 12:55:49.999 UTC
```

The millisecond `000`–`999` occupies 3 decimal characters (12 bits). The
following nibble `x` is **not** part of the readable millisecond.

## Sub-millisecond fraction (`x`)

`x` is a single hex nibble holding a sub-millisecond timestamp fraction — which
sixteenth of the current millisecond the id was generated in (`0` = 0–62.5 µs,
`f` = 937.5 µs–1 ms). It is derived from a high-resolution monotonic clock
(`performance.timeOrigin + performance.now()`), following the same approach as
PostgreSQL 18's `uuidv7()` (RFC 9562 "Method 3: increased clock precision").

This extends ordering below the millisecond. Two ids in the same 1/16-ms window
share `x` and are ordered by their random tail.

> Generators do not need a sub-ms clock to be correct. When an explicit `Date` is
> supplied it has only millisecond resolution, so `x` is `0`. The default
> generator uses the high-resolution clock and fills `x` meaningfully.

## Supported year range

`YY` is the year modulo 100, so coid represents UTC years **2000 through 2099**
inclusive. Generation outside this range is an error. This is a permanent limit
of the format, not an implementation detail.

> The high-resolution clock is monotonic and tracks wall-clock time approximately
> (it may drift by sub-second amounts from the system clock over a long-running
> process). For an identifier this is acceptable and keeps ids monotonic across
> clock adjustments.

---

# Random Tail

Group 4 plus group 5 are a 64-bit cryptographic random tail, freshly drawn for
**every** id.

The random value MUST come from a cryptographic source. Implementations MAY draw
it in batches (fill a buffer of many ids' worth at once) for throughput, provided
every emitted id still consumes fresh, unused CSPRNG bytes.

Recommended sources: Node.js `crypto.randomFillSync`, Web Crypto
`crypto.getRandomValues`, OS-backed cryptographic random bytes.

Not acceptable: non-cryptographic PRNGs, or reusing/recycling random bytes across ids.

---

# Canonical Form

A coid has exactly one canonical textual form. Generators MUST emit it; parsers
MUST accept any letter case and normalize to it.

| Field | Case |
|-------|------|
| `YYMMDDHH`, `mmss`, `MMM` | decimal digits (no case) |
| `x` (sub-ms), `rrrr`, `rrrrrrrrrrrr` | lowercase hex |

Because every field uses uniform casing and only digits `0`–`9` / `a`–`f`,
lexicographic text ordering equals the binary (16-byte) ordering PostgreSQL uses
for `UUID` columns. Parsing is case-insensitive on the hex fields:
`26061912-5549-9998-ABCD-0123456789AB` canonicalizes to lowercase.

---

# Validity and Parsing

A string is a valid coid if and only if **all** hold:

1. It matches the canonical structure (8 decimal / 4 decimal / 3 decimal + 1 hex /
   4 hex / 12 hex, dash-separated), case-insensitively on the hex fields.
2. The `YYMMDDHH-mmss` fields with the millisecond name a **real UTC calendar
   instant** in 2000–2099 — impossible dates (month `13`, `02-30`, hour `> 23`,
   etc.) are rejected by reconstructing the instant and confirming every field
   round-trips, not merely range-checking digits.

Parsing yields the decoded UTC `Date` (to the millisecond), the broken-out
calendar fields, the `fraction` (0–15), and the 64-bit `random` value.

---

# Sorting Properties

Comparing two coids as strings orders them by, in sequence: year, month, day,
hour, minute, second, millisecond, sub-millisecond fraction, then random.

```text
26061912-5549-9996-0000-0a1b2c3d4e5f   ->  2026-06-19 12:55:49.999  +6/16 ms
26061912-5549-9998-0000-0a1b2c3d4e5f   ->  2026-06-19 12:55:49.999  +8/16 ms
26061912-5550-0000-0000-0a1b2c3d4e5f   ->  2026-06-19 12:55:50.000
26061913-0000-0000-0000-0a1b2c3d4e5f   ->  2026-06-19 13:00:00.000
```

String order equals chronological order down to **~62.5 µs** (the sub-millisecond
nibble). Within a single 1/16-ms window, ids order by their random tail. The
text/binary ordering equivalence means the same order holds when stored in a
PostgreSQL `UUID` column.

---

# Collision Analysis

Two ids are equal only if every field matches: same millisecond, same
sub-millisecond fraction (1 of 16), **and** same 64-bit random tail. Per
millisecond, the collision budget is:

```text
4 bits (sub-ms fraction)  +  64 bits (random)  =  68 bits
```

For two ids landing in the same millisecond, the collision probability is
approximately `2^-68 ≈ 1 / 2.95 × 10^20`. By the birthday bound, an expected
collision needs on the order of `2^34 ≈ 17 billion` ids in a single millisecond.
For internal systems this is negligible.

This is the deliberate trade for the readable decimal timestamp: a dense binary
timestamp (as in UUIDv7) leaves more bits for entropy, so UUIDv7 has more
collision headroom. coid spends those bits on readability instead, which is the
right call below the multi-million-ids-per-second range that exhausts the margin.

---

# Database Characteristics

## PostgreSQL

coid stores in a `UUID` column: PostgreSQL treats UUID values as 16 opaque bytes
and does not enforce version/variant semantics. Because coid's canonical casing
is uniform, the column's binary ordering matches coid's textual ordering.

Benefits: compact 16-byte storage, efficient indexing, native tooling.

## B-Tree Locality

Compared to UUIDv4: dramatically reduced page fragmentation, better cache
locality, fewer page splits. Comparable to UUIDv7 and ULID.

---

# Comparison

## UUIDv7

UUIDv7 is the closest sibling — also 128-bit, time-ordered, UUID-shaped. It packs
a dense 48-bit binary millisecond timestamp, leaving ~74 bits for a
counter/random tail (PostgreSQL's implementation uses a 12-bit sub-ms fraction +
62-bit random, the same sub-ms-precision approach coid uses for `x`).

- **UUIDv7 is superior for** raw collision headroom and RFC interoperability.
- **coid is superior for** readability: its timestamp is decoded by eye. Both are
  coordination-free; both sort.

## ULID

Sortable and human-friendly, but Base32 (26 chars) and not a native `UUID` column
type. coid is simpler for SQL-centric systems.

## UUIDv4

Completely random: no timestamp, poor index locality. coid is superior for
database-heavy workloads.

---

# Recommended Use Cases

Ideal for: PostgreSQL applications, event stores, distributed APIs, job systems,
data pipelines, internal microservices, audit logs.

Not recommended for: public standards-based APIs, systems requiring RFC UUID
compliance or UUID version semantics, identifiers relied upon to be unguessable
secrets, or timestamps outside UTC years 2000–2099.

---

# Example

```text
26061912-5549-9998-a1b2-c3d4e5f60718
```

Decoded:

```text
Date:        2026-06-19
Time:        12:55:49.999 UTC
Sub-ms:      8/16 ms (≈ 0.5 ms)
Random:      0xa1b2c3d4e5f60718
```

coid achieves the readability of a plain timestamp and the sortability/database
locality of UUIDv7 from a coordination-free generation model, while retaining the
full 128-bit identifier space.
