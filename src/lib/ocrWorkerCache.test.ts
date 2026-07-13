import { describe, expect, it } from "vitest";

import { createWorkerCache } from "@/lib/ocrWorkerCache";

/**
 * La caché de workers es una unidad PURA con desalojo-en-rechazo. Se ejercita
 * con factorías falsas (que cuentan invocaciones y resuelven/rechazan a
 * voluntad), sin instanciar ningún worker real. (#34 R7, R8a, R8b, R9)
 */
describe("ocrWorkerCache — desalojo en rechazo (#34 R7, R8a, R8b, R9)", () => {
  it("factory que resuelve: reutiliza la promesa y sólo invoca la factoría una vez (R9)", async () => {
    let calls = 0;
    const cache = createWorkerCache<string>((key) => {
      calls++;
      return Promise.resolve(`worker:${key}`);
    });

    const first = cache.get("spa");
    const second = cache.get("spa");

    expect(first).toBe(second); // misma promesa reutilizada
    await expect(first).resolves.toBe("worker:spa");
    expect(calls).toBe(1); // factoría invocada una sola vez
  });

  it("factory que rechaza: la clave NO queda cacheada (R7)", async () => {
    const cache = createWorkerCache<string>(() =>
      Promise.reject(new Error("boom")),
    );

    const created = cache.get("eng");
    await expect(created).rejects.toThrow("boom");
    // El .catch de desalojo corre en un microtask; espera al ciclo.
    await Promise.resolve();

    expect(cache.values()).toHaveLength(0);
  });

  it("rechaza una vez y luego resuelve: el reintento re-invoca la factoría (R8a) y resuelve (R8b)", async () => {
    let calls = 0;
    const cache = createWorkerCache<string>((key) => {
      calls++;
      if (calls === 1) {
        return Promise.reject(new Error("primer intento falla"));
      }
      return Promise.resolve(`worker:${key}`);
    });

    await expect(cache.get("fra")).rejects.toThrow("primer intento falla");
    await Promise.resolve(); // deja correr el desalojo

    const retry = cache.get("fra");
    await expect(retry).resolves.toBe("worker:fra"); // R8b: reintento con éxito
    expect(calls).toBe(2); // R8a: factoría re-invocada
    expect(cache.values()).toHaveLength(1);
  });

  it("clear() vacía la caché; values() refleja las promesas activas", async () => {
    const cache = createWorkerCache<string>((key) =>
      Promise.resolve(`w:${key}`),
    );
    cache.get("spa");
    cache.get("eng");
    expect(cache.values()).toHaveLength(2);
    cache.clear();
    expect(cache.values()).toHaveLength(0);
  });
});
