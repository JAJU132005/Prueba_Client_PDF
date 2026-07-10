/**
 * Modelo de interacción PURO del editor de anotaciones (#29): borradores de
 * gesto (arrastre en curso → anotación confirmada o descartada), creación de
 * texto/imagen, prueba de impacto (hit-test), traslado, redimensionado con
 * clamps y edición de texto. Todo opera sobre los tipos `Annotation` de
 * `annotate.ts` en PUNTOS PDF (origen inferior-izquierdo).
 *
 * Sin React, sin DOM, sin pdf-lib: es el núcleo testeable aparte del canvas que
 * exige el acceptance A8. Toda función devuelve valores NUEVOS sin mutar la
 * entrada. (R34, R35)
 */

import type {
  Annotation,
  AnnotationColor,
  PdfPoint,
  TextAnnotation,
} from "@/pdf/annotate";

/** Ajustes de estilo activos para la SIGUIENTE anotación creada. (R1, R2) */
export interface ToolSettings {
  color: AnnotationColor;
  fontSize: number;
  thickness: number;
  highlightOpacity: number;
}

/** Ajustes por defecto (color negro, tamaños del editor de #23). */
export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  color: { r: 0, g: 0, b: 0 },
  fontSize: 16,
  thickness: 1.5,
  highlightOpacity: 0.4,
};

/** Desplazamiento mínimo (en pts PDF) para que un arrastre cree una forma. (R15) */
export const MIN_DRAG_DISTANCE_PTS = 3;
/** Ancho/alto mínimo (en pts PDF) tras redimensionar cajas/imágenes/trazos. (R24) */
export const MIN_SIZE_PTS = 8;
/** Tamaño de fuente mínimo (en pts PDF) tras redimensionar texto. (R24) */
export const MIN_FONT_SIZE_PTS = 6;
/** Tamaño por defecto de una anotación de imagen recién colocada. (R16) */
export const DEFAULT_IMAGE_SIZE_PTS: { width: number; height: number } = {
  width: 120,
  height: 120,
};

/** Borrador de gesto de creación en curso (forma dimensionada o trazo). (R9, R14) */
export type Draft =
  | {
      kind: "shape";
      tool: "line" | "rect" | "highlight";
      start: PdfPoint;
      current: PdfPoint;
    }
  | { kind: "freehand"; points: readonly PdfPoint[] };

/** Inicia un borrador de gesto anclado en `at`. (R9, R14) */
export function beginDraft(
  tool: "line" | "rect" | "highlight" | "freehand",
  at: PdfPoint,
): Draft {
  if (tool === "freehand") {
    return { kind: "freehand", points: [{ x: at.x, y: at.y }] };
  }
  return {
    kind: "shape",
    tool,
    start: { x: at.x, y: at.y },
    current: { x: at.x, y: at.y },
  };
}

/** Extiende el borrador con el punto actual del puntero (inmutable). (R8, R35) */
export function updateDraft(draft: Draft, at: PdfPoint): Draft {
  if (draft.kind === "freehand") {
    return { kind: "freehand", points: [...draft.points, { x: at.x, y: at.y }] };
  }
  return {
    kind: "shape",
    tool: draft.tool,
    start: draft.start,
    current: { x: at.x, y: at.y },
  };
}

