import { describe, expect, it } from "vitest";

import bannerSource from "@/components/OfflineEducationBanner.tsx?raw";
import helpModalSource from "@/components/OfflineHelpModal.tsx?raw";
import indicatorSource from "@/components/OfflineIndicator.tsx?raw";
import copySource from "@/lib/offlineEducation.ts?raw";
import hookSource from "@/lib/useOnlineStatus.ts?raw";

/**
 * Invariante cero-backend de la capa de educación PWA (#22, R19). El fuente se
 * lee vía `?raw` de Vite (sin `node:fs`), igual que `pwaNoBackend.test.ts`.
 * Refuerza que los módulos nuevos son solo informativos/UI: no hacen red ni
 * envían datos del usuario. Solo se permite leer `navigator.onLine` y escuchar
 * eventos locales del `window`.
 */
const NETWORK_PATTERNS: RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
];

const EDUCATION_MODULES: { label: string; source: string }[] = [
  { label: "offlineEducation.ts", source: copySource },
  { label: "useOnlineStatus.ts", source: hookSource },
  { label: "OfflineIndicator.tsx", source: indicatorSource },
  { label: "OfflineHelpModal.tsx", source: helpModalSource },
  { label: "OfflineEducationBanner.tsx", source: bannerSource },
];

describe("offline_pwa_education — invariante cero-backend (R19)", () => {
  for (const { label, source } of EDUCATION_MODULES) {
    it(`${label} no contiene llamadas de red sospechosas (R19)`, () => {
      for (const pattern of NETWORK_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
