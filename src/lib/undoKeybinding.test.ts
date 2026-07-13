import { describe, expect, it } from "vitest";

import {
  isTextEntryElement,
  matchUndoRedo,
  type KeyChord,
} from "@/lib/undoKeybinding";

function chord(partial: Partial<KeyChord>): KeyChord {
  return {
    key: "z",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe("matchUndoRedo (R15, R16, R17)", () => {
  it("Ctrl+Z devuelve 'undo' (R15)", () => {
    expect(matchUndoRedo(chord({ ctrlKey: true }))).toBe("undo");
  });

  it("Cmd+Z (metaKey) devuelve 'undo' (R15)", () => {
    expect(matchUndoRedo(chord({ metaKey: true }))).toBe("undo");
  });

  it("acepta la tecla en mayúscula 'Z' (R15)", () => {
    expect(matchUndoRedo(chord({ key: "Z", ctrlKey: true }))).toBe("undo");
  });

  it("Ctrl+Shift+Z devuelve 'redo' (R16)", () => {
    expect(matchUndoRedo(chord({ ctrlKey: true, shiftKey: true }))).toBe(
      "redo",
    );
  });

  it("Cmd+Shift+Z devuelve 'redo' (R16)", () => {
    expect(matchUndoRedo(chord({ metaKey: true, shiftKey: true }))).toBe(
      "redo",
    );
  });

  it("z sin modificador devuelve null (R17)", () => {
    expect(matchUndoRedo(chord({}))).toBeNull();
  });

  it("otra tecla con Ctrl devuelve null (R17)", () => {
    expect(matchUndoRedo(chord({ key: "y", ctrlKey: true }))).toBeNull();
  });
});

describe("isTextEntryElement (R14)", () => {
  it("es true para un <input>", () => {
    const el = document.createElement("input");
    expect(isTextEntryElement(el)).toBe(true);
  });

  it("es true para un <textarea>", () => {
    const el = document.createElement("textarea");
    expect(isTextEntryElement(el)).toBe(true);
  });

  it("es true para un elemento contenteditable", () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isTextEntryElement(el)).toBe(true);
  });

  it("es false para un <div> normal", () => {
    const el = document.createElement("div");
    expect(isTextEntryElement(el)).toBe(false);
  });

  it("es false para un <select> (usa undo nativo propio, no captura texto)", () => {
    const el = document.createElement("select");
    expect(isTextEntryElement(el)).toBe(false);
  });

  it("es false para null", () => {
    expect(isTextEntryElement(null)).toBe(false);
  });
});
