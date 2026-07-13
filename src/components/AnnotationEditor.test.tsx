import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PDFDocument } from "pdf-lib";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationEditor } from "@/components/AnnotationEditor";
import { flattenAnnotations, type Annotation } from "@/pdf/annotate";
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

// jsdom no implementa ResizeObserver; el editor lo usa para recalcular el tamaño
// mostrado de la página. Este mock CAPTURA cada callback para que los tests
// puedan disparar un reflow manualmente. (T9/T10/T15 → R2)
type ResizeEntryLike = { contentRect: { width: number; height: number } };
type ResizeCallback = (entries: ResizeEntryLike[]) => void;
const resizeCallbacks: ResizeCallback[] = [];

class MockResizeObserver {
  constructor(callback: ResizeCallback) {
    resizeCallbacks.push(callback);
  }
  observe(): void {
    /* no auto-fire: el tamaño inicial lo aporta getBoundingClientRect */
  }
  unobserve(): void {}
  disconnect(): void {}
}

/** Dispara el callback del ResizeObserver con un nuevo tamaño mostrado. */
function triggerResize(width: number, height: number): void {
  act(() => {
    for (const cb of resizeCallbacks) {
      cb([{ contentRect: { width, height } }]);
    }
  });
}

/** Fija el tamaño natural de la <img> rasterizada y emite su evento `load`. */
function stubNaturalSize(width: number, height: number): void {
  const img = screen.getByAltText(/para anotar/);
  Object.defineProperty(img, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(img, "naturalHeight", {
    value: height,
    configurable: true,
  });
  fireEvent.load(img);
}

// jsdom no implementa object URLs; el editor las usa al rasterizar el fondo.
beforeEach(() => {
  resizeCallbacks.length = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    MockResizeObserver;
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

/** PNG 1×1 válido (firma reconocida por `detectImageType`). */
const PNG_1x1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("AnnotationEditor — escala real de visualización (#35: R1, R2, R4)", () => {
  it("un reflow del ResizeObserver recalcula la escala usada por la conversión (R2)", async () => {
    const raster = mockRasterizer(3);
    render(<Harness createRasterizer={raster.factory} initialTool="rect" />);
    const overlay = await screen.findByTestId("annotation-overlay");
    // Página real 200×400 pts (renderScale 1) mostrada a 100×200 → displayScale 0.5.
    stubNaturalSize(200, 400);
    triggerResize(100, 200);

    // Coloca un rect: puntos PDF at{20,180} w100 h200 (px·2 por displayScale 0.5).
    pointerDrag(overlay, { x: 10, y: 10 }, { x: 60, y: 110 });
    const rect = await screen.findByTestId("annotation-rect");
    // Esquina superior-izq mostrada = toPx({20,380}) = {10,10} con displayScale 0.5.
    expect(rect.getAttribute("x")).toBe("10");
    expect(rect.getAttribute("y")).toBe("10");

    // Reflow: se duplica el ancho mostrado → displayScale pasa a 1.
    triggerResize(200, 400);
    await waitFor(() => {
      const now = screen.getByTestId("annotation-rect");
      // Misma anotación (mismos puntos PDF) pero re-proyectada con displayScale 1.
      expect(now.getAttribute("x")).toBe("20");
      expect(now.getAttribute("y")).toBe("20");
    });
  });

  it("px→pt usa la escala DERIVADA (px/displayScale), no la asumida 1 (R1, R4)", async () => {
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
    stubNaturalSize(200, 400); // displayScale = 100/200 = 0.5
    triggerResize(100, 200);

    pointerDrag(overlay, { x: 10, y: 10 }, { x: 60, y: 110 });
    await waitFor(() => expect(latest).toHaveLength(1));
    const rect = latest[0];
    expect(rect.kind).toBe("rect");
    if (rect.kind === "rect") {
      // Con la escala real: at {20,180}, 100×200 (px·2). Con el bug (scale=1)
      // habría sido at {10,90}, 50×100. Distinto → detecta la compresión.
      expect(rect.at).toEqual({ x: 20, y: 180 });
      expect(rect.width).toBe(100);
      expect(rect.height).toBe(200);
    }
  });
});

describe("AnnotationEditor — cambiar de herramienta con borrador abierto (#35: R6, R7)", () => {
  it("abrir texto, cambiar a rect y arrastrar crea el rectángulo (no queda bloqueado)", async () => {
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
    // Abre un borrador de texto (queda un textarea en edición).
    fireEvent.click(overlay, { clientX: 20, clientY: 30 });
    await screen.findByTestId("annotation-text-input");

    // Cambia a la herramienta Rectángulo: debe CERRAR el borrador de texto.
    fireEvent.click(screen.getByRole("button", { name: "Rectángulo" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("annotation-text-input"),
      ).not.toBeInTheDocument(),
    );

    // El arrastre con rect ahora responde (antes quedaba bloqueado por textDraft).
    pointerDrag(overlay, { x: 10, y: 10 }, { x: 60, y: 110 });
    await waitFor(() => expect(latest).toHaveLength(1));
    expect(latest[0].kind).toBe("rect");
  });
});

describe("AnnotationEditor — volver a selección tras colocar (#35: R8, R9, R10)", () => {
  it("tras colocar una imagen, un arrastre la mueve (modo selección + selección automática)", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="image"
        imageData={PNG_1x1}
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    // Coloca la imagen con un clic (displayScale 1 por defecto en jsdom).
    fireEvent.click(overlay, { clientX: 20, clientY: 20 });
    await waitFor(() => expect(latest).toHaveLength(1));

    const before = latest[0];
    const beforeX = before.kind === "image" ? before.at.x : NaN;
    // La herramienta Imagen ya no está activa (aria-pressed false).
    expect(
      screen.getByRole("button", { name: "Imagen" }).getAttribute("aria-pressed"),
    ).toBe("false");

    // SIN reactivar herramienta a mano: arrastrar el cuerpo la traslada.
    pointerDrag(overlay, { x: 30, y: 60 }, { x: 45, y: 60 });
    await waitFor(() => {
      const now = latest[0];
      expect(now.kind === "image" && now.at.x).toBe(beforeX + 15);
    });
  });

  it("tras confirmar un texto se pasa a modo selección y queda seleccionado (R8, R10)", async () => {
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
    fireEvent.change(input, { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    await waitFor(() => expect(latest).toHaveLength(1));
    // Herramienta Texto desactivada (modo selección).
    expect(
      screen.getByRole("button", { name: "Texto" }).getAttribute("aria-pressed"),
    ).toBe("false");
    // La anotación recién creada aparece seleccionada (contorno + tiradores).
    await screen.findByTestId("annotation-selection");
  });
});

describe("AnnotationEditor — herramienta Imagen sin imagen (#35: R11, R12)", () => {
  it("muestra un aviso accesible y un clic no crea anotación", async () => {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    render(
      <Harness
        createRasterizer={raster.factory}
        initialTool="image"
        imageData={null}
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    // Aviso visible mientras la herramienta Imagen está activa sin imagen. (R11)
    const notice = screen.getByTestId("image-tool-notice");
    expect(notice).toHaveAttribute("role", "alert");
    expect(notice.textContent).toMatch(/imagen/i);

    // Un clic no crea ninguna anotación (fin del no-op silencioso). (R12)
    fireEvent.click(overlay, { clientX: 20, clientY: 20 });
    await new Promise((r) => setTimeout(r, 0));
    expect(latest).toHaveLength(0);
  });
});

describe("AnnotationEditor — regresión de escala end-to-end (#35: R5, R13)", () => {
  /** Coloca UNA anotación bajo displayScale 0.5 y devuelve la creada. */
  async function placeUnderHalfScale(
    initialTool: "text" | "highlight" | "freehand" | "line" | "rect" | "image",
    place: (overlay: HTMLElement) => void | Promise<void>,
    imageData: Uint8Array | null = null,
  ): Promise<Annotation> {
    const raster = mockRasterizer(3);
    let latest: readonly Annotation[] = [];
    const view = render(
      <Harness
        createRasterizer={raster.factory}
        initialTool={initialTool}
        imageData={imageData}
        onState={(a) => (latest = a)}
      />,
    );
    const overlay = await screen.findByTestId("annotation-overlay");
    // Página real 200×400 pts mostrada a 100×200 → displayScale 0.5, pageH 400.
    stubNaturalSize(200, 400);
    triggerResize(100, 200);
    await place(overlay);
    await waitFor(() => expect(latest.length).toBeGreaterThan(0));
    const created = latest[latest.length - 1];
    view.unmount();
    return created;
  }

  it("cada tipo se guarda en la geometría MOSTRADA·(1/displayScale), y el dominio aplana la salida", async () => {
    // Con displayScale 0.5 y pageHeightPts 400: toPdf(px) = (2·pxX, 400 − 2·pxY).
    const rect = await placeUnderHalfScale("rect", (o) =>
      pointerDrag(o, { x: 10, y: 10 }, { x: 60, y: 110 }),
    );
    expect(rect.kind === "rect" && rect.at).toEqual({ x: 20, y: 180 });
    expect(rect.kind === "rect" && rect.width).toBe(100);

    const highlight = await placeUnderHalfScale("highlight", (o) =>
      pointerDrag(o, { x: 10, y: 10 }, { x: 60, y: 110 }),
    );
    expect(highlight.kind === "highlight" && highlight.at).toEqual({
      x: 20,
      y: 180,
    });

    const line = await placeUnderHalfScale("line", (o) =>
      pointerDrag(o, { x: 10, y: 20 }, { x: 50, y: 60 }),
    );
    // start = toPdf(10,20) = (20,360); end = toPdf(50,60) = (100,280).
    expect(line.kind === "line" && line.start).toEqual({ x: 20, y: 360 });
    expect(line.kind === "line" && line.end).toEqual({ x: 100, y: 280 });

    const freehand = await placeUnderHalfScale("freehand", (o) => {
      fireEvent.pointerDown(o, { clientX: 10, clientY: 20, pointerId: 1 });
      fireEvent.pointerMove(o, { clientX: 30, clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(o, { clientX: 30, clientY: 40, pointerId: 1 });
    });
    expect(freehand.kind === "freehand" && freehand.points).toEqual([
      { x: 20, y: 360 },
      { x: 60, y: 320 },
    ]);

    const text = await placeUnderHalfScale("text", async (o) => {
      fireEvent.click(o, { clientX: 20, clientY: 30 });
      const input = await screen.findByTestId("annotation-text-input");
      fireEvent.change(input, { target: { value: "Hola" } });
      fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    });
    // at = toPdf(20,30) = (40, 340).
    expect(text.kind === "text" && text.at).toEqual({ x: 40, y: 340 });

    const image = await placeUnderHalfScale(
      "image",
      (o) => {
        fireEvent.click(o, { clientX: 25, clientY: 25 });
      },
      PNG_1x1,
    );
    // toPdf(25,25) = (50, 350); la imagen ancla su esquina inf-izq 120 pts abajo.
    expect(image.kind === "image" && image.at).toEqual({ x: 50, y: 230 });

    // Encadena el aplanado por el DOMINIO (mismo camino que `pdfClient.annotate`
    // → `flattenAnnotations`, R13) sobre esos puntos ya escalados. La salida
    // conserva la geometría porque el dominio dibuja en los puntos almacenados.
    const source = await PDFDocument.create();
    source.addPage([300, 500]);
    const sourceBytes = await source.save();
    const annotations: Annotation[] = [rect, highlight, line, freehand, text, image];
    const flattened = await flattenAnnotations(sourceBytes, annotations);
    expect(flattened.byteLength).toBeGreaterThan(0);
    const reloaded = await PDFDocument.load(flattened);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
