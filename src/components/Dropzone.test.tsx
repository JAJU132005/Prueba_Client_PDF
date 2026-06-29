import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dropzone } from "@/components/Dropzone";
import type { FileValidationConfig } from "@/lib/fileValidation";

const validation: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: 1024,
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

/** Wrapper controlado que mantiene la lista, como haría una herramienta real. */
function ControlledDropzone({
  initial = [],
}: {
  initial?: File[];
}): JSX.Element {
  const [files, setFiles] = useState<File[]>(initial);
  return (
    <Dropzone files={files} onFilesChange={setFiles} validation={validation} />
  );
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) {
    throw new Error("no se encontró el input de archivos");
  }
  return input as HTMLInputElement;
}

describe("Dropzone", () => {
  it("al seleccionar un archivo válido por el input notifica y muestra su nombre (R13)", () => {
    const { container } = render(<ControlledDropzone />);
    const input = fileInput(container);
    fireEvent.change(input, {
      target: { files: [makeFile("documento.pdf", "application/pdf", 200)] },
    });
    expect(screen.getByText("documento.pdf")).toBeInTheDocument();
  });

  it("al soltar (drop) archivos válidos notifica con los aceptados añadidos (R12)", () => {
    const onFilesChange = vi.fn();
    const existing = makeFile("previo.pdf", "application/pdf", 100);
    const { container } = render(
      <Dropzone
        files={[existing]}
        onFilesChange={onFilesChange}
        validation={validation}
      />,
    );
    const zone = container.querySelector(".border-dashed") as HTMLElement;
    const dropped = makeFile("nuevo.pdf", "application/pdf", 200);
    fireEvent.drop(zone, { dataTransfer: { files: [dropped] } });
    expect(onFilesChange).toHaveBeenCalledTimes(1);
    const arg = onFilesChange.mock.calls[0][0] as File[];
    expect(arg.map((f) => f.name)).toEqual(["previo.pdf", "nuevo.pdf"]);
  });

  it("no añade archivos rechazados y muestra un mensaje legible por cada uno (R18)", () => {
    const onFilesChange = vi.fn();
    const { container } = render(
      <Dropzone
        files={[]}
        onFilesChange={onFilesChange}
        validation={validation}
      />,
    );
    const input = fileInput(container);
    fireEvent.change(input, {
      target: {
        files: [
          makeFile("imagen.png", "image/png", 100),
          makeFile("grande.pdf", "application/pdf", 5000),
        ],
      },
    });
    expect(onFilesChange).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("imagen.png");
    expect(alert.textContent).toContain("grande.pdf");
  });

  it("formatea el tamaño de 0 bytes como '0 B' y uno grande con su unidad (R14, R15)", () => {
    render(
      <Dropzone
        files={[
          makeFile("vacio.pdf", "application/pdf", 0),
          makeFile("grande.pdf", "application/pdf", 2 * 1024 * 1024),
        ]}
        onFilesChange={vi.fn()}
        validation={validation}
      />,
    );
    expect(screen.getByText("0 B")).toBeInTheDocument();
    expect(screen.getByText("2 MB")).toBeInTheDocument();
  });

  it("el botón quitar notifica sin ese archivo y los botones mover reordenan (R16, R17)", () => {
    const onFilesChange = vi.fn();
    const files = [
      makeFile("a.pdf", "application/pdf", 100),
      makeFile("b.pdf", "application/pdf", 100),
    ];
    render(
      <Dropzone
        files={files}
        onFilesChange={onFilesChange}
        validation={validation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /quitar a\.pdf/i }));
    expect(
      (onFilesChange.mock.calls[0][0] as File[]).map((f) => f.name),
    ).toEqual(["b.pdf"]);

    fireEvent.click(
      screen.getByRole("button", { name: /mover b\.pdf hacia arriba/i }),
    );
    expect(
      (onFilesChange.mock.calls[1][0] as File[]).map((f) => f.name),
    ).toEqual(["b.pdf", "a.pdf"]);
  });

  it("expone aria-labels accionables y un control de selección alcanzable por teclado (R20a, R20b, R20c)", () => {
    render(
      <Dropzone
        files={[makeFile("doc.pdf", "application/pdf", 100)]}
        onFilesChange={vi.fn()}
        validation={validation}
      />,
    );
    expect(
      screen.getByRole("button", { name: /quitar doc\.pdf/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mover doc\.pdf hacia arriba/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mover doc\.pdf hacia abajo/i }),
    ).toBeInTheDocument();

    const selector = screen.getByRole("button", {
      name: /arrastra archivos o haz clic/i,
    });
    expect(selector).toBeInTheDocument();
    expect(selector.tagName).toBe("BUTTON");
    expect(selector).not.toHaveAttribute("tabindex", "-1");
  });
});
