export interface ProgressBarProps {
  /** Progreso REAL 0..1 emitido por el worker; nunca un valor inventado. */
  value: number;
  /** Texto opcional dentro de la rama de bambú; por defecto el porcentaje. */
  label?: string;
}

/**
 * Barra de progreso "rama de bambú" (`.progress` + `.progress-fill`). El ancho
 * del relleno refleja el 0..1 real del worker. (#28 R24)
 */
export function ProgressBar(props: ProgressBarProps): JSX.Element {
  const percent = Math.round(Math.min(1, Math.max(0, props.value)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="progress-fill" style={{ width: `${percent}%` }} />
      <span className="progress-label">
        {props.label ?? `${percent}% · rama de bambú llenándose`}
      </span>
    </div>
  );
}
