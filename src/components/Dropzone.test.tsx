import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Dropzone } from "@/components/Dropzone";
import type { FileValidationConfig } from "@/lib/fileValidation";
import type { PageCounter } from "@/pdf/pageCount";
import type { PageRasterizer, PageRasterizerFactory } from "@/pdf/rasterize";

const validation: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: 1024,
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

/**
 * Contador de páginas falso (sin pdf.js): por defecto resuelve 3 páginas.
 * Registra los signals recibidos para verificar la cancelación.
 */
function makeCounter(
  impl?: PageCounter,
): PageCounter & { signals: AbortSignal[]; calls: number } {
  const signals: AbortSignal[] = [];
  const counter = (async (input, signal) => {
    counter.calls += 1;
    if (signal) {
      signals.push(signal);
    }
    return impl ? impl(input, signal) : 3;
  }) as PageCounter & { signals: AbortSignal[]; calls: number };
  counter.signals = signals;
  counter.calls = 0;
  return counter;
}

/** Factoría de rasterizador falsa (sin pdf.js/canvas) para el visor. */
function makeRasterizerFactory(pageCount = 2): PageRasterizerFactory {
  const rasterizer: PageRasterizer = {
    pageCount: () => pageCount,
    renderPage: () =>
      Promise.resolve(
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      ),
    destroy: () => {},
  };
  return async () => rasterizer;
}

/** Wrapper controlado que mantiene la lista, como haría una herramienta real. */
function ControlledDropzone({
  initial = [],
  countPages,
  createRasterizer,
}: {
  initial?: File[];
  countPages?: PageCounter;
  createRasterizer?: PageRasterizerFactory;
}): JSX.Element {
  const [files, setFiles] = useState<File[]>(initial);
  return (
    <Dropzone
      files={files}
      onFilesChange={setFiles}
      validation={validation}
      countPages={countPages}
      createRasterizer={createRasterizer}
    />
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
  beforeEach(() => {
    URL.createObjectURL = vi.fn(
      () => "blob:mock",
    ) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

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

  it("muestra 'contando…' y luego 'N páginas' al añadir un PDF (R1, R4a, R2)", async () => {
    let resolveCount: ((n: number) => void) | undefined;
    const counter = makeCounter(
      () => new Promise<number>((resolve) => (resolveCount = resolve)),
    );
    const { container } = render(<ControlledDropzone countPages={counter} />);
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("doc.pdf", "application/pdf", 200)] },
    });

    expect(await screen.findByText("contando…")).toBeInTheDocument();
    // El counter se invoca tras `file.arrayBuffer()`, después de pintar
    // "contando…"; esperamos a que reciba el signal antes de resolverlo.
    await waitFor(() => expect(counter.signals).toHaveLength(1));
    resolveCount?.(5);
    expect(await screen.findByText("5 páginas")).toBeInTheDocument();
    expect(screen.queryByText("contando…")).not.toBeInTheDocument();
  });

  it("un PDF de 1 página muestra '1 página' (singular) (R3)", async () => {
    const counter = makeCounter(async () => 1);
    const { container } = render(<ControlledDropzone countPages={counter} />);
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("uno.pdf", "application/pdf", 200)] },
    });
    expect(await screen.findByText("1 página")).toBeInTheDocument();
  });

  it("renderiza nombre y tamaño aunque el conteo siga en curso (R4b)", async () => {
    const counter = makeCounter(() => new Promise<number>(() => {}));
    const { container } = render(<ControlledDropzone countPages={counter} />);
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("doc.pdf", "application/pdf", 200)] },
    });
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    expect(await screen.findByText("contando…")).toBeInTheDocument();
  });

  it("un counter que lanza muestra 'páginas: —' con aviso sin romper la lista (R11, R12a, R12b)", async () => {
    const counter = makeCounter(async () => {
      throw new Error("PDF cifrado");
    });
    const { container } = render(<ControlledDropzone countPages={counter} />);
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("roto.pdf", "application/pdf", 200)] },
    });

    const badge = await screen.findByText("páginas: —");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      "aria-label",
      expect.stringContaining("No se pudo determinar"),
    );
    // La lista sigue intacta: el archivo y sus controles permanecen. (R12b)
    expect(screen.getByText("roto.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /quitar roto\.pdf/i }),
    ).toBeInTheDocument();
  });

  it("quitar un archivo mientras cuenta aborta su signal y descarta el resultado (R13, R14b)", async () => {
    let resolveCount: ((n: number) => void) | undefined;
    const counter = makeCounter(
      () => new Promise<number>((resolve) => (resolveCount = resolve)),
    );
    const { container } = render(<ControlledDropzone countPages={counter} />);
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("doc.pdf", "application/pdf", 200)] },
    });
    await screen.findByText("contando…");
    await waitFor(() => expect(counter.signals).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: /quitar doc\.pdf/i }));
    await waitFor(() => expect(counter.signals[0].aborted).toBe(true));

    // Aunque el conteo resuelva tarde, no reaparece ningún badge de páginas. (R14b)
    resolveCount?.(9);
    await Promise.resolve();
    expect(screen.queryByText("9 páginas")).not.toBeInTheDocument();
  });

  it("un archivo no-PDF no inicia conteo ni muestra elemento de páginas (R17)", () => {
    const counter = makeCounter();
    render(
      <ControlledDropzone
        initial={[makeFile("foto.png", "image/png", 100)]}
        countPages={counter}
      />,
    );
    expect(screen.getByText("foto.png")).toBeInTheDocument();
    expect(screen.queryByText("contando…")).not.toBeInTheDocument();
    expect(screen.queryByText("páginas: —")).not.toBeInTheDocument();
    expect(counter.calls).toBe(0);
  });

  it("al desmontar aborta los conteos en curso (R15)", async () => {
    const counter = makeCounter(() => new Promise<number>(() => {}));
    const { container, unmount } = render(
      <ControlledDropzone countPages={counter} />,
    );
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile("doc.pdf", "application/pdf", 200)] },
    });
    await waitFor(() => expect(counter.signals).toHaveLength(1));

    unmount();
    expect(counter.signals[0].aborted).toBe(true);
  });

  it("muestra un botón 'Vista previa' para un archivo PDF (R16)", () => {
    const counter = makeCounter(() => new Promise<number>(() => {}));
    render(
      <ControlledDropzone
        initial={[makeFile("doc.pdf", "application/pdf", 100)]}
        countPages={counter}
      />,
    );
    expect(
      screen.getByRole("button", { name: /vista previa de doc\.pdf/i }),
    ).toBeInTheDocument();
  });

  it("no muestra el botón 'Vista previa' para un archivo no-PDF (R17)", () => {
    const validationImg: FileValidationConfig = {
      allowedExtensions: [".png"],
      allowedMimeTypes: ["image/png"],
      maxBytes: 1024,
    };
    render(
      <Dropzone
        files={[makeFile("foto.png", "image/png", 100)]}
        onFilesChange={vi.fn()}
        validation={validationImg}
      />,
    );
    expect(screen.getByText("foto.png")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /vista previa/i }),
    ).not.toBeInTheDocument();
  });

  it("activar 'Vista previa' abre el visor con ese archivo (R18)", async () => {
    const counter = makeCounter(() => new Promise<number>(() => {}));
    render(
      <ControlledDropzone
        initial={[makeFile("informe.pdf", "application/pdf", 100)]}
        countPages={counter}
        createRasterizer={makeRasterizerFactory()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /vista previa de informe\.pdf/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", expect.stringContaining("informe.pdf"));
  });
});
