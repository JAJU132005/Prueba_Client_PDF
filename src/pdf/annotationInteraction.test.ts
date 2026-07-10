import { describe, expect, it } from "vitest";

import {
  buildDrawOps,
  canvasPointToPdf,
  pdfPointToCanvas,
  type FreehandAnnotation,
  type ImageAnnotation,
  type LineAnnotation,
  type RectAnnotation,
  type TextAnnotation,
} from "@/pdf/annotate";
import {
  DEFAULT_TOOL_SETTINGS,
  MIN_DRAG_DISTANCE_PTS,
  MIN_FONT_SIZE_PTS,
  MIN_SIZE_PTS,
  annotationBounds,
  beginDraft,
  commitDraft,
  createImageAnnotation,
  createTextAnnotation,
  handlesFor,
  hitTest,
  moveAnnotation,
  normalizedRect,
  resizeAnnotation,
  updateAnnotationText,
  updateDraft,
  type ToolSettings,
} from "@/pdf/annotationInteraction";

const SETTINGS: ToolSettings = {
  color: { r: 0.1, g: 0.2, b: 0.3 },
  fontSize: 20,
  thickness: 4,
  highlightOpacity: 0.5,
};

/** Simula un arrastre: begin + una serie de updateDraft por cada punto. */
function drag(
  tool: "line" | "rect" | "highlight" | "freehand",
  points: { x: number; y: number }[],
) {
  let draft = beginDraft(tool, points[0]);
  for (let i = 1; i < points.length; i++) {
    draft = updateDraft(draft, points[i]);
  }
  return draft;
}

// --- T6: creación por arrastre (R2, R10, R11, R12, R13, R15, R34) ---
describe("commitDraft — creación por arrastre (R10, R11, R12, R13, R15, R2)", () => {
  it("línea usa el start y end reales del arrastre (R12)", () => {
    const draft = drag("line", [
      { x: 10, y: 10 },
      { x: 50, y: 80 },
    ]);
    const a = commitDraft(draft, 1, "l1", SETTINGS) as LineAnnotation;
    expect(a.kind).toBe("line");
    expect(a.start).toEqual({ x: 10, y: 10 });
    expect(a.end).toEqual({ x: 50, y: 80 });
    expect(a.thickness).toBe(SETTINGS.thickness);
    expect(a.color).toEqual(SETTINGS.color);
    expect(a.pageIndex).toBe(1);
  });

  it("rect y resaltado se normalizan en las 4 direcciones de arrastre (R13)", () => {
    const corners = [
      { x: 20, y: 20 },
      { x: 60, y: 90 },
    ];
    const directions: [{ x: number; y: number }, { x: number; y: number }][] = [
      [corners[0], corners[1]], // SE
      [corners[1], corners[0]], // NW
      [
        { x: 60, y: 20 },
        { x: 20, y: 90 },
      ], // SW
      [
        { x: 20, y: 90 },
        { x: 60, y: 20 },
      ], // NE
    ];
    for (const [from, to] of directions) {
      const rect = commitDraft(
        drag("rect", [from, to]),
        0,
        "r",
        SETTINGS,
      ) as RectAnnotation;
      expect(rect.at).toEqual({ x: 20, y: 20 });
      expect(rect.width).toBe(40);
      expect(rect.height).toBe(70);

      const hl = commitDraft(drag("highlight", [from, to]), 0, "h", SETTINGS);
      expect(hl?.kind).toBe("highlight");
      if (hl?.kind === "highlight") {
        expect(hl.at).toEqual({ x: 20, y: 20 });
        expect(hl.width).toBe(40);
        expect(hl.height).toBe(70);
        expect(hl.opacity).toBe(SETTINGS.highlightOpacity);
      }
    }
  });

  it("forma con desplazamiento bajo el umbral no se registra (R15)", () => {
    const tiny = MIN_DRAG_DISTANCE_PTS / 2;
    const draft = drag("rect", [
      { x: 5, y: 5 },
      { x: 5 + tiny, y: 5 },
    ]);
    expect(commitDraft(draft, 0, "r", SETTINGS)).toBeNull();
  });

  it("freehand conserva EXACTAMENTE los puntos capturados (R10)", () => {
    const pts = [
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 7, y: 3 },
      { x: 9, y: 9 },
    ];
    const a = commitDraft(
      drag("freehand", pts),
      2,
      "f1",
      SETTINGS,
    ) as FreehandAnnotation;
    expect(a.kind).toBe("freehand");
    expect(a.points).toEqual(pts);
    expect(a.thickness).toBe(SETTINGS.thickness);
    expect(a.color).toEqual(SETTINGS.color);
  });

  it("freehand con menos de 2 puntos no se registra (R11)", () => {
    const draft = beginDraft("freehand", { x: 3, y: 3 });
    expect(commitDraft(draft, 0, "f", SETTINGS)).toBeNull();
  });

  it("aplica los ajustes activos a la anotación creada (R2)", () => {
    const line = commitDraft(
      drag("line", [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ]),
      0,
      "l",
      SETTINGS,
    ) as LineAnnotation;
    expect(line.color).toEqual(SETTINGS.color);
    expect(line.thickness).toBe(4);
  });

  it("normalizedRect coloca `at` en la esquina inferior-izquierda (R13)", () => {
    expect(normalizedRect({ x: 8, y: 9 }, { x: 2, y: 3 })).toEqual({
      at: { x: 2, y: 3 },
      width: 6,
      height: 6,
    });
  });
});

