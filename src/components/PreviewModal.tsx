import { useEffect, useRef } from "react";

/** Selector de elementos enfocables para el focus trap. (R4) */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PreviewModalProps {
  /** Etiqueta accesible y título mostrado (p. ej. `file.name`). */
  label: string;
  /** Cierra el visor (el padre desmonta). */
  onClose: () => void;
  /** Cuerpo del visor (imagen o cuerpo del visor de PDF). */
  children: React.ReactNode;
}

/**
 * Chrome genérico del visor ampliado, extraído de `PdfPreviewModal` (#18):
 * overlay `fixed inset-0`, `role="dialog"`/`aria-modal`/`aria-label`, focus
 * trap con `Tab`/`Shift+Tab`, cierre con Escape, traslado de foco al montar y
 * botón de cierre con `aria-label`. Renderiza `children` en el cuerpo. Es la
 * pieza común de los visores de imagen y de PDF. (R1–R6)
 */
export function PreviewModal({
  label,
  onClose,
  children,
}: PreviewModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Trasladar el foco a un elemento dentro del visor al abrir. (R2)
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    // Cerrar con Escape. (R3)
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    // Focus trap: el foco no sale del contenedor con Tab/Shift+Tab. (R4)
    if (event.key !== "Tab") {
      return;
    }
    const container = dialogRef.current;
    if (!container) {
      return;
    }
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Vista previa de ${label}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="card flex max-h-full w-full max-w-4xl flex-col gap-4 motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="hand truncate text-2xl text-ink">{label}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="hand px-2 py-1 text-lg text-mk-red"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
