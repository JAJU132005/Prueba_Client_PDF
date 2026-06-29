import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";
import { ThemeProvider } from "@/design/theme";
import { TOOLS } from "@/lib/tools";

function renderApp(initialPath = "/"): void {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Home", () => {
  it("renderiza exactamente TOOLS.length tarjetas en la rejilla (R8)", () => {
    renderApp();
    const grid = screen.getByRole("region", {
      name: /herramientas disponibles/i,
    });
    const cards = within(grid).getAllByRole("link");
    expect(cards).toHaveLength(TOOLS.length);
  });

  it("dispone la rejilla con las clases responsive 1/2/3 columnas (R7)", () => {
    renderApp();
    const grid = screen.getByRole("region", {
      name: /herramientas disponibles/i,
    });
    expect(grid).toHaveClass(
      "grid-cols-1",
      "sm:grid-cols-2",
      "lg:grid-cols-3",
    );
  });

  it("al activar una tarjeta navega a su ruta y renderiza el placeholder (R11)", () => {
    renderApp();

    // Las rutas /unir, /dividir, /rotar, /organizar, /pdf-a-imagenes,
    // /imagenes-a-pdf, /numeros-pagina, /marca-agua y /comprimir ya tienen
    // página real; se elige una herramienta que siga siendo placeholder para
    // validar la navegación genérica.
    const placeholderTool = TOOLS.find(
      (tool) =>
        tool.path !== "/unir" &&
        tool.path !== "/dividir" &&
        tool.path !== "/rotar" &&
        tool.path !== "/organizar" &&
        tool.path !== "/pdf-a-imagenes" &&
        tool.path !== "/imagenes-a-pdf" &&
        tool.path !== "/numeros-pagina" &&
        tool.path !== "/marca-agua" &&
        tool.path !== "/comprimir",
    );
    if (!placeholderTool) {
      throw new Error("no hay herramienta placeholder disponible");
    }
    const grid = screen.getByRole("region", {
      name: /herramientas disponibles/i,
    });
    const card = within(grid).getByRole("link", {
      name: new RegExp(placeholderTool.title, "i"),
    });

    fireEvent.click(card);

    expect(
      screen.getByRole("heading", {
        name: new RegExp(placeholderTool.title, "i"),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/disponible pronto/i)).toBeInTheDocument();
  });
});
