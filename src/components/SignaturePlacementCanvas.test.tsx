import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignaturePlacementCanvas } from "@/components/SignaturePlacementCanvas";
import { canvasPointToPdf } from "@/pdf/annotate";
import { resizeSignatureBox, type FreePlacement } from "@/pdf/signature";
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

/** Harness con placement controlado y captura del último notificado. */
function Harness({
  initial,
  aspectRatio,
  onLatest,
}: {
  initial: FreePlacement;
  aspectRatio: number;
  onLatest: (p: FreePlacement) => void;
}): JSX.Element {
  const [placement, setPlacement] = useState<FreePlacement>(initial);
  const [file] = useState(makePdfFile);
  return (
    <SignaturePlacementCanvas
      file={file}
      pageIndex={0}
      placement={placement}
      onPlacementChange={(p) => {
        setPlacement(p);
        onLatest(p);
      }}
      aspectRatio={aspectRatio}
      minSize={8}
      scale={1}
      createRasterizer={mockRasterizer()}
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

describe("SignaturePlacementCanvas — arrastre de la firma (R11, R12)", () => {
  it("mueve la caja a coordenadas PDF exactas de la posición soltada", async () => {
    let latest: FreePlacement | null = null;
    // Caja en pts PDF: at (10,150), 40×20. Su centro en px de vista es (30,40).
    const initial: FreePlacement = { x: 10, y: 150, width: 40, height: 20 };
    render(
      <Harness
        initial={initial}
        aspectRatio={2}
        onLatest={(p) => (latest = p)}
      />,
    );
    const overlay = await screen.findByTestId("signature-placement-overlay");

    // Arrastre del cuerpo desde px (30,40) a px (50,40).
    pointerDrag(overlay, { x: 30, y: 40 }, { x: 50, y: 40 });

    await waitFor(() => expect(latest).not.toBeNull());
    // El `at` resultante es exactamente el PDF derivado por canvasPointToPdf,
    // sin ajuste a ninguna rejilla de anclas.
    const startPdf = canvasPointToPdf(30, 40, 200, 1);
    const dropPdf = canvasPointToPdf(50, 40, 200, 1);
    const result = latest as unknown as FreePlacement;
    expect(result.x).toBeCloseTo(initial.x + (dropPdf.x - startPdf.x));
    expect(result.y).toBeCloseTo(initial.y + (dropPdf.y - startPdf.y));
    // El tamaño no cambia al mover.
    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
  });
});

describe("SignaturePlacementCanvas — arrastre de tirador (R13)", () => {
  it("redimensiona preservando el aspecto (coincide con resizeSignatureBox)", async () => {
    let latest: FreePlacement | null = null;
    const initial: FreePlacement = { x: 10, y: 150, width: 40, height: 20 };
    const aspectRatio = 2;
    render(
      <Harness
        initial={initial}
        aspectRatio={aspectRatio}
        onLatest={(p) => (latest = p)}
      />,
    );
    const overlay = await screen.findByTestId("signature-placement-overlay");

    // El tirador `se` está en pts PDF (50,150) → px de vista (50,50).
    pointerDrag(overlay, { x: 50, y: 50 }, { x: 80, y: 10 });

    await waitFor(() => expect(latest).not.toBeNull());
    const dropPdf = canvasPointToPdf(80, 10, 200, 1);
    const expected = resizeSignatureBox(
      initial,
      "se",
      dropPdf,
      aspectRatio,
      8,
    );
    const result = latest as unknown as FreePlacement;
    expect(result).toEqual(expected);
    // Aspecto preservado.
    expect(result.width / result.height).toBeCloseTo(aspectRatio);
  });
});
