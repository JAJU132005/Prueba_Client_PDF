import {
  OFFLINE_LABEL,
  OFFLINE_REASSURANCE,
  ONLINE_LABEL,
} from "@/lib/offlineEducation";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export interface OfflineIndicatorProps {
  /** Estado inyectable para tests; por defecto usa `useOnlineStatus()`. */
  online?: boolean;
}

/**
 * Indicador sutil de conexión. En línea (R17) muestra una etiqueta discreta; sin
 * conexión (R16) muestra un mensaje tranquilizador. El estado se transmite por
 * texto + `aria` además del color (R18), con `aria-live="polite"` para anunciar
 * los cambios sin interrumpir.
 */
export function OfflineIndicator(props: OfflineIndicatorProps = {}): JSX.Element {
  const detected = useOnlineStatus();
  const online = props.online ?? detected;

  const label = online ? ONLINE_LABEL : OFFLINE_LABEL;
  const text = online ? ONLINE_LABEL : OFFLINE_REASSURANCE;
  const dotClass = online ? "bg-mk-green" : "bg-mk-orange";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Estado de conexión: ${label}`}
      className="hand inline-flex items-center gap-[7px] text-[17px] text-ink"
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 border-[1.5px] border-ink ${dotClass}`}
        style={{ borderRadius: "50% 45% 55% 50%" }}
      />
      {text}
    </span>
  );
}
