import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/** Umbral de scroll (px) a partir del cual el FAB se muestra. */
export const SHOW_AFTER_PX = 200;

/**
 * FAB de "volver al inicio" (#40). Montado en `Layout` como HERMANO de las
 * rutas: su estado de scroll vive dentro del propio componente, de modo que
 * togglear la visibilidad NO re-renderiza las rutas (`{children}`) (R1, R11).
 *
 * - Oculto en la home (`/`) vía `useLocation` (R6).
 * - Se muestra cuando `window.scrollY > 200` y se oculta si `<= 200` (R2, R3),
 *   con el mismo patrón de listener `passive` que `PandaWidget`.
 * - Enlace nativo `<Link to="/">` con `aria-label` → navegación accesible en un
 *   clic, alcanzable por teclado con foco visible global (R4, R5, R12).
 * - Esquina inferior IZQUIERDA (`bottom-4 left-4`), opuesta al `PandaWidget`
 *   (`bottom-2 right-4`) → sin solape con el panda ni con el footer (R7, R8).
 * - Animación decorativa sólo si NO hay reduced-motion, reutilizando
 *   `usePrefersReducedMotion` (#39) + `motion-reduce:animate-none` (R9, R10).
 * - Sin red, sin workers, sin dominio: navegación cliente pura (R13).
 */
export function FloatingHomeButton(): JSX.Element | null {
  const { pathname } = useLocation();
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    function onScroll(): void {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // R6: en la home no se renderiza nada.
  if (pathname === "/") {
    return null;
  }

  const animateClass = reduced ? "" : "home-fab-animate";

  return (
    <div
      className={`fixed bottom-4 left-4 z-40 transition-opacity duration-150 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      data-floating-home=""
    >
      <Link
        to="/"
        aria-label="Volver al inicio"
        aria-hidden={visible ? undefined : true}
        tabIndex={visible ? undefined : -1}
        className={`btn btn-primary lv-media ${animateClass} motion-reduce:animate-none inline-flex min-h-[44px] min-w-[44px] items-center justify-center !px-4 !py-2 !text-2xl`.trim()}
      >
        <span aria-hidden="true">🏠</span>
      </Link>
    </div>
  );
}
