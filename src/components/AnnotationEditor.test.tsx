import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationEditor } from "@/components/AnnotationEditor";
import type { Annotation } from "@/pdf/annotate";
import type { AnnotationTool } from "@/pdf/annotationModel";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";

// jsdom no implementa object URLs; el editor las usa al rasterizar el fondo.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  // Rect determinista del lienzo: 100×200 px, origen (0,0). Con scale=1, la
  // altura de página en puntos PDF es 200.
  Element.prototype.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 200,
        width: 100,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

/** Rasterizador falso (sin pdf.js) que registra qué páginas se rasterizan. */
function mockRasterizer(pageCount = 3): {
  factory: PageRasterizerFactory;
  rendered: number[];
} {
  const rendered: number[] = [];
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: (index) => {
      rendered.push(index);
      return Promise.resolve(
        new Blob([new Uint8Array([1])], { type: "image/png" }),
      );
    },
    destroy: () => {},
  };
  return { factory: async () => rasterizer, rendered };
}

function makePdfFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "a.pdf", {
    type: "application/pdf",
  });
}

/** Harness con estado controlado que expone las anotaciones creadas. */
function Harness({
  onAdded,
  createRasterizer,
  initialTool = null,
}: {
  onAdded: (a: Annotation) => void;
  createRasterizer: PageRasterizerFactory;
  initialTool?: AnnotationTool | null;
}): JSX.Element {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(
    initialTool,
  );
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  let id = 0;
  return (
    <AnnotationEditor
      file={makePdfFile()}
      pageCount={3}
      annotations={annotations}
      activePageIndex={activePageIndex}
      onActivePageChange={setActivePageIndex}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      onAddAnnotation={(a) => {
        setAnnotations((prev) => [...prev, a]);
        onAdded(a);
      }}
      createId={() => {
        id += 1;
        return `id-${String(id)}`;
      }}
      createRasterizer={createRasterizer}
      scale={1}
    />
  );
}

describe("AnnotationEditor — render sin bloquear + colocación (R24, R14)", () => {
  it("usa el rasterizador inyectado (sin pdf.js) y muestra la página (R24)", async () => {
    const raster = mockRasterizer(3);
    const added = vi.fn();
    render(<Harness onAdded={added} createRasterizer={raster.factory} />);

    await screen.findByTestId("annotation-overlay");
    expect(raster.rendered).toContain(0);
  });

  it("un clic con herramienta activa crea la anotación en la coordenada PDF esperada (R14)", async () => {
    const raster = mockRasterizer(3);
    const added = vi.fn();
    render(
      <Harness
        onAdded={added}
        createRasterizer={raster.factory}
        initialTool="text"
      />,
    );

    const overlay = await screen.findByTestId("annotation-overlay");
    // Clic en (30, 40) px con rect 100×200 y scale 1 → PDF (30, 200 − 40 = 160).
    fireEvent.click(overlay, { clientX: 30, clientY: 40 });

    await waitFor(() => expect(added).toHaveBeenCalledTimes(1));
    const annotation = added.mock.calls[0][0] as Annotation;
    expect(annotation.kind).toBe("text");
    if (annotation.kind === "text") {
      expect(annotation.at).toEqual({ x: 30, y: 160 });
    }
  });
});

describe("AnnotationEditor — elección de página activa vía selector (R13)", () => {
  it("cambiar la página activa asocia la nueva anotación a ese pageIndex (R13)", async () => {
    const raster = mockRasterizer(3);
    const added = vi.fn();
    render(
      <Harness
        onAdded={added}
        createRasterizer={raster.factory}
        initialTool="text"
      />,
    );

    await screen.findByTestId("annotation-overlay");

    // Elige la página 2 (index 1) en el selector visual de páginas.
    fireEvent.click(screen.getByRole("button", { name: "Página 2" }));

    // La nueva anotación queda asociada a la página elegida (pageIndex 1),
    // distinta de la página activa anterior (0).
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.click(overlay, { clientX: 10, clientY: 10 });

    await waitFor(() => expect(added).toHaveBeenCalledTimes(1));
    const annotation = added.mock.calls[0][0] as Annotation;
    expect(annotation.pageIndex).toBe(1);
  });
});
