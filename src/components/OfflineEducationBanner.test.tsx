import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfflineEducationBanner } from "@/components/OfflineEducationBanner";
import { BANNER_MESSAGE } from "@/lib/offlineEducation";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OfflineEducationBanner (R1, R2, R3)", () => {
  it("muestra el aviso una vez con el texto exacto (R1)", () => {
    render(<OfflineEducationBanner />);
    expect(screen.getByText(BANNER_MESSAGE)).toBeInTheDocument();
  });

  it("el control abre la ayuda de instalación y uso offline (R2)", () => {
    render(<OfflineEducationBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cómo instalarla/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("tras descartar, el aviso desaparece y no se vuelve a renderizar (R3)", () => {
    render(<OfflineEducationBanner />);
    expect(screen.getByText(BANNER_MESSAGE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /descartar aviso/i }));
    expect(screen.queryByText(BANNER_MESSAGE)).not.toBeInTheDocument();
  });
});

// T15 — invariante de estado en memoria (R5, R20)
describe("OfflineEducationBanner — estado en memoria de sesión (R5, R20)", () => {
  it("descartar NO invoca localStorage.setItem ni sessionStorage.setItem (R5)", () => {
    const localSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<OfflineEducationBanner />);
    fireEvent.click(screen.getByRole("button", { name: /descartar aviso/i }));

    // Storage.prototype cubre localStorage y sessionStorage (misma prototipo).
    expect(localSpy).not.toHaveBeenCalled();
  });

  it("un remontaje limpio vuelve a mostrar el aviso (solo memoria de sesión) (R20)", () => {
    const first = render(<OfflineEducationBanner />);
    fireEvent.click(screen.getByRole("button", { name: /descartar aviso/i }));
    expect(screen.queryByText(BANNER_MESSAGE)).not.toBeInTheDocument();
    first.unmount();

    // Remontaje limpio: sin persistencia, el aviso reaparece.
    render(<OfflineEducationBanner />);
    expect(screen.getByText(BANNER_MESSAGE)).toBeInTheDocument();
  });
});
