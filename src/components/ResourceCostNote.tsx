import { ResourceCostBadge } from "@/components/ResourceCostBadge";
import {
  HEAVY_MOBILE_WARNING,
  RESOURCE_COST_EXPLANATION,
} from "@/lib/resourceCost";
import { getToolResourceCost } from "@/lib/tools";
import { useIsMobile } from "@/lib/useIsMobile";

export interface ResourceCostNoteProps {
  toolId: string;
  /** Inyección para tests deterministas; por defecto usa useIsMobile(). */
  isMobile?: boolean;
}

/**
 * Resuelve el nivel con getToolResourceCost(toolId). Si no existe → null.
 * Muestra etiqueta + frase explicativa (R7, R8). Si level==="heavy" y el
 * dispositivo es móvil, muestra además HEAVY_MOBILE_WARNING en un contenedor
 * accesible (role="note") (R9); en cualquier otro caso NO lo muestra (R10).
 */
export function ResourceCostNote(
  props: ResourceCostNoteProps,
): JSX.Element | null {
  const detectedMobile = useIsMobile();
  const isMobile = props.isMobile ?? detectedMobile;
  const level = getToolResourceCost(props.toolId);

  if (!level) {
    return null;
  }

  const showWarning = level === "heavy" && isMobile;

  return (
    <div className="flex flex-col gap-3">
      <p className="hand soft flex flex-wrap items-center gap-2 text-[17px]">
        <ResourceCostBadge level={level} />
        <span>{RESOURCE_COST_EXPLANATION[level]}</span>
      </p>
      {showWarning && (
        <p role="note" className="postit max-w-sm text-ink">
          <span className="block">⚠️ En móvil esto suda de verdad.</span>
          <span className="mono mt-1.5 block text-[11px] opacity-70">
            {HEAVY_MOBILE_WARNING}
          </span>
        </p>
      )}
    </div>
  );
}
