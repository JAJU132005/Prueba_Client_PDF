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
        className="border-b border-border bg-surface"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-6">
          <p className="text-sm text-text-muted">{BANNER_MESSAGE}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="rounded-md px-2 py-1 text-sm font-medium text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              Cómo instalarla
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Descartar aviso"
              className="rounded-md px-2 py-1 text-text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      {helpOpen && <OfflineHelpModal onClose={() => setHelpOpen(false)} />}
    </>
  );
}
