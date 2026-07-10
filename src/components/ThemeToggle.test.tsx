import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeProvider } from "@/design/theme";

function renderToggle(): void {
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("ThemeToggle", () => {
  it("expone un control con nombre accesible que describe cambiar de tema (R12)", () => {
    renderToggle();
    expect(
      screen.getByRole("button", {
        name: /modo (pizarra|cuaderno)/i,
      }),
    ).toBeInTheDocument();
  });

  it("parte en tema claro y ofrece cambiar a oscuro con el rótulo 'modo pizarra ☾' (R12, #28 R4)", () => {
    renderToggle();
    expect(
      screen.getByRole("button", { name: /modo pizarra ☾/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("al hacer click alterna el rótulo y la clase 'dark' en <html> (R12, R14, #28 R3/R43)", () => {
    renderToggle();

    const toggle = screen.getByRole("button", {
      name: /modo pizarra ☾/i,
    });
    fireEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: /modo cuaderno ☀/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /modo cuaderno ☀/i }));

    expect(
      screen.getByRole("button", { name: /modo pizarra ☾/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
