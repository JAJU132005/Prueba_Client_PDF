import type { FormFieldInfo } from "@/pdf/fillForms";
import { widgetRectToPreviewPixels, widgetsForPage } from "@/pdf/formOverlay";
import type { PreviewPageSize } from "@/pdf/previewModel";

export interface FormFieldOverlayProps {
  /** Campos del formulario detectados (con su geometría de widgets). */
  fields: readonly FormFieldInfo[];
  /** Índice 0-indexado de la página previsualizada. */
  pageIndex: number;
  /** Tamaño real de la página en puntos PDF (de `LivePreview.onPageSize`). */
  pageSize: PreviewPageSize;
  /** Escala de render de la página. */
  scale: number;
  /** Nombre del campo actualmente enfocado (o null). */
  focusedField: string | null;
  /** Notifica que el usuario activó (clic/teclado) el marcador de un campo. */
  onFocusField: (name: string) => void;
}

/**
 * Capa presentacional (#31) que dibuja un marcador clicable por cada widget
 * AcroForm de la página activa, sobre la vista previa. Delega TODA la geometría
 * en `formOverlay.ts` (dominio puro): `widgetsForPage` filtra los widgets de la
 * página y `widgetRectToPreviewPixels` los posiciona. No contiene lógica de
 * pdf-lib ni de negocio.
 *
 * Cada marcador es un `<button type="button">` real (accesible por teclado y
 * lectores de pantalla) con `aria-label` del nombre del campo. El del campo
 * `focusedField` se destaca con el marcador `--mk-orange`/`--hl-orange` y
 * `aria-current="true"` (estado no comunicado solo por color). (R8, R9, R11, R12)
 */
export function FormFieldOverlay({
  fields,
  pageIndex,
  pageSize,
  scale,
  focusedField,
  onFocusField,
}: FormFieldOverlayProps): JSX.Element {
  const widgets = widgetsForPage(fields, pageIndex); // (R9)
  return (
    <>
      {widgets.map(({ fieldName, rect }, index) => {
        const px = widgetRectToPreviewPixels(rect, pageSize, scale); // (R5)
        const focused = fieldName === focusedField;
        return (
          <button
            key={`${fieldName}-${String(index)}`}
            type="button"
            data-testid="field-marker"
            aria-label={`Campo ${fieldName}`}
            aria-current={focused ? "true" : undefined}
            onClick={() => onFocusField(fieldName)}
            className={`absolute rounded-[2px] border-2 transition-colors focus-visible:outline-none motion-reduce:transition-none ${
              focused
                ? "border-mk-orange bg-hl-orange/40"
                : "border-mk-green/70 bg-hl-green/20 hover:bg-hl-green/40"
            }`}
            style={{
              left: `${String(px.left)}px`,
              top: `${String(px.top)}px`,
              width: `${String(px.width)}px`,
              height: `${String(px.height)}px`,
            }}
          />
        );
      })}
    </>
  );
}
