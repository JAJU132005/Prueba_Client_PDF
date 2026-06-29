import { describe, expect, it } from "vitest";

import { moveItem, removeItem } from "@/lib/fileList";

describe("moveItem", () => {
  it("mueve un elemento hacia adelante sin mutar la original (R8)", () => {
    const original = ["a", "b", "c", "d"];
    const result = moveItem(original, 0, 2);
    expect(result).toEqual(["b", "c", "a", "d"]);
    expect(original).toEqual(["a", "b", "c", "d"]);
    expect(result).not.toBe(original);
  });

  it("mueve un elemento hacia atrás sin mutar la original (R8)", () => {
    const original = ["a", "b", "c", "d"];
    const result = moveItem(original, 3, 1);
    expect(result).toEqual(["a", "d", "b", "c"]);
    expect(original).toEqual(["a", "b", "c", "d"]);
  });

  it("devuelve una copia equivalente con índices fuera de rango (R8)", () => {
    const original = ["a", "b"];
    const result = moveItem(original, -1, 5);
    expect(result).toEqual(["a", "b"]);
    expect(result).not.toBe(original);
  });
});

describe("removeItem", () => {
  it("quita el índice indicado sin mutar la original (R9)", () => {
    const original = ["a", "b", "c"];
    const result = removeItem(original, 1);
    expect(result).toEqual(["a", "c"]);
    expect(original).toEqual(["a", "b", "c"]);
    expect(result).not.toBe(original);
  });

  it("devuelve una copia equivalente con índice fuera de rango (R9)", () => {
    const original = ["a", "b"];
    const result = removeItem(original, 9);
    expect(result).toEqual(["a", "b"]);
    expect(result).not.toBe(original);
  });
});
