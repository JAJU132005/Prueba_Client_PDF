import { describe, expect, it } from "vitest";

import { PWA_MANIFEST } from "@/pwa/manifest";
import { PWA_OPTIONS } from "@/pwa/pwaConfig";

const NETWORK = /https?:|\/\//;

describe("PWA_OPTIONS — configuración del plugin PWA (R13–R21)", () => {
  it("usa exactamente PWA_MANIFEST como manifest (R13)", () => {
    expect(PWA_OPTIONS.manifest).toEqual(PWA_MANIFEST);
  });

  it("precachea el shell: html, css y js (R14)", () => {
    const globs = PWA_OPTIONS.workbox.globPatterns ?? [];
    const joined = globs.join(" ");
    expect(joined).toContain("html");
    expect(joined).toContain("css");
    expect(joined).toContain("js");
  });

  it("precachea los assets de herramientas: wasm y mjs (R15)", () => {
    const globs = PWA_OPTIONS.workbox.globPatterns ?? [];
    const joined = globs.join(" ");
    expect(joined).toContain("wasm");
    expect(joined).toContain("mjs");
  });

  it("usa navigateFallback 'index.html' para rutas SPA offline (R16)", () => {
    expect(PWA_OPTIONS.workbox.navigateFallback).toBe("index.html");
  });

  it("desactiva el SW en desarrollo (R17)", () => {
    expect(PWA_OPTIONS.devOptions.enabled).toBe(false);
  });

  it("usa registerType 'autoUpdate' (R18)", () => {
    expect(PWA_OPTIONS.registerType).toBe("autoUpdate");
  });

  it("fija cleanupOutdatedCaches para cache-bustear builds anteriores (#42 R7)", () => {
    expect(PWA_OPTIONS.workbox.cleanupOutdatedCaches).toBe(true);
  });

  it("reafirma registerType 'autoUpdate' para el control inmediato del SW nuevo (#42 R6)", () => {
    expect(PWA_OPTIONS.registerType).toBe("autoUpdate");
  });

  it("usa injectRegister false (registro explícito) (R19)", () => {
    expect(PWA_OPTIONS.injectRegister).toBe(false);
  });

  it("NO declara runtimeCaching (cero-backend) (R20)", () => {
    expect(
      (PWA_OPTIONS.workbox as { runtimeCaching?: unknown }).runtimeCaching,
    ).toBeUndefined();
  });

  it("ningún globPattern contiene esquema o autoridad de red (R21)", () => {
    const globs = PWA_OPTIONS.workbox.globPatterns ?? [];
    for (const pattern of globs) {
      expect(pattern).not.toMatch(NETWORK);
    }
  });
});
