import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOnlineStatus } from "@/lib/useOnlineStatus";

function stubOnLine(value: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOnlineStatus (R13, R14, R15)", () => {
  it("inicializa a partir de navigator.onLine cuando está en línea (R13)", () => {
    stubOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("inicializa a partir de navigator.onLine cuando está sin conexión (R13)", () => {
    stubOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("pasa a 'sin conexión' al emitirse el evento offline (R14)", () => {
    stubOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("pasa a 'en línea' al emitirse el evento online (R15)", () => {
    stubOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});
