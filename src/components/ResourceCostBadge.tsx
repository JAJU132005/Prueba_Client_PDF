import { PandaArt, type PandaArtKind } from "@/components/PandaArt";
import { RESOURCE_COST_LABEL, type ResourceCost } from "@/lib/resourceCost";

/** Coletilla del diario por nivel ("Ligera · Pan comido", …). (#28 R22) */
export const RESOURCE_COST_QUIP: Record<ResourceCost, string> = {
  light: "Pan comido",
  medium: "Ahí va la cosa",
  heavy: "Modo bestia",
};

/** Clase de color del badge (`.badge.lv-*` en tokens.css) por nivel. */
export const RESOURCE_COST_LV_CLASS: Record<ResourceCost, string> = {
  light: "lv-ligera",
  medium: "lv-media",
  heavy: "lv-pesada",
};

/** Pose del panda por nivel. */
export const RESOURCE_COST_POSE: Record<ResourceCost, PandaArtKind> = {
  light: "pose-ligera",
  medium: "pose-media",
  heavy: "pose-pesada",
};

export interface ResourceCostBadgeProps {
  level: ResourceCost;
  /** Oculta la pose del panda (para contextos muy compactos). */
  hidePose?: boolean;
}

/**
 * Badge accesible del diario: color (`.badge.lv-*`) + TEXTO
 * ("Ligera · Pan comido") + pose del panda — nunca solo color.
 * (R4, R5, R6; #28 R22)
 */
export function ResourceCostBadge(props: ResourceCostBadgeProps): JSX.Element {
  const label = RESOURCE_COST_LABEL[props.level];
  const quip = RESOURCE_COST_QUIP[props.level];
  return (
    <span
      aria-label={`Consumo de recursos: ${label} · ${quip}`}
      className={`badge ${RESOURCE_COST_LV_CLASS[props.level]} text-ink`}
    >
      {!props.hidePose && (
        <span className="w-9 shrink-0">
          <PandaArt kind={RESOURCE_COST_POSE[props.level]} />
        </span>
      )}
      {label} · {quip}
    </span>
  );
}
