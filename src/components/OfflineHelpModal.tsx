import { useEffect, useRef } from "react";

import { PandaArt } from "@/components/PandaArt";
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
        className="card flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-auto motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="hand text-2xl text-ink">
            Instalar y usar sin conexión
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={props.onClose}
            aria-label="Cerrar ayuda"
            className="hand px-2 py-1 text-lg text-mk-red"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-hidden="true">
          <div className="rounded-[10px] border-[2.5px] border-ink-soft p-1">
            <PandaArt kind="comic1" />
          </div>
          <div className="rounded-[10px] border-[2.5px] border-ink-soft p-1">
            <PandaArt kind="comic2" />
          </div>
          <div className="rounded-[10px] border-[2.5px] border-ink-soft p-1">
            <PandaArt kind="comic3" />
          </div>
        </div>

        {installSections.map((section) => (
          <section key={section.key} className="flex flex-col gap-2">
            <h3 className="hand text-lg text-ink">{section.title}</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}

        <section className="flex flex-col gap-2">
          <h3 className="hand text-lg text-ink">Usar sin conexión</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            {OFFLINE_USAGE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <p className="postit text-ink">{PRIVACY_REMINDER}</p>
      </div>
    </div>
  );
}
