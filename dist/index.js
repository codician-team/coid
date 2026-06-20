import { randomFillSync } from "node:crypto";
import { performance } from "node:perf_hooks";
const COID_PATTERN = /^(\d{8})-(\d{4})-(\d{3})([0-9a-fA-F])-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})$/;
const POOL_BYTES = 1024 * 8; // ponytail: 8 random bytes per id; 1024-id refills (8KB) amortize the CSPRNG call
const HEX_CODES = Uint8Array.from("0123456789abcdef", (c) => c.charCodeAt(0));
const DASH = 0x2d;
const ZERO = 0x30;
const TIME_ORIGIN = performance.timeOrigin;
/** Thrown for malformed input, impossible timestamps, or out-of-range generation. */
export class CoidError extends Error {
    constructor(message) {
        super(message);
        this.name = "CoidError";
    }
}
/**
 * Independent generator with pooled CSPRNG bytes and a per-ms timestamp cache.
 */
export class CoidGenerator {
    #lastMs = Number.NaN;
    #buffer = Buffer.alloc(36);
    #pool = new Uint8Array(POOL_BYTES);
    #poolOffset = POOL_BYTES;
    #now;
    #inlineClock;
    #randomBytes;
    constructor(options = {}) {
        this.#now = options.now ?? defaultNow;
        this.#inlineClock = options.now === undefined;
        this.#randomBytes = options.randomBytes ?? secureRandomBytes;
        this.#buffer[8] = DASH;
        this.#buffer[13] = DASH;
        this.#buffer[18] = DASH;
        this.#buffer[23] = DASH;
    }
    /**
     * Generate the next coid.
     *
     * @param date UTC instant to encode; defaults to now. Years 2000–2099 only. An
     *   explicit `Date` has millisecond resolution (sub-ms fraction 0).
     * @throws {CoidError} if `date` is invalid or outside the supported year range.
     */
    generate(date) {
        if (date !== undefined) {
            return this.#write(Math.floor(date.getTime()), 0);
        }
        const time = this.#inlineClock ? TIME_ORIGIN + performance.now() : this.#now();
        const ms = Math.floor(time);
        return this.#write(ms, Math.min(15, ((time - ms) * 16) | 0));
    }
    #write(ms, fraction) {
        const out = this.#buffer;
        if (ms !== this.#lastMs) {
            writeTimestampCodes(out, ms);
        }
        this.#lastMs = ms;
        let offset = this.#poolOffset;
        if (offset + 8 > POOL_BYTES) {
            this.#randomBytes(this.#pool);
            offset = 0;
        }
        this.#poolOffset = offset + 8;
        const b = this.#pool;
        out[17] = HEX_CODES[fraction];
        let v = b[offset];
        out[19] = HEX_CODES[v >> 4];
        out[20] = HEX_CODES[v & 15];
        v = b[offset + 1];
        out[21] = HEX_CODES[v >> 4];
        out[22] = HEX_CODES[v & 15];
        v = b[offset + 2];
        out[24] = HEX_CODES[v >> 4];
        out[25] = HEX_CODES[v & 15];
        v = b[offset + 3];
        out[26] = HEX_CODES[v >> 4];
        out[27] = HEX_CODES[v & 15];
        v = b[offset + 4];
        out[28] = HEX_CODES[v >> 4];
        out[29] = HEX_CODES[v & 15];
        v = b[offset + 5];
        out[30] = HEX_CODES[v >> 4];
        out[31] = HEX_CODES[v & 15];
        v = b[offset + 6];
        out[32] = HEX_CODES[v >> 4];
        out[33] = HEX_CODES[v & 15];
        v = b[offset + 7];
        out[34] = HEX_CODES[v >> 4];
        out[35] = HEX_CODES[v & 15];
        return out.toString("latin1");
    }
}
const defaultNow = () => TIME_ORIGIN + performance.now();
const defaultGenerator = new CoidGenerator();
/**
 * Generate a coid from the shared default generator — the common entry point.
 * @param date UTC instant to encode; defaults to now. Years 2000–2099 only.
 * @throws {CoidError} if `date` is invalid or outside the supported year range.
 * @example coid(); // "26061912-5549-9998-a1b2-c3d4e5f60718"
 */
export function coid(date) {
    return defaultGenerator.generate(date);
}
/**
 * Create an independent {@link CoidGenerator}, e.g. to inject a clock or random
 * source (deterministic tests, custom runtimes).
 */
