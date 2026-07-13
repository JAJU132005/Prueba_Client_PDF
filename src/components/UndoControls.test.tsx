import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_UNDO_HINT, UndoControls } from "@/components/UndoControls";

describe("UndoControls (R22–R26)", () => {
  it("renderiza los botones Deshacer/Rehacer y el hint de Ctrl+Z (R22, R24, R26)", () => {
    render(
      <UndoControls
        canUndo
        canRedo
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_UNDO_HINT)).toBeInTheDocument();
  });

  it("clic en Deshacer invoca onUndo (R22)", () => {
    const onUndo = vi.fn();
    render(
      <UndoControls canUndo canRedo={false} onUndo={onUndo} onRedo={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("clic en Rehacer invoca onRedo (R24)", () => {
    const onRedo = vi.fn();
    render(
      <UndoControls canUndo={false} canRedo onUndo={() => {}} onRedo={onRedo} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("Deshacer se deshabilita cuando canUndo es falso (R23)", () => {
    render(
      <UndoControls
        canUndo={false}
        canRedo
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeEnabled();
  });

  it("Rehacer se deshabilita cuando canRedo es falso (R25)", () => {
    render(
      <UndoControls
        canUndo
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();
  });
});
