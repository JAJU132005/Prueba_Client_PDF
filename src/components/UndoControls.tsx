/** Hint por defecto sobre el atajo de teclado. (R26) */
export const DEFAULT_UNDO_HINT = "Ctrl+Z para deshacer";

export interface UndoControlsProps {
  /** Hay algo que deshacer. (R23) */
  canUndo: boolean;
  /** Hay algo que rehacer. (R25) */
  canRedo: boolean;
  /** Acción de deshacer. (R22) */
  onUndo: () => void;
  /** Acción de rehacer. (R24) */
  onRedo: () => void;
  /** Texto del hint; por defecto `DEFAULT_UNDO_HINT`. (R26) */
  hint?: string;
  /** Clases extra para el contenedor. */
  className?: string;
}

/**
 * Control accesible de deshacer/rehacer (#37). Presentacional puro, sin lógica
 * de historial: dos botones con nombre accesible por texto ("Deshacer" /
 * "Rehacer"), deshabilitados según `canUndo`/`canRedo`, y un hint discreto del
 * atajo Ctrl+Z. Estilos con utilidades ya presentes del sistema de diseño.
 * (R22–R26)
 */
export function UndoControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hint = DEFAULT_UNDO_HINT,
  className,
}: UndoControlsProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Deshacer y rehacer"
      className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="btn !px-4 !py-1 !text-base"
      >
        Deshacer
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="btn !px-4 !py-1 !text-base"
      >
        Rehacer
      </button>
      <span className="hand soft text-base text-ink-soft">{hint}</span>
    </div>
  );
}
