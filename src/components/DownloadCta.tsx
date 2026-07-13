import { RESOURCE_COST_LV_CLASS } from "@/components/ResourceCostBadge";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import type { ResourceCost } from "@/lib/resourceCost";

/** Texto por defecto del botón de descarga guiado (incluye el icono ⇩). */
export const DEFAULT_DOWNLOAD_LABEL = "⇩ Descargar resultado";

export interface DownloadCtaProps {
  /** Dispara la MISMA descarga local que la herramienta ya implementa. */
  onDownload: () => void;
  /** Nivel de la herramienta: colorea el botón primario (`lv-*`). */
  costLevel: ResourceCost;
  /** Texto del botón; por defecto "⇩ Descargar resultado". */
  label?: string;
  /** Clases extra opcionales (p. ej. tamaños puntuales de una ruta). */
  className?: string;
}

/**
 * Botón de descarga GUIADO, único y reutilizable (#39). Centraliza el resaltado
 * y la animación que ayudan al usuario a localizar dónde descargar, sin
 * reimplementar el efecto por ruta (R7, R8). Consumido por `ResultPanel` y por
 * las rutas ad-hoc (Ocr, RedactPdf, FillForms).
 *
 * - Resaltado ESTÁTICO siempre (clase `download-cta`) + icono ⇩ en el label →
 *   color + texto/icono, nunca solo color (R1, R4, R6).
 * - Animación SOLO si NO hay reduced-motion, gateada por
 *   `usePrefersReducedMotion()` (R2, R3); el CSS lleva además
 *   `motion-reduce:animate-none` como defensa en profundidad.
 * - No roba/mueve el foco: sin `autoFocus`, sin `.focus()` (R5, R14).
 * - Sin lógica de PDF ni de dominio: sólo presentación + `onDownload` (R13).
 */
export function DownloadCta(props: DownloadCtaProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const label = props.label ?? DEFAULT_DOWNLOAD_LABEL;
  const animateClass = reducedMotion ? "" : "download-cta-animate";
  const extra = props.className ?? "";

  return (
    <button
      type="button"
      onClick={props.onDownload}
      data-testid="download-cta"
      data-download-guided="true"
      className={`btn btn-primary ${RESOURCE_COST_LV_CLASS[props.costLevel]} download-cta ${animateClass} motion-reduce:animate-none !px-6 !py-2 !text-xl ${extra}`.trim()}
    >
      {label}
    </button>
  );
}
