import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/design/theme";

function wrapper(props: { children: ReactNode }): JSX.Element {
  return <ThemeProvider>{props.children}</ThemeProvider>;
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
  vi.restoreAllMocks();
});

describe("ThemeProvider / useTheme", () => {
  it("añade y retira la clase 'dark' en <html> al alternar el tema (R14)", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("conserva el tema entre re-renders dentro del provider (R15)", () => {
    const { result, rerender } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");

    rerender();
    expect(result.current.theme).toBe("dark");
  });

  it("NO escribe en localStorage ni sessionStorage al alternar el tema (R16)", () => {
    const localSpy = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggleTheme());
    act(() => result.current.toggleTheme());

    expect(localSpy).not.toHaveBeenCalled();
  });

  it("monta sin tocar storage al renderizar el provider (R16)", () => {
    const localGetSpy = vi.spyOn(Storage.prototype, "getItem");
    render(
      <ThemeProvider>
        <span>contenido</span>
      </ThemeProvider>,
    );
    expect(localGetSpy).not.toHaveBeenCalled();
  });
});