// --- T7: texto real editable (R4, R5, R6, R7) ---
describe("texto — contenido real (R4, R5, R6, R7)", () => {
  it("createTextAnnotation registra la cadena EXACTA (R4, R6)", () => {
    const a = createTextAnnotation(
      "t1",
      1,
      { x: 5, y: 6 },
      "Hola mundo",
      SETTINGS,
    );
    expect(a).not.toBeNull();
    expect(a?.text).toBe("Hola mundo");
    expect(a?.text).not.toBe("Texto");
    expect(a?.fontSize).toBe(SETTINGS.fontSize);
    expect(a?.at).toEqual({ x: 5, y: 6 });
  });

  it("texto vacío o de solo espacios no se registra (R5)", () => {
    expect(createTextAnnotation("t", 0, { x: 0, y: 0 }, "", SETTINGS)).toBeNull();
    expect(
      createTextAnnotation("t", 0, { x: 0, y: 0 }, "   \t ", SETTINGS),
    ).toBeNull();
  });

  it("updateAnnotationText conserva id/página/ancla y solo cambia la cadena (R7)", () => {
    const original = createTextAnnotation(
      "t1",
      3,
      { x: 9, y: 12 },
      "antes",
      SETTINGS,
    ) as TextAnnotation;
    const edited = updateAnnotationText(original, "después");
    expect(edited.text).toBe("después");
    expect(edited.id).toBe("t1");
    expect(edited.pageIndex).toBe(3);
    expect(edited.at).toEqual({ x: 9, y: 12 });
    // Inmutable: no muta el original.
    expect(original.text).toBe("antes");
  });

  it("ninguna ruta del modelo de creación produce el literal 'Texto' (R6)", () => {
    const ann = createTextAnnotation(
      "t",
      0,
      { x: 0, y: 0 },
      "cualquiera",
      DEFAULT_TOOL_SETTINGS,
    );
    expect(ann?.text).not.toBe("Texto");
  });

  it("createImageAnnotation ancla el punto pulsado como esquina superior (R16)", () => {
    const data = new Uint8Array([1, 2, 3]);
    const img = createImageAnnotation("i1", 2, { x: 30, y: 200 }, data);
    expect(img.kind).toBe("image");
    if (img.kind === "image") {
      expect(img.at.x).toBe(30);
      expect(img.at.y).toBeLessThan(200);
      expect(img.data).toBe(data);
    }
  });
});

