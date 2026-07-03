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

  it("al activar una tarjeta navega a su ruta y renderiza su página real (R11)", () => {
    // Todas las herramientas ya tienen página real (la última en migrar fue
    // /proteger en #14); por eso esta navegación lleva a una ruta real, cuyo
    // cliente crea un Worker al montar. Se stubea `Worker` para poder montar la
    // página en jsdom sin instanciar el worker real.
    const originalWorker = globalThis.Worker;
    class StubWorker {
      postMessage(): void {
        // no-op: ningún método del cliente se invoca en este test de navegación.
      }
      addEventListener(): void {
        // no-op
      }
      removeEventListener(): void {
        // no-op
      }
      terminate(): void {
        // no-op
      }
    }
    (globalThis as { Worker: unknown }).Worker = StubWorker;

    try {
      renderApp();

      const protectTool = TOOLS.find((tool) => tool.path === "/proteger");
      if (!protectTool) {
        throw new Error("no se encontró la herramienta protect");
      }
      const grid = screen.getByRole("region", {
        name: /herramientas disponibles/i,
      });
      const card = within(grid).getByRole("link", {
        name: new RegExp(protectTool.title, "i"),
      });

      fireEvent.click(card);

      // Navegó a la página real (su heading aparece) y no al placeholder.
      expect(
        screen.getByRole("heading", { name: "Proteger / desbloquear PDF" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/disponible pronto/i)).not.toBeInTheDocument();
    } finally {
      (globalThis as { Worker: unknown }).Worker = originalWorker;
    }
  });
});
