import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SignaturePad } from "@/components/SignaturePad";

describe("SignaturePad (R16)", () => {
  it("al confirmar el dibujo notifica los bytes PNG capturados por la costura", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const capture = vi.fn(async () => pngBytes);
    const onCapture = vi.fn();

    render(<SignaturePad onCapture={onCapture} capture={capture} />);

    // Un trazo habilita la confirmación.
    const canvas = screen.getByTestId("signature-pad-canvas");
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);

    const confirm = screen.getByRole("button", { name: "Usar esta firma" });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    // La costura recibe el canvas y los bytes llegan al callback.
    await vi.waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0][0]).toBe(pngBytes);
  });

  it("mantiene deshabilitado «Usar esta firma» sin trazos", () => {
    render(<SignaturePad onCapture={vi.fn()} capture={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Usar esta firma" }),
    ).toBeDisabled();
  });
});
