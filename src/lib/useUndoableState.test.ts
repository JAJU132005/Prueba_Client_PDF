import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useUndoableState } from "@/lib/useUndoableState";

interface Model {
  readonly value: number;
}

describe("useUndoableState (R11, R12, R13)", () => {
  it("expone present/canUndo/canRedo iniciales (R11)", () => {
    const { result } = renderHook(() => useUndoableState<Model>({ value: 0 }));
    expect(result.current.present).toEqual({ value: 0 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("set añade entrada y undo/redo navegan (R11)", () => {
    const { result } = renderHook(() => useUndoableState<Model>({ value: 0 }));

    act(() => result.current.set({ value: 1 }));
    act(() => result.current.set((prev) => ({ value: prev.value + 1 })));
    expect(result.current.present).toEqual({ value: 2 });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.present).toEqual({ value: 1 });
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.present).toEqual({ value: 2 });
    expect(result.current.canRedo).toBe(false);
  });

  it("un gesto (begin + varios update + end) produce UNA entrada (R12, R32)", () => {
    const { result } = renderHook(() => useUndoableState<Model>({ value: 0 }));
    act(() => result.current.set({ value: 10 }));

    act(() => result.current.beginGesture());
    act(() => result.current.updateGesture({ value: 11 }));
    act(() => result.current.updateGesture({ value: 12 }));
    act(() => result.current.updateGesture({ value: 13 }));
    act(() => result.current.endGesture());

    expect(result.current.present).toEqual({ value: 13 });
    // Un solo undo revierte TODO el gesto al estado pre-gesto.
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ value: 10 });
    // No hay más que deshacer del gesto (solo queda el set inicial → estado 0).
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ value: 0 });
    expect(result.current.canUndo).toBe(false);
  });

  it("endGesture sin cambios NO añade entrada (R13)", () => {
    const { result } = renderHook(() => useUndoableState<Model>({ value: 0 }));
    act(() => result.current.set({ value: 5 }));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.beginGesture());
    act(() => result.current.endGesture());

    // Sigue habiendo exactamente una entrada (la del set), no dos.
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ value: 0 });
    expect(result.current.canUndo).toBe(false);
  });

  it("replace no añade entrada de historial (R3, R34)", () => {
    const { result } = renderHook(() => useUndoableState<Model>({ value: 0 }));
    act(() => result.current.set({ value: 1 }));

    act(() => result.current.replace({ value: 99 }));
    expect(result.current.present).toEqual({ value: 99 });
    // Un undo vuelve al valor inicial: el replace no creó entrada.
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ value: 0 });
    expect(result.current.canUndo).toBe(false);
  });

  it("reset limpia el historial (R6, R33)", () => {
    const { result } = renderHook(() => useUndoableState<Model>({ value: 0 }));
    act(() => result.current.set({ value: 1 }));
    act(() => result.current.set({ value: 2 }));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.reset({ value: 0 }));
    expect(result.current.present).toEqual({ value: 0 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
