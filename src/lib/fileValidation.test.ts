import { describe, expect, it } from "vitest";

import {
  validateFile,
  validateFiles,
  type FileValidationConfig,
} from "@/lib/fileValidation";

const config: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: 1024,
};

function makeFile(
  name: string,
  type: string,
  sizeBytes: number,
): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe("validateFile", () => {
  it("acepta un archivo con extensión, MIME y tamaño válidos (R3)", () => {
    const result = validateFile(
      makeFile("documento.pdf", "application/pdf", 512),
      config,
    );
    expect(result.status).toBe("accepted");
  });

  it("acepta un archivo con MIME vacío apoyándose en la extensión (R3)", () => {
    const result = validateFile(makeFile("documento.pdf", "", 512), config);
    expect(result.status).toBe("accepted");
  });

  it("rechaza extensión/MIME no permitido con reason type-not-allowed y mensaje (R5, R6a, R6b)", () => {
    const result = validateFile(makeFile("imagen.png", "image/png", 100), config);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("type-not-allowed");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("rechaza tamaño excedido con reason size-exceeded y mensaje (R4, R6a, R6b)", () => {
    const result = validateFile(
      makeFile("documento.pdf", "application/pdf", 2048),
      config,
    );
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("size-exceeded");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("prioriza type-not-allowed cuando el tipo es inválido y además excede tamaño (R5)", () => {
    const result = validateFile(makeFile("imagen.png", "image/png", 9999), config);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("type-not-allowed");
    }
  });
});

describe("validateFiles", () => {
  it("parte una mezcla en aceptados y rechazados con los tamaños esperados (R7)", () => {
    const files = [
      makeFile("a.pdf", "application/pdf", 100),
      makeFile("b.png", "image/png", 100),
      makeFile("c.pdf", "application/pdf", 5000),
      makeFile("d.pdf", "application/pdf", 200),
    ];
    const { accepted, rejected } = validateFiles(files, config);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf", "d.pdf"]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "type-not-allowed",
      "size-exceeded",
    ]);
  });
});
