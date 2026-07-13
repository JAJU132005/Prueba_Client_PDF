import { describe, expect, it } from "vitest";

import tailwindConfigRaw from "../../tailwind.config.ts?raw";
import imagePreviewModalRaw from "../components/ImagePreviewModal.tsx?raw";
import pageRangeSelectorRaw from "../components/PageRangeSelector.tsx?raw";
import pdfPreviewModalRaw from "../components/PdfPreviewModal.tsx?raw";
import resultPanelRaw from "../components/ResultPanel.tsx?raw";
import organizePagesRaw from "../routes/OrganizePages.tsx?raw";
import pdfToImagesRaw from "../routes/PdfToImages.tsx?raw";
import tokensCss from "./tokens.css?raw";

/** Variables CSS que R1 exige con sus nombres originales. */
const REQUIRED_VARIABLES = [
  "--paper",
  "--card",
  "--surface",
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
  "--panda-fur",
  "--panda-patch",
  "--panda-eye",
];

/** Extrae el cuerpo del bloque de tema oscuro (html.dark, [data-theme="dark"]). */
function darkBlock(): string {
  const match = tokensCss.match(/html\.dark[^{]*\{([^}]*)\}/);
  return match?.[1] ?? "";
}

/** Lee el valor hex #rrggbb de una variable dentro de un bloque CSS. */
function hexOf(block: string, variable: string): string {
  const match = block.match(
    new RegExp(`${variable}:\\s*(#[0-9a-fA-F]{6})`),
  );
  if (!match) {
    throw new Error(`no se encontró ${variable} como hex en el bloque`);
  }
  return match[1];
}

/** Opacidad de la componente blanca de `--line` (rgba(255,255,255,α)) en un bloque. */
function lineWhiteAlpha(block: string): number {
  const match = block.match(
    /--line:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([0-9.]+)\s*\)/,
  );
  if (!match) {
    throw new Error("no se encontró --line como rgba blanca en el bloque");
  }
  return parseFloat(match[1]);
}

/** Linearización sRGB de un canal 0..255 (WCAG 2.x). */
function channelToLinear(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa de un color #rrggbb (WCAG 2.x). */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

/** Relación de contraste WCAG entre dos colores #rrggbb. */
function contrast(hexA: string, hexB: string): number {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

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
      ["surface", "--surface"],
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

describe("dark_mode_redesign — token de superficie sin planchas quemadas (#41)", () => {
  it("las clases .pagecell y .sheet usan var(--surface) y ya no #fff (R8)", () => {
    const pagecell = tokensCss.match(/\.pagecell\s*\{[^}]*\}/)?.[0] ?? "";
    const sheet = tokensCss.match(/\.sheet\s*\{[^}]*\}/)?.[0] ?? "";
    expect(pagecell).toContain("background: var(--surface)");
    expect(pagecell).not.toMatch(/background:\s*#fff/);
    expect(sheet).toContain("background: var(--surface)");
    expect(sheet).not.toMatch(/background:\s*#fff/);
  });

  it("la tinta de .pagecell deriva de var(--ink), no del hex hardcodeado (R10)", () => {
    const pagecell = tokensCss.match(/\.pagecell\s*\{[^}]*\}/)?.[0] ?? "";
    expect(pagecell).toContain("color: var(--ink)");
    expect(pagecell).not.toContain("#2d2a26");
  });

  it("--surface en :root es blanco puro para no degradar el modo claro (R16)", () => {
    const rootBlock = tokensCss.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(hexOf(rootBlock, "--surface").toLowerCase()).toBe("#ffffff");
  });
});

describe("dark_mode_redesign — contraste WCAG AA del tema oscuro (#41, R21)", () => {
  const dark = darkBlock();
  const paper = hexOf(dark, "--paper");
  const card = hexOf(dark, "--card");
  const surface = hexOf(dark, "--surface");
  const ink = hexOf(dark, "--ink");
  const inkSoft = hexOf(dark, "--ink-soft");
  const mkGreen = hexOf(dark, "--mk-green");
  const mkOrange = hexOf(dark, "--mk-orange");
  const mkRed = hexOf(dark, "--mk-red");
  const fur = hexOf(dark, "--panda-fur");
  const patch = hexOf(dark, "--panda-patch");

  it("--card y --paper son superficies distinguibles (≥ 1.3:1) (R1)", () => {
    expect(contrast(card, paper)).toBeGreaterThanOrEqual(1.3);
  });

  it("--line tiene opacidad blanca efectiva ≥ 0.12 y > 0.06 (R2)", () => {
    const alpha = lineWhiteAlpha(dark);
    expect(alpha).toBeGreaterThanOrEqual(0.12);
    expect(alpha).toBeGreaterThan(0.06);
  });

  it("--ink mantiene ≥ 4.5:1 sobre --paper, --card y --surface (R3)", () => {
    for (const bg of [paper, card, surface]) {
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("--ink-soft mantiene ≥ 4.5:1 sobre --paper, --card y --surface (R4)", () => {
    for (const bg of [paper, card, surface]) {
      expect(contrast(inkSoft, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("cada marcador de nivel mantiene ≥ 3:1 sobre --paper (R5)", () => {
    for (const mk of [mkGreen, mkOrange, mkRed]) {
      expect(contrast(mk, paper)).toBeGreaterThanOrEqual(3);
    }
  });

  it("--panda-fur y --panda-patch mantienen ≥ 3:1 entre sí (R14)", () => {
    expect(contrast(fur, patch)).toBeGreaterThanOrEqual(3);
  });

  it("los tokens del panda en oscuro no son blanco ni negro puros (R11)", () => {
    for (const value of [fur, patch, hexOf(dark, "--panda-eye")]) {
      expect(value.toLowerCase()).not.toBe("#ffffff");
      expect(value.toLowerCase()).not.toBe("#000000");
    }
  });
});

describe("dark_mode_redesign — bg-surface sustituye a bg-white en las hojas (#41, R9)", () => {
  const components: Array<[string, string, string]> = [
    ["ResultPanel.tsx", resultPanelRaw, "bg-surface"],
    ["PdfPreviewModal.tsx", pdfPreviewModalRaw, "bg-surface"],
    ["ImagePreviewModal.tsx", imagePreviewModalRaw, "bg-surface"],
    ["routes/OrganizePages.tsx", organizePagesRaw, "bg-surface"],
    ["routes/PdfToImages.tsx", pdfToImagesRaw, "bg-surface"],
    ["PageRangeSelector.tsx", pageRangeSelectorRaw, "bg-surface/80"],
  ];

  it.each(components)(
    "%s usa %s en la superficie de hoja/página",
    (_name, raw, surfaceClass) => {
      expect(raw).toContain(surfaceClass);
    },
  );

  it.each(components)(
    "%s ya no conserva bg-white en la superficie sustituida",
    (_name, raw) => {
      expect(raw).not.toContain("bg-white");
    },
  );
});