// --- T8: hit-test, mover, redimensionar, clamps, inmutabilidad ---
describe("edición — hitTest / move / resize (R17, R19..R24, R34, R35)", () => {
  const rect: RectAnnotation = {
    id: "rect",
    pageIndex: 0,
    kind: "rect",
    at: { x: 10, y: 10 },
    width: 40,
    height: 20,
    color: { r: 0, g: 0, b: 0 },
    thickness: 2,
  };

  it("hitTest acierta dentro y falla fuera (R17)", () => {
    expect(hitTest([rect], { x: 30, y: 20 })?.id).toBe("rect");
    expect(hitTest([rect], { x: 200, y: 200 })).toBeNull();
  });

  it("hitTest resuelve solapes a favor de la más reciente (R17)", () => {
    const older: RectAnnotation = { ...rect, id: "older" };
    const newer: RectAnnotation = { ...rect, id: "newer" };
    expect(hitTest([older, newer], { x: 20, y: 15 })?.id).toBe("newer");
  });

  it("moveAnnotation traslada ancla/extremos/puntos (R19, R35)", () => {
    const movedRect = moveAnnotation(rect, 5, -3);
    expect(movedRect.kind === "rect" && movedRect.at).toEqual({ x: 15, y: 7 });
    expect(rect.at).toEqual({ x: 10, y: 10 }); // no muta

    const line: LineAnnotation = {
      id: "l",
      pageIndex: 0,
      kind: "line",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
      color: { r: 0, g: 0, b: 0 },
      thickness: 1,
    };
    const movedLine = moveAnnotation(line, 2, 2);
    if (movedLine.kind === "line") {
      expect(movedLine.start).toEqual({ x: 2, y: 2 });
      expect(movedLine.end).toEqual({ x: 12, y: 12 });
    }

    const free: FreehandAnnotation = {
      id: "f",
      pageIndex: 0,
      kind: "freehand",
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 6 },
      ],
      color: { r: 0, g: 0, b: 0 },
      thickness: 1,
    };
    const movedFree = moveAnnotation(free, 1, 1);
    if (movedFree.kind === "freehand") {
      expect(movedFree.points).toEqual([
        { x: 1, y: 1 },
        { x: 5, y: 7 },
      ]);
    }
  });

  it("resize de caja sigue al tirador con la esquina opuesta fija (R20)", () => {
    // Arrastrar la esquina 'ne' (arriba-derecha) a (70, 60): sw=(10,10) fija.
    const resized = resizeAnnotation(rect, "ne", { x: 70, y: 60 });
    if (resized.kind === "rect") {
      expect(resized.at).toEqual({ x: 10, y: 10 });
      expect(resized.width).toBe(60);
      expect(resized.height).toBe(50);
    }
    expect(rect.width).toBe(40); // no muta (R35)
  });

  it("resize de línea mueve solo el extremo arrastrado (R21)", () => {
    const line: LineAnnotation = {
      id: "l",
      pageIndex: 0,
      kind: "line",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      color: { r: 0, g: 0, b: 0 },
      thickness: 1,
    };
    const resized = resizeAnnotation(line, "end", { x: 20, y: 5 });
    if (resized.kind === "line") {
      expect(resized.start).toEqual({ x: 0, y: 0 });
      expect(resized.end).toEqual({ x: 20, y: 5 });
    }
    expect(handlesFor(line)).toEqual(["start", "end"]);
  });

  it("resize de freehand escala proporcional respecto a su bbox (R22)", () => {
    const free: FreehandAnnotation = {
      id: "f",
      pageIndex: 0,
      kind: "freehand",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ],
      color: { r: 0, g: 0, b: 0 },
      thickness: 1,
    };
    // bbox 10×20, esquina opuesta a 'ne' es sw=(0,0). Doblamos a 20×40.
    const resized = resizeAnnotation(free, "ne", { x: 20, y: 40 });
    if (resized.kind === "freehand") {
      expect(resized.points).toEqual([
        { x: 0, y: 0 },
        { x: 20, y: 40 },
      ]);
    }
  });

  it("resize de texto ajusta fontSize al nuevo alto de su bbox (R23)", () => {
    const text: TextAnnotation = {
      id: "t",
      pageIndex: 0,
      kind: "text",
      at: { x: 0, y: 0 },
      text: "abc",
      fontSize: 10,
      color: { r: 0, g: 0, b: 0 },
    };
    // bbox alto = fontSize = 10, bottom en y=0. Arrastramos 'ne' (arriba) a y=30.
    const resized = resizeAnnotation(text, "ne", { x: 50, y: 30 });
    if (resized.kind === "text") {
      expect(resized.fontSize).toBe(30);
    }
  });

  it("clamps: ancho/alto y fontSize no bajan de sus mínimos (R24)", () => {
    const smallRect = resizeAnnotation(rect, "ne", { x: 11, y: 11 });
    if (smallRect.kind === "rect") {
      expect(smallRect.width).toBeGreaterThanOrEqual(MIN_SIZE_PTS);
      expect(smallRect.height).toBeGreaterThanOrEqual(MIN_SIZE_PTS);
    }
    const text: TextAnnotation = {
      id: "t",
      pageIndex: 0,
      kind: "text",
      at: { x: 0, y: 0 },
      text: "abc",
      fontSize: 10,
      color: { r: 0, g: 0, b: 0 },
    };
    const tiny = resizeAnnotation(text, "ne", { x: 5, y: 1 });
    if (tiny.kind === "text") {
      expect(tiny.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PTS);
    }
  });
});

