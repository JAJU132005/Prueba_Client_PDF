import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageRangeSelector } from "@/components/PageRangeSelector";
import {
  createSelection,
  type PageSelectionState,
} from "@/pdf/pageSelection";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Índices seleccionados en orden ascendente. */
function selectedList(s: PageSelectionState): number[] {
  return [...s.selected].sort((a, b) => a - b);
}

/**
 * Envoltura controlada: mantiene el estado y expone el último valor para las
 * aserciones, replicando cómo lo cablea una ruta.
 */
function Harness({
  pageCount,
  showAdvanced,
  onValue,
}: {
  pageCount: number;
  showAdvanced?: boolean;
  onValue?: (s: PageSelectionState) => void;
}): JSX.Element {
  const [value, setValue] = useState(() => createSelection(pageCount));
  return (
    <PageRangeSelector
      pageCount={pageCount}
      value={value}
      showAdvanced={showAdvanced}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe("PageRangeSelector", () => {
  it("renderiza una casilla clicable por página (R18)", () => {
    render(<Harness pageCount={5} />);
    for (let i = 1; i <= 5; i++) {
      expect(
        screen.getByRole("button", { name: `Página ${i}` }),
      ).toBeInTheDocument();
    }
  });

  it("al hacer clic en una casilla dispara onChange con togglePage (R19)", () => {
    const onValue = vi.fn();
    render(<Harness pageCount={3} onValue={onValue} />);
    // Empieza con todas seleccionadas; clic en la página 2 la deselecciona.
    fireEvent.click(screen.getByRole("button", { name: "Página 2" }));
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(selectedList(onValue.mock.calls[0][0])).toEqual([0, 2]);
  });

  it("ofrece los atajos Todas/Pares/Impares/Invertir y el control de rango (R20)", () => {
    render(<Harness pageCount={4} />);
    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pares" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Impares" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invertir" })).toBeInTheDocument();
    expect(screen.getByLabelText("Desde la página")).toBeInTheDocument();
    expect(screen.getByLabelText("Hasta la página")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aplicar rango" }),
    ).toBeInTheDocument();
  });

  it("los atajos Pares/Impares/Invertir disparan onChange con la selección esperada (R20)", () => {
    const onValue = vi.fn();
    render(<Harness pageCount={4} onValue={onValue} />);

    fireEvent.click(screen.getByRole("button", { name: "Pares" }));
    expect(selectedList(onValue.mock.calls.at(-1)![0])).toEqual([1, 3]);

    fireEvent.click(screen.getByRole("button", { name: "Impares" }));
    expect(selectedList(onValue.mock.calls.at(-1)![0])).toEqual([0, 2]);

    fireEvent.click(screen.getByRole("button", { name: "Invertir" }));
    // Complemento de {0,2} → {1,3}.
    expect(selectedList(onValue.mock.calls.at(-1)![0])).toEqual([1, 3]);
  });

  it("el control de rango desde-hasta dispara onChange con selectRange (R20)", () => {
    const onValue = vi.fn();
    render(<Harness pageCount={6} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Desde la página"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Hasta la página"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar rango" }));
    expect(selectedList(onValue.mock.calls.at(-1)![0])).toEqual([1, 2, 3]);
  });

  it("el campo avanzado válido actualiza la selección vía fromText (R21)", () => {
    const onValue = vi.fn();
    render(<Harness pageCount={6} showAdvanced onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Especificación de rangos avanzada"), {
      target: { value: "1-3,5" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Aplicar selección avanzada" }),
    );
    expect(selectedList(onValue.mock.calls.at(-1)![0])).toEqual([0, 1, 2, 4]);
  });

  it("el campo avanzado inválido muestra el mensaje en role=alert y NO llama onChange (R22a, R22b)", () => {
    const onValue = vi.fn();
    render(<Harness pageCount={6} showAdvanced onValue={onValue} />);
    fireEvent.change(screen.getByLabelText("Especificación de rangos avanzada"), {
      target: { value: "1-99" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Aplicar selección avanzada" }),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onValue).not.toHaveBeenCalled();
  });

  it("no realiza ninguna petición de red al interactuar (R23)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const onValue = vi.fn();
    render(<Harness pageCount={4} showAdvanced onValue={onValue} />);

    fireEvent.click(screen.getByRole("button", { name: "Página 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Pares" }));
    fireEvent.change(screen.getByLabelText("Especificación de rangos avanzada"), {
      target: { value: "1-2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Aplicar selección avanzada" }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
