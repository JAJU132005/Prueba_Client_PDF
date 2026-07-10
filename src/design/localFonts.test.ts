import { describe, expect, it } from "vitest";

import { PWA_OPTIONS } from "@/pwa/pwaConfig";
import indexHtml from "../../index.html?raw";
import tokensCss from "./tokens.css?raw";

const EXTERNAL_FONT_ORIGINS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/];

describe("fuentes locales (R5, R6)", () => {
  it("declara las 3 familias con @font-face y src local en /fonts/ (R5)", () => {
    for (const family of ["Patrick Hand", "Gochi Hand", "Nunito"]) {
      const face = tokensCss.match(
        new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${family}"[^}]*\\}`),
      );
      expect(face, `falta @font-face de ${family}`).not.toBeNull();
      expect(face?.[0]).toMatch(/src:\s*url\("\/fonts\/[\w.-]+\.woff2"\)\s*format\("woff2"\)/);
    }
  });

  it("no referencia orígenes externos de tipografías en tokens.css (R6)", () => {
    for (const origin of EXTERNAL_FONT_ORIGINS) {
      expect(tokensCss).not.toMatch(origin);
    }
  });

  it("no referencia orígenes externos de tipografías en index.html (R6)", () => {
    for (const origin of EXTERNAL_FONT_ORIGINS) {
      expect(indexHtml).not.toMatch(origin);
    }
    expect(indexHtml).not.toContain("preconnect");
  });

  it("mantiene woff2 en el precache del service worker (R7)", () => {
    const globs = PWA_OPTIONS.workbox.globPatterns ?? [];
    expect(globs.join(" ")).toContain("woff2");
  });
});
