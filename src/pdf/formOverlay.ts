/**
 * Dominio PURO de la geometría del overlay de campos de formulario (#31).
 *
 * Convierte los rectángulos de los widgets AcroForm (puntos PDF, origen
 * inferior-izquierdo) a datos resueltos por página y a píxeles de la vista
 * previa (origen superior-izquierdo), DERIVANDO la conversión de
 * `previewModel.toPreviewPixels` sin reimplementar los cálculos.
 *
 * Sin React, sin DOM y SIN pdf-lib: opera únicamente sobre datos planos
 * (números y objetos serializables). Es el núcleo testeable del overlay
 * `FormFieldOverlay`. (R5, R6, R7, R13, R25, R28)
 */

import {
  toPreviewPixels,
  type PreviewPageSize,
  type PreviewPixelRect,
} from "@/pdf/previewModel";
import type { FormFieldInfo } from "@/pdf/fillForms";

/** Rectángulo del widget en puntos PDF, origen inferior-izquierdo (como pdf-lib). */
export interface WidgetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Un widget resuelto a su página: rectángulo + índice 0-indexado. (R1) */
export interface FieldWidget {
  pageIndex: number;
  rect: WidgetRect;
}

/** Datos planos por widget extraídos con pdf-lib (antes de resolver la página). */
export interface RawWidget {
  rect: WidgetRect;
  /** Clave de la referencia de página del widget (`String(widget.P())`) o null. */
  pageRefId: string | null;
}

/**
 * Mapea cada `RawWidget` a `FieldWidget` resolviendo `pageRefId` contra el orden
 * `pageRefIds` (`pageRefIds.indexOf(pageRefId)`). Omite los widgets con
 * `pageRefId === null` o no encontrados en `pageRefIds`. (R1, R2, R4)
 */
export function buildFieldWidgets(
  raws: readonly RawWidget[],
  pageRefIds: readonly string[],
): FieldWidget[] {
  const widgets: FieldWidget[] = [];
  for (const raw of raws) {
    if (raw.pageRefId === null) {
      continue; // Widget sin referencia de página resoluble. (R4)
    }
    const pageIndex = pageRefIds.indexOf(raw.pageRefId);
    if (pageIndex === -1) {
      continue; // Referencia de página no presente en el documento. (R4)
    }
    widgets.push({ pageIndex, rect: raw.rect });
  }
  return widgets;
}

/**
 * Convierte el rectángulo de un widget (puntos PDF, origen inferior-izquierdo) a
 * píxeles de la vista previa (origen superior-izquierdo). DERIVA de
 * `toPreviewPixels` construyendo un overlay mínimo con el mismo rect, de modo que
 * el resultado sea idéntico al de #20. (R5, R6)
 */
export function widgetRectToPreviewPixels(
  rect: WidgetRect,
  page: PreviewPageSize,
  scale: number,
): PreviewPixelRect {
  return toPreviewPixels(
    {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      opacity: 1,
      rotationDegrees: 0,
      content: { kind: "image" },
    },
    page,
    scale,
  );
}

/** Widgets ubicados en `pageIndex`, con el nombre de su campo. (R7, R9) */
export function widgetsForPage(
  fields: readonly FormFieldInfo[],
  pageIndex: number,
): { fieldName: string; rect: WidgetRect }[] {
  const result: { fieldName: string; rect: WidgetRect }[] = [];
  for (const field of fields) {
    for (const widget of field.widgets ?? []) {
      if (widget.pageIndex === pageIndex) {
        result.push({ fieldName: field.name, rect: widget.rect });
      }
    }
  }
  return result;
}

/**
 * Página a mostrar al enfocar un campo. Si alguno de los widgets del campo ya
 * está en `currentPageIndex`, devuelve `currentPageIndex` (no salta); si no,
 * devuelve el `pageIndex` del primer widget; si el campo no tiene widgets,
 * devuelve `currentPageIndex`. Lógica pura del salto de página. (R13)
 */
export function pageIndexForField(
  field: FormFieldInfo,
  currentPageIndex: number,
): number {
  const widgets = field.widgets ?? [];
  if (widgets.length === 0) {
    return currentPageIndex;
  }
  if (widgets.some((w) => w.pageIndex === currentPageIndex)) {
    return currentPageIndex;
  }
  return widgets[0].pageIndex;
}
