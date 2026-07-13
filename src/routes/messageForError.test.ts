import { describe, expect, it } from "vitest";

import { messageForError } from "@/routes/Ocr";
import { InvalidPdfError, OcrFailedError } from "@/pdf/types";

/**
 * El mapeo error→mensaje de la UI de OCR: un `OcrFailedError` (name estable que
 * cruza el límite del worker) produce el mensaje ESPECÍFICO, no el genérico.
 * (#34 R6)
 */
describe("messageForError — mensaje específico de OCR (#34 R6)", () => {
  const GENERIC = "Ocurrió un error inesperado al reconocer el texto.";

  it("OcrFailedError → mensaje específico, no el genérico", () => {
    expect(messageForError(new OcrFailedError())).toBe(
      "No se pudo reconocer el texto del PDF.",
    );
    expect(messageForError(new OcrFailedError())).not.toBe(GENERIC);
  });

  it("Error genérico → mensaje genérico", () => {
    expect(messageForError(new Error("x"))).toBe(GENERIC);
  });

  it("InvalidPdfError → su mensaje específico", () => {
    expect(messageForError(new InvalidPdfError())).toBe(
      "El archivo no es un PDF válido.",
    );
  });
});
