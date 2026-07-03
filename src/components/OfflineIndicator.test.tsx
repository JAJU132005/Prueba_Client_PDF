import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OfflineIndicator } from "@/components/OfflineIndicator";
import { OFFLINE_REASSURANCE, ONLINE_LABEL } from "@/lib/offlineEducation";

describe("OfflineIndicator (R16, R17, R18)", () => {
  it("con online={true} refleja el estado 'en línea' de forma sutil (R17)", () => {
    render(<OfflineIndicator online={true} />);
    expect(screen.getByText(ONLINE_LABEL)).toBeInTheDocument();
  });

  it("con online={false} muestra el mensaje tranquilizador (R16)", () => {
    render(<OfflineIndicator online={false} />);
    expect(screen.getByText(OFFLINE_REASSURANCE)).toBeInTheDocument();
  });

  it("expone el estado por texto/aria además del color (R18)", () => {
    render(<OfflineIndicator online={false} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", expect.stringContaining("conexión"));
    // El estado va en texto, no solo en color.
    expect(status.textContent).toMatch(/sigue funcionando/i);
  });

  it("anuncia los cambios con aria-live polite (R18)", () => {
    render(<OfflineIndicator online={true} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
