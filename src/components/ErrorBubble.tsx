import { PandaArt } from "@/components/PandaArt";

export interface ErrorBubbleProps {
  /** Mensaje YA mapeado por la ruta desde `error.name`; se muestra ÍNTEGRO. */
  message: string;
}

/**
 * Bocadillo de cómic junto al panda para los errores de operación. NO
 * transforma ni suaviza el mensaje recibido. (#28 R26)
 */
export function ErrorBubble(props: ErrorBubbleProps): JSX.Element {
  return (
    <div role="alert" className="flex items-end gap-3">
      <span className="w-16 shrink-0">
        <PandaArt kind="pose-media" />
      </span>
      <p
        className="hand relative m-0 border-[2.5px] border-ink bg-card px-4 py-2.5 text-[17px] text-ink"
        style={{ borderRadius: "18px 22px 20px 24px/24px 18px 26px 18px" }}
      >
        {props.message}
      </p>
    </div>
  );
}
