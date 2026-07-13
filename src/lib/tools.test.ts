import { describe, expect, it } from "vitest";

import { TOOLS } from "@/lib/tools";
import type { ToolCategory } from "@/lib/tools";

const VALID_CATEGORIES: ReadonlySet<ToolCategory> = new Set<ToolCategory>([
  "organizar",
  "convertir",
  "optimizar",
  "seguridad",
]);

describe("TOOLS", () => {
  it("lista las 15 herramientas previstas (features #5-#27; firma unificada #36) (R5)", () => {
    expect(TOOLS).toHaveLength(15);
  });

  it("expone los ids esperados del catálogo (R5)", () => {
    const ids = TOOLS.map((tool) => tool.id);
    expect(ids).toEqual([
      "merge",
      "split",
      "rotate",
      "organize",
      "pdf-to-images",
      "images-to-pdf",
      "page-numbers",
      "watermark",
      "compress",
      "protect",
      "annotate",
      "sign",
      "fill-forms",
      "ocr",
      "redact",
    ]);
  });

  it("cada herramienta tiene título y descripción no vacíos (R5)", () => {
    for (const tool of TOOLS) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("todas las rutas son únicas y empiezan por '/' (R5)", () => {
    const paths = TOOLS.map((tool) => tool.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path.startsWith("/")).toBe(true);
    }
  });

  it("cada categoría pertenece al conjunto válido (R5)", () => {
    for (const tool of TOOLS) {
      expect(VALID_CATEGORIES.has(tool.category)).toBe(true);
    }
  });

  // Ampliación ADITIVA #28 (R30/R46): mapeo herramienta → plantilla EXACTO al
  // de design-incoming/README.md. Las aserciones anteriores no se alteran.
  it("cada herramienta tiene el template exacto de design-incoming/README.md (#28 R30)", () => {
    const templates = Object.fromEntries(
      TOOLS.map((tool) => [tool.id, tool.template]),
    );
    expect(templates).toEqual({
      merge: "01-multi-file",
      "images-to-pdf": "01-multi-file",
      rotate: "02-options",
      compress: "02-options",
      protect: "02-options",
      ocr: "02-options",
      split: "03-page-select",
      organize: "03-page-select",
      "pdf-to-images": "03-page-select",
      "page-numbers": "04-editor-preview",
      watermark: "04-editor-preview",
      annotate: "04-editor-preview",
      sign: "04-editor-preview",
      "fill-forms": "04-editor-preview",
      redact: "04-editor-preview",
    });
  });
});
