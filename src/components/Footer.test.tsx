import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Footer } from "@/components/Footer";

describe("Footer", () => {
  it("muestra el contador 'Bytes enviados a internet' con el valor literal 0 (R15)", () => {
    render(<Footer />);
    const counter = screen.getByText(/bytes enviados a internet:/i);
    const zero = counter.querySelector(".zero");
    expect(zero?.textContent).toBe("0");
  });

  it("muestra el lema del diario y los créditos de las libs (R15)", () => {
    render(<Footer />);
    expect(
      screen.getByText(/lo que pasa en tu diario, se queda en tu diario/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/pdf-lib · pdf\.js/i)).toBeInTheDocument();
  });
});
