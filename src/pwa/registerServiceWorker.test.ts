import { describe, expect, it, vi } from "vitest";

import { registerServiceWorker } from "@/pwa/registerServiceWorker";

describe("registerServiceWorker — costura pura de registro (R25–R28)", () => {
  it("no registra en desarrollo y devuelve false (R25)", () => {
    const register = vi.fn();
    const result = registerServiceWorker(register, {
      isProduction: false,
      hasServiceWorker: true,
    });
    expect(register).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("no registra sin soporte de service worker y devuelve false (R26)", () => {
    const register = vi.fn();
    const result = registerServiceWorker(register, {
      isProduction: true,
      hasServiceWorker: false,
    });
    expect(register).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("registra exactamente una vez en producción con soporte y devuelve true (R27)", () => {
    const register = vi.fn();
    const result = registerServiceWorker(register, {
      isProduction: true,
      hasServiceWorker: true,
    });
    expect(register).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});
