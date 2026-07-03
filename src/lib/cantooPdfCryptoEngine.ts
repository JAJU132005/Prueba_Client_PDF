import { PDFDocument } from "@cantoo/pdf-lib";

import type { PdfCryptoEngine } from "@/pdf/protectPdf";
import { IncorrectPasswordError, InvalidPdfError } from "@/pdf/types";

/**
 * ¿El mensaje de error de `@cantoo/pdf-lib` indica contraseña incorrecta?
 * El fork lanza `Error('Password incorrect')` / `Error('NEEDS PASSWORD')` cuando
 * la clave aportada no descifra el documento. (R13)
 */
function isIncorrectPasswordError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("password incorrect") ||
    message.includes("incorrect password") ||
    message.includes("needs password") ||
    message.includes("invalid password")
  );
}

/**
 * Motor de cifrado/descifrado real con `@cantoo/pdf-lib`. Único módulo del repo
 * que importa el fork. Solo intercambia bytes↔bytes; ningún `PDFDocument` del
 * fork cruza esta frontera. Traduce siempre los fallos a errores de dominio
 * nombrados (nunca deja escapar un error crudo del fork). (R11–R14)
 */
export const cantooPdfCryptoEngine: PdfCryptoEngine = {
  async encrypt(input, password) {
    let doc: PDFDocument;
    try {
      // Carga el PDF (no cifrado). Si los bytes no son un PDF → InvalidPdfError.
      doc = await PDFDocument.load(input); // (R14)
    } catch {
      throw new InvalidPdfError();
    }
    // Aplica cifrado: la apertura del resultado exige la contraseña. (R11)
    doc.encrypt({ userPassword: password, ownerPassword: password });
    return new Uint8Array(await doc.save()); // (R11, R12)
  },

  async decrypt(input, password) {
    let doc: PDFDocument;
    try {
      // Carga aportando la contraseña: con la correcta, descifra. (R12)
      doc = await PDFDocument.load(input, { password });
    } catch (error) {
      // Contraseña incorrecta → IncorrectPasswordError. (R13)
      if (isIncorrectPasswordError(error)) {
        throw new IncorrectPasswordError();
      }
      // Bytes no-PDF (o ilegibles) → InvalidPdfError. (R14)
      throw new InvalidPdfError();
    }
    // PDF descifrado y reserializado sin protección. (R12)
    return new Uint8Array(await doc.save());
  },
};
