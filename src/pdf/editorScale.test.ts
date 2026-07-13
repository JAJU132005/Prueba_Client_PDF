import { describe, expect, it } from "vitest";

import { deriveEditorGeometry } from "@/pdf/editorScale";

describe("deriveEditorGeometry (#35)", () => {
  it("con tamaño natural conocido deriva la escala real (< 1) y el alto real (R1, R3)", () => {
    // Página real de 200×400 pts (renderScale 1) mostrada a la mitad (100×200 px).
    const geometry = deriveEditorGeometry({
      naturalWidth: 200,
      naturalHeight: 400,
      displayedWidth: 100,
      displayedHeight: 200,
      renderScale: 1,
    });
    expect(geometry).not.toBeNull();
    expect(geometry?.pageWidthPts).toBe(200);
    expect(geometry?.pageHeightPts).toBe(400); // alto REAL, no el mostrado
    expect(geometry?.scale).toBe(0.5); // px mostrados por punto PDF
  });

  it("respeta renderScale > 1 al derivar puntos y escala (R1, R3)", () => {
    // Rasterizado a 2x: natural 400×800 px = página 200×400 pts; mostrada 200×400.
    const geometry = deriveEditorGeometry({
      naturalWidth: 400,
      naturalHeight: 800,
      displayedWidth: 200,
      displayedHeight: 400,
      renderScale: 2,
    });
    expect(geometry?.pageWidthPts).toBe(200);
    expect(geometry?.pageHeightPts).toBe(400);
    expect(geometry?.scale).toBe(1); // 200 px mostrados / 200 pts = 1
  });

  it("sin tamaño natural usa el fallback legacy (scale = renderScale) (R1, R3)", () => {
    const geometry = deriveEditorGeometry({
      naturalWidth: 0,
      naturalHeight: 0,
      displayedWidth: 100,
      displayedHeight: 200,
      renderScale: 1,
    });
    expect(geometry?.scale).toBe(1);
    expect(geometry?.pageWidthPts).toBe(100);
    expect(geometry?.pageHeightPts).toBe(200);
  });

  it("fallback legacy respeta renderScale cuando falta el tamaño natural", () => {
    const geometry = deriveEditorGeometry({
      naturalWidth: 0,
      naturalHeight: 0,
      displayedWidth: 200,
      displayedHeight: 400,
      renderScale: 2,
    });
    expect(geometry?.scale).toBe(2);
    expect(geometry?.pageWidthPts).toBe(100);
    expect(geometry?.pageHeightPts).toBe(200);
  });

  it("devuelve null cuando falta cualquier medida (aún sin medir)", () => {
    expect(
      deriveEditorGeometry({
        naturalWidth: 200,
        naturalHeight: 400,
        displayedWidth: 0,
        displayedHeight: 200,
        renderScale: 1,
      }),
    ).toBeNull();
    expect(
      deriveEditorGeometry({
        naturalWidth: 200,
        naturalHeight: 400,
        displayedWidth: 100,
        displayedHeight: 0,
        renderScale: 1,
      }),
    ).toBeNull();
    expect(
      deriveEditorGeometry({
        naturalWidth: 200,
        naturalHeight: 400,
        displayedWidth: 100,
        displayedHeight: 200,
        renderScale: 0,
      }),
    ).toBeNull();
  });
});
