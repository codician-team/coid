import { randomFillSync } from "node:crypto";
import { performance } from "node:perf_hooks";

const POOL_BYTES = 1024 * 8; // ponytail: 8 random bytes per id; 1024-id refills amortize CSPRNG
const HEX_CODES = Uint8Array.from("0123456789abcdef", (c) => c.charCodeAt(0));
const DASH = 0x2d;
const ZERO = 0x30;
const TIME_ORIGIN = performance.timeOrigin;

export type Coid = string & { readonly __coid: unique symbol };

export interface CoidGeneratorOptions {
  readonly now?: () => number;
  readonly randomBytes?: (bytes: Uint8Array) => Uint8Array;
}

export class CoidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoidError";
  }
}

export class CoidGenerator {
  #lastMs = Number.NaN;
  readonly #buffer = Buffer.alloc(36);
  readonly #pool = new Uint8Array(POOL_BYTES);
  #poolOffset = POOL_BYTES;
  readonly #now: () => number;
  readonly #usesDefaultClock: boolean;
  readonly #randomBytes: (bytes: Uint8Array) => Uint8Array;

  constructor(options: CoidGeneratorOptions = {}) {
    this.#now = options.now ?? defaultNow;
    this.#usesDefaultClock = options.now === undefined;
    this.#randomBytes = options.randomBytes ?? randomFillSync;
    this.#buffer[8] = DASH;
    this.#buffer[13] = DASH;
    this.#buffer[18] = DASH;
    this.#buffer[23] = DASH;
  }

  generate(date?: Date): Coid {
    if (date !== undefined) {
      return this.#write(Math.floor(date.getTime()), 0);
    }

    const time = this.#usesDefaultClock ? TIME_ORIGIN + performance.now() : this.#now();
    const ms = Math.floor(time);
    return this.#write(ms, Math.min(15, ((time - ms) * 16) | 0));
  }

  #write(ms: number, fraction: number): Coid {
    const out = this.#buffer;
    if (ms !== this.#lastMs) {
      writeTimestampCodes(out, ms);
      this.#lastMs = ms;
    }

    let offset = this.#poolOffset;
    if (offset + 8 > POOL_BYTES) {
      this.#randomBytes(this.#pool);
      offset = 0;
    }
    this.#poolOffset = offset + 8;

    const b = this.#pool;
    out[17] = HEX_CODES[fraction]!;
    let v = b[offset]!; out[19] = HEX_CODES[v >> 4]!; out[20] = HEX_CODES[v & 15]!;
    v = b[offset + 1]!; out[21] = HEX_CODES[v >> 4]!; out[22] = HEX_CODES[v & 15]!;
    v = b[offset + 2]!; out[24] = HEX_CODES[v >> 4]!; out[25] = HEX_CODES[v & 15]!;
    v = b[offset + 3]!; out[26] = HEX_CODES[v >> 4]!; out[27] = HEX_CODES[v & 15]!;
    v = b[offset + 4]!; out[28] = HEX_CODES[v >> 4]!; out[29] = HEX_CODES[v & 15]!;
    v = b[offset + 5]!; out[30] = HEX_CODES[v >> 4]!; out[31] = HEX_CODES[v & 15]!;
    v = b[offset + 6]!; out[32] = HEX_CODES[v >> 4]!; out[33] = HEX_CODES[v & 15]!;
    v = b[offset + 7]!; out[34] = HEX_CODES[v >> 4]!; out[35] = HEX_CODES[v & 15]!;
    return out.toString("latin1") as Coid;
  }
}

const defaultNow = (): number => TIME_ORIGIN + performance.now();
const defaultGenerator = new CoidGenerator();

export function coid(date?: Date): Coid {
  return defaultGenerator.generate(date);
}

export function createCoidGenerator(options?: CoidGeneratorOptions): CoidGenerator {
  return new CoidGenerator(options);
}

function writeTimestampCodes(out: Buffer, ms: number): void {
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

function writeDec2(out: Buffer, at: number, value: number): void {
  out[at] = ZERO + ((value / 10) | 0);
  out[at + 1] = ZERO + (value % 10);
}

export default coid;
