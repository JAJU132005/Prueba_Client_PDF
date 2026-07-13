import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingHomeButton } from "@/components/FloatingHomeButton";

/** Instala un `matchMedia` falso cuyo `matches` fija la preferencia. */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/** Fija `window.scrollY` y dispara el evento `scroll`. */
function scrollTo(y: number): void {
  Object.defineProperty(window, "scrollY", {
    value: y,
    writable: true,
    configurable: true,
  });
  fireEvent.scroll(window);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FloatingHomeButton />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  stubReducedMotion(false);
  scrollTo(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  scrollTo(0);
});

describe("FloatingHomeButton (#40)", () => {
  it("NO se renderiza en la home '/', SÍ en una ruta de herramienta (R6, R1)", () => {
    const { container, unmount } = renderAt("/");
    expect(container.querySelector("[data-floating-home]")).toBeNull();
    unmount();

    renderAt("/unir");
    expect(document.querySelector("[data-floating-home]")).not.toBeNull();
  });

  it("el enlace apunta a '/' y expone su nombre accesible por aria-label (R4, R5, R12)", () => {
    renderAt("/unir");
    scrollTo(300); // visible → alcanzable por su rol/nombre (teclado)
    const link = screen.getByRole("link", { name: "Volver al inicio" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("oculto con scrollY <= 200; visible tras scrollY = 300 (R2, R3)", () => {
    renderAt("/unir");
    const fab = document.querySelector("[data-floating-home]");
    expect(fab).not.toBeNull();
    // Estado inicial (scrollY = 0): oculto.
    expect(fab).toHaveClass("opacity-0");

    scrollTo(300);
    expect(fab).toHaveClass("opacity-100");

    scrollTo(50);
    expect(fab).toHaveClass("opacity-0");
  });

  it("wrapper 'fixed' en esquina inferior IZQUIERDA, distinta al PandaWidget (R7, R8)", () => {
    renderAt("/unir");
    const fab = document.querySelector("[data-floating-home]");
    expect(fab).toHaveClass("fixed");
    expect(fab).toHaveClass("bottom-4");
    expect(fab).toHaveClass("left-4");
    // No comparte la esquina inferior derecha del PandaWidget.
    expect(fab).not.toHaveClass("right-4");
    expect(fab).not.toHaveClass("bottom-2");
  });

  it("sin reduced-motion aplica la animación; con reduce NO la aplica (R9, R10)", () => {
    const { unmount } = renderAt("/unir");
    scrollTo(300);
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveClass(
      "home-fab-animate",
    );
    unmount();

    stubReducedMotion(true);
    renderAt("/unir");
    scrollTo(300);
    expect(
      screen.getByRole("link", { name: "Volver al inicio" }),
    ).not.toHaveClass("home-fab-animate");
  });

  it("el estado de scroll está aislado: un hijo hermano no re-renderiza al hacer scroll (R11)", () => {
    const renderSpy = vi.fn();
    function Sibling(): JSX.Element {
      const count = useRef(0);
      count.current += 1;
      renderSpy(count.current);
      return <div data-testid="sibling" />;
    }

    render(
      <MemoryRouter initialEntries={["/unir"]}>
        <Sibling />
        <FloatingHomeButton />
      </MemoryRouter>,
    );

    const rendersBefore = renderSpy.mock.calls.length;
    scrollTo(300);
    scrollTo(500);
    scrollTo(0);
    // El FAB togglea su propio estado; el hermano NO se vuelve a renderizar.
    expect(renderSpy.mock.calls.length).toBe(rendersBefore);
  });

  it("no invoca fetch al montar ni al navegar (R13)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    stubReducedMotion(false);

    renderAt("/unir");
    scrollTo(300);
    fireEvent.click(screen.getByRole("link", { name: "Volver al inicio" }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
