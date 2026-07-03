export interface ServiceWorkerEnv {
  isProduction: boolean;
  hasServiceWorker: boolean;
}

/** Registrador inyectable; la implementación real vive en `swRegistration.ts`. */
export type RegisterServiceWorker = () => void;

/**
 * Registra el SW solo en producción y con soporte del navegador. Pura: no lee
 * el entorno del navegador ni cablea el módulo del plugin; recibe `register` y
 * `env` ya inyectados. Devuelve `true` si registró. (R25, R26, R27, R28)
 */
export function registerServiceWorker(
  register: RegisterServiceWorker,
  env: ServiceWorkerEnv,
): boolean {
  if (!env.isProduction) return false;
  if (!env.hasServiceWorker) return false;
  register();
  return true;
}
