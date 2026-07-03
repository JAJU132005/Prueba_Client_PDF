import {
  RESOURCE_COST_BADGE_CLASSES,
  RESOURCE_COST_LABEL,
  type ResourceCost,
} from "@/lib/resourceCost";

export interface ResourceCostBadgeProps {
  level: ResourceCost;
}

/**
 * Badge accesible: color (RESOURCE_COST_BADGE_CLASSES) + TEXTO
 * (RESOURCE_COST_LABEL), con aria-label "Consumo de recursos: <etiqueta>".
 * (R4, R5, R6)
 */
export function ResourceCostBadge(props: ResourceCostBadgeProps): JSX.Element {
  const label = RESOURCE_COST_LABEL[props.level];
  return (
    <span
      aria-label={`Consumo de recursos: ${label}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RESOURCE_COST_BADGE_CLASSES[props.level]}`}
    >
      {label}
    </span>
  );
}