// --- T9: paridad geometría editor↔PDF (R28, R29) ---
describe("paridad geometría editor↔PDF (R28, R29)", () => {
  it("annotationBounds y buildDrawOps describen la misma geometría por tipo", () => {
    const rect: RectAnnotation = {
      id: "r",
      pageIndex: 0,
      kind: "rect",
      at: { x: 10, y: 20 },
      width: 30,
      height: 40,
      color: { r: 0, g: 0, b: 0 },
      thickness: 1,
    };
    const rectOp = buildDrawOps(rect)[0];
    const rectBounds = annotationBounds(rect);
    if (rectOp.op === "rect") {
      expect({ x: rectOp.x, y: rectOp.y }).toEqual(rectBounds.at);
      expect(rectOp.width).toBe(rectBounds.width);
      expect(rectOp.height).toBe(rectBounds.height);
    }

    const line: LineAnnotation = {
      id: "l",
      pageIndex: 0,
      kind: "line",
      start: { x: 5, y: 60 },
      end: { x: 45, y: 20 },
      color: { r: 0, g: 0, b: 0 },
      thickness: 1,
    };
    const lineOp = buildDrawOps(line)[0];
    const lineBounds = annotationBounds(line);
    if (lineOp.op === "line") {
      // Los extremos del DrawOp caen en las esquinas opuestas del bbox.
      const minX = Math.min(lineOp.x1, lineOp.x2);
      const minY = Math.min(lineOp.y1, lineOp.y2);
      expect({ x: minX, y: minY }).toEqual(lineBounds.at);
      expect(Math.abs(lineOp.x2 - lineOp.x1)).toBe(lineBounds.width);
      expect(Math.abs(lineOp.y2 - lineOp.y1)).toBe(lineBounds.height);
    }

    const img: ImageAnnotation = {
      id: "i",
      pageIndex: 0,
      kind: "image",
      at: { x: 1, y: 2 },
      width: 50,
      height: 60,
      data: new Uint8Array([1]),
    };
    const imgOp = buildDrawOps(img)[0];
    const imgBounds = annotationBounds(img);
    if (imgOp.op === "image") {
      expect({ x: imgOp.x, y: imgOp.y }).toEqual(imgBounds.at);
      expect(imgOp.width).toBe(imgBounds.width);
      expect(imgOp.height).toBe(imgBounds.height);
    }
  });

  it("canvasPointToPdf ∘ pdfPointToCanvas = identidad para las escalas del editor", () => {
    const pageHeightPts = 200;
    for (const scale of [1, 1.5, 2, 0.75]) {
      const point = { x: 37.5, y: 128.25 };
      const px = pdfPointToCanvas(point, pageHeightPts, scale);
      const back = canvasPointToPdf(px.left, px.top, pageHeightPts, scale);
      expect(back.x).toBeCloseTo(point.x, 10);
      expect(back.y).toBeCloseTo(point.y, 10);
    }
  });
});
