/**
 * Dominio PURO de la capa de anotaciones (#23). Define el modelo serializable de
 * anotación, la conversión de coordenadas lienzo↔PDF (misma geometría que
 * `previewModel`, origen inferior-izquierdo), la derivación de operaciones de
 * dibujo de pdf-lib como datos puros y el aplanado (`flattenAnnotations`) que
 * dibuja la capa ENCIMA del contenido existente sin reescribir el texto original.
 *
 * Sin React, sin DOM. La única dependencia es pdf-lib (JS puro), como el resto
 * de la capa de dominio (`watermark.ts`, `pageNumbers.ts`, `imagesToPdf.ts`).
 * (R1–R31)
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { detectImageType } from "@/pdf/imagesToPdf";
import {
  AnnotateFailedError,
  InvalidImageError,
  InvalidPdfError,
  type ProgressCallback,
} from "@/pdf/types";

/** Color RGB normalizado en [0,1] (compatible con pdf-lib `rgb()`). */
export interface AnnotationColor {
  r: number;
  g: number;
  b: number;
}

/** Punto en puntos PDF, origen inferior-izquierdo. (R5) */
export interface PdfPoint {
  x: number;
  y: number;
}

/** Campos comunes a toda anotación: identidad y página 0-indexada. (R4, R6) */
export interface BaseAnnotation {
  id: string;
  pageIndex: number;
}

/** Caja de texto. (R7) */
export interface TextAnnotation extends BaseAnnotation {
  kind: "text";
  at: PdfPoint;
  text: string;
  fontSize: number;
  color: AnnotationColor;
}

/** Resaltado rectangular semitransparente. (R8) */
export interface HighlightAnnotation extends BaseAnnotation {
  kind: "highlight";
  at: PdfPoint;
  width: number;
  height: number;
  color: AnnotationColor;
  opacity: number;
}

/** Trazo a mano alzada: secuencia ordenada de puntos. (R9) */
export interface FreehandAnnotation extends BaseAnnotation {
  kind: "freehand";
  points: readonly PdfPoint[];
  color: AnnotationColor;
  thickness: number;
}

/** Línea recta entre dos extremos. (R10) */
export interface LineAnnotation extends BaseAnnotation {
  kind: "line";
  start: PdfPoint;
  end: PdfPoint;
  color: AnnotationColor;
  thickness: number;
}

/** Rectángulo (contorno). (R11) */
export interface RectAnnotation extends BaseAnnotation {
  kind: "rect";
  at: PdfPoint;
  width: number;
  height: number;
  color: AnnotationColor;
  thickness: number;
}

/** Imagen JPG/PNG incrustada. (R12) */
export interface ImageAnnotation extends BaseAnnotation {
  kind: "image";
  at: PdfPoint;
  width: number;
  height: number;
  data: Uint8Array;
}

/** Unión discriminada por `kind`; objeto plano serializable por Comlink. (R4) */
export type Annotation =
  | TextAnnotation
  | HighlightAnnotation
  | FreehandAnnotation
  | LineAnnotation
  | RectAnnotation
  | ImageAnnotation;

/**
 * (R14) Convierte un punto del lienzo `(pxX, pxY)` (origen superior-izquierdo,
 * escala `s > 0`) a un punto PDF con origen inferior-izquierdo sobre una página
 * de altura `pageHeightPts`:
 *   `(pxX / s, pageHeightPts − pxY / s)`.
 */
export function canvasPointToPdf(
  pxX: number,
  pxY: number,
  pageHeightPts: number,
  scale: number,
): PdfPoint {
  return { x: pxX / scale, y: pageHeightPts - pxY / scale };
}

/**
 * (R15) Inversa exacta de `canvasPointToPdf`, derivada de
 * `previewModel.toPreviewPixels` (`left = x·scale`, `top = (height − y)·scale`
 * para un punto de altura 0). Round-trip identidad para todo `s > 0`.
 */
export function pdfPointToCanvas(
  point: PdfPoint,
  pageHeightPts: number,
  scale: number,
): { left: number; top: number } {
  return {
    left: point.x * scale,
    top: (pageHeightPts - point.y) * scale,
  };
}

