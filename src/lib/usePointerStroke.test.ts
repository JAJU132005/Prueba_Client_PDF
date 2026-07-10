import { fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { usePointerStroke, type StrokePoint } from "@/lib/usePointerStroke";

/** Componente de prueba que aplica los handlers del hook a un div medible. */
function Probe(props: {
  onStart?: (p: StrokePoint) => void;
  onMove?: (p: StrokePoint) => void;
  onEnd?: () => void;
}): JSX.Element {
  const handlers = usePointerStroke(props);
  return createElement("div", {
    "data-testid": "stroke-surface",
    ...handlers,
  });
}

function mockRect(el: HTMLElement, left: number, top: number): void {
  el.getBoundingClientRect = vi.fn(
    () =>
      ({
        left,
        top,
        right: left + 100,
        bottom: top + 100,
        width: 100,
        height: 100,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect,
  );
}

describe("usePointerStroke (R8)", () => {
  it("emite puntos relativos al elemento entre down y up", () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { getByTestId } = render(
      createElement(Probe, { onStart, onMove, onEnd }),
    );
    const surface = getByTestId("stroke-surface");
    mockRect(surface, 10, 20);

    fireEvent.pointerDown(surface, { clientX: 40, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 55, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 55, clientY: 90, pointerId: 1 });

    expect(onStart).toHaveBeenCalledWith({ x: 30, y: 40 });
    expect(onMove).toHaveBeenCalledWith({ x: 45, y: 70 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("ignora movimientos sin una bajada previa", () => {
    const onMove = vi.fn();
    const { getByTestId } = render(createElement(Probe, { onMove }));
    const surface = getByTestId("stroke-surface");
    mockRect(surface, 0, 0);

    fireEvent.pointerMove(surface, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("cierra el trazo al salir del elemento (pointerLeave)", () => {
    const onEnd = vi.fn();
    const { getByTestId } = render(createElement(Probe, { onEnd }));
    const surface = getByTestId("stroke-surface");
    mockRect(surface, 0, 0);

    fireEvent.pointerDown(surface, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerLeave(surface, { clientX: 5, clientY: 5, pointerId: 1 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
