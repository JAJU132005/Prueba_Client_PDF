import { Link } from "react-router-dom";

import { PandaArt } from "@/components/PandaArt";
import {
  RESOURCE_COST_POSE,
  ResourceCostBadge,
} from "@/components/ResourceCostBadge";
import type { ResourceCost } from "@/lib/resourceCost";
import { getToolSkin } from "@/lib/toolSkin";
import type { ToolCategory, ToolIconId } from "@/lib/tools";

/** Rotaciones de las tarjetas, en el ORDEN exacto del mockup de home. */
const ROTATIONS = [
  "-1.4deg",
  "0.9deg",
  "-0.7deg",
  "1.6deg",
  "-1.1deg",
  "0.8deg",
  "-1.8deg",
  "1.2deg",
  "-0.6deg",
  "1.5deg",
  "-1.2deg",
  "0.7deg",
  "-1.6deg",
  "1.0deg",
  "-0.9deg",
];

/** Utilería (cinta/chincheta/clip) por posición, según el mockup de home. */
const PROPS_CYCLE = [
  "tape",
  "pin",
  "clip",
  "pin",
  "tape",
  "clip",
  "pin",
  "tape",
  "pin",
  "clip",
  "tape",
  "pin",
  "clip",
  "pin",
  "tape",
] as const;

const LV_BG: Record<ResourceCost, string> = {
  light: "bg-lv-ligera",
  medium: "bg-lv-media",
  heavy: "bg-lv-pesada",
};

const HL: Record<ResourceCost, string> = {
  light: "hl-ligera",
  medium: "hl-media",
  heavy: "hl-pesada",
};

export interface ToolCardProps {
  title: string;
  description: string;
  to: string;
  icon: ToolIconId;
  category: ToolCategory;
  resourceCost: ResourceCost;
  /** Posición en la rejilla del home: fija rotación y utilería del mockup. */
  index?: number;
}

export function ToolCard(props: ToolCardProps): JSX.Element {
  // El id de icono coincide con el id estable de la herramienta.
  const skin = getToolSkin(props.icon);
  const index = props.index ?? 0;
  const decoration = PROPS_CYCLE[index % PROPS_CYCLE.length];

  return (
    <Link
      to={props.to}
      className="card tool group"
      style={{ "--rot": ROTATIONS[index % ROTATIONS.length] } as React.CSSProperties}
    >
      <span className={decoration} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <span
          className={`tool-icon ${LV_BG[props.resourceCost]}`}
          aria-hidden="true"
        >
          {skin?.glyph ?? "✎"}
        </span>
        <ResourceCostBadge level={props.resourceCost} hidePose />
      </div>
      <h3 className="hand m-0 mt-2 text-[28px] font-normal leading-tight">
        <span className={HL[props.resourceCost]}>{props.title}</span>
      </h3>
      <p className="m-0 text-[15.5px] font-semibold leading-snug text-ink-soft">
        {props.description}
      </p>
      <span className="mt-auto w-[84px]">
        <PandaArt kind={RESOURCE_COST_POSE[props.resourceCost]} />
      </span>
    </Link>
  );
}
