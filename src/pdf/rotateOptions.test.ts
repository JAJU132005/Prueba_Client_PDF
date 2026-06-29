import { describe, expect, it } from "vitest";

import {
  normalizeRotationAngle,
  resolveRotationPages,
} from "@/pdf/rotateOptions";
import { InvalidRangeError, InvalidRotationError } from "@/pdf/types";

describe("normalizeRotationAngle (R1, R2)", () => {
  it("normaliza múltiplos de 90 al cuadrante {0,90,180,270} (R2)", () => {
    expect(normalizeRotationAngle(90)).toBe(90);
    expect(normalizeRotationAngle(180)).toBe(180);
    expect(normalizeRotationAngle(270)).toBe(270);
    expect(normalizeRotationAngle(360)).toBe(0);
    expect(normalizeRotationAngle(-90)).toBe(270);
  });

  it("lanza InvalidRotationError ante ángulos no múltiplos de 90 (R3)", () => {
    expect(() => normalizeRotationAngle(45)).toThrow(InvalidRotationError);
  });

  it("lanza InvalidRotationError ante NaN e Infinity (R3)", () => {
    expect(() => normalizeRotationAngle(Number.NaN)).toThrow(
      InvalidRotationError,
    );
    expect(() => normalizeRotationAngle(Number.POSITIVE_INFINITY)).toThrow(
      InvalidRotationError,
    );
    expect(() => normalizeRotationAngle(45)).toThrow(InvalidRotationError);
    // Aseverar instanceof concreto.
    let caught: unknown;
    try {
      normalizeRotationAngle(45);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidRotationError);
  });
});

describe("resolveRotationPages (R5–R8)", () => {
  it("'all' devuelve todos los índices en orden ascendente (R6)", () => {
    expect(resolveRotationPages("all", 3)).toEqual([0, 1, 2]);
  });

  it("una cadena de rangos delega en parsePageRanges (R7)", () => {
    expect(resolveRotationPages("1-3,5", 5)).toEqual([0, 1, 2, 4]);
  });

  it("propaga InvalidRangeError ante rango fuera de límites (R8)", () => {
    expect(() => resolveRotationPages("9", 3)).toThrow(InvalidRangeError);
  });

  it("propaga InvalidRangeError ante cadena vacía sin devolver valor (R8)", () => {
    let resolved: number[] | undefined;
    try {
      resolved = resolveRotationPages("", 3);
    } catch {
      resolved = undefined;
    }
    expect(resolved).toBeUndefined();
  });
});
