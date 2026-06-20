/**
 * A 128-bit, lexicographically sortable identifier in canonical form
 * `YYMMDDHH-mmss-MMMx-rrrr-rrrrrrrrrrrr` (UTC).
 */
export type Coid = string & {
    readonly __coid: unique symbol;
};
export interface CoidGeneratorOptions {
    /**
     * High-resolution clock returning fractional Unix milliseconds. The integer
     * part is the timestamp; the fraction fills the sub-millisecond nibble.
     * Defaults to `performance.timeOrigin + performance.now()` (monotonic, ~µs).
     */
    readonly now?: () => number;
    /**
     * Random byte source; it must fill and return the provided array. Intended for
     * deterministic tests or custom runtime integrations.
     */
    readonly randomBytes?: (bytes: Uint8Array) => Uint8Array;
}
/** Fully decoded coid. */
export interface ParsedCoid {
    /** Canonical lowercase id. */
    readonly id: Coid;
    /** Encoded UTC instant, to millisecond precision. */
    readonly date: Date;
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly millisecond: number;
    /** Sub-millisecond fraction in 1/16 ms units (0–15). */
    readonly fraction: number;
    /** The 64-bit random tail. */
    readonly random: bigint;
}
/** Thrown for malformed input, impossible timestamps, or out-of-range generation. */
export declare class CoidError extends Error {
    constructor(message: string);
}
/**
 * Independent generator with pooled CSPRNG bytes and a per-ms timestamp cache.
 */
export declare class CoidGenerator {
    #private;
    constructor(options?: CoidGeneratorOptions);
    /**
     * Generate the next coid.
     *
     * @param date UTC instant to encode; defaults to now. Years 2000–2099 only. An
     *   explicit `Date` has millisecond resolution (sub-ms fraction 0).
     * @throws {CoidError} if `date` is invalid or outside the supported year range.
     */
    generate(date?: Date): Coid;
}
/**
 * Generate a coid from the shared default generator — the common entry point.
 * @param date UTC instant to encode; defaults to now. Years 2000–2099 only.
 * @throws {CoidError} if `date` is invalid or outside the supported year range.
 * @example coid(); // "26061912-5549-9998-a1b2-c3d4e5f60718"
 */
export declare function coid(date?: Date): Coid;
/**
 * Create an independent {@link CoidGenerator}, e.g. to inject a clock or random
 * source (deterministic tests, custom runtimes).
 */
export declare function createCoidGenerator(options?: CoidGeneratorOptions): CoidGenerator;
/**
 * Type guard: `true` only if `value` is a syntactically valid coid that also names
 * a real UTC calendar instant in 2000–2099. Accepts any letter case.
 */
export declare function isCoid(value: unknown): value is Coid;
/**
 * Narrow `value` to {@link Coid}, throwing if it is not a valid coid.
 * @throws {CoidError}
 */
export declare function assertCoid(value: unknown): asserts value is Coid;
/**
 * Decode a coid into all of its fields. Accepts any letter case; `id` is returned
 * in canonical form.
 * @throws {CoidError} if the string is malformed or encodes an impossible instant.
 */
export declare function parseCoid(value: string): ParsedCoid;
/**
 * Extract just the UTC creation time. Shorthand for `parseCoid(value).date`.
 * @throws {CoidError} if `value` is not a valid coid.
 */
export declare function dateFromCoid(value: string): Date;
/**
 * Extract just the 64-bit random tail. Shorthand for `parseCoid(value).random`.
 * @throws {CoidError} if `value` is not a valid coid.
 */
export declare function randomFromCoid(value: string): bigint;
export default coid;
