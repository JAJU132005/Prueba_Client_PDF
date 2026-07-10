import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResourceCostNote } from "@/components/ResourceCostNote";
import {
  HEAVY_MOBILE_WARNING,
  RESOURCE_COST_EXPLANATION,
  RESOURCE_COST_LABEL,
} from "@/lib/resourceCost";

describe("ResourceCostNote — etiqueta y frase por nivel (R7, R8)", () => {
  it("muestra etiqueta + frase explicativa para una herramienta 'heavy' (R7, R8)", () => {
    render(<ResourceCostNote toolId="compress" isMobile={false} />);
    expect(screen.getByLabelText(/consumo de recursos/i)).toHaveTextContent(
      RESOURCE_COST_LABEL.heavy,
    );
    expect(
      screen.getByText(RESOURCE_COST_EXPLANATION.heavy),
    ).toBeInTheDocument();
  });

  it("muestra etiqueta + frase explicativa para una herramienta 'medium' (R7, R8)", () => {
    render(<ResourceCostNote toolId="organize" isMobile={false} />);
    expect(screen.getByLabelText(/consumo de recursos/i)).toHaveTextContent(
      RESOURCE_COST_LABEL.medium,
    );
    expect(
      screen.getByText(RESOURCE_COST_EXPLANATION.medium),
    ).toBeInTheDocument();
  });

  it("muestra etiqueta + frase explicativa para una herramienta 'light' (R7, R8)", () => {
    render(<ResourceCostNote toolId="merge" isMobile={false} />);
    expect(screen.getByLabelText(/consumo de recursos/i)).toHaveTextContent(
      RESOURCE_COST_LABEL.light,
    );
    expect(
      screen.getByText(RESOURCE_COST_EXPLANATION.light),
    ).toBeInTheDocument();
  });
});

describe("ResourceCostNote — aviso móvil (R9, R10)", () => {
  it("heavy + móvil muestra el aviso accesible de memoria (R9)", () => {
    render(<ResourceCostNote toolId="compress" isMobile />);
    const warning = screen.getByRole("note");
    expect(warning).toHaveTextContent(HEAVY_MOBILE_WARNING);
    expect(warning.className).toContain("postit");
    expect(warning).toHaveTextContent(/en móvil esto suda de verdad/i);
  });

  it("heavy en escritorio NO muestra el aviso (R10)", () => {
    render(<ResourceCostNote toolId="compress" isMobile={false} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(HEAVY_MOBILE_WARNING)).not.toBeInTheDocument();
  });

  it("no-heavy en móvil NO muestra el aviso (R10)", () => {
    render(<ResourceCostNote toolId="merge" isMobile />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(HEAVY_MOBILE_WARNING)).not.toBeInTheDocument();
  });
});

describe("ResourceCostNote — id inexistente", () => {
  it("renderiza null cuando el toolId no existe en el catálogo", () => {
    const { container } = render(
      <ResourceCostNote toolId="no-existe" isMobile />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
