import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MOBILE_MEDIA_QUERY, useIsMobile } from "@/lib/useIsMobile";

interface FakeMql {
  media: string;
  matches: boolean;
  listeners: Set<(event: MediaQueryListEvent) => void>;
  addEventListener: (type: string, cb: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: string, cb: (event: MediaQueryListEvent) => void) => void;
  emit: (matches: boolean) => void;
}

function makeMql(query: string, initialMatches: boolean): FakeMql {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    media: query,
    matches: initialMatches,
    listeners,
    addEventListener(_type, cb) {
      listeners.add(cb);
    },
    removeEventListener(_type, cb) {
      listeners.delete(cb);
    },
    emit(matches: boolean) {
      this.matches = matches;
      for (const cb of listeners) {
        cb({ matches } as MediaQueryListEvent);
      }
    },
  };
}

function stubMatchMedia(mql: FakeMql): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      mql.media = query;
      return mql as unknown as MediaQueryList;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIsMobile (R11, R12)", () => {
  it("devuelve el 'matches' de la MediaQueryList de window.matchMedia (R11)", () => {
    stubMatchMedia(makeMql(MOBILE_MEDIA_QUERY, true));
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("devuelve false cuando la MediaQueryList no coincide (R11)", () => {
    stubMatchMedia(makeMql(MOBILE_MEDIA_QUERY, false));
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("actualiza el valor cuando la MediaQueryList emite un cambio (R12)", () => {
    const mql = makeMql(MOBILE_MEDIA_QUERY, false);
    stubMatchMedia(mql);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      mql.emit(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      mql.emit(false);
    });
    expect(result.current).toBe(false);
  });

  it("devuelve false si window.matchMedia no existe (SSR/jsdom sin soporte)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