/**
 * Operación de dibujo de pdf-lib como DATO PURO (sin dibujar). Testeable aparte
 * del canvas: coordenadas/tamaño → parámetros. (R16–R21)
 *
 * Para `rect`: `borderWidth === 0` representa un relleno semitransparente
 * (resaltado, R17); `borderWidth > 0` representa un contorno (rectángulo, R19).
 */
export type DrawOp =
  | {
      op: "text";
      x: number;
      y: number;
      size: number;
      text: string;
      color: AnnotationColor;
    }
  | {
      op: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      color: AnnotationColor;
      opacity: number;
      borderWidth: number;
    }
  | {
      op: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness: number;
      color: AnnotationColor;
    }
  | {
      op: "image";
      x: number;
      y: number;
      width: number;
      height: number;
      ref: number;
    };

/**
 * Deriva las operaciones de dibujo de UNA anotación anclada en su punto/tamaño
 * PDF almacenado. Para imágenes, `imageRef` es el índice del recurso ya
 * incrustado (lo resuelve `flattenAnnotations`); por defecto `0`. (R16–R21)
 */
export function buildDrawOps(
  annotation: Annotation,
  imageRef = 0,
): DrawOp[] {
  switch (annotation.kind) {
    case "text":
      // (R16) Texto anclado en el punto PDF, con tamaño y color de la anotación.
      return [
        {
          op: "text",
          x: annotation.at.x,
          y: annotation.at.y,
          size: annotation.fontSize,
          text: annotation.text,
          color: annotation.color,
        },
      ];
    case "highlight":
      // (R17) Rectángulo relleno con la opacidad de resaltado (borde 0).
      return [
        {
          op: "rect",
          x: annotation.at.x,
          y: annotation.at.y,
          width: annotation.width,
          height: annotation.height,
          color: annotation.color,
          opacity: annotation.opacity,
          borderWidth: 0,
        },
      ];
    case "rect":
      // (R19) Rectángulo de contorno con el grosor de la anotación.
      return [
        {
          op: "rect",
          x: annotation.at.x,
          y: annotation.at.y,
          width: annotation.width,
          height: annotation.height,
          color: annotation.color,
          opacity: 1,
          borderWidth: annotation.thickness,
        },
      ];
    case "line":
      // (R18) Línea entre los dos extremos PDF, con grosor y color.
      return [
        {
          op: "line",
          x1: annotation.start.x,
          y1: annotation.start.y,
          x2: annotation.end.x,
          y2: annotation.end.y,
          thickness: annotation.thickness,
          color: annotation.color,
        },
      ];
    case "freehand": {
      // (R20) Segmentos de línea que unen, en orden, los puntos del trazo.
      const ops: DrawOp[] = [];
      for (let i = 0; i + 1 < annotation.points.length; i++) {
        const a = annotation.points[i];
        const b = annotation.points[i + 1];
        ops.push({
          op: "line",
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          thickness: annotation.thickness,
          color: annotation.color,
        });
      }
      return ops;
    }
    case "image":
      // (R21) Imagen dibujada en el punto y tamaño PDF almacenados.
      return [
        {
          op: "image",
          x: annotation.at.x,
          y: annotation.at.y,
          width: annotation.width,
          height: annotation.height,
          ref: imageRef,
        },
      ];
  }
}

/**
 * (R22–R31) Carga `input` con pdf-lib, incrusta las imágenes de las anotaciones
 * de imagen y dibuja cada anotación en su página con `buildDrawOps`, sobre el
 * contenido existente (capa encima, sin reescribir el texto original). Emite
 * progreso en [0,1] terminando en 1 y devuelve los bytes.
 *
 * - `AnnotateFailedError` si la lista está vacía (R31) o alguna anotación
 *   referencia un índice de página fuera de rango (R30) → sin salida.
 * - `InvalidPdfError` si los bytes no son un PDF cargable (R28) → sin salida.
 * - `InvalidImageError` si una imagen de anotación no es JPG/PNG incrustable
 *   (R29) → sin salida.
 *
 * Sin React/DOM (pdf-lib es JS puro).
 */
