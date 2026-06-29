import { describe, expect, it } from "vitest";

import { probe } from "@/pdf/probe";
import { ProbeFailedError } from "@/pdf/types";

describe("probe", () => {
  it("suma [1,2,3] y devuelve { sum: 6, count: 3 } (R8, R17)", () => {
    expect(probe({ values: [1, 2, 3] })).toEqual({ sum: 6, count: 3 });
  });

  it("emite progreso no decreciente en [0,1] que termina en 1 (R13, R14, R15)", () => {
    const progress: number[] = [];
    probe({ values: [1, 2, 3] }, (p) => progress.push(p));

    expect(progress.length).toBeGreaterThan(0);
    for (const p of progress) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
    expect(progress[progress.length - 1]).toBe(1);
  });

  it("con values vacío emite progreso 1 y devuelve { sum: 0, count: 0 } (R14, R15)", () => {
    const progress: number[] = [];
    const result = probe({ values: [] }, (p) => progress.push(p));

    expect(result).toEqual({ sum: 0, count: 0 });
    expect(progress).toEqual([1]);
  });

  it("con fail: true lanza ProbeFailedError con name estable (R10)", () => {
    expect(() => probe({ values: [1, 2], fail: true })).toThrow(
      ProbeFailedError,
    );
    try {
      probe({ values: [1, 2], fail: true });
    } catch (error) {
      expect((error as Error).name).toBe("ProbeFailedError");
    }
  });
});
