import { describe, expect, it } from "vitest";

import {
  BANNER_MESSAGE,
  INSTALL_STEPS_DESKTOP,
  INSTALL_STEPS_MOBILE,
  OFFLINE_REASSURANCE,
  OFFLINE_USAGE_STEPS,
  PRIVACY_BADGE_TEXT,
  PRIVACY_REMINDER,
} from "@/lib/offlineEducation";

describe("offlineEducation copy", () => {
  it("BANNER_MESSAGE es el texto exacto del aviso de primera visita (R1)", () => {
    expect(BANNER_MESSAGE).toBe(
      "Funciona sin internet · instálala para usarla offline",
    );
  });

  it("los pasos de instalación de escritorio no están vacíos (R7)", () => {
    expect(INSTALL_STEPS_DESKTOP.length).toBeGreaterThan(0);
    expect(INSTALL_STEPS_DESKTOP.every((s) => s.trim().length > 0)).toBe(true);
  });

  it("los pasos de instalación de móvil no están vacíos (R8)", () => {
    expect(INSTALL_STEPS_MOBILE.length).toBeGreaterThan(0);
    expect(INSTALL_STEPS_MOBILE.every((s) => s.trim().length > 0)).toBe(true);
  });

  it("los pasos de uso offline no están vacíos (R9)", () => {
    expect(OFFLINE_USAGE_STEPS.length).toBeGreaterThan(0);
    expect(OFFLINE_USAGE_STEPS.every((s) => s.trim().length > 0)).toBe(true);
  });

  it("PRIVACY_REMINDER menciona el procesamiento local (R12)", () => {
    expect(PRIVACY_REMINDER.toLowerCase()).toContain("local");
    expect(PRIVACY_REMINDER).toContain(PRIVACY_BADGE_TEXT);
  });

  it("OFFLINE_REASSURANCE es tranquilizador (menciona que sigue funcionando) (R16)", () => {
    expect(OFFLINE_REASSURANCE.toLowerCase()).toMatch(/sigue funcionando/);
    expect(OFFLINE_REASSURANCE.toLowerCase()).toContain("navegador");
  });
});
