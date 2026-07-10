import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormFieldOverlay } from "@/components/FormFieldOverlay";
import type { FormFieldInfo } from "@/pdf/fillForms";
import type { PreviewPageSize } from "@/pdf/previewModel";

const PAGE: PreviewPageSize = { width: 300, height: 400 };

const FIELDS: FormFieldInfo[] = [
  {
    name: "nombre",
    type: "text",
    value: "",
    widgets: [{ pageIndex: 0, rect: { x: 20, y: 350, width: 200, height: 20 } }],
  },
  {
    name: "firma",
    type: "text",
    value: "",
    widgets: [{ pageIndex: 1, rect: { x: 10, y: 100, width: 80, height: 20 } }],
  },
  {
    name: "color",
    type: "radio",
    value: "",
    widgets: [
      { pageIndex: 0, rect: { x: 20, y: 290, width: 15, height: 15 } },
      { pageIndex: 0, rect: { x: 60, y: 290, width: 15, height: 15 } },
    ],
  },
];

describe("FormFieldOverlay (#31)", () => {
  it("dibuja un marcador por cada widget de la página activa (R8, R9)", () => {
    render(
      <FormFieldOverlay
        fields={FIELDS}
        pageIndex={0}
        pageSize={PAGE}
        scale={1}
        focusedField={null}
        onFocusField={vi.fn()}
      />,
    );
    // Página 0: nombre (1) + color (2) = 3 marcadores; firma (pág. 1) NO aparece.
    const markers = screen.getAllByTestId("field-marker");
    expect(markers).toHaveLength(3);
    expect(screen.queryByLabelText("Campo firma")).not.toBeInTheDocument();
  });

  it("expone el aria-label con el nombre del campo (R8)", () => {
    render(
      <FormFieldOverlay
        fields={FIELDS}
        pageIndex={0}
        pageSize={PAGE}
        scale={1}
        focusedField={null}
        onFocusField={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Campo nombre")).toBeInTheDocument();
  });

  it("clic en un marcador invoca onFocusField con el nombre (R11)", () => {
    const onFocusField = vi.fn();
    render(
      <FormFieldOverlay
        fields={FIELDS}
        pageIndex={0}
        pageSize={PAGE}
        scale={1}
        focusedField={null}
        onFocusField={onFocusField}
      />,
    );
    fireEvent.click(screen.getByLabelText("Campo nombre"));
    expect(onFocusField).toHaveBeenCalledWith("nombre");
  });

  it("el campo enfocado recibe aria-current='true' (R12)", () => {
    render(
      <FormFieldOverlay
        fields={FIELDS}
        pageIndex={0}
        pageSize={PAGE}
        scale={1}
        focusedField="nombre"
        onFocusField={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Campo nombre")).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Los no enfocados no llevan aria-current.
    const color = screen.getAllByLabelText("Campo color")[0];
    expect(color).not.toHaveAttribute("aria-current");
  });

  it("posiciona el marcador con la geometría de formOverlay (R5, R8)", () => {
    render(
      <FormFieldOverlay
        fields={FIELDS}
        pageIndex={0}
        pageSize={PAGE}
        scale={1}
        focusedField={null}
        onFocusField={vi.fn()}
      />,
    );
    const marker = screen.getByLabelText("Campo nombre");
    // top = (400 - 350 - 20) * 1 = 30; left = 20.
    expect(marker.style.left).toBe("20px");
    expect(marker.style.top).toBe("30px");
    expect(marker.style.width).toBe("200px");
    expect(marker.style.height).toBe("20px");
  });
});