/** Rectángulo normalizado entre dos puntos PDF (`at` = esquina inferior-izq.). (R13) */
export function normalizedRect(
  a: PdfPoint,
  b: PdfPoint,
): { at: PdfPoint; width: number; height: number } {
  return {
    at: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Confirma el borrador como anotación, o `null` si no supera el umbral:
 * `< MIN_DRAG_DISTANCE_PTS` para formas, `< 2` puntos para freehand.
 * (R10, R11, R12, R13, R15)
 */
export function commitDraft(
  draft: Draft,
  pageIndex: number,
  id: string,
  settings: ToolSettings,
): Annotation | null {
  if (draft.kind === "freehand") {
    if (draft.points.length < 2) {
      return null; // (R11)
    }
    return {
      id,
      pageIndex,
      kind: "freehand",
      points: draft.points.map((p) => ({ x: p.x, y: p.y })), // (R10)
      color: settings.color,
      thickness: settings.thickness,
    };
  }

  const distance = Math.hypot(
    draft.current.x - draft.start.x,
    draft.current.y - draft.start.y,
  );
  if (distance < MIN_DRAG_DISTANCE_PTS) {
    return null; // (R15)
  }

  if (draft.tool === "line") {
    return {
      id,
      pageIndex,
      kind: "line",
      start: { x: draft.start.x, y: draft.start.y }, // (R12)
      end: { x: draft.current.x, y: draft.current.y },
      color: settings.color,
      thickness: settings.thickness,
    };
  }

  const { at, width, height } = normalizedRect(draft.start, draft.current); // (R13)
  if (draft.tool === "rect") {
    return {
      id,
      pageIndex,
      kind: "rect",
      at,
      width,
      height,
      color: settings.color,
      thickness: settings.thickness,
    };
  }
  return {
    id,
    pageIndex,
    kind: "highlight",
    at,
    width,
    height,
    color: settings.color,
    opacity: settings.highlightOpacity,
  };
}

/** Crea una anotación de texto, o `null` si el contenido es vacío/espacios. (R4, R5, R6) */
export function createTextAnnotation(
  id: string,
  pageIndex: number,
  at: PdfPoint,
  text: string,
  settings: ToolSettings,
): TextAnnotation | null {
  if (text.trim() === "") {
    return null; // (R5)
  }
  return {
    id,
    pageIndex,
    kind: "text",
    at: { x: at.x, y: at.y },
    text, // (R4, R6): la cadena EXACTA introducida, nunca un literal fijo.
    fontSize: settings.fontSize,
    color: settings.color,
  };
}

/** Reemplaza la cadena conservando id/página/ancla/estilo (inmutable). (R7, R35) */
export function updateAnnotationText(
  annotation: TextAnnotation,
  text: string,
): TextAnnotation {
  return { ...annotation, text };
}

/** Crea una anotación de imagen anclada en `at` con su tamaño por defecto. (R16) */
export function createImageAnnotation(
  id: string,
  pageIndex: number,
  at: PdfPoint,
  data: Uint8Array,
): Annotation {
  return {
    id,
    pageIndex,
    kind: "image",
    // El punto pulsado se toma como esquina superior-izquierda: en pts PDF la
    // esquina inferior-izquierda (`at`) queda `height` por debajo.
    at: { x: at.x, y: at.y - DEFAULT_IMAGE_SIZE_PTS.height },
    width: DEFAULT_IMAGE_SIZE_PTS.width,
    height: DEFAULT_IMAGE_SIZE_PTS.height,
    data,
  };
}

/** Tamaño aproximado del texto en pts PDF (reubica `approxTextWidth` de la ruta). */
export function approxTextSize(
  text: string,
  fontSize: number,
): { width: number; height: number } {
  return { width: text.length * fontSize * 0.6, height: fontSize };
}

/** Caja delimitadora en puntos PDF (`at` = esquina inferior-izq.). (R17, R18, R27) */
export function annotationBounds(
  annotation: Annotation,
): { at: PdfPoint; width: number; height: number } {
  switch (annotation.kind) {
    case "text": {
      const size = approxTextSize(annotation.text, annotation.fontSize);
      return {
        at: { x: annotation.at.x, y: annotation.at.y },
        width: size.width,
        height: annotation.fontSize,
      };
    }
    case "highlight":
    case "rect":
    case "image":
      return {
        at: { x: annotation.at.x, y: annotation.at.y },
        width: annotation.width,
        height: annotation.height,
      };
    case "line": {
      const x = Math.min(annotation.start.x, annotation.end.x);
      const y = Math.min(annotation.start.y, annotation.end.y);
      return {
        at: { x, y },
        width: Math.abs(annotation.end.x - annotation.start.x),
        height: Math.abs(annotation.end.y - annotation.start.y),
      };
    }
    case "freehand": {
      const xs = annotation.points.map((p) => p.x);
      const ys = annotation.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        at: { x: minX, y: minY },
        width: Math.max(...xs) - minX,
        height: Math.max(...ys) - minY,
      };
    }
  }
}

/** Distancia de un punto al segmento `a→b` (en pts PDF). */
function pointSegmentDistance(p: PdfPoint, a: PdfPoint, b: PdfPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** `true` si la geometría de `annotation` contiene `point` (con tolerancia). */
function containsPoint(
  annotation: Annotation,
  point: PdfPoint,
  tolerance: number,
): boolean {
  if (annotation.kind === "line") {
    return (
      pointSegmentDistance(point, annotation.start, annotation.end) <= tolerance
    );
  }
  if (annotation.kind === "freehand") {
    for (let i = 0; i + 1 < annotation.points.length; i++) {
      if (
        pointSegmentDistance(
          point,
          annotation.points[i],
          annotation.points[i + 1],
        ) <= tolerance
      ) {
        return true;
      }
    }
    return false;
  }
  const b = annotationBounds(annotation);
  return (
    point.x >= b.at.x - tolerance &&
    point.x <= b.at.x + b.width + tolerance &&
    point.y >= b.at.y - tolerance &&
    point.y <= b.at.y + b.height + tolerance
  );
}

/**
 * Última anotación (más reciente primero) cuya geometría contiene `point`, o
 * `null`. Resuelve solapes a favor de la más recientemente creada. (R17)
 */
export function hitTest(
  annotations: readonly Annotation[],
  point: PdfPoint,
  tolerancePts = 4,
): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (containsPoint(annotations[i], point, tolerancePts)) {
      return annotations[i];
    }
  }
  return null;
}

