import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { Header } from "@/components/Header";
import { ThemeProvider } from "@/design/theme";

function renderHeader(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Header", () => {
  it("muestra el logo panda con 'cliente-pdf' enlazando a la home (R14)", () => {
    const { container } = renderHeader();
    expect(screen.getByRole("link", { name: /cliente-pdf/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(container.querySelector('[data-panda-art="pose-ligera"]')).not.toBeNull();
  });

  it("conserva OfflineIndicator, ThemeToggle y el sello '100% local' (R14)", () => {
    renderHeader();
    expect(
      screen.getByRole("status", { name: /estado de conexión/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /modo pizarra/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/100% local/i)).toBeInTheDocument();
  });
});
