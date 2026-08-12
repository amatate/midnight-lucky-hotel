import { describe, expect, it } from "vitest";
import { nextInt } from "@/core/random";

describe("nextInt", () => {
  it("repeats the same ten values for the same seed", () => {
    let left = { value: 123456789 };
    let right = { value: 123456789 };

    for (let index = 0; index < 10; index += 1) {
      const leftResult = nextInt(left, 97);
      const rightResult = nextInt(right, 97);

      expect(leftResult.value).toBe(rightResult.value);
      expect(leftResult.rng).toEqual(rightResult.rng);
      left = leftResult.rng;
      right = rightResult.rng;
    }
  });

  it("diverges for distinct seeds", () => {
    const first = nextInt({ value: 1 }, 4_294_967_296);
    const second = nextInt({ value: 2 }, 4_294_967_296);

    expect(first.value).not.toBe(second.value);
    expect(first.rng).not.toEqual(second.rng);
  });

  it("rejects non-positive or non-integer bounds", () => {
    expect(() => nextInt({ value: 0 }, 0)).toThrow(RangeError);
    expect(() => nextInt({ value: 0 }, -1)).toThrow(RangeError);
    expect(() => nextInt({ value: 0 }, 1.5)).toThrow(RangeError);
  });
});