export async function flattenAnnotations(
  input: Uint8Array,
  annotations: readonly Annotation[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  if (annotations.length === 0) {
    throw new AnnotateFailedError("No hay anotaciones que aplicar."); // (R31)
  }

  onProgress?.(0);

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input);
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido."); // (R28)
  }

  const pageCount = doc.getPageCount();
  // Valida TODOS los índices antes de dibujar nada: si alguno está fuera de
  // rango, aborta sin producir salida parcial. (R30)
  for (const annotation of annotations) {
    if (
      !Number.isInteger(annotation.pageIndex) ||
      annotation.pageIndex < 0 ||
      annotation.pageIndex >= pageCount
    ) {
      throw new AnnotateFailedError(
        `La anotación referencia una página fuera de rango (${String(
          annotation.pageIndex,
        )}).`,
      );
    }
  }

  const pages = doc.getPages();
  // El texto original NO se toca: solo se añaden operadores de dibujo por
  // encima con la fuente estándar embebida. (R1, R2)
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const n = annotations.length;

  for (let i = 0; i < n; i++) {
    const annotation = annotations[i];
    const page = pages[annotation.pageIndex];

    if (annotation.kind === "image") {
      const type = detectImageType(annotation.data); // (R29)
      if (type === null) {
        throw new InvalidImageError(
          "Una imagen de anotación no es un JPG o PNG válido.",
        );
      }
      let embedded;
      try {
        embedded =
          type === "jpeg"
            ? await doc.embedJpg(annotation.data)
            : await doc.embedPng(annotation.data);
      } catch {
        throw new InvalidImageError(
          "Una imagen de anotación no se puede incrustar.",
        );
      }
      page.drawImage(embedded, {
        x: annotation.at.x,
        y: annotation.at.y,
        width: annotation.width,
        height: annotation.height,
      }); // (R21, R22)
    } else {
      for (const drawOp of buildDrawOps(annotation)) {
        applyDrawOp(page, drawOp, font);
      }
    }

    onProgress?.((i + 1) / n); // (R25: último = 1)
  }

  onProgress?.(1); // (R25)
  return doc.save(); // (R22)
}

/**
 * Traduce un `DrawOp` a la llamada de dibujo de pdf-lib sobre `page`. La
 * incrustación de imágenes la resuelve `flattenAnnotations` (no llega aquí).
 */
function applyDrawOp(
  page: ReturnType<PDFDocument["getPages"]>[number],
  drawOp: DrawOp,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
): void {
  const asColor = (c: AnnotationColor): ReturnType<typeof rgb> =>
    rgb(c.r, c.g, c.b);

  switch (drawOp.op) {
    case "text":
      page.drawText(drawOp.text, {
        x: drawOp.x,
        y: drawOp.y,
        size: drawOp.size,
        font,
        color: asColor(drawOp.color),
      });
      return;
    case "rect":
      if (drawOp.borderWidth === 0) {
        // Relleno semitransparente (resaltado). (R17)
        page.drawRectangle({
          x: drawOp.x,
          y: drawOp.y,
          width: drawOp.width,
          height: drawOp.height,
          color: asColor(drawOp.color),
          opacity: drawOp.opacity,
        });
      } else {
        // Contorno (rectángulo). (R19)
        page.drawRectangle({
          x: drawOp.x,
          y: drawOp.y,
          width: drawOp.width,
          height: drawOp.height,
          borderColor: asColor(drawOp.color),
          borderWidth: drawOp.borderWidth,
          borderOpacity: drawOp.opacity,
        });
      }
      return;
    case "line":
      page.drawLine({
        start: { x: drawOp.x1, y: drawOp.y1 },
        end: { x: drawOp.x2, y: drawOp.y2 },
        thickness: drawOp.thickness,
        color: asColor(drawOp.color),
      });
      return;
    case "image":
      // No se alcanza: las imágenes se dibujan en flattenAnnotations tras
      // incrustarlas. Se mantiene por exhaustividad del switch.
      return;
  }
}
