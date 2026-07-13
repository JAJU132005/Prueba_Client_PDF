import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewModal } from "@/components/PreviewModal";

describe("PreviewModal", () => {
  it("expone role='dialog' con aria-modal='true' y aria-label (R1)", () => {
    render(
      <PreviewModal label="doc.pdf" onClose={vi.fn()}>
        <p>cuerpo</p>
      </PreviewModal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute(
      "aria-label",
      expect.stringContaining("doc.pdf"),
    );
  });

  it("renderiza el contenido pasado como children (R6)", () => {
    render(
      <PreviewModal label="x" onClose={vi.fn()}>
        <span data-testid="cuerpo">contenido del visor</span>
      </PreviewModal>,
    );
    expect(screen.getByTestId("cuerpo")).toHaveTextContent(
      "contenido del visor",
    );
  });

  it("Escape invoca onClose (R3)", () => {
    const onClose = vi.fn();
    render(
      <PreviewModal label="x" onClose={onClose}>
        <p>cuerpo</p>
      </PreviewModal>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el control de cierre expone un aria-label e invoca onClose (R5)", () => {
    const onClose = vi.fn();
    render(
      <PreviewModal label="x" onClose={onClose}>
        <p>cuerpo</p>
      </PreviewModal>,
    );
    const closeButton = screen.getByRole("button", {
      name: /cerrar vista previa/i,
    });
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("al montar traslada el foco a un elemento dentro del diálogo (R2)", async () => {
    render(
      <PreviewModal label="x" onClose={vi.fn()}>
        <button type="button">acción</button>
      </PreviewModal>,
    );
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
  });

  it("el foco no escapa del diálogo al tabular (focus trap) (R4)", () => {
    render(
      <PreviewModal label="x" onClose={vi.fn()}>
        <button type="button">acción</button>
      </PreviewModal>,
    );
    const dialog = screen.getByRole("dialog");
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>("button:not([disabled])"),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
