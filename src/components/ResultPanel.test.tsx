import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultPanel } from "@/components/ResultPanel";

describe("ResultPanel", () => {
  it("muestra la anatomía del diario: trituradora, mensaje y hoja sellada (R25)", () => {
    const { container } = render(
      <ResultPanel
        fileName="unido.pdf"
        onDownload={() => {}}
        onReset={() => {}}
        costLevel="light"
      />,
    );
    expect(container.querySelector('[data-panda-art="trituradora"]')).not.toBeNull();
    expect(screen.getByText(/borrado hasta de mi memoria/i)).toBeInTheDocument();
    expect(screen.getByText("TOP SECRET")).toBeInTheDocument();
    expect(screen.getByText("unido.pdf")).toBeInTheDocument();
  });

  it("el botón de descarga dispara el handler de descarga recibido (R25, #39 R8, R12)", () => {
    const onDownload = vi.fn();
    render(
      <ResultPanel
        fileName="salida.pdf"
        onDownload={onDownload}
        onReset={() => {}}
        costLevel="medium"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /descargar resultado/i }),
    );
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("el botón de descarga expone el resaltado guiado `download-cta` (#39 R1, R8)", () => {
    render(
      <ResultPanel
        fileName="salida.pdf"
        onDownload={() => {}}
        onReset={() => {}}
        costLevel="light"
      />,
    );
    const button = screen.getByTestId("download-cta");
    expect(button).toHaveClass("download-cta");
    expect(button).toHaveAttribute("data-download-guided", "true");
  });

  it("el botón 'procesar otro' dispara el reinicio recibido (R25)", () => {
    const onReset = vi.fn();
    render(
      <ResultPanel
        fileName="salida.pdf"
        onDownload={() => {}}
        onReset={onReset}
        costLevel="heavy"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /procesar otro/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
