import { PandaArt } from "@/components/PandaArt";
import { ResourceCostNote } from "@/components/ResourceCostNote";
import { PRIVACY_BADGE_TEXT } from "@/lib/offlineEducation";
import {
  getToolHlClass,
  getToolLvClass,
  getToolSkin,
  LEVEL_PHRASE,
} from "@/lib/toolSkin";
import { TOOLS } from "@/lib/tools";

export interface ToolPageHeaderProps {
  toolId: string;
}

/**
 * Encabezado común de las páginas de herramienta del diario: icono garabato +
 * título subrayado + sello local + nota de consumo (badge/pose/frase/post-it)
 * + tarjeta de escena con onomatopeya. Todo desde `toolSkin.ts`; presentación
 * pura. (#28, plantillas 01–04)
 */
export function ToolPageHeader(props: ToolPageHeaderProps): JSX.Element | null {
  const tool = TOOLS.find((candidate) => candidate.id === props.toolId);
  const skin = getToolSkin(props.toolId);
  if (!tool || !skin) {
    return null;
  }
  const hlClass = getToolHlClass(tool.id);
  const iconBg: Record<string, string> = {
    "lv-ligera": "bg-lv-ligera",
    "lv-media": "bg-lv-media",
    "lv-pesada": "bg-lv-pesada",
  };

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3.5">
        <span
          className={`tool-icon ${iconBg[getToolLvClass(tool.id)]} h-14 w-14 text-2xl`}
          aria-hidden="true"
        >
          {skin.glyph}
        </span>
        <h1 className="hand m-0 text-[clamp(32px,4vw,46px)] font-normal text-ink">
          <span className={hlClass}>{tool.title}</span>
        </h1>
        <span className="badge lv-ligera">
          <span aria-hidden="true">✓</span>
          {PRIVACY_BADGE_TEXT}
        </span>
      </div>
      <p className="hand soft m-0 text-[17px]">
        {LEVEL_PHRASE[tool.resourceCost]}
      </p>
      <ResourceCostNote toolId={tool.id} />
      <div className="card mt-2 max-w-[640px]">
        <h2 className="hand m-0 text-[27px] font-normal text-ink">
          <span className={hlClass}>{skin.sceneTitle}</span>{" "}
          <span className="scrawl soft text-xl">{skin.onomatopoeia}</span>
        </h2>
        <div className="mx-auto mt-2.5 w-full max-w-[360px]">
          <PandaArt kind={skin.scene} />
        </div>
      </div>
    </header>
  );
}
