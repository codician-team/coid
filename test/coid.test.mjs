import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertCoid,
  CoidError,
  coid,
  createCoidGenerator,
  dateFromCoid,
  isCoid,
  parseCoid,
  randomFromCoid,
} from "../dist/index.js";

function deterministicRandom(bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = index + 1;
  }
  return bytes;
}

const FIXED_MS = Date.UTC(2026, 5, 19, 12, 55, 49, 999);

describe("coid", () => {
  it("generates the canonical textual representation", () => {
    const generator = createCoidGenerator({ randomBytes: deterministicRandom });

    const id = generator.generate(new Date(FIXED_MS));

    assert.equal(id, "26061912-5549-9990-0102-030405060708");
    assert.equal(isCoid(id), true);
  });

  it("encodes the sub-millisecond fraction from a high-resolution clock", () => {
    const generator = createCoidGenerator({
      now: () => FIXED_MS + 0.5, // half a millisecond into the tick -> nibble 8
      randomBytes: deterministicRandom,
    });

    const id = generator.generate();

    assert.equal(id, "26061912-5549-9998-0102-030405060708");
    assert.equal(parseCoid(id).fraction, 8);
  });

  it("decodes the timestamp, fraction, and random fields", () => {
    const parsed = parseCoid("26061912-5549-9998-ABCD-0123456789ab");

    assert.equal(parsed.date.toISOString(), "2026-06-19T12:55:49.999Z");
    assert.equal(parsed.millisecond, 999);
    assert.equal(parsed.fraction, 8);
    assert.equal(parsed.random, 0xabcd0123456789abn);
    assert.equal(randomFromCoid(parsed.id), 0xabcd0123456789abn);
    assert.equal(parsed.id, "26061912-5549-9998-abcd-0123456789ab"); // canonical = lowercase hex
  });

  it("sorts lexicographically by UTC time then sub-millisecond fraction", () => {
    const generator = createCoidGenerator({ randomBytes: deterministicRandom });
    const ids = [
      generator.generate(new Date(Date.UTC(2026, 5, 19, 13, 0, 0, 0))),
      generator.generate(new Date(Date.UTC(2026, 5, 19, 12, 55, 50, 0))),
      generator.generate(new Date(Date.UTC(2026, 5, 19, 12, 55, 49, 1))),
    ];

    assert.deepEqual([...ids].sort(), [ids[2], ids[1], ids[0]]);
  });

  it("rejects malformed or impossible timestamps", () => {
    assert.equal(isCoid("26061912-5549-9998-abcd-c3b9960fc2f7"), true);
    assert.equal(isCoid("26023012-5549-9998-abcd-c3b9960fc2f7"), false); // Feb 30 does not exist
    assert.equal(isCoid("26061912-5549-3e78-abcd-c3b9960fc2f7"), false); // ms is decimal now, not hex
    assert.throws(() => dateFromCoid("not-a-coid"), CoidError);
  });

  it("assertCoid narrows valid values", () => {
    const value = coid(new Date(FIXED_MS));
    assertCoid(value);
    assert.equal(value.length, 36);
  });

  it("uses fresh 64-bit random tails in the same time bucket", () => {
    const generator = createCoidGenerator({
      now: () => FIXED_MS + 0.5, // constant clock -> one bucket
      randomBytes: deterministicRandom,
    });

    const ids = Array.from({ length: 3 }, () => generator.generate());

    assert.deepEqual(
      ids.map((id) => id.slice(19)),
      ["0102-030405060708", "090a-0b0c0d0e0f10", "1112-131415161718"],
    );
  });

  it("generates unique ids in a tight bulk loop", () => {
    const generator = createCoidGenerator();
    const ids = Array.from({ length: 5000 }, () => generator.generate());

    assert.equal(new Set(ids).size, 5000);
  });
});
