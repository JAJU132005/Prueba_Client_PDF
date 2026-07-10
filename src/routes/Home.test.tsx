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

  // Ampliaciones #28 (R27, R28, R29, R31): orden del entregable, hero y cómic.
  it("las tarjetas siguen el ORDEN exacto del entregable y enlazan a las rutas existentes (#28 R27, R31)", () => {
    renderApp();
    const grid = screen.getByRole("region", {
      name: /herramientas disponibles/i,
    });
    const cards = within(grid).getAllByRole("link");
    // Orden tarjeta a tarjeta de design-incoming/home/index.html.
    const expectedTitles = [
      "Unir PDF",
      "Dividir PDF",
      "Rotar PDF",
      "Organizar páginas",
      "PDF a imágenes",
      "Imágenes a PDF",
      "Números de página",
      "Marca de agua",
      "Comprimir PDF",
      "Proteger / desbloquear",
      "Editar y anotar PDF",
      "Firmar PDF",
      "Rellenar formularios",
      "Reconocer texto (OCR)",
      "Redactar PDF",
      "Firmar PDF (colocación libre)",
    ];
    const expectedPaths = [
      "/unir",
      "/dividir",
      "/rotar",
      "/organizar",
      "/pdf-a-imagenes",
      "/imagenes-a-pdf",
      "/numeros-pagina",
      "/marca-agua",
      "/comprimir",
      "/proteger",
      "/anotar",
      "/firmar",
      "/rellenar-formularios",
      "/reconocer-texto",
      "/redactar",
      "/firmar-libre",
    ];
    expect(cards.map((card) => card.getAttribute("href"))).toEqual(
      expectedPaths,
    );
    cards.forEach((card, i) => {
      expect(card).toHaveTextContent(expectedTitles[i]);
    });
  });

  it("muestra el hero de portada con el contador a 0 y las ilustraciones (#28 R28)", () => {
    renderApp();
    expect(
      screen.getByRole("heading", {
        name: /tus pdf, sin salir de tu navegador/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sin subida · sin registro · funciona offline/i),
    ).toBeInTheDocument();
    // El contador aparece en el hero (además del footer del Layout).
    const counters = screen.getAllByText(/bytes enviados a internet:/i);
    expect(counters.length).toBeGreaterThanOrEqual(2);
    const zeros = Array.from(document.querySelectorAll(".zero")).map(
      (el) => el.textContent,
    );
    expect(zeros.length).toBeGreaterThanOrEqual(2);
    for (const zero of zeros) {
      expect(zero).toBe("0");
    }
    expect(
      document.querySelector('[data-panda-art="portada"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-panda-art="nube"]')).not.toBeNull();
  });

  it("incluye la sección #como-funciona con el cómic de 3 viñetas y la nota de instalación (#28 R29)", () => {
    renderApp();
    const section = document.querySelector("#como-funciona");
    expect(section).not.toBeNull();
    for (const comic of ["comic1", "comic2", "comic3"]) {
      expect(
        section?.querySelector(`[data-panda-art="${comic}"]`),
        `falta ${comic}`,
      ).not.toBeNull();
    }
    expect(
      screen.getByText(/una vez\s+instalada, funciona sin conexión/i),
    ).toBeInTheDocument();
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
        screen.getByRole("heading", { name: "Proteger / desbloquear" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/disponible pronto/i)).not.toBeInTheDocument();
    } finally {
      (globalThis as { Worker: unknown }).Worker = originalWorker;
    }
  });
});
