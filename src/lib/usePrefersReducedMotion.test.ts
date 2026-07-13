import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REDUCED_MOTION_QUERY,
  usePrefersReducedMotion,
} from "@/lib/usePrefersReducedMotion";

/**
 * MediaQueryList falso controlable: registra listeners `change` y permite
 * emitir cambios en vivo para verificar la suscripción del hook.
 */
function makeMatchMedia(initialMatches: boolean): {
  matchMedia: (query: string) => MediaQueryList;
  emit: (matches: boolean) => void;
  queries: string[];
} {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const queries: string[] = [];
  let matches = initialMatches;
  const mql = {
    get matches() {
      return matches;
    },
    media: REDUCED_MOTION_QUERY,
    addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (
      _type: string,
      cb: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(cb);
    },
  } as unknown as MediaQueryList;
  return {
    matchMedia: (query: string) => {
      queries.push(query);
      return mql;
    },
    emit: (next: boolean) => {
      matches = next;
      for (const cb of listeners) {
        cb({ matches: next } as MediaQueryListEvent);
      }
    },
    queries,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePrefersReducedMotion", () => {
  it("devuelve true cuando prefers-reduced-motion: reduce está activo", () => {
    const { matchMedia, queries } = makeMatchMedia(true);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    expect(queries).toContain(REDUCED_MOTION_QUERY);
  });

  it("devuelve false cuando reduced-motion no está activo", () => {
    const { matchMedia } = makeMatchMedia(false);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("se actualiza en vivo al emitir un cambio en la MediaQueryList", () => {
    const { matchMedia, emit } = makeMatchMedia(false);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      emit(true);
    });
    expect(result.current).toBe(true);
  });

  it("devuelve false si window.matchMedia no existe (sin DOM)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
