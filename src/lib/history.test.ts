import { describe, expect, it } from "vitest";

import {
  DEFAULT_HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  pushCheckpoint,
  redo,
  replace,
  reset,
  set,
  undo,
} from "@/lib/history";

describe("history — modelo puro (R1–R10)", () => {
  it("createHistory arranca con present y pilas vacías (R1)", () => {
    const h = createHistory("a");
    expect(h.present).toBe("a");
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
    expect(h.limit).toBe(DEFAULT_HISTORY_LIMIT);
  });

  it("set empuja present→past, fija next y vacía future, sin mutar (R2)", () => {
    const h0 = createHistory("a");
    const h1 = set(h0, "b");
    expect(h1.present).toBe("b");
    expect(h1.past).toEqual(["a"]);
    expect(h1.future).toEqual([]);
    // No muta la entrada.
    expect(h0.present).toBe("a");
    expect(h0.past).toEqual([]);
    expect(h1).not.toBe(h0);
  });

  it("set vacía el future previo (una rama nueva) (R2)", () => {
    const h = redo(undo(set(set(createHistory("a"), "b"), "c")));
    // Tras undo hay future; un set lo debe limpiar.
    const undone = undo(set(set(createHistory("a"), "b"), "c"));
    expect(undone.future.length).toBeGreaterThan(0);
    const branched = set(undone, "z");
    expect(branched.future).toEqual([]);
    expect(h.present).toBe("c");
  });

  it("replace cambia present sin tocar past (R3)", () => {
    const h1 = set(createHistory("a"), "b");
    const h2 = replace(h1, "b2");
    expect(h2.present).toBe("b2");
    expect(h2.past).toEqual(["a"]);
    expect(h2).not.toBe(h1);
  });

  it("undo mueve el último past a present y el present a future (R4)", () => {
    const h = set(set(createHistory("a"), "b"), "c");
    const u = undo(h);
    expect(u.present).toBe("b");
    expect(u.past).toEqual(["a"]);
    expect(u.future).toEqual(["c"]);
  });

  it("redo mueve el primer future a present y el present al final de past (R5)", () => {
    const h = undo(set(set(createHistory("a"), "b"), "c"));
    const r = redo(h);
    expect(r.present).toBe("c");
    expect(r.past).toEqual(["a", "b"]);
    expect(r.future).toEqual([]);
  });

  it("reset produce un historial con present y pilas vacías (R6)", () => {
    const h = set(set(createHistory("a"), "b"), "c");
    const r = reset("x");
    expect(r.present).toBe("x");
    expect(r.past).toEqual([]);
    expect(r.future).toEqual([]);
    // El original no se toca.
    expect(h.present).toBe("c");
  });

  it("canUndo/canRedo reflejan past/future (R7, R8)", () => {
    const h0 = createHistory("a");
    expect(canUndo(h0)).toBe(false);
    expect(canRedo(h0)).toBe(false);
    const h1 = set(h0, "b");
    expect(canUndo(h1)).toBe(true);
    expect(canRedo(h1)).toBe(false);
    const u = undo(h1);
    expect(canUndo(u)).toBe(false);
    expect(canRedo(u)).toBe(true);
  });

  it("undo sin past y redo sin future son no-op (R9)", () => {
    const h = createHistory("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("set respeta el límite descartando la entrada más antigua (R10)", () => {
    let h = createHistory(0, 3);
    for (let i = 1; i <= 5; i++) {
      h = set(h, i);
    }
    // present = 5; past acotado a las 3 últimas de [0,1,2,3,4] → [2,3,4].
    expect(h.present).toBe(5);
    expect(h.past).toEqual([2, 3, 4]);
    expect(h.past.length).toBe(3);
  });

  it("pushCheckpoint inserta UNA entrada (el estado pre-gesto) y conserva present (R12)", () => {
    // Simula un gesto: replace lleva present a la geometría final; el checkpoint
    // es el estado previo al gesto.
    const h1 = set(createHistory("a"), "b");
    const during = replace(h1, "b-moved");
    const sealed = pushCheckpoint(during, "b");
    expect(sealed.present).toBe("b-moved");
    expect(sealed.past).toEqual(["a", "b"]);
    // Un solo undo vuelve al pre-gesto.
    expect(undo(sealed).present).toBe("b");
  });

  it("pushCheckpoint respeta el límite (R10)", () => {
    let h = createHistory(0, 2);
    h = set(h, 1);
    h = set(h, 2);
    const sealed = pushCheckpoint(h, 99);
    expect(sealed.past.length).toBe(2);
    expect(sealed.past).toEqual([1, 99]);
  });
});
