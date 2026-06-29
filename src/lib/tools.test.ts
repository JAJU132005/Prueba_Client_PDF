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
  it("lista las 10 herramientas previstas (features #5-#14) (R5)", () => {
    expect(TOOLS).toHaveLength(10);
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
});
