import { describe, expect, it } from "vitest";

import { parsePageRanges } from "@/pdf/splitRanges";
import { InvalidRangeError } from "@/pdf/types";

describe("parsePageRanges (válidos)", () => {
  it("resuelve un combinado a índices 0-indexados (R1, R2, R3)", () => {
    expect(parsePageRanges("1-3,5", 5)).toEqual([0, 1, 2, 4]);
  });

  it("resuelve una página única al índice N-1 (R2, R3)", () => {
    expect(parsePageRanges("3", 5)).toEqual([2]);
  });

  it("conserva el orden de aparición con tokens desordenados (R5)", () => {
    expect(parsePageRanges("5,1-3", 5)).toEqual([4, 0, 1, 2]);
  });

  it("deduplica rangos solapados conservando la primera aparición (R4)", () => {
    expect(parsePageRanges("1-3,2-4", 5)).toEqual([0, 1, 2, 3]);
  });

  it("deduplica páginas repetidas (R4)", () => {
    expect(parsePageRanges("1,1,2", 5)).toEqual([0, 1]);
  });

  it("ignora los espacios en blanco alrededor de tokens y números (R6)", () => {
    expect(parsePageRanges(" 1 - 3 , 5 ", 5)).toEqual([0, 1, 2, 4]);
  });
});

describe("parsePageRanges (errores)", () => {
  it("lanza InvalidRangeError con cadena vacía o solo espacios (R8)", () => {
    expect(() => parsePageRanges("", 5)).toThrow(InvalidRangeError);
    expect(() => parsePageRanges("   ", 5)).toThrow(InvalidRangeError);
  });

  it("lanza InvalidRangeError con tokens mal formados (R9)", () => {
    for (const bad of ["a", "1-", "-3", "3-1", "1,,2"]) {
      expect(() => parsePageRanges(bad, 5)).toThrow(InvalidRangeError);
    }
  });

  it("lanza InvalidRangeError con páginas fuera de límites (R10)", () => {
    expect(() => parsePageRanges("0", 5)).toThrow(InvalidRangeError);
    expect(() => parsePageRanges("6", 5)).toThrow(InvalidRangeError);
    expect(() => parsePageRanges("4-9", 5)).toThrow(InvalidRangeError);
  });

  it("no devuelve arreglo cuando lanza (R11)", () => {
    let result: number[] | undefined;
    try {
      result = parsePageRanges("9", 3);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRangeError);
      result = undefined;
    }
    expect(result).toBeUndefined();
  });
});
