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
  const dotClass = online ? "bg-success" : "bg-accent";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Estado de conexión: ${label}`}
      className="inline-flex items-center gap-1.5 text-xs text-text-muted"
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
      {text}
    </span>
  );
}
