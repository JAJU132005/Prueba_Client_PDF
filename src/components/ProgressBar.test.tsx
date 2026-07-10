import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "@/components/ProgressBar";

describe("ProgressBar", () => {
  it("expone role='progressbar' con aria-valuenow derivado del 0..1 real (R24)", () => {
    render(<ProgressBar value={0.62} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "62");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("el ancho del relleno refleja el progreso recibido (R24)", () => {
    const { container } = render(<ProgressBar value={0.4} />);
    const fill = container.querySelector<HTMLElement>(".progress-fill");
    expect(fill?.style.width).toBe("40%");
  });

  it("acota valores fuera de rango a 0..100", () => {
    const { rerender } = render(<ProgressBar value={-1} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    rerender(<ProgressBar value={2} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});
