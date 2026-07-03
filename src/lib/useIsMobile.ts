import { useEffect, useState } from "react";

/** Umbral de "móvil": por debajo de md (768px), coherente con docs/design.md. */
export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function matchesQuery(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

/**
 * Devuelve true si el viewport coincide con `query`. (R11)
 * Se suscribe a los cambios de la MediaQueryList y actualiza el valor. (R12)
 * Si `window.matchMedia` no existe (SSR/entorno sin DOM), devuelve false.
 */
export function useIsMobile(query: string = MOBILE_MEDIA_QUERY): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => matchesQuery(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQueryList = window.matchMedia(query);
    setIsMobile(mediaQueryList.matches);
    const handleChange = (event: MediaQueryListEvent): void => {
      setIsMobile(event.matches);
    };
    mediaQueryList.addEventListener("change", handleChange);
    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [query]);

  return isMobile;
}
