import { describe, expect, it } from "vitest";

import {
  addPlacedSignature,
  buildPlacedSignatureAnnotations,
  buildSignatureAnnotations,
  computeSignatureBox,
  findSignatureAt,
  formatSignatureDate,
  moveSignatureBox,
  removePlacedSignature,
  resizeSignatureBox,
  updatePlacedSignatureBox,
  updatePlacedSignaturePages,
  type FreePlacement,
  type PlacedSignature,
  type SignatureExtra,
} from "@/pdf/signature";

// ---------------------------------------------------------------------------
// Colocación libre (#30). Geometría pura de arrastrar/redimensionar la firma.
// ---------------------------------------------------------------------------

describe("computeSignatureBox (R1)", () => {
  it("ancla exacta + aspecto preservado a un ancho objetivo", () => {
    const box = computeSignatureBox(200, 100, { x: 30, y: 40 }, 50);
    expect(box).toEqual({ x: 30, y: 40, width: 50, height: 25 });
  });

  it("mantiene el ancla `at` sin ajuste a rejilla", () => {
    const box = computeSignatureBox(640, 480, { x: 12.5, y: 99 }, 120);
    expect(box.x).toBe(12.5);
    expect(box.y).toBe(99);
    expect(box.width).toBe(120);
    expect(box.height).toBeCloseTo(480 * (120 / 640));
  });
});

describe("moveSignatureBox (R2)", () => {
  it("traslada (dx,dy) sin cambiar el tamaño y sin mutar la entrada", () => {
    const box: FreePlacement = { x: 10, y: 20, width: 50, height: 25 };
    const moved = moveSignatureBox(box, 5, -8);
    expect(moved).toEqual({ x: 15, y: 12, width: 50, height: 25 });
    // La entrada no se muta.
    expect(box).toEqual({ x: 10, y: 20, width: 50, height: 25 });
    expect(moved).not.toBe(box);
  });
});

describe("resizeSignatureBox — aspecto preservado (R6)", () => {
  const box: FreePlacement = { x: 100, y: 100, width: 60, height: 30 };
  const aspectRatio = 2; // width / height

  for (const handle of ["nw", "ne", "sw", "se"] as const) {
    it(`el tirador ${handle} devuelve width/height === aspectRatio y ambos >= minSize`, () => {
      const resized = resizeSignatureBox(
        box,
        handle,
        { x: 300, y: 260 },
        aspectRatio,
        8,
      );
      expect(resized.width / resized.height).toBeCloseTo(aspectRatio);
      expect(resized.width).toBeGreaterThanOrEqual(8);
      expect(resized.height).toBeGreaterThanOrEqual(8);
    });
  }

  it("con `to` sobre la esquina fija, ambos lados quedan en minSize (R6)", () => {
    const square: FreePlacement = { x: 100, y: 100, width: 60, height: 60 };
    // se fija = (160, 100); arrastramos nw casi encima de la esquina fija.
    const resized = resizeSignatureBox(square, "nw", { x: 160, y: 100 }, 1, 8);
    expect(resized.width).toBe(8);
    expect(resized.height).toBe(8);
  });
});

describe("resizeSignatureBox — esquina opuesta fija", () => {
  it("arrastrar `nw` mantiene fija la esquina `se`", () => {
    const box: FreePlacement = { x: 100, y: 100, width: 60, height: 30 };
    // se = (x+width, y) = (160, 100).
    const resized = resizeSignatureBox(box, "nw", { x: 40, y: 220 }, 2, 8);
    expect(resized.x + resized.width).toBeCloseTo(160);
    expect(resized.y).toBeCloseTo(100);
  });
});

describe("buildSignatureAnnotations — reutilización de #30", () => {
  it("pageIndices=[0,2,4] → 3 anotaciones image, una por página", () => {
    const placement: FreePlacement = { x: 12, y: 34, width: 50, height: 25 };
    const image = new Uint8Array([1, 2, 3]);
    const anns = buildSignatureAnnotations(
      placement,
      image,
      [0, 2, 4],
      [],
      (p, part) => `id-${String(p)}-${part}`,
    );
    expect(anns).toHaveLength(3);
    expect(anns.map((a) => a.pageIndex)).toEqual([0, 2, 4]);
    for (const a of anns) {
      expect(a.kind).toBe("image");
      if (a.kind === "image") {
        expect(a.at).toEqual({ x: 12, y: 34 });
        expect(a.data).toBe(image);
      }
    }
  });
});

describe("formatSignatureDate (R10 de #30)", () => {
  it("formatea AAAA-MM-DD de forma determinista (UTC)", () => {
    expect(formatSignatureDate(new Date("2026-07-07T10:00:00Z"))).toBe(
      "2026-07-07",
    );
  });

  it("rellena con ceros los meses y días de un dígito", () => {
    expect(formatSignatureDate(new Date("2026-01-05T00:00:00Z"))).toBe(
      "2026-01-05",
    );
  });
});

