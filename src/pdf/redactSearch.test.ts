import { describe, expect, it } from "vitest";

import {
  findMatches,
  matchBoxFromItem,
  type PageTextGeometry,
  type TextItemGeometry,
} from "@/pdf/redactSearch";

/** Ítem de ejemplo: baseline (20,150), 90×18 pts en una página 200×300. */
const ITEM: TextItemGeometry = {
  str: "SECRETO",
  xPts: 20,
  yPts: 150,
  widthPts: 90,
  heightPts: 18,
};

function page(items: readonly TextItemGeometry[]): PageTextGeometry {
  return { pageIndex: 0, pageWidthPts: 200, pageHeightPts: 300, items };
}

describe("matchBoxFromItem (R2, R3)", () => {
  it("convierte una coincidencia de ítem completo a NormalizedBox [0,1] con origen sup-izq", () => {
    const box = matchBoxFromItem(ITEM, 200, 300, 0, 1, 0);
    // left = 20/200; top = (300 - (150+18))/300 = 132/300; width = 90/200;
    // height = 18/300.
    expect(box.pageIndex).toBe(0);
    expect(box.left).toBeCloseTo(0.1, 10);
    expect(box.top).toBeCloseTo(0.44, 10);
    expect(box.width).toBeCloseTo(0.45, 10);
    expect(box.height).toBeCloseTo(0.06, 10);
  });

  it("cubre solo el tramo [startFrac,endFrac) de caracteres (sub-caja proporcional)", () => {
    // Primera mitad del ítem: startFrac 0, endFrac 0.5.
    const box = matchBoxFromItem(ITEM, 200, 300, 0, 0.5, 3);
    expect(box.pageIndex).toBe(3);
    expect(box.left).toBeCloseTo(20 / 200, 10);
    expect(box.width).toBeCloseTo(45 / 200, 10);
    // Segunda mitad: se desplaza a la derecha.
    const second = matchBoxFromItem(ITEM, 200, 300, 0.5, 1, 3);
    expect(second.left).toBeCloseTo((20 + 45) / 200, 10);
    expect(second.width).toBeCloseTo(45 / 200, 10);
  });

  it("acota la caja al rango [0,1] cuando la geometría se sale de la página", () => {
    const wide: TextItemGeometry = {
      str: "X",
      xPts: 190,
      yPts: -5,
      widthPts: 100,
      heightPts: 400,
    };
    const box = matchBoxFromItem(wide, 200, 300, 0, 1, 0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(box.top + box.height).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("findMatches (R1, R4, R5)", () => {
  it("encuentra un término conocido y produce su caja en la posición esperada (R1, R2)", () => {
    const matches = findMatches([page([ITEM])], "SECRETO");
    expect(matches).toHaveLength(1);
    expect(matches[0].box.pageIndex).toBe(0);
    expect(matches[0].box.left).toBeCloseTo(0.1, 10);
    expect(matches[0].box.top).toBeCloseTo(0.44, 10);
    expect(matches[0].snippet).toBe("SECRETO");
  });

  it("fija box.pageIndex desde PageTextGeometry.pageIndex (observación 1 del critic)", () => {
    const p: PageTextGeometry = {
      pageIndex: 5,
      pageWidthPts: 200,
      pageHeightPts: 300,
      items: [ITEM],
    };
    const matches = findMatches([p], "SECRETO");
    expect(matches[0].box.pageIndex).toBe(5);
  });

  it("es insensible a mayúsculas/minúsculas (R4)", () => {
    const matches = findMatches([page([ITEM])], "secreto");
    expect(matches).toHaveLength(1);
    // El snippet conserva el texto ORIGINAL, no el término.
    expect(matches[0].snippet).toBe("SECRETO");
  });

  it("encuentra varias apariciones dentro del mismo ítem", () => {
    const item: TextItemGeometry = {
      str: "abab",
      xPts: 0,
      yPts: 100,
      widthPts: 40,
      heightPts: 10,
    };
    const matches = findMatches([page([item])], "ab");
    expect(matches).toHaveLength(2);
    // Segunda aparición desplazada media anchura (2/4 de los caracteres).
    expect(matches[1].box.left).toBeCloseTo(20 / 200, 10);
  });

  it("encuentra apariciones en varias páginas con su pageIndex", () => {
    const p0: PageTextGeometry = {
      pageIndex: 0,
      pageWidthPts: 200,
      pageHeightPts: 300,
      items: [ITEM],
    };
    const p1: PageTextGeometry = {
      pageIndex: 1,
      pageWidthPts: 200,
      pageHeightPts: 300,
      items: [ITEM],
    };
    const matches = findMatches([p0, p1], "SECRETO");
    expect(matches.map((m) => m.box.pageIndex)).toEqual([0, 1]);
  });

  it("query vacío o solo espacios → [] sin lanzar (R5)", () => {
    expect(findMatches([page([ITEM])], "")).toEqual([]);
    expect(findMatches([page([ITEM])], "   ")).toEqual([]);
  });

  it("sin coincidencias → [] (R6, entrada de la lógica pura)", () => {
    expect(findMatches([page([ITEM])], "AUSENTE")).toEqual([]);
  });
});
