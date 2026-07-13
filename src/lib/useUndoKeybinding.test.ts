import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUndoKeybinding } from "@/lib/useUndoKeybinding";

function Probe(props: {
  onUndo: () => void;
  onRedo: () => void;
  enabled?: boolean;
}): JSX.Element {
  useUndoKeybinding(props);
  return createElement("div", { "data-testid": "probe" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Dispara un keydown sobre `target` y devuelve el evento (para preventDefault). */
function pressZ(
  target: EventTarget,
  init: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean },
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("useUndoKeybinding (R18, R19, R20, R21)", () => {
  it("Ctrl+Z dispara onUndo y hace preventDefault (R18, R21)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(createElement(Probe, { onUndo, onRedo }));

    const event = pressZ(document.body, { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+Shift+Z dispara onRedo (R19)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(createElement(Probe, { onUndo, onRedo }));

    pressZ(document.body, { ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("con foco en un <input> NO dispara y NO hace preventDefault (R20, R21)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(createElement(Probe, { onUndo, onRedo }));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = pressZ(input, { ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    input.remove();
  });

  it("con foco en un <textarea> NO dispara (R20)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(createElement(Probe, { onUndo, onRedo }));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    pressZ(textarea, { ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();

    textarea.remove();
  });

  it("una tecla que no es el atajo no dispara ni hace preventDefault (R21)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(createElement(Probe, { onUndo, onRedo }));

    const event = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(onUndo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("enabled=false ignora el atajo", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(createElement(Probe, { onUndo, onRedo, enabled: false }));

    pressZ(document.body, { ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });
});
