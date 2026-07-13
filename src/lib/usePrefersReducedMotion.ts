import { useEffect, useState } from "react";

/** Media query que detecta la preferencia de movimiento reducido. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function matchesReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/**
 * Hook: `true` si el usuario pidió `prefers-reduced-motion: reduce`.
 *
 * Reutiliza el patrón `matchMedia` de `PandaWidget`/`useIsMobile`: se guarda con
 * `typeof window.matchMedia === "function"`, se suscribe al evento `change` de la
 * `MediaQueryList` y limpia en el desmontaje. Si `matchMedia` no existe
 * (SSR/entorno sin DOM), devuelve `false`. No toca DOM ni lógica de dominio.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => matchesReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduced(mediaQueryList.matches);
    const handleChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    mediaQueryList.addEventListener("change", handleChange);
    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, []);

  return reduced;
}
