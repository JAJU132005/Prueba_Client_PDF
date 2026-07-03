import { describe, expect, it } from "vitest";

import { PWA_MANIFEST } from "@/pwa/manifest";

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const NETWORK = /https?:|\/\//;

describe("PWA_MANIFEST — manifest web válido (R1–R12, R24)", () => {
  it("declara display standalone (R1)", () => {
    expect(PWA_MANIFEST.display).toBe("standalone");
  });

  it("declara start_url '/' (R2)", () => {
    expect(PWA_MANIFEST.start_url).toBe("/");
  });

  it("declara scope '/' (R3)", () => {
    expect(PWA_MANIFEST.scope).toBe("/");
  });

  it("declara name no vacío (R4)", () => {
    expect(typeof PWA_MANIFEST.name).toBe("string");
    expect(PWA_MANIFEST.name.length).toBeGreaterThan(0);
  });

  it("declara short_name no vacío (R5)", () => {
    expect(typeof PWA_MANIFEST.short_name).toBe("string");
    expect(PWA_MANIFEST.short_name.length).toBeGreaterThan(0);
  });

  it("declara description no vacía (R6)", () => {
    expect(typeof PWA_MANIFEST.description).toBe("string");
    expect(PWA_MANIFEST.description.length).toBeGreaterThan(0);
  });

  it("declara theme_color en hex de 6 dígitos (R7)", () => {
    expect(PWA_MANIFEST.theme_color).toMatch(HEX6);
  });

  it("declara background_color en hex de 6 dígitos (R8)", () => {
    expect(PWA_MANIFEST.background_color).toMatch(HEX6);
  });

  it("incluye un icono PNG 192x192 (R9)", () => {
    const found = PWA_MANIFEST.icons.some(
      (icon) => icon.sizes === "192x192" && icon.type === "image/png",
    );
    expect(found).toBe(true);
  });

  it("incluye un icono PNG 512x512 (R10)", () => {
    const found = PWA_MANIFEST.icons.some(
      (icon) => icon.sizes === "512x512" && icon.type === "image/png",
    );
    expect(found).toBe(true);
  });

  it("incluye al menos un icono maskable (R11)", () => {
    const found = PWA_MANIFEST.icons.some((icon) =>
      icon.purpose.includes("maskable"),
    );
    expect(found).toBe(true);
  });

  it("es serializable a JSON sin pérdida (R12)", () => {
    const roundtrip = JSON.parse(JSON.stringify(PWA_MANIFEST));
    expect(roundtrip).toEqual(PWA_MANIFEST);
  });

  it("todas las rutas src de iconos son relativas al mismo origen (R24)", () => {
    for (const icon of PWA_MANIFEST.icons) {
      expect(icon.src).not.toMatch(NETWORK);
    }
  });
});
