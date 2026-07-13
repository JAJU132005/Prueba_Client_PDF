import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HEAVY_MOBILE_WARNING,
  RESOURCE_COST_BADGE_CLASSES,
  RESOURCE_COST_EXPLANATION,
  RESOURCE_COST_LABEL,
  type ResourceCost,
} from "@/lib/resourceCost";
import { TOOLS, getToolResourceCost } from "@/lib/tools";

const LEVELS: ResourceCost[] = ["light", "medium", "heavy"];

/** Clasificación acordada (requirements.md §Clasificación). (R2) */
const EXPECTED_CLASSIFICATION: Record<string, ResourceCost> = {
  merge: "light",
  split: "light",
  rotate: "light",
  organize: "medium",
  "pdf-to-images": "medium",
  "images-to-pdf": "light",
  "page-numbers": "light",
  watermark: "light",
  compress: "heavy",
  protect: "medium",
  annotate: "heavy",
  sign: "medium",
  "fill-forms": "medium",
  ocr: "heavy",
  redact: "medium",
};

describe("resourceCost — tablas de presentación (R4, R5, R8)", () => {
  it("RESOURCE_COST_LABEL define los 3 niveles con texto no vacío (R4)", () => {
    for (const level of LEVELS) {
      expect(RESOURCE_COST_LABEL[level]).toBeTruthy();
      expect(RESOURCE_COST_LABEL[level].trim().length).toBeGreaterThan(0);
    }
    expect(RESOURCE_COST_LABEL).toEqual({
      light: "Ligera",
      medium: "Media",
      heavy: "Pesada",
    });
  });

  it("RESOURCE_COST_EXPLANATION define una frase no vacía por nivel (R8)", () => {
    for (const level of LEVELS) {
      expect(RESOURCE_COST_EXPLANATION[level].trim().length).toBeGreaterThan(0);
    }
  });

  it("RESOURCE_COST_BADGE_CLASSES asigna una clase de color distinta por nivel (R5)", () => {
    const values = LEVELS.map((level) => RESOURCE_COST_BADGE_CLASSES[level]);
    for (const value of values) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(values).size).toBe(LEVELS.length);
  });

  it("HEAVY_MOBILE_WARNING es un texto no vacío (R9)", () => {
    expect(HEAVY_MOBILE_WARNING.trim().length).toBeGreaterThan(0);
  });
});

describe("resourceCost — fuente única en TOOLS (R1, R2, R13)", () => {
  it("cada Tool tiene resourceCost dentro de la unión light|medium|heavy (R1)", () => {
    for (const tool of TOOLS) {
      expect(LEVELS).toContain(tool.resourceCost);
    }
  });

  it("la clasificación de TOOLS coincide con la tabla acordada (R2)", () => {
    const actual = Object.fromEntries(
      TOOLS.map((tool) => [tool.id, tool.resourceCost]),
    );
    expect(actual).toEqual(EXPECTED_CLASSIFICATION);
  });

  it("getToolResourceCost resuelve por id y devuelve undefined si no existe (R1)", () => {
    expect(getToolResourceCost("compress")).toBe("heavy");
    expect(getToolResourceCost("merge")).toBe("light");
    expect(getToolResourceCost("organize")).toBe("medium");
    expect(getToolResourceCost("no-existe")).toBeUndefined();
  });
});

describe("resourceCost — invariante cero-red (R13)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("el nivel se obtiene de forma síncrona sin invocar fetch (R13)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const level = getToolResourceCost("compress");
    expect(level).toBe("heavy");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
