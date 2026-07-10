import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolPageHeader } from "@/components/ToolPageHeader";
import { getToolSkin } from "@/lib/toolSkin";

describe("ToolPageHeader", () => {
  it("muestra título de la herramienta, sello local y badge de nivel (R14, R22)", () => {
    render(<ToolPageHeader toolId="merge" />);
    expect(
      screen.getByRole("heading", { level: 1, name: /unir pdf/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/100% local/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/consumo de recursos/i)).toBeInTheDocument();
  });

  it("muestra la tarjeta de escena con la ilustración y la onomatopeya de toolSkin", () => {
    const skin = getToolSkin("merge");
    const { container } = render(<ToolPageHeader toolId="merge" />);
    expect(screen.getByText(skin!.sceneTitle)).toBeInTheDocument();
    // La onomatopeya puede aparecer también dentro del SVG de la escena.
    expect(screen.getAllByText(skin!.onomatopoeia).length).toBeGreaterThan(0);
    expect(
      container.querySelector(`[data-panda-art="${skin!.scene}"]`),
    ).not.toBeNull();
  });

  it("devuelve null para un toolId desconocido", () => {
    const { container } = render(<ToolPageHeader toolId="no-existe" />);
    expect(container).toBeEmptyDOMElement();
  });
});
