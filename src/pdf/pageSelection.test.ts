import { describe, expect, it } from "vitest";

// Fuente del módulo como texto crudo (Vite `?raw`) para verificar su pureza.
import pageSelectionSource from "@/pdf/pageSelection.ts?raw";
import { parsePageRanges } from "@/pdf/splitRanges";
import { InvalidRangeError } from "@/pdf/types";
import {
  createSelection,
  fromText,
  invertSelection,
  resolvePages,
  selectAll,
  selectEven,
  selectOdd,
  selectRange,
  toPageSelection,
  toRangeSpec,
  togglePage,
  type PageSelectionState,
} from "@/pdf/pageSelection";

/** Índices seleccionados en orden ascendente, para aserciones deterministas. */
function selectedList(s: PageSelectionState): number[] {
  return [...s.selected].sort((a, b) => a - b);
}

// ── Parte 1 (T17): estado + atajos + rango ─────────────────────────────────
describe("pageSelection — estado y atajos (parte 1)", () => {
  it("createSelection inicia con TODAS las páginas seleccionadas (R1)", () => {
    expect(selectedList(createSelection(4))).toEqual([0, 1, 2, 3]);
  });

  it("togglePage añade una página no seleccionada devolviendo estado nuevo (R2)", () => {
    const base: PageSelectionState = { pageCount: 3, selected: new Set([0]) };
    const next = togglePage(base, 2);
    expect(next).not.toBe(base);
    expect(selectedList(next)).toEqual([0, 2]);
    // No muta la entrada.
    expect(selectedList(base)).toEqual([0]);
  });

  it("togglePage quita una página ya seleccionada (R3)", () => {
    const base: PageSelectionState = { pageCount: 3, selected: new Set([0, 2]) };
    const next = togglePage(base, 2);
    expect(selectedList(next)).toEqual([0]);
  });

  it("selectAll selecciona 0..pageCount-1 (R4)", () => {
    const base: PageSelectionState = { pageCount: 5, selected: new Set([1]) };
    expect(selectedList(selectAll(base))).toEqual([0, 1, 2, 3, 4]);
  });

  it("selectEven selecciona las páginas de número par (índices 1,3,5) (R5)", () => {
    const base = createSelection(6);
    // Páginas 2,4,6 → índices 1,3,5.
    expect(selectedList(selectEven(base))).toEqual([1, 3, 5]);
  });

  it("selectOdd selecciona las páginas de número impar (índices 0,2,4) (R6)", () => {
    const base = createSelection(6);
    // Páginas 1,3,5 → índices 0,2,4.
    expect(selectedList(selectOdd(base))).toEqual([0, 2, 4]);
  });

  it("invertSelection devuelve el complemento (R7)", () => {
    const base: PageSelectionState = { pageCount: 5, selected: new Set([0, 2]) };
    expect(selectedList(invertSelection(base))).toEqual([1, 3, 4]);
  });

  it("selectRange selecciona from..to inclusive (1-indexado) (R8)", () => {
    const base = createSelection(6);
    expect(selectedList(selectRange(base, 2, 4))).toEqual([1, 2, 3]);
  });

  it("selectRange lanza InvalidRangeError ante límites inválidos (R9)", () => {
    const base = createSelection(5);
    expect(() => selectRange(base, 0, 3)).toThrow(InvalidRangeError);
    expect(() => selectRange(base, 2, 9)).toThrow(InvalidRangeError);
    expect(() => selectRange(base, 4, 2)).toThrow(InvalidRangeError);
  });
});

// ── Parte 2 (T18): estructura canónica + parseo + resolución + pureza ───────
describe("pageSelection — canónico y parseo (parte 2)", () => {
  it("toPageSelection devuelve 'all' cuando todas están seleccionadas (R10)", () => {
    expect(toPageSelection(createSelection(4))).toBe("all");
  });

  it("toPageSelection devuelve una spec round-trip con parsePageRanges (R11)", () => {
    const base: PageSelectionState = {
      pageCount: 6,
      selected: new Set([0, 1, 2, 4]),
    };
    const spec = toPageSelection(base);
    expect(spec).toBe("1-3,5");
    // Round-trip: la spec parsea exactamente a los índices seleccionados.
    expect(parsePageRanges(spec as string, 6).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 4,
    ]);
  });

  it("toPageSelection devuelve '' cuando no hay páginas seleccionadas (R12)", () => {
    const base: PageSelectionState = { pageCount: 4, selected: new Set() };
    expect(toPageSelection(base)).toBe("");
  });

  it("toRangeSpec devuelve '1-N' cuando todas están seleccionadas (R13)", () => {
    expect(toRangeSpec(createSelection(5))).toBe("1-5");
  });

  it("toRangeSpec devuelve '' cuando no hay selección (R13)", () => {
    const base: PageSelectionState = { pageCount: 4, selected: new Set() };
    expect(toRangeSpec(base)).toBe("");
  });

  it("fromText resuelve un texto de rangos válido a sus índices (R14)", () => {
    const s = fromText("1-3,5", 6);
    expect(selectedList(s)).toEqual([0, 1, 2, 4]);
    expect(s.pageCount).toBe(6);
  });

  it("fromText propaga InvalidRangeError ante texto inválido (R15)", () => {
    expect(() => fromText("", 6)).toThrow(InvalidRangeError);
    expect(() => fromText("abc", 6)).toThrow(InvalidRangeError);
    expect(() => fromText("1-99", 6)).toThrow(InvalidRangeError);
  });

  it("resolvePages('all') devuelve 0..pageCount-1 ascendente (R16)", () => {
    expect(resolvePages("all", 4)).toEqual([0, 1, 2, 3]);
  });

  it("resolvePages(spec) respeta el orden de primera aparición de parsePageRanges (R16)", () => {
    // Orden no ascendente: 5 antes que 1-2 → índices [4,0,1].
    expect(resolvePages("5,1-2", 6)).toEqual([4, 0, 1]);
  });

  it("el módulo NO importa React, pdf.js, pdf-lib ni toca el DOM (R17)", () => {
    const src = pageSelectionSource;
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/pdfjs-dist/);
    expect(src).not.toMatch(/from\s+["']pdf-lib["']/);
    expect(src).not.toMatch(/\bdocument\.|\bwindow\./);
  });
});
