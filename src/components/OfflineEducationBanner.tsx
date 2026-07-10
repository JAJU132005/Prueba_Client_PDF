import { useState } from "react";

import { OfflineHelpModal } from "@/components/OfflineHelpModal";
import { BANNER_MESSAGE } from "@/lib/offlineEducation";

/**
 * Aviso de primera visita, descartable. Muestra `BANNER_MESSAGE` (R1), un
 * control que abre la ayuda (R2) y un control de descarte que lo oculta (R3,
 * devuelve `null`). El estado de descarte y de apertura de la ayuda vive en
 * `useState` (memoria de sesión, sin `localStorage`/`sessionStorage` → R5, R20),
 * mismo patrón que el toggle de tema en `src/design/theme.tsx`. Al montarse en
 * `Layout` (que no se desmonta al navegar), el descarte persiste durante la
 * sesión (R4).
 */
export function OfflineEducationBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <>
      <div
        role="region"
        aria-label="Aviso de uso sin conexión"
        className="card mx-auto mt-4 flex w-fit max-w-[820px] -rotate-[0.6deg] flex-wrap items-center gap-3 !rounded-[20px_8px_18px_10px/10px_18px_8px_20px] !px-5 !py-2.5"
      >
        <span className="tape" aria-hidden="true" />
        <p className="hand text-lg">
          <span>{BANNER_MESSAGE}</span> <span aria-hidden="true">🐼</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="hand text-[17px] text-ink shadow-[inset_0_-7px_0_var(--hl-orange)]"
          >
            Cómo instalarla
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Descartar aviso"
            className="hand px-2 py-1 text-lg text-mk-red"
          >
            ✕
          </button>
        </div>
      </div>
      {helpOpen && <OfflineHelpModal onClose={() => setHelpOpen(false)} />}
    </>
  );
}
