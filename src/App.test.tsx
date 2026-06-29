import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";
import { ThemeProvider } from "@/design/theme";

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
});
