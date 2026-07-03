import { useEffect, useRef } from "react";

import {
  INSTALL_STEPS_DESKTOP,
  INSTALL_STEPS_MOBILE,
  OFFLINE_USAGE_STEPS,
  PRIVACY_REMINDER,
} from "@/lib/offlineEducation";
import { useIsMobile } from "@/lib/useIsMobile";

export interface OfflineHelpModalProps {
  /** Cierra la ayuda (el padre desmonta el componente). */
  onClose: () => void;
  /** Viewport móvil inyectable (tests); por defecto `useIsMobile()`. */
  isMobile?: boolean;
}

interface StepsSection {
  key: string;
  title: string;
  steps: readonly string[];
}

/**
 * Modal de ayuda de instalación y uso offline. Replica el contrato de
 * accesibilidad de `PdfPreviewModal` (#18): `role="dialog"`, `aria-modal`, foco
 * inicial al abrir (R6), cierre con `Escape`, botón de cierre y clic en el
 * backdrop (R11). Muestra pasos de escritorio (R7), móvil (R8) y uso offline
 * (R9), reitera la privacidad (R12) y ordena móvil antes que escritorio en
 * viewport móvil (R10).
 */
export function OfflineHelpModal(props: OfflineHelpModalProps): JSX.Element {
  const detectedMobile = useIsMobile();
  const isMobile = props.isMobile ?? detectedMobile;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const desktopSection: StepsSection = {
    key: "desktop",
    title: "Instalar en escritorio",
    steps: INSTALL_STEPS_DESKTOP,
  };
  const mobileSection: StepsSection = {
    key: "mobile",
    title: "Instalar en móvil",
    steps: INSTALL_STEPS_MOBILE,
  };
  const installSections: StepsSection[] = isMobile
    ? [mobileSection, desktopSection]
    : [desktopSection, mobileSection];

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ayuda: instalación y uso sin conexión"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-auto rounded-2xl bg-surface p-6 shadow-md motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text">
            Instalar y usar sin conexión
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={props.onClose}
            aria-label="Cerrar ayuda"
            className="rounded-md px-2 py-1 text-text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            ✕
          </button>
        </div>

        {installSections.map((section) => (
          <section key={section.key} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text">{section.title}</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Usar sin conexión</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
            {OFFLINE_USAGE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <p className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text-muted">
          {PRIVACY_REMINDER}
        </p>
      </div>
    </div>
  );
}
