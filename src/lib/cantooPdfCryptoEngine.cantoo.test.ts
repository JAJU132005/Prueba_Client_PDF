import { PDFDocument } from "@cantoo/pdf-lib";
import { PDFDocument as StdPDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { cantooPdfCryptoEngine } from "@/lib/cantooPdfCryptoEngine";
import { IncorrectPasswordError, InvalidPdfError } from "@/pdf/types";

/** Crea un PDF (no cifrado) de `n` páginas con `@cantoo/pdf-lib`. */
async function makePdf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([200, 200]);
  }
  return new Uint8Array(await doc.save());
}

const NOT_A_PDF = new Uint8Array([0x68, 0x69]);

describe("cantooPdfCryptoEngine — cifrado real (R11–R14)", () => {
  it("encrypt produce un PDF que pdf-lib estándar no abre sin contraseña (R11)", async () => {
    const pdf = await makePdf(1);
    const encrypted = await cantooPdfCryptoEngine.encrypt(pdf, "secreta");
    await expect(StdPDFDocument.load(encrypted)).rejects.toBeDefined();
  });

  it("cifrar+descifrar con la misma contraseña recupera el contenido (R12)", async () => {
    const pdf = await makePdf(2);
    const encrypted = await cantooPdfCryptoEngine.encrypt(pdf, "clave-123");
    const decrypted = await cantooPdfCryptoEngine.decrypt(encrypted, "clave-123");

    // El PDF descifrado se recarga sin contraseña y conserva 2 páginas.
    const reloaded = await StdPDFDocument.load(decrypted);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it("descifrar con contraseña incorrecta → IncorrectPasswordError (R13)", async () => {
    const pdf = await makePdf(1);
    const encrypted = await cantooPdfCryptoEngine.encrypt(pdf, "correcta");
    await expect(
      cantooPdfCryptoEngine.decrypt(encrypted, "incorrecta"),
    ).rejects.toMatchObject({ name: "IncorrectPasswordError" });
    await expect(
      cantooPdfCryptoEngine.decrypt(encrypted, "incorrecta"),
    ).rejects.toBeInstanceOf(IncorrectPasswordError);
  });

  it("encrypt con bytes no-PDF → InvalidPdfError (R14)", async () => {
    await expect(
      cantooPdfCryptoEngine.encrypt(NOT_A_PDF, "x"),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("decrypt con bytes no-PDF → InvalidPdfError (R14)", async () => {
    await expect(
      cantooPdfCryptoEngine.decrypt(NOT_A_PDF, "x"),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });
});