/** Traslada TODA la geometría por `(dx, dy)` (inmutable). (R19, R35) */
export function moveAnnotation(
  annotation: Annotation,
  dx: number,
  dy: number,
): Annotation {
  switch (annotation.kind) {
    case "text":
    case "highlight":
    case "rect":
    case "image":
      return {
        ...annotation,
        at: { x: annotation.at.x + dx, y: annotation.at.y + dy },
      };
    case "line":
      return {
        ...annotation,
        start: { x: annotation.start.x + dx, y: annotation.start.y + dy },
        end: { x: annotation.end.x + dx, y: annotation.end.y + dy },
      };
    case "freehand":
      return {
        ...annotation,
        points: annotation.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
  }
}

/** Tiradores: extremos para línea; esquinas para el resto. (R18) */
export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "start" | "end";

/** Tiradores disponibles de una anotación. (R18) */
export function handlesFor(annotation: Annotation): readonly ResizeHandle[] {
  if (annotation.kind === "line") {
    return ["start", "end"];
  }
  return ["nw", "ne", "sw", "se"];
}

type Corner = "nw" | "ne" | "sw" | "se";

const OPPOSITE_CORNER: Record<Corner, Corner> = {
  nw: "se",
  ne: "sw",
  sw: "ne",
  se: "nw",
};

/** Coordenadas PDF de las 4 esquinas de una caja (y-arriba: `n`=alto). */
function boxCorners(box: {
  at: PdfPoint;
  width: number;
  height: number;
}): Record<Corner, PdfPoint> {
  return {
    sw: { x: box.at.x, y: box.at.y },
    se: { x: box.at.x + box.width, y: box.at.y },
    nw: { x: box.at.x, y: box.at.y + box.height },
    ne: { x: box.at.x + box.width, y: box.at.y + box.height },
  };
}

/** Rect resultante de arrastrar `handle` hasta `to` con la esquina opuesta fija. */
function resizeBox(
  box: { at: PdfPoint; width: number; height: number },
  handle: Corner,
  to: PdfPoint,
  minSize: number,
): { at: PdfPoint; width: number; height: number } {
  const fixed = boxCorners(box)[OPPOSITE_CORNER[handle]];
  const width = Math.max(Math.abs(to.x - fixed.x), minSize);
  const height = Math.max(Math.abs(to.y - fixed.y), minSize);
  const dirX = to.x >= fixed.x ? 1 : -1;
  const dirY = to.y >= fixed.y ? 1 : -1;
  const cornerX = fixed.x + dirX * width;
  const cornerY = fixed.y + dirY * height;
  return {
    at: { x: Math.min(fixed.x, cornerX), y: Math.min(fixed.y, cornerY) },
    width,
    height,
  };
}

/**
 * Redimensiona según el tipo, con clamps a los mínimos (R24):
 * - highlight/rect/image: rect normalizado siguiendo el tirador, esquina
 *   opuesta fija (R20);
 * - line: mueve solo el extremo arrastrado (R21);
 * - freehand: escala proporcional de los puntos respecto a su bbox (R22);
 * - text: fontSize proporcional al nuevo alto de su bbox (R23).
 * Inmutable (R35).
 */
export function resizeAnnotation(
  annotation: Annotation,
  handle: ResizeHandle,
  to: PdfPoint,
): Annotation {
  switch (annotation.kind) {
    case "line": {
      if (handle === "start") {
        return { ...annotation, start: { x: to.x, y: to.y } };
      }
      if (handle === "end") {
        return { ...annotation, end: { x: to.x, y: to.y } };
      }
      return annotation;
    }
    case "highlight":
    case "rect":
    case "image": {
      if (handle === "start" || handle === "end") {
        return annotation;
      }
      const box = annotationBounds(annotation);
      const resized = resizeBox(box, handle, to, MIN_SIZE_PTS);
      return {
        ...annotation,
        at: resized.at,
        width: resized.width,
        height: resized.height,
      };
    }
    case "freehand": {
      if (handle === "start" || handle === "end") {
        return annotation;
      }
      const box = annotationBounds(annotation);
      const fixed = boxCorners(box)[OPPOSITE_CORNER[handle]];
      const newWidth = Math.max(Math.abs(to.x - fixed.x), MIN_SIZE_PTS);
      const newHeight = Math.max(Math.abs(to.y - fixed.y), MIN_SIZE_PTS);
      const sx = box.width === 0 ? 1 : newWidth / box.width;
      const sy = box.height === 0 ? 1 : newHeight / box.height;
      return {
        ...annotation,
        points: annotation.points.map((p) => ({
          x: fixed.x + (p.x - fixed.x) * sx,
          y: fixed.y + (p.y - fixed.y) * sy,
        })),
      };
    }
    case "text": {
      if (handle === "start" || handle === "end") {
        return annotation;
      }
      const box = annotationBounds(annotation);
      const bottomY = box.at.y;
      const topY = box.at.y + box.height;
      const draggingTop = handle === "nw" || handle === "ne";
      const fixedY = draggingTop ? bottomY : topY;
      const newFontSize = Math.max(Math.abs(to.y - fixedY), MIN_FONT_SIZE_PTS); // (R23, R24)
      const newAtY = draggingTop ? bottomY : topY - newFontSize;
      return {
        ...annotation,
        fontSize: newFontSize,
        at: { x: annotation.at.x, y: newAtY },
      };
    }
  }
}
