import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DOWNLOAD_LABEL, DownloadCta } from "@/components/DownloadCta";

/** Instala un `matchMedia` falso cuyo `matches` fija la preferencia. */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  // Por defecto: sin reduced-motion.
  stubReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DownloadCta (#39)", () => {
  it("expone el resaltado estático `download-cta` y el indicador icónico ⇩ (R1, R6)", () => {
    render(<DownloadCta onDownload={() => {}} costLevel="light" />);
    const button = screen.getByTestId("download-cta");
    expect(button).toHaveClass("download-cta");
    expect(button).toHaveAttribute("data-download-guided", "true");
    // Indicador texto/icono (nunca solo color): el icono ⇩ viaja en el label.
    expect(button.textContent).toContain("⇩");
    expect(button.textContent).toBe(DEFAULT_DOWNLOAD_LABEL);
  });

  it("con reduced-motion=false aplica la animación `download-cta-animate` (R2)", () => {
    stubReducedMotion(false);
    render(<DownloadCta onDownload={() => {}} costLevel="medium" />);
    expect(screen.getByTestId("download-cta")).toHaveClass(
      "download-cta-animate",
    );
  });

  it("con reduced-motion=true NO aplica la animación pero conserva el resaltado (R3, R4)", () => {
    stubReducedMotion(true);
    render(<DownloadCta onDownload={() => {}} costLevel="heavy" />);
    const button = screen.getByTestId("download-cta");
    expect(button).not.toHaveClass("download-cta-animate");
    // El resaltado estático permanece → sigue localizable.
    expect(button).toHaveClass("download-cta");
  });

  it("al montar NO roba el foco del teclado (R5)", () => {
    render(<DownloadCta onDownload={() => {}} costLevel="light" />);
    const button = screen.getByTestId("download-cta");
    expect(document.activeElement).not.toBe(button);
  });

  it("el click invoca onDownload y mantiene el rol/nombre 'Descargar…' (R12, R14)", () => {
    const onDownload = vi.fn();
    render(<DownloadCta onDownload={onDownload} costLevel="medium" />);
    const button = screen.getByRole("button", { name: /descargar/i });
    fireEvent.click(button);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("usa el label recibido por props cuando se pasa uno (R9)", () => {
    render(
      <DownloadCta
        onDownload={() => {}}
        costLevel="heavy"
        label="⇩ Descargar texto"
      />,
    );
    expect(
      screen.getByRole("button", { name: "⇩ Descargar texto" }),
    ).toBeInTheDocument();
  });
});
