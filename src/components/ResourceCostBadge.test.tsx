import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResourceCostBadge } from "@/components/ResourceCostBadge";
import { RESOURCE_COST_LABEL, type ResourceCost } from "@/lib/resourceCost";

const LEVELS: ResourceCost[] = ["light", "medium", "heavy"];

describe("ResourceCostBadge (R4, R5, R6)", () => {
  it("muestra la etiqueta textual de cada nivel, no solo color (R4)", () => {
    for (const level of LEVELS) {
      const { unmount } = render(<ResourceCostBadge level={level} />);
      expect(screen.getByText(RESOURCE_COST_LABEL[level])).toBeInTheDocument();
      unmount();
    }
  });

  it("aplica una clase de color distinta por nivel (R5)", () => {
    const classNames = LEVELS.map((level) => {
      const { container, unmount } = render(
        <ResourceCostBadge level={level} />,
      );
      const cls = (container.firstChild as HTMLElement).className;
      unmount();
      return cls;
    });
    expect(new Set(classNames).size).toBe(LEVELS.length);
  });

  it("expone un aria-label con 'Consumo de recursos' y la etiqueta (R6)", () => {
    render(<ResourceCostBadge level="heavy" />);
    const badge = screen.getByLabelText(/consumo de recursos/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      "aria-label",
      `Consumo de recursos: ${RESOURCE_COST_LABEL.heavy}`,
    );
  });
});
