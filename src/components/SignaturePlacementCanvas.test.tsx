import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignaturePlacementCanvas } from "@/components/SignaturePlacementCanvas";
import { canvasPointToPdf } from "@/pdf/annotate";
import {
  resizeSignatureBox,
  type FreePlacement,
  type PlacedSignature,
} from "@/pdf/signature";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";

// jsdom no implementa object URLs; el lienzo las usa al rasterizar el fondo.
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

function mockRasterizer(pageCount = 1): PageRasterizerFactory {
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: () =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: "image/png" })),
    destroy: () => {},
  };
  return async () => rasterizer;
}

function makePdfFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "a.pdf", {
    type: "application/pdf",
  });
}

function makeSig(
  id: string,
  box: FreePlacement,
  aspectRatio: number,
): PlacedSignature {
  return { id, image: new Uint8Array([1]), box, aspectRatio, pageIndices: [0] };
}

/** Harness con lista de firmas controlada + captura de cambios/selección. */
function Harness({
  initial,
  onLatest,
  onSelectLatest,
}: {
  initial: readonly PlacedSignature[];
  onLatest?: (id: string, box: FreePlacement) => void;
  onSelectLatest?: (id: string | null) => void;
}): JSX.Element {
  const [placements, setPlacements] = useState<readonly PlacedSignature[]>(
    initial,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [file] = useState(makePdfFile);
  // Rasterizador estable entre renders: un factory nuevo por render reejecutaría
  // el efecto de carga y remontaría el overlay a mitad de gesto.
  const [rasterizer] = useState(() => mockRasterizer());
  return (
    <SignaturePlacementCanvas
      file={file}
      pageIndex={0}
      placements={placements}
      selectedId={selectedId}
      onSelect={(id) => {
        setSelectedId(id);
        onSelectLatest?.(id);
      }}
      onPlacementChange={(id, box) => {
        setPlacements((prev) =>
          prev.map((p) => (p.id === id ? { ...p, box } : p)),
        );
        onLatest?.(id, box);
      }}
      minSize={8}
      scale={1}
      createRasterizer={rasterizer}
    />
  );
}

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
  fireEvent.pointerMove(overlay, { clientX: to.x, clientY: to.y, pointerId: 1 });
  fireEvent.pointerUp(overlay, { clientX: to.x, clientY: to.y, pointerId: 1 });
}

function pointerClick(overlay: HTMLElement, at: { x: number; y: number }): void {
  fireEvent.pointerDown(overlay, { clientX: at.x, clientY: at.y, pointerId: 1 });
  fireEvent.pointerUp(overlay, { clientX: at.x, clientY: at.y, pointerId: 1 });
}

describe("SignaturePlacementCanvas — render de N cajas (R16)", () => {
  it("dibuja una caja por cada firma de la página activa", async () => {
    render(
      <Harness
        initial={[
          makeSig("a", { x: 10, y: 150, width: 40, height: 20 }, 2),
          makeSig("b", { x: 60, y: 50, width: 30, height: 15 }, 2),
        ]}
      />,
    );
    await screen.findByTestId("signature-placement-overlay");
    const boxes = await screen.findAllByTestId("signature-placement-box");
    expect(boxes).toHaveLength(2);
  });
});

describe("SignaturePlacementCanvas — selección por clic (R16)", () => {
  it("clic sobre una firma la selecciona (findSignatureAt) y muestra tiradores", async () => {
    let selectedLatest: string | null | undefined;
    render(
      <Harness
        initial={[
          makeSig("a", { x: 10, y: 150, width: 40, height: 20 }, 2),
          makeSig("b", { x: 60, y: 50, width: 30, height: 15 }, 2),
        ]}
        onSelectLatest={(id) => (selectedLatest = id)}
      />,
    );
    const overlay = await screen.findByTestId("signature-placement-overlay");

    // Caja 'a' en pts PDF x∈[10,50], y∈[150,170]. Punto pdf (30,160) → px (30,40).
    pointerClick(overlay, { x: 30, y: 40 });

    await waitFor(() => expect(selectedLatest).toBe("a"));
    // La firma seleccionada muestra 4 tiradores.
    expect(await screen.findByTestId("signature-handle-se")).toBeInTheDocument();
    expect(screen.getByTestId("signature-handle-nw")).toBeInTheDocument();
  });
});

describe("SignaturePlacementCanvas — mover la seleccionada (R17)", () => {
  it("arrastrar el cuerpo mueve SOLO esa firma a coordenadas PDF exactas", async () => {
    let latestId: string | null = null;
    let latestBox: FreePlacement | null = null;
    const initial: FreePlacement = { x: 10, y: 150, width: 40, height: 20 };
    render(
      <Harness
        initial={[makeSig("a", initial, 2)]}
        onLatest={(id, box) => {
          latestId = id;
          latestBox = box;
        }}
      />,
    );
    const overlay = await screen.findByTestId("signature-placement-overlay");

    // Arrastre del cuerpo de 'a' desde px (30,40) a px (50,40).
    pointerDrag(overlay, { x: 30, y: 40 }, { x: 50, y: 40 });

    await waitFor(() => expect(latestBox).not.toBeNull());
    expect(latestId).toBe("a");
    const startPdf = canvasPointToPdf(30, 40, 200, 1);
    const dropPdf = canvasPointToPdf(50, 40, 200, 1);
    const box = latestBox as unknown as FreePlacement;
    expect(box.x).toBeCloseTo(initial.x + (dropPdf.x - startPdf.x));
    expect(box.y).toBeCloseTo(initial.y + (dropPdf.y - startPdf.y));
    expect(box.width).toBe(40);
    expect(box.height).toBe(20);
  });
});

describe("SignaturePlacementCanvas — redimensionar la seleccionada (R18)", () => {
  it("arrastrar un tirador redimensiona preservando el aspecto (resizeSignatureBox)", async () => {
    let latestBox: FreePlacement | null = null;
    const initial: FreePlacement = { x: 10, y: 150, width: 40, height: 20 };
    const aspectRatio = 2;
    render(
      <Harness
        initial={[makeSig("a", initial, aspectRatio)]}
        onLatest={(_id, box) => (latestBox = box)}
      />,
    );
    const overlay = await screen.findByTestId("signature-placement-overlay");

    // Primero seleccionar 'a' (clic en su cuerpo).
    pointerClick(overlay, { x: 30, y: 40 });
    await screen.findByTestId("signature-handle-se");

    // El tirador `se` está en pts PDF (50,150) → px (50,50). Arrastrar a (80,10).
    latestBox = null;
    pointerDrag(overlay, { x: 50, y: 50 }, { x: 80, y: 10 });

    await waitFor(() => expect(latestBox).not.toBeNull());
    const dropPdf = canvasPointToPdf(80, 10, 200, 1);
    const expected = resizeSignatureBox(initial, "se", dropPdf, aspectRatio, 8);
    const box = latestBox as unknown as FreePlacement;
    expect(box).toEqual(expected);
    expect(box.width / box.height).toBeCloseTo(aspectRatio);
  });
});