export function createCoidGenerator(options) {
    return new CoidGenerator(options);
}
/**
 * Type guard: `true` only if `value` is a syntactically valid coid that also names
 * a real UTC calendar instant in 2000–2099. Accepts any letter case.
 */
export function isCoid(value) {
    if (typeof value !== "string") {
        return false;
    }
    const match = COID_PATTERN.exec(value);
    return match !== null && decodeTimestamp(match) !== null;
}
/**
 * Narrow `value` to {@link Coid}, throwing if it is not a valid coid.
 * @throws {CoidError}
 */
export function assertCoid(value) {
    if (!isCoid(value)) {
        throw new CoidError("Invalid coid");
    }
}
/**
 * Decode a coid into all of its fields. Accepts any letter case; `id` is returned
 * in canonical form.
 * @throws {CoidError} if the string is malformed or encodes an impossible instant.
 */
export function parseCoid(value) {
    const match = COID_PATTERN.exec(value);
    if (match === null) {
        throw new CoidError("Invalid coid format");
    }
    const decoded = decodeTimestamp(match);
    if (decoded === null) {
        throw new CoidError("Invalid coid timestamp");
    }
    return {
        id: canonicalFromMatch(match),
        date: decoded.date,
        year: decoded.year,
        month: decoded.month,
        day: decoded.day,
        hour: decoded.hour,
        minute: decoded.minute,
        second: decoded.second,
        millisecond: decoded.millisecond,
        fraction: Number.parseInt(match[4], 16),
        random: BigInt(`0x${match[5]}${match[6]}`),
    };
}
/**
 * Extract just the UTC creation time. Shorthand for `parseCoid(value).date`.
 * @throws {CoidError} if `value` is not a valid coid.
 */
export function dateFromCoid(value) {
    return parseCoid(value).date;
}
/**
 * Extract just the 64-bit random tail. Shorthand for `parseCoid(value).random`.
 * @throws {CoidError} if `value` is not a valid coid.
 */
export function randomFromCoid(value) {
    return parseCoid(value).random;
}
/**
 * Write `YYMMDDHH-mmss-MMM`. Runs once per millisecond; the random tail is
 * still overwritten on every id.
 * @throws {CoidError} on a non-finite time or a year outside 2000–2099.
 */
function writeTimestampCodes(out, ms) {
    if (!Number.isFinite(ms)) {
        throw new CoidError("Invalid time");
    }
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    if (year < 2000 || year > 2099) {
        throw new CoidError("coid supports UTC years from 2000 through 2099");
    }
    writeDec2(out, 0, year % 100);
    writeDec2(out, 2, date.getUTCMonth() + 1);
    writeDec2(out, 4, date.getUTCDate());
    writeDec2(out, 6, date.getUTCHours());
    writeDec2(out, 9, date.getUTCMinutes());
    writeDec2(out, 11, date.getUTCSeconds());
    const msf = date.getUTCMilliseconds();
    out[14] = ZERO + ((msf / 100) | 0);
    out[15] = ZERO + (((msf / 10) | 0) % 10);
    out[16] = ZERO + (msf % 10);
}
function writeDec2(out, at, value) {
    out[at] = ZERO + ((value / 10) | 0);
    out[at + 1] = ZERO + (value % 10);
}
function decodeTimestamp(match) {
    const dateHour = match[1];
    const minuteSecond = match[2];
    const yy = Number.parseInt(dateHour.slice(0, 2), 10);
    const month = Number.parseInt(dateHour.slice(2, 4), 10);
    const day = Number.parseInt(dateHour.slice(4, 6), 10);
    const hour = Number.parseInt(dateHour.slice(6, 8), 10);
    const minute = Number.parseInt(minuteSecond.slice(0, 2), 10);
    const second = Number.parseInt(minuteSecond.slice(2, 4), 10);
    const millisecond = Number.parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
        return null;
    }
    const year = 2000 + yy;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day ||
        date.getUTCHours() !== hour ||
        date.getUTCMinutes() !== minute ||
        date.getUTCSeconds() !== second) {
        return null;
    }
    return { date, year, month, day, hour, minute, second, millisecond };
}
function secureRandomBytes(bytes) {
    return randomFillSync(bytes);
}
function canonicalFromMatch(match) {
    return `${match[1]}-${match[2]}-${match[3]}${match[4].toLowerCase()}-${match[5].toLowerCase()}-${match[6].toLowerCase()}`;
}
export default coid;