// ---------------------------------------------------------------------------
// Herramienta unificada (#36). Modelo de LISTA de firmas colocadas (R1–R10).
// ---------------------------------------------------------------------------

function makeSig(overrides: Partial<PlacedSignature> = {}): PlacedSignature {
  return {
    id: "s1",
    image: new Uint8Array([1, 2, 3]),
    box: { x: 10, y: 20, width: 40, height: 20 },
    aspectRatio: 2,
    pageIndices: [0],
    ...overrides,
  };
}

describe("addPlacedSignature — append inmutable (R1)", () => {
  it("devuelve una lista nueva length+1 sin mutar la entrada", () => {
    const list: PlacedSignature[] = [makeSig({ id: "a" })];
    const sig = makeSig({ id: "b" });
    const next = addPlacedSignature(list, sig);
    expect(next).toHaveLength(2);
    expect(next[next.length - 1]).toBe(sig);
    expect(next).not.toBe(list);
    // La lista original no se muta.
    expect(list).toHaveLength(1);
    expect(list.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("updatePlacedSignatureBox — solo la entrada del id (R2)", () => {
  it("cambia la box de ese id y deja el resto y la lista intactos", () => {
    const a = makeSig({ id: "a", box: { x: 0, y: 0, width: 10, height: 5 } });
    const b = makeSig({ id: "b", box: { x: 1, y: 1, width: 20, height: 10 } });
    const list: PlacedSignature[] = [a, b];
    const newBox: FreePlacement = { x: 99, y: 88, width: 30, height: 15 };
    const next = updatePlacedSignatureBox(list, "b", newBox);

    expect(next).not.toBe(list);
    expect(next[0]).toBe(a); // la no afectada conserva su referencia
    expect(next[1].box).toEqual(newBox);
    expect(next[1].id).toBe("b");
    // La entrada original de b no se muta.
    expect(b.box).toEqual({ x: 1, y: 1, width: 20, height: 10 });
  });

  it("no cambia nada si el id no existe", () => {
    const list: PlacedSignature[] = [makeSig({ id: "a" })];
    const next = updatePlacedSignatureBox(list, "zzz", {
      x: 5,
      y: 5,
      width: 5,
      height: 5,
    });
    expect(next.map((s) => s.box)).toEqual(list.map((s) => s.box));
  });
});

describe("updatePlacedSignaturePages — solo la entrada del id (R3)", () => {
  it("cambia pageIndices de ese id y deja el resto y la lista intactos", () => {
    const a = makeSig({ id: "a", pageIndices: [0] });
    const b = makeSig({ id: "b", pageIndices: [1] });
    const list: PlacedSignature[] = [a, b];
    const next = updatePlacedSignaturePages(list, "a", [0, 2, 3]);

    expect(next).not.toBe(list);
    expect(next[0].pageIndices).toEqual([0, 2, 3]);
    expect(next[1]).toBe(b);
    // La entrada original de a no se muta.
    expect(a.pageIndices).toEqual([0]);
  });
});

describe("removePlacedSignature — filtra por id inmutable (R4)", () => {
  it("quita solo el id indicado, resto intacto, sin mutar la lista", () => {
    const a = makeSig({ id: "a" });
    const b = makeSig({ id: "b" });
    const c = makeSig({ id: "c" });
    const list: PlacedSignature[] = [a, b, c];
    const next = removePlacedSignature(list, "b");

    expect(next).not.toBe(list);
    expect(next.map((s) => s.id)).toEqual(["a", "c"]);
    expect(next[0]).toBe(a);
    expect(next[1]).toBe(c);
    // Original intacta.
    expect(list.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("findSignatureAt — topmost o null (R5)", () => {
  it("devuelve el id de la ÚLTIMA caja que contiene el punto (superior)", () => {
    // Dos firmas solapadas: 'top' se dibuja después, así que gana en (15,25).
    const bottom = makeSig({
      id: "bottom",
      box: { x: 0, y: 0, width: 100, height: 100 },
    });
    const top = makeSig({
      id: "top",
      box: { x: 10, y: 10, width: 30, height: 30 },
    });
    const list: PlacedSignature[] = [bottom, top];
    expect(findSignatureAt(list, { x: 15, y: 25 })).toBe("top");
    // Punto solo dentro de la inferior.
    expect(findSignatureAt(list, { x: 80, y: 80 })).toBe("bottom");
  });

  it("devuelve null si ninguna caja contiene el punto", () => {
    const list: PlacedSignature[] = [
      makeSig({ id: "a", box: { x: 0, y: 0, width: 10, height: 10 } }),
    ];
    expect(findSignatureAt(list, { x: 500, y: 500 })).toBeNull();
    expect(findSignatureAt([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("buildPlacedSignatureAnnotations — geometría y datos (R7)", () => {
  it("por firma/página emite una image con at/width/height de su box y data de su image", () => {
    const image = new Uint8Array([7, 7, 7]);
    const list: PlacedSignature[] = [
      makeSig({
        id: "s",
        image,
        box: { x: 11, y: 22, width: 44, height: 22 },
        pageIndices: [0],
      }),
    ];
    const anns = buildPlacedSignatureAnnotations(list, (sid, p, part) =>
      `${sid}-${String(p)}-${part}`,
    );
    const images = anns.filter((a) => a.kind === "image");
    expect(images).toHaveLength(1);
    const img = images[0];
    if (img.kind === "image") {
      expect(img.at).toEqual({ x: 11, y: 22 });
      expect(img.width).toBe(44);
      expect(img.height).toBe(22);
      expect(img.data).toBe(image);
    }
  });
});

describe("buildPlacedSignatureAnnotations — cajas distintas → anotaciones correspondientes (R8)", () => {
  it("cada anotación imagen corresponde a la box/imagen de SU firma (no mera desigualdad)", () => {
    const imageA = new Uint8Array([0xa]);
    const imageB = new Uint8Array([0xb]);
    const sigA = makeSig({
      id: "A",
      image: imageA,
      box: { x: 5, y: 5, width: 40, height: 20 },
      pageIndices: [0],
    });
    const sigB = makeSig({
      id: "B",
      image: imageB,
      box: { x: 300, y: 400, width: 120, height: 60 },
      pageIndices: [0],
    });
    const list: PlacedSignature[] = [sigA, sigB];

    const anns = buildPlacedSignatureAnnotations(list, (sid, p, part) =>
      `${sid}-${String(p)}-${part}`,
    );
    const images = anns.filter((a) => a.kind === "image");
    expect(images).toHaveLength(2);

    // Correspondencia caja_i ↔ anotación_i ↔ imagen_i: cada firma tiene EXACTA-
    // MENTE una anotación imagen cuya geometría y bytes son los de esa firma.
    for (const sig of [sigA, sigB]) {
      const match = images.filter(
        (a) =>
          a.kind === "image" &&
          a.at.x === sig.box.x &&
          a.at.y === sig.box.y &&
          a.width === sig.box.width &&
          a.height === sig.box.height &&
          a.data === sig.image,
      );
      expect(match).toHaveLength(1);
    }

    // Y las geometrías son efectivamente distintas entre firmas.
    const a0 = images[0];
    const a1 = images[1];
    if (a0.kind === "image" && a1.kind === "image") {
      expect(a0.at).not.toEqual(a1.at);
      expect(a0.width).not.toBe(a1.width);
    }
  });
});

describe("buildPlacedSignatureAnnotations — N páginas (R9)", () => {
  it("una firma con pageIndices de N emite N anotaciones imagen, una por pageIndex", () => {
    const list: PlacedSignature[] = [
      makeSig({ id: "s", pageIndices: [0, 2, 4] }),
    ];
    const anns = buildPlacedSignatureAnnotations(list, (sid, p, part) =>
      `${sid}-${String(p)}-${part}`,
    );
    const images = anns.filter((a) => a.kind === "image");
    expect(images).toHaveLength(3);
    expect(images.map((a) => a.pageIndex)).toEqual([0, 2, 4]);
  });
});

describe("buildPlacedSignatureAnnotations — extras (R10)", () => {
  it("por página y extra emite un text con text/at/fontSize/color de ese extra", () => {
    const extras: SignatureExtra[] = [
      {
        id: "date",
        kind: "date",
        text: "2026-07-07",
        at: { x: 5, y: 6 },
        fontSize: 12,
        color: { r: 0, g: 0, b: 0 },
      },
    ];
    const list: PlacedSignature[] = [
      makeSig({ id: "s", pageIndices: [1, 3], extras }),
    ];
    const anns = buildPlacedSignatureAnnotations(list, (sid, p, part) =>
      `${sid}-${String(p)}-${part}`,
    );
    const texts = anns.filter((a) => a.kind === "text");
    // Un text por página (2) y por extra (1) → 2.
    expect(texts).toHaveLength(2);
    for (const pageIndex of [1, 3]) {
      const match = texts.find(
        (a) => a.pageIndex === pageIndex && a.kind === "text",
      );
      expect(match).toBeDefined();
      if (match?.kind === "text") {
        expect(match.text).toBe("2026-07-07");
        expect(match.at).toEqual({ x: 5, y: 6 });
        expect(match.fontSize).toBe(12);
        expect(match.color).toEqual({ r: 0, g: 0, b: 0 });
      }
    }
  });
});
