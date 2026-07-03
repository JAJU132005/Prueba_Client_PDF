import { describe, expect, it, vi } from "vitest";

import protectPdfSource from "@/pdf/protectPdf.ts?raw";
import {
  PROTECT_MODES,
  protectPdf,
  type PdfCryptoEngine,
  type ProtectMode,
} from "@/pdf/protectPdf";
import { IncorrectPasswordError } from "@/pdf/types";

/** Motor falso determinista que cuenta llamadas y devuelve bytes fijos. */
function spyEngine(result = new Uint8Array([1, 2, 3, 4])) {
  const encrypt = vi.fn(async (_input: Uint8Array, _password: string) => result);
  const decrypt = vi.fn(async (_input: Uint8Array, _password: string) => result);
  const engine: PdfCryptoEngine = { encrypt, decrypt };
  return { engine, encrypt, decrypt, result };
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe("protectPdf — modelo de modos (R1)", () => {
  it("expone exactamente protect y unlock en orden (R1)", () => {
    expect([...PROTECT_MODES]).toEqual(["protect", "unlock"]);
  });
});

describe("protectPdf — validación previa al motor (R2, R3)", () => {
  it("contraseña vacía → ProtectFailedError sin invocar el motor (R2)", async () => {
    const { engine, encrypt, decrypt } = spyEngine();
    await expect(
      protectPdf(PDF, { mode: "protect", password: "" }, engine),
    ).rejects.toMatchObject({ name: "ProtectFailedError" });
    expect(encrypt).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("modo inválido → ProtectFailedError sin invocar el motor (R3)", async () => {
    const { engine, encrypt, decrypt } = spyEngine();
    await expect(
      protectPdf(
        PDF,
        { mode: "nope" as ProtectMode, password: "x" },
        engine,
      ),
    ).rejects.toMatchObject({ name: "ProtectFailedError" });
    expect(encrypt).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
  });
});

describe("protectPdf — despacho según modo (R4, R4b, R5, R5b)", () => {
  it("mode protect invoca solo encrypt(input, password) una vez (R4, R4b)", async () => {
    const { engine, encrypt, decrypt } = spyEngine();
    await protectPdf(PDF, { mode: "protect", password: "secreta" }, engine);
    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenCalledWith(PDF, "secreta");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("mode unlock invoca solo decrypt(input, password) una vez (R5, R5b)", async () => {
    const { engine, encrypt, decrypt } = spyEngine();
    await protectPdf(PDF, { mode: "unlock", password: "secreta" }, engine);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(decrypt).toHaveBeenCalledWith(PDF, "secreta");
    expect(encrypt).not.toHaveBeenCalled();
  });
});

describe("protectPdf — resultado y errores (R6, R7)", () => {
  it("devuelve exactamente los bytes del motor sin alterarlos (R6)", async () => {
    const expected = new Uint8Array([9, 8, 7]);
    const { engine } = spyEngine(expected);
    const out = await protectPdf(
      PDF,
      { mode: "protect", password: "x" },
      engine,
    );
    expect(out).toBe(expected);
  });

  it("propaga IncorrectPasswordError del motor conservando name (R7)", async () => {
    const engine: PdfCryptoEngine = {
      async encrypt() {
        return new Uint8Array();
      },
      async decrypt() {
        throw new IncorrectPasswordError();
      },
    };
    await expect(
      protectPdf(PDF, { mode: "unlock", password: "mala" }, engine),
    ).rejects.toMatchObject({ name: "IncorrectPasswordError" });
  });
});

describe("protectPdf — progreso (R8, R9)", () => {
  for (const mode of ["protect", "unlock"] as const) {
    it(`emite progreso en [0,1] terminando en 1 (${mode}) (R8, R9)`, async () => {
      const { engine } = spyEngine();
      const progress: number[] = [];
      await protectPdf(
        PDF,
        { mode, password: "x" },
        engine,
        (p) => progress.push(p),
      );
      expect(progress.length).toBeGreaterThan(0);
      for (const p of progress) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(progress[progress.length - 1]).toBe(1);
    });
  }
});

describe("protectPdf — pureza (R10)", () => {
  it("se ejecuta en jsdom con un motor falso sin tocar @cantoo/pdf-lib (R10)", async () => {
    const { engine } = spyEngine();
    const out = await protectPdf(
      PDF,
      { mode: "protect", password: "x" },
      engine,
    );
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it("el módulo no importa @cantoo/pdf-lib ni React (R10)", () => {
    expect(protectPdfSource).not.toMatch(/from ["']@cantoo\/pdf-lib["']/);
    expect(protectPdfSource).not.toMatch(/from ["']pdf-lib["']/);
    expect(protectPdfSource).not.toMatch(/from ["']react["']/);
  });
});
