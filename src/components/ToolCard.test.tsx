import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ToolCard } from "@/components/ToolCard";
import { RESOURCE_COST_LABEL, type ResourceCost } from "@/lib/resourceCost";

function renderCard(resourceCost: ResourceCost = "light"): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <ToolCard
        title="Unir PDF"
        description="Combina varios PDF en uno."
        to="/unir"
        icon="merge"
        category="organizar"
        resourceCost={resourceCost}
      />
    </MemoryRouter>,
  );
  return container;
}

describe("ToolCard", () => {
  it("muestra el título y la descripción de las props (R2)", () => {
    renderCard();
    expect(screen.getByText("Unir PDF")).toBeInTheDocument();
    expect(
      screen.getByText("Combina varios PDF en uno."),
    ).toBeInTheDocument();
  });

  it("muestra el icono decorativo dentro del enlace (R2)", () => {
    const container = renderCard();
    const link = screen.getByRole("link", { name: /unir pdf/i });
    const svg = link.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renderiza un único enlace navegable con nombre accesible que incluye el título (R3, R4)", () => {
    renderCard();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    const link = screen.getByRole("link", { name: /unir pdf/i });
    expect(link).toBeInTheDocument();
  });

  it("el enlace apunta a la ruta recibida en 'to' (R3)", () => {
    renderCard();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/unir");
  });

  it("muestra el badge de consumo con la etiqueta del nivel recibido (R3)", () => {
    renderCard("heavy");
    expect(
      screen.getByText(RESOURCE_COST_LABEL.heavy),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        `Consumo de recursos: ${RESOURCE_COST_LABEL.heavy}`,
      ),
    ).toBeInTheDocument();
  });
});
