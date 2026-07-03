import { useEffect, useState } from "react";

function readOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }
  return navigator.onLine;
}

/**
 * Devuelve el estado de conexión del navegador. Inicializa desde
 * `navigator.onLine` (R13) y se suscribe a los eventos locales `online`/
 * `offline` del `window` para reflejar los cambios (R14, R15). Solo lee estado
 * del propio navegador; no hace red. Si `navigator` no existe (SSR/jsdom sin
 * soporte) asume `true` (en línea).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => readOnline());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setOnline(readOnline());
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
