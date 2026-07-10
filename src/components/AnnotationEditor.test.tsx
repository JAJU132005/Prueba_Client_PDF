import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationEditor } from "@/components/AnnotationEditor";
import type { Annotation } from "@/pdf/annotate";
import {
  addAnnotation,
  createAnnotationState,
  removeAnnotation,
  selectAnnotation,
  updateAnnotation,
  type AnnotationTool,
} from "@/pdf/annotationModel";
import {
  DEFAULT_TOOL_SETTINGS,
  type ToolSettings,
} from "@/pdf/annotationInteraction";
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

/** Harness con el estado real del editor (modelo puro) y ids deterministas. */
function Harness({
  onState,
  createRasterizer,
  initialTool = null,
  imageData = null,
}: {
  onState?: (annotations: readonly Annotation[]) => void;
  createRasterizer: PageRasterizerFactory;
  initialTool?: AnnotationTool | null;
  imageData?: Uint8Array | null;
}): JSX.Element {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(
    initialTool,
  );
  const [state, setState] = useState(createAnnotationState());
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  // Fichero estable entre renders (en producción viene de `files[0]` del estado):
  // crearlo inline haría re-cargar el rasterizador en cada re-render.
  const [file] = useState(makePdfFile);
  const idRef = useRef(0);
  onState?.(state.annotations);
  return (
    <AnnotationEditor
      file={file}
      pageCount={3}
      annotations={state.annotations}
      activePageIndex={activePageIndex}
      onActivePageChange={setActivePageIndex}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      onAddAnnotation={(a) => setState((prev) => addAnnotation(prev, a))}
      onUpdateAnnotation={(a) => setState((prev) => updateAnnotation(prev, a))}
      onRemoveAnnotation={(rid) => setState((prev) => removeAnnotation(prev, rid))}
      selectedId={state.selectedId}
      onSelectionChange={(sid) => setState((prev) => selectAnnotation(prev, sid))}
      settings={settings}
      onSettingsChange={setSettings}
      imageData={imageData}
      createId={() => {
        idRef.current += 1;
        return `id-${String(idRef.current)}`;
      }}
      createRasterizer={createRasterizer}
      scale={1}
    />
  );
}

/** Simula un arrastre de puntero sobre el overlay: down → moves → up. */
function pointerDrag(
  overlay: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  fireEvent.pointerDown(overlay, {
    clientX: from.x,
    clientY: from.y,
    pointerId: 1,
  });
  fireEvent.pointerMove(overlay, {
    clientX: to.x,
    clientY: to.y,
    pointerId: 1,
  });
  fireEvent.pointerUp(overlay, { clientX: to.x, clientY: to.y, pointerId: 1 });
}

describe("AnnotationEditor — render sin bloquear (R24)", () => {
  it("usa el rasterizador inyectado y muestra la página (R24)", async () => {
    const raster = mockRasterizer(3);
    render(<Harness createRasterizer={raster.factory} />);
    await screen.findByTestId("annotation-overlay");
    expect(raster.rendered).toContain(0);
  });
});

describe("AnnotationEditor — creación por arrastre (R8, R9, R13, R14)", () => {
  it("arrastrar con rectángulo crea una forma dimensionada, no de tamaño fijo (R13, R14)", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="rect"
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    // Arrastre (10,10)→(60,110) px, scale 1, pageH 200 →
    // PDF at (10,90) width 50 height 100.
    pointerDrag(overlay, { x: 10, y: 10 }, { x: 60, y: 110 });

    await waitFor(() => expect(latest).toHaveLength(1));
    const rect = latest[0];
    expect(rect.kind).toBe("rect");
    if (rect.kind === "rect") {
      expect(rect.width).toBe(50);
      expect(rect.height).toBe(100);
    }
    // Se renderiza como nodo SVG fiel, no como marcador puntual.
    expect(screen.getByTestId("annotation-rect")).toBeInTheDocument();
  });

  it("dibujo libre conserva los puntos reales del puntero (R8, R9)", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="freehand"
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 50, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 50, clientY: 10, pointerId: 1 });

    await waitFor(() => expect(latest).toHaveLength(1));
    const stroke = latest[0];
    expect(stroke.kind).toBe("freehand");
    if (stroke.kind === "freehand") {
      // 3 puntos capturados (down + 2 moves), en puntos PDF (y = 200 − py).
      expect(stroke.points).toEqual([
        { x: 10, y: 180 },
        { x: 30, y: 160 },
        { x: 50, y: 190 },
      ]);
    }
  });
});

