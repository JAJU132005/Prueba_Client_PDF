import { describe, expect, it } from "vitest";

import readmeSource from "../../README.md?raw";

/**
 * R32: la documentación pública (`app/README.md`) describe el smoke manual de la
 * PWA. El fuente se lee vía `?raw` (sin `node:fs`), por lo que corre en jsdom.
 */
describe("README — smoke manual de la PWA (R32)", () => {
  const lower = readmeSource.toLowerCase();

  it("incluye una sección de uso offline / PWA", () => {
    expect(readmeSource).toMatch(/##\s+Uso offline\s*\/\s*PWA/i);
  });

  it("menciona offline y service worker", () => {
    expect(lower).toContain("offline");
    expect(lower).toContain("service worker");
  });

  it("describe los pasos del smoke: instalar, ir offline y usar una herramienta", () => {
    expect(lower).toContain("instal");
    expect(lower).toContain("preview");
    expect(lower).toMatch(/recarg/);
    expect(lower).toMatch(/unir|herramienta/);
  });
});
