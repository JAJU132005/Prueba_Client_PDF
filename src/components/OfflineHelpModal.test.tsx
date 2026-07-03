import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OfflineHelpModal } from "@/components/OfflineHelpModal";
import {
  INSTALL_STEPS_DESKTOP,
  INSTALL_STEPS_MOBILE,
  OFFLINE_USAGE_STEPS,
  PRIVACY_REMINDER,
} from "@/lib/offlineEducation";

describe("OfflineHelpModal (R6..R12)", () => {
  it("expone role='dialog' con aria-modal='true' (R6)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={false} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("traslada el foco a un elemento del diálogo al abrir (R6)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={false} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("muestra los pasos de instalación de escritorio (R7)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={false} />);
    for (const step of INSTALL_STEPS_DESKTOP) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it("muestra los pasos de instalación de móvil (R8)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={false} />);
    for (const step of INSTALL_STEPS_MOBILE) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it("muestra los pasos de uso sin conexión (R9)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={false} />);
    for (const step of OFFLINE_USAGE_STEPS) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it("reitera el mensaje de privacidad (R12)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={false} />);
    expect(screen.getByText(PRIVACY_REMINDER)).toBeInTheDocument();
  });

  it("con isMobile={true} los pasos móviles preceden a los de escritorio (R10)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={true} />);
    const mobileHeading = screen.getByRole("heading", {
      name: /instalar en móvil/i,
    });
    const desktopHeading = screen.getByRole("heading", {
      name: /instalar en escritorio/i,
    });
    const position = mobileHeading.compareDocumentPosition(desktopHeading);
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: desktop va después de mobile.
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("con isMobile={false} los pasos de escritorio preceden a los de móvil (R10)", () => {
    render(<OfflineHelpModal onClose={vi.fn()} isMobile={false} />);
    const desktopHeading = screen.getByRole("heading", {
      name: /instalar en escritorio/i,
    });
    const mobileHeading = screen.getByRole("heading", {
      name: /instalar en móvil/i,
    });
    const position = desktopHeading.compareDocumentPosition(mobileHeading);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Escape cierra la ayuda (R11)", () => {
    const onClose = vi.fn();
    render(<OfflineHelpModal onClose={onClose} isMobile={false} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el botón de cierre invoca onClose (R11)", () => {
    const onClose = vi.fn();
    render(<OfflineHelpModal onClose={onClose} isMobile={false} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar ayuda/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el clic en el backdrop cierra la ayuda (R11)", () => {
    const onClose = vi.fn();
    const { container } = render(
      <OfflineHelpModal onClose={onClose} isMobile={false} />,
    );
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
