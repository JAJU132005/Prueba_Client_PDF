import { describe, expect, it } from "vitest";

import tailwindConfigRaw from "../../tailwind.config.ts?raw";
import tokensCss from "./tokens.css?raw";

/** Variables CSS que R1 exige con sus nombres originales. */
const REQUIRED_VARIABLES = [
  "--paper",
  "--card",
  "--line",
  "--margin",
  "--ink",
  "--ink-soft",
  "--tape",
  "--postit",
  "--mk-green",
  "--mk-orange",
  "--mk-red",
  "--hl-green",
  "--hl-orange",
  "--hl-red",
  "--shadow",
  "--font-display",
  "--font-scrawl",
  "--font-body",
  "--font-mono",
  "--radius-wonky",
  "--radius-oval",
  "--radius-scrap",
];

describe("tokens.css (El Diario del Panda)", () => {
  it("define todas las variables del tema con sus nombres originales (R1)", () => {
    for (const variable of REQUIRED_VARIABLES) {
      expect(tokensCss, `falta ${variable}`).toContain(`${variable}:`);
    }
  });

  it("activa el tema oscuro con el selector html.dark (R1)", () => {
    expect(tokensCss).toMatch(/html\.dark/);
  });

  it("aplica el foco de teclado garabateado global con :focus-visible (R8)", () => {
    const focusBlock = tokensCss.match(/:focus-visible\s*\{[^}]*\}/);
    expect(focusBlock).not.toBeNull();
    expect(focusBlock?.[0]).toContain("outline: 3px dashed var(--ink)");
  });

  it("reduce animaciones y transiciones con prefers-reduced-motion (R9)", () => {
    expect(tokensCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(tokensCss).toMatch(/animation-duration:\s*0?\.01ms\s*!important/);
    expect(tokensCss).toMatch(/transition-duration:\s*0?\.01ms\s*!important/);
  });

  it("porta las clases de componente del entregable en @layer components (R1)", () => {
    for (const selector of [
      ".card",
      ".btn",
      ".badge",
      ".dropzone",
      ".filerow",
      ".progress",
      ".pagecell",
      ".sheet",
      ".postit",
      ".tape",
      ".pin",
      ".clip",
      ".stamp-topsecret",
      ".zero",
      ".hand",
      ".scrawl",
      ".mono",
      ".soft",
      ".hl-ligera",
      ".hl-media",
      ".hl-pesada",
    ]) {
      expect(tokensCss, `falta ${selector}`).toContain(`${selector} {`);
    }
    expect(tokensCss).toContain("@layer components");
  });
});

describe("tailwind.config.ts (R2)", () => {
  it("expone los colores del diseño mapeados a variables CSS", () => {
    for (const [key, variable] of [
      ["paper", "--paper"],
      ["card", "--card"],
      ["line", "--line"],
      ["postit", "--postit"],
      ["tape", "--tape"],
    ]) {
      expect(tailwindConfigRaw).toContain(`${key}: "var(${variable})"`);
    }
    expect(tailwindConfigRaw).toContain('DEFAULT: "var(--ink)"');
    expect(tailwindConfigRaw).toContain('soft: "var(--ink-soft)"');
    for (const tone of ["green", "orange", "red"]) {
      expect(tailwindConfigRaw).toContain(`${tone}: "var(--mk-${tone})"`);
      expect(tailwindConfigRaw).toContain(`${tone}: "var(--hl-${tone})"`);
    }
  });

  it("expone las familias hand/scrawl/body/mono y los radios wonky/oval/scrap", () => {
    expect(tailwindConfigRaw).toContain('hand: ["var(--font-display)"]');
    expect(tailwindConfigRaw).toContain('scrawl: ["var(--font-scrawl)"]');
    expect(tailwindConfigRaw).toContain('body: ["var(--font-body)"]');
    expect(tailwindConfigRaw).toContain('mono: ["var(--font-mono)"]');
    expect(tailwindConfigRaw).toContain('wonky: "var(--radius-wonky)"');
    expect(tailwindConfigRaw).toContain('oval: "var(--radius-oval)"');
    expect(tailwindConfigRaw).toContain('scrap: "var(--radius-scrap)"');
    expect(tailwindConfigRaw).toContain('doodle: "4px 5px 0 var(--shadow)"');
  });
});