describe("AnnotationEditor — texto real editable (R3, R4, R6)", () => {
  it("un clic con la herramienta de texto abre un campo editable y confirma la cadena escrita (nunca 'Texto')", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="text"
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.click(overlay, { clientX: 20, clientY: 30 });

    const input = await screen.findByTestId("annotation-text-input");
    fireEvent.change(input, { target: { value: "Hola panda" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    await waitFor(() => expect(latest).toHaveLength(1));
    const text = latest[0];
    expect(text.kind).toBe("text");
    if (text.kind === "text") {
      expect(text.text).toBe("Hola panda");
      expect(text.text).not.toBe("Texto");
    }
  });

  it("no registra nada si el campo de texto queda vacío (R5)", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="text"
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.click(overlay, { clientX: 20, clientY: 30 });
    await screen.findByTestId("annotation-text-input");
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    // Un pequeño respiro para asegurar que no se añadió nada.
    await new Promise((r) => setTimeout(r, 0));
    expect(latest).toHaveLength(0);
  });
});

describe("AnnotationEditor — seleccionar, mover, eliminar (R17, R18, R19, R25, R26)", () => {
  async function seedRect(): Promise<HTMLElement> {
    const raster = mockRasterizer(3);
    render(<Harness createRasterizer={raster.factory} initialTool="rect" />);
    const overlay = await screen.findByTestId("annotation-overlay");
    pointerDrag(overlay, { x: 10, y: 10 }, { x: 60, y: 110 });
    await screen.findByTestId("annotation-rect");
    return overlay;
  }

  it("un rectángulo recién creado se muestra seleccionado con tiradores (R18)", async () => {
    await seedRect();
    // addAnnotation deja la nueva como seleccionada → hay tiradores.
    await screen.findByTestId("annotation-selection");
    expect(screen.getByTestId("annotation-handle-nw")).toBeInTheDocument();
    expect(screen.getByTestId("annotation-handle-se")).toBeInTheDocument();
  });

  it("clic en zona vacía deselecciona (R26); Supr elimina la seleccionada (R25)", async () => {
    const overlay = await seedRect();
    // Vuelve al modo selección (despulsa la herramienta de creación).
    fireEvent.click(screen.getByRole("button", { name: "Rectángulo" }));
    // Deselecciona con un clic en zona vacía (lejos del rect).
    pointerDrag(overlay, { x: 95, y: 195 }, { x: 95, y: 195 });
    await waitFor(() =>
      expect(screen.queryByTestId("annotation-selection")).not.toBeInTheDocument(),
    );

    // Vuelve a seleccionar con un clic sobre el rect (dentro de su geometría).
    pointerDrag(overlay, { x: 30, y: 60 }, { x: 30, y: 60 });
    await screen.findByTestId("annotation-selection");

    // Supr elimina la anotación seleccionada.
    fireEvent.keyDown(overlay, { key: "Delete" });
    await waitFor(() =>
      expect(screen.queryByTestId("annotation-rect")).not.toBeInTheDocument(),
    );
  });

  it("arrastrar el cuerpo de la anotación seleccionada la traslada (R19)", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="rect"
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    pointerDrag(overlay, { x: 10, y: 10 }, { x: 60, y: 110 });
    await screen.findByTestId("annotation-rect");
    const before = latest[0];
    const beforeX = before.kind === "rect" ? before.at.x : 0;

    // Cambia a modo selección y arrastra el cuerpo del rect.
    fireEvent.click(screen.getByRole("button", { name: "Rectángulo" }));
    pointerDrag(overlay, { x: 30, y: 60 }, { x: 45, y: 60 });

    await waitFor(() => {
      const now = latest[0];
      expect(now.kind === "rect" && now.at.x).toBe(beforeX + 15);
    });
  });
});

describe("AnnotationEditor — imagen (R16)", () => {
  it("clic con la herramienta de imagen coloca una imagen con su tamaño por defecto", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="image"
        imageData={new Uint8Array([1, 2, 3])}
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    fireEvent.click(overlay, { clientX: 20, clientY: 20 });

    await waitFor(() => expect(latest).toHaveLength(1));
    expect(latest[0].kind).toBe("image");
  });
});
