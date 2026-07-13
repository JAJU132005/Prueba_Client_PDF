import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImagePreviewModal } from "@/components/ImagePreviewModal";

function makeImageFile(name = "foto.png"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: "image/png" });
}

const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  let counter = 0;
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:img-${counter++}`;
    created.push(url);
    return url;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  }) as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Monta el visor; al pulsar cerrar se desmonta (como haría el `Dropzone`). */
function Harness({ file }: { file: File }): JSX.Element | null {
  const [open, setOpen] = useState(true);
  if (!open) {
    return null;
  }
  return <ImagePreviewModal file={file} onClose={() => setOpen(false)} />;
}

describe("ImagePreviewModal", () => {
  it("al montar crea una object URL y la usa como src del <img> (R8)", () => {
    render(<ImagePreviewModal file={makeImageFile()} onClose={vi.fn()} />);
    expect(created).toHaveLength(1);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", created[0]);
  });

  it("monta dentro del chrome de PreviewModal (role dialog + cierre) (R11)", () => {
    render(<ImagePreviewModal file={makeImageFile("mapa.jpg")} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute(
      "aria-label",
      expect.stringContaining("mapa.jpg"),
    );
    expect(
      screen.getByRole("button", { name: /cerrar vista previa/i }),
    ).toBeInTheDocument();
  });

  it("al desmontar revoca la object URL creada (R9)", () => {
    render(<Harness file={makeImageFile()} />);
    expect(created).toHaveLength(1);
    expect(revoked).not.toContain(created[0]);

    fireEvent.click(
      screen.getByRole("button", { name: /cerrar vista previa/i }),
    );

    expect(revoked).toContain(created[0]);
  });
});
