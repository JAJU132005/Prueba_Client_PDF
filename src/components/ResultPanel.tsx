import type { ReactNode } from "react";

import { DownloadCta } from "@/components/DownloadCta";
import { PandaArt } from "@/components/PandaArt";
import type { ResourceCost } from "@/lib/resourceCost";

export interface ResultPanelProps {
  /** Nombre del archivo de salida que se mostrará en la hoja sellada. */
  fileName: string;
  /** Dispara la MISMA descarga local que la herramienta ya implementa. */
  onDownload: () => void;
  /** Dispara el MISMO reinicio que la herramienta ya implementa. */
  onReset: () => void;
  /** Nivel de la herramienta: colorea el botón primario (`lv-*`). */
  costLevel: ResourceCost;
  /** Mensaje de celebración; por defecto "¡Listo!". */
  title?: string;
  /** Contenido extra propio de la herramienta (p. ej. balanza de tamaños). */
  children?: ReactNode;
}

/**
 * Panel de resultado del diario: celebración + trituradora + "borrado hasta de
 * mi memoria" + hoja con sello + Descargar / procesar otro. La descarga y el
 * reinicio son los handlers que cada ruta ya tenía. (#28 R25)
 */
export function ResultPanel(props: ResultPanelProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-6">
      <div className="card min-w-[280px] flex-1 basis-80">
        <h3 className="hand m-0 text-2xl text-ink">
          <span className="hl-ligera">{props.title ?? "¡Listo!"}</span>
        </h3>
        <div className="mx-auto mt-2.5 w-full max-w-[270px]">
          <PandaArt
            kind="trituradora"
            label="Trituradora feliz convirtiendo los datos temporales en confeti"
          />
        </div>
        <p className="hand mb-0 mt-2.5 text-lg text-ink">
          borrado hasta de mi memoria 🤝
        </p>
        {props.children}
      </div>
      <div className="flex min-w-[240px] shrink basis-64 flex-col items-start gap-3">
        <div className="relative aspect-[3/4] w-[170px] rounded border-[2.5px] border-ink bg-surface shadow-doodle">
          <span className="stamp-topsecret absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
            TOP SECRET
          </span>
          <span className="mono absolute bottom-3 left-2.5 right-2.5 truncate text-[10px] text-[#8a857b]">
            {props.fileName}
          </span>
        </div>
        <DownloadCta
          onDownload={props.onDownload}
          costLevel={props.costLevel}
        />
        <button type="button" onClick={props.onReset} className="btn btn-ghost">
          procesar otro
        </button>
      </div>
    </div>
  );
}
