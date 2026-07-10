// @vitest-environment node
//
// Dominio PURO de la geometría del overlay de campos (#31). Se ejecuta en el
// entorno NODE de Vitest (sin jsdom) para verificar que el módulo no toca el DOM
// ni `window` (R25) y que opera solo sobre datos planos, sin pdf-lib (R28).
import { describe, expect, it } from "vitest";

import {
  buildFieldWidgets,
  pageIndexForField,
  widgetRectToPreviewPixels,
  widgetsForPage,
  type RawWidget,
} from "@/pdf/formOverlay";
import type { FormFieldInfo } from "@/pdf/fillForms";
// El fuente del módulo se lee como texto vía `?raw` de Vite (sin `node:fs`) para
// verificar su pureza (sin React, sin DOM, sin pdf-lib). (R25, R28)
import formOverlaySource from "@/pdf/formOverlay.ts?raw";
import { toPreviewPixels, type PreviewPageSize } from "@/pdf/previewModel";

describe("buildFieldWidgets (R1, R2, R4)", () => {
  it("resuelve el índice de página y conserva un rect por widget (R1, R2)", () => {
    const pageRefIds = ["1 0 R", "2 0 R", "3 0 R"];
    const raws: RawWidget[] = [
      { rect: { x: 10, y: 20, width: 30, height: 12 }, pageRefId: "1 0 R" },
      { rect: { x: 50, y: 60, width: 15, height: 15 }, pageRefId: "3 0 R" },
    ];
    const widgets = buildFieldWidgets(raws, pageRefIds);
    expect(widgets).toEqual([
      { pageIndex: 0, rect: { x: 10, y: 20, width: 30, height: 12 } },
      { pageIndex: 2, rect: { x: 50, y: 60, width: 15, height: 15 } },
    ]);
  });

  it("conserva un widget por cada opción de un grupo radio (R2)", () => {
    const pageRefIds = ["1 0 R"];
    const raws: RawWidget[] = [
      { rect: { x: 20, y: 290, width: 15, height: 15 }, pageRefId: "1 0 R" },
      { rect: { x: 60, y: 290, width: 15, height: 15 }, pageRefId: "1 0 R" },
    ];
    expect(buildFieldWidgets(raws, pageRefIds)).toHaveLength(2);
  });

  it("omite widgets con pageRefId null o no resoluble (R4)", () => {
    const pageRefIds = ["1 0 R", "2 0 R"];
    const raws: RawWidget[] = [
      { rect: { x: 1, y: 1, width: 1, height: 1 }, pageRefId: null },
      { rect: { x: 2, y: 2, width: 2, height: 2 }, pageRefId: "9 0 R" },
      { rect: { x: 3, y: 3, width: 3, height: 3 }, pageRefId: "2 0 R" },
    ];
    const widgets = buildFieldWidgets(raws, pageRefIds);
    expect(widgets).toEqual([
      { pageIndex: 1, rect: { x: 3, y: 3, width: 3, height: 3 } },
    ]);
  });
});

describe("widgetRectToPreviewPixels (R5, R6)", () => {
  it("produce el MISMO rectángulo que toPreviewPixels para scale != 1 (R5)", () => {
    const page: PreviewPageSize = { width: 300, height: 400 };
    const rect = { x: 20, y: 350, width: 200, height: 20 };
    const scale = 1.5;

    const derived = widgetRectToPreviewPixels(rect, page, scale);
    const reference = toPreviewPixels(
      {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        opacity: 1,
        rotationDegrees: 0,
        content: { kind: "image" },
      },
      page,
      scale,
    );

    expect(derived).toEqual(reference);
    // Origen superior-izquierdo: top = (height - y - h) * scale. (R6)
    expect(derived).toEqual({
      left: 20 * scale,
      top: (400 - 350 - 20) * scale,
      width: 200 * scale,
      height: 20 * scale,
    });
  });
});

describe("widgetsForPage (R7, R9)", () => {
  const fields: FormFieldInfo[] = [
    {
      name: "nombre",
      type: "text",
      value: "",
      widgets: [{ pageIndex: 0, rect: { x: 1, y: 1, width: 10, height: 5 } }],
    },
    {
      name: "firma",
      type: "text",
      value: "",
      widgets: [{ pageIndex: 1, rect: { x: 2, y: 2, width: 20, height: 8 } }],
    },
    {
      name: "color",
      type: "radio",
      value: "",
      widgets: [
        { pageIndex: 0, rect: { x: 3, y: 3, width: 15, height: 15 } },
        { pageIndex: 1, rect: { x: 4, y: 4, width: 15, height: 15 } },
      ],
    },
  ];

  it("devuelve solo los widgets de la página pedida con su nombre (R7, R9)", () => {
    const page0 = widgetsForPage(fields, 0);
    expect(page0).toEqual([
      { fieldName: "nombre", rect: { x: 1, y: 1, width: 10, height: 5 } },
      { fieldName: "color", rect: { x: 3, y: 3, width: 15, height: 15 } },
    ]);

    const page1 = widgetsForPage(fields, 1);
    expect(page1.map((w) => w.fieldName)).toEqual(["firma", "color"]);
  });

  it("devuelve vacío si ningún widget está en esa página (R9)", () => {
    expect(widgetsForPage(fields, 5)).toEqual([]);
  });
});

describe("pageIndexForField (R13)", () => {
  const fieldOnPage2: FormFieldInfo = {
    name: "firma",
    type: "text",
    value: "",
    widgets: [{ pageIndex: 2, rect: { x: 0, y: 0, width: 1, height: 1 } }],
  };

  it("salta a la página del widget cuando está en otra página (R13)", () => {
    expect(pageIndexForField(fieldOnPage2, 0)).toBe(2);
  });

  it("conserva la página actual si un widget ya está en ella (R13)", () => {
    const multi: FormFieldInfo = {
      name: "color",
      type: "radio",
      value: "",
      widgets: [
        { pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 } },
        { pageIndex: 2, rect: { x: 0, y: 0, width: 1, height: 1 } },
      ],
    };
    expect(pageIndexForField(multi, 0)).toBe(0);
  });

  it("conserva la página actual si el campo no tiene widgets (R13)", () => {
    const noWidgets: FormFieldInfo = { name: "x", type: "text", value: "" };
    expect(pageIndexForField(noWidgets, 3)).toBe(3);
  });
});

describe("pureza del módulo (R25, R28)", () => {
  it("el fuente no importa React ni referencia el DOM (R25)", () => {
    expect(formOverlaySource).not.toMatch(/from\s+["']react["']/);
    expect(formOverlaySource).not.toMatch(/\bdocument\b/);
    expect(formOverlaySource).not.toMatch(/\bwindow\b/);
  });

  it("el fuente no importa pdf-lib: opera solo sobre datos planos (R28)", () => {
    expect(formOverlaySource).not.toMatch(/from\s+["']pdf-lib["']/);
  });
});
