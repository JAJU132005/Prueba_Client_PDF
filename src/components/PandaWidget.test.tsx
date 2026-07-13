import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Layout } from "@/components/Layout";
import { PandaWidget } from "@/components/PandaWidget";
import { ThemeProvider } from "@/design/theme";

describe("PandaWidget", () => {
  it("se monta fijo en la esquina sin bloquear la interacción del resto (R12)", () => {
    const { container } = render(<PandaWidget />);
    const wrapper = container.querySelector<HTMLElement>("[data-panda-widget]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("fixed");
    expect(wrapper?.style.pointerEvents).toBe("none");
    const svg = wrapper?.querySelector("svg");
    expect(svg?.style.pointerEvents).toBe("auto");
  });

  it("dibuja el panda con colores tokenizados para la pizarra (#41)", () => {
    const { container } = render(<PandaWidget />);
    const markup = container.querySelector("[data-panda-widget]")?.innerHTML ?? "";
    // Pelaje, parches y brillo del ojo derivan de tokens, no de #2d2a26/#fff/#fffdf6.
    expect(markup).toContain("var(--panda-patch");
    expect(markup).toContain("var(--panda-fur");
    expect(markup).toContain("var(--panda-eye");
  });

  it("es enfocable por teclado con nombre accesible (R13)", () => {
    render(<PandaWidget />);
    const panda = screen.getByRole("button", { name: /panda de guardia/i });
    expect(panda.getAttribute("tabindex")).toBe("0");
  });

  it("saluda con un easter egg al activarlo con el teclado (R13)", () => {
    render(<PandaWidget />);
    const panda = screen.getByRole("button", { name: /panda de guardia/i });
    fireEvent.keyDown(panda, { key: "Enter" });
    expect(screen.getByRole("status").textContent).toBeTruthy();
  });

  it("el Layout monta una única instancia (R12)", () => {
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter>
          <Layout>
            <p>contenido</p>
          </Layout>
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(container.querySelectorAll("[data-panda-widget]")).toHaveLength(1);
  });

  it("rota los easter eggs al hacer clic (R12)", () => {
    render(<PandaWidget />);
    const panda = screen.getByRole("button", { name: /panda de guardia/i });
    fireEvent.click(panda);
    const first = screen.getByRole("status").textContent;
    fireEvent.click(panda);
    const second = screen.getByRole("status").textContent;
    expect(first).not.toBe(second);
  });
});
