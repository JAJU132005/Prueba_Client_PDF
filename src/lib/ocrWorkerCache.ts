/**
 * Caché de workers por clave con DESALOJO-EN-RECHAZO. Unidad PURA e inyectable:
 * no depende de `tesseract.js` — recibe la factoría de creación por parámetro,
 * de modo que se puede ejercitar con un factory falso en jsdom.
 *
 * Invariantes:
 * - Camino feliz: la misma promesa se reutiliza; la factoría se invoca una sola
 *   vez por clave (#34 R9).
 * - Si la promesa creada por `factory(key)` se RECHAZA, se elimina de la caché
 *   para no envenenar reintentos futuros (#34 R7).
 * - Un reintento tras un rechazo vuelve a invocar la factoría (#34 R8a) y puede
 *   resolver con éxito (#34 R8b).
 */
export interface WorkerCache<T> {
  /** Devuelve la promesa cacheada del worker; la crea con la factoría si falta. */
  get(key: string): Promise<T>;
  /** Promesas actualmente cacheadas (para terminación). */
  values(): Promise<T>[];
  /** Vacía la caché. */
  clear(): void;
}

export function createWorkerCache<T>(
  factory: (key: string) => Promise<T>,
): WorkerCache<T> {
  const cache = new Map<string, Promise<T>>();
  return {
    get(key: string): Promise<T> {
      const existing = cache.get(key);
      if (existing) {
        return existing; // R9: reutiliza la promesa en el camino feliz.
      }
      const created = factory(key); // R8a: un reintento re-invoca la factoría.
      cache.set(key, created);
      // R7: desaloja al rechazar, sólo si la entrada sigue siendo esta promesa
      // (no pisar una recreación posterior).
      created.catch(() => {
        if (cache.get(key) === created) {
          cache.delete(key);
        }
      });
      return created;
    },
    values(): Promise<T>[] {
      return Array.from(cache.values());
    },
    clear(): void {
      cache.clear();
    },
  };
}
