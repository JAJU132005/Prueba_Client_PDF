import { describe, expect, it } from "vitest";

import errorBubbleSource from "@/components/ErrorBubble.tsx?raw";
import footerSource from "@/components/Footer.tsx?raw";
import headerSource from "@/components/Header.tsx?raw";
import pandaArtSource from "@/components/PandaArt.tsx?raw";
import pandaWidgetSource from "@/components/PandaWidget.tsx?raw";
import progressBarSource from "@/components/ProgressBar.tsx?raw";
import resultPanelSource from "@/components/ResultPanel.tsx?raw";
import toolCardSource from "@/components/ToolCard.tsx?raw";
import toolPageHeaderSource from "@/components/ToolPageHeader.tsx?raw";
import toolSkinSource from "@/lib/toolSkin.ts?raw";
import homeSource from "@/routes/Home.tsx?raw";
import indexHtml from "../../index.html?raw";
import tokensCss from "./tokens.css?raw";

/**
 * Invariante cero-red de la capa de PIEL del rediseño #28 (R6, R42). Mismo
 * patrón de escaneo estático (`?raw`, sin `node:fs`) que
 * `offlineEducationNoBackend.test.ts`: los módulos nuevos de presentación no
 * hacen ninguna llamada de red ni referencian URLs externas con datos del
 * usuario; las fuentes son locales.
 */
const NETWORK_PATTERNS: RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
  /axios/,
];

/** Orígenes externos prohibidos en la piel (tipografías y CDNs). */
const EXTERNAL_URL_PATTERN =
  /https?:\/\/(?!www\.w3\.org\/)[\w.-]+/;

const SKIN_MODULES: { label: string; source: string }[] = [
  { label: "PandaArt.tsx", source: pandaArtSource },
  { label: "PandaWidget.tsx", source: pandaWidgetSource },
  { label: "ProgressBar.tsx", source: progressBarSource },
  { label: "ResultPanel.tsx", source: resultPanelSource },
  { label: "ErrorBubble.tsx", source: errorBubbleSource },
  { label: "ToolPageHeader.tsx", source: toolPageHeaderSource },
  { label: "ToolCard.tsx", source: toolCardSource },
  { label: "Header.tsx", source: headerSource },
  { label: "Footer.tsx", source: footerSource },
  { label: "toolSkin.ts", source: toolSkinSource },
  { label: "Home.tsx", source: homeSource },
];

describe("design_integration_reskin — invariante cero-red de la piel (R42)", () => {
  for (const { label, source } of SKIN_MODULES) {
    it(`${label} no contiene llamadas de red ni URLs externas (R42)`, () => {
      for (const pattern of NETWORK_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
      // El namespace SVG (www.w3.org) es un identificador, no una petición.
      expect(source).not.toMatch(EXTERNAL_URL_PATTERN);
    });
  }

  it("las tipografías del reskin son locales: cero orígenes externos en tokens.css e index.html (R6)", () => {
    for (const source of [tokensCss, indexHtml]) {
      expect(source).not.toMatch(/fonts\.googleapis\.com/);
      expect(source).not.toMatch(/fonts\.gstatic\.com/);
      expect(source).not.toMatch(EXTERNAL_URL_PATTERN);
    }
  });
});
