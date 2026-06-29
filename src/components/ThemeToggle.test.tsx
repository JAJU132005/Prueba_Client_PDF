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
        name: /cambiar a tema (oscuro|claro)/i,
      }),
    ).toBeInTheDocument();
  });

  it("parte en tema claro y ofrece cambiar a oscuro (R12)", () => {
    renderToggle();
    expect(
      screen.getByRole("button", { name: /cambiar a tema oscuro/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("al hacer click alterna el aria-label y la clase 'dark' en <html> (R12, R14)", () => {
    renderToggle();

    const toggle = screen.getByRole("button", {
      name: /cambiar a tema oscuro/i,
    });
    fireEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: /cambiar a tema claro/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /cambiar a tema claro/i }),
    );

    expect(
      screen.getByRole("button", { name: /cambiar a tema oscuro/i }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
