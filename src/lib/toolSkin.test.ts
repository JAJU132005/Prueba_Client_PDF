import { describe, expect, it } from "vitest";

import {
  getToolHlClass,
  getToolLvClass,
  getToolSkin,
  LEVEL_PHRASE,
  TOOL_SKINS,
} from "@/lib/toolSkin";
import { TOOLS } from "@/lib/tools";

describe("toolSkin", () => {
  it("define una piel completa para cada una de las 16 herramientas (R27)", () => {
    for (const tool of TOOLS) {
      const skin = getToolSkin(tool.id);
      expect(skin, `falta piel de ${tool.id}`).toBeDefined();
      expect(skin?.scene.length).toBeGreaterThan(0);
      expect(skin?.glyph.length).toBeGreaterThan(0);
      expect(skin?.sceneTitle.length).toBeGreaterThan(0);
      expect(skin?.actionLabel.length).toBeGreaterThan(0);
    }
    expect(Object.keys(TOOL_SKINS)).toHaveLength(16);
  });

  it("cada escena usa el slug del entregable (R27)", () => {
    expect(getToolSkin("merge")?.scene).toBe("unir");
    expect(getToolSkin("annotate")?.scene).toBe("editar");
    expect(getToolSkin("pdf-to-images")?.scene).toBe("pdf-a-imagenes");
    expect(getToolSkin("ocr")?.scene).toBe("ocr");
  });

  it("las clases hl-*/lv-* derivan del nivel de la herramienta (R22, R27)", () => {
    expect(getToolHlClass("merge")).toBe("hl-ligera");
    expect(getToolHlClass("organize")).toBe("hl-media");
    expect(getToolHlClass("compress")).toBe("hl-pesada");
    expect(getToolLvClass("merge")).toBe("lv-ligera");
    expect(getToolLvClass("protect")).toBe("lv-media");
    expect(getToolLvClass("ocr")).toBe("lv-pesada");
  });

  it("hay una frase de nivel por cada nivel de consumo", () => {
    expect(LEVEL_PHRASE.light.length).toBeGreaterThan(0);
    expect(LEVEL_PHRASE.medium.length).toBeGreaterThan(0);
    expect(LEVEL_PHRASE.heavy.length).toBeGreaterThan(0);
  });

  it("no existe piel para ids desconocidos", () => {
    expect(getToolSkin("no-existe")).toBeUndefined();
  });
});
