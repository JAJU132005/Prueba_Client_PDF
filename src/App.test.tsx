import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";
import { Layout } from "@/components/Layout";
import { ThemeProvider } from "@/design/theme";
import { BANNER_MESSAGE } from "@/lib/offlineEducation";

function renderApp(): void {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("App", () => {
  it("monta y muestra el título de la app (R13)", () => {
    renderApp();
    expect(
      screen.getByRole("heading", {
        name: /tus pdf, sin salir de tu navegador/i,
      }),
    ).toBeInTheDocument();
  });

  it("muestra el badge de confianza '100% local' (R7)", () => {
    renderApp();
    expect(screen.getByText(/100% local/i)).toBeInTheDocument();
  });

  it("tras descartar el aviso, no reaparece al navegar entre rutas (#22 R4)", () => {
    // El aviso vive en `Layout`, que envuelve `Routes` y no se desmonta al
    // navegar; su estado de descarte es en memoria de sesión, así que debe
    // persistir al cambiar de ruta. Se usan rutas ligeras para no montar
    // componentes de herramienta con worker (no disponible en jsdom).
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/a"]}>
          <Layout>
            <nav>
              <Link to="/a">Ir a A</Link>
              <Link to="/b">Ir a B</Link>
            </nav>
            <Routes>
              <Route path="/a" element={<p>Ruta A</p>} />
              <Route path="/b" element={<p>Ruta B</p>} />
            </Routes>
          </Layout>
        </MemoryRouter>
      </ThemeProvider>,
    );

    // El aviso aparece en la primera visita.
    expect(screen.getByText(BANNER_MESSAGE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /descartar aviso/i }));
    expect(screen.queryByText(BANNER_MESSAGE)).not.toBeInTheDocument();

    // Navegar a otra ruta: el Layout no se desmonta → el descarte persiste.
    fireEvent.click(screen.getByRole("link", { name: /ir a b/i }));
    expect(screen.getByText("Ruta B")).toBeInTheDocument();
    expect(screen.queryByText(BANNER_MESSAGE)).not.toBeInTheDocument();

    // Y de vuelta: sigue descartado; el badge de confianza sigue presente.
    fireEvent.click(screen.getByRole("link", { name: /ir a a/i }));
    expect(screen.queryByText(BANNER_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText(/100% local/i)).toBeInTheDocument();
  });
});
