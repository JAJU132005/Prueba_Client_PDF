import { describe, expect, it } from "vitest";

import { IMAGE_EXTENSIONS, isImageFile } from "@/lib/imageFileTypes";

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array([1])], name, { type });
}

describe("isImageFile", () => {
  it("reconoce PNG y JPG por MIME 'image/*' (R12, R22)", () => {
    expect(isImageFile(makeFile("foto", "image/png"))).toBe(true);
    expect(isImageFile(makeFile("foto", "image/jpeg"))).toBe(true);
    expect(isImageFile(makeFile("anim", "image/gif"))).toBe(true);
  });

  it("reconoce PNG y JPG por extensión aunque el MIME esté vacío (R12, R22)", () => {
    expect(isImageFile(makeFile("foto.png", ""))).toBe(true);
    expect(isImageFile(makeFile("foto.JPG", ""))).toBe(true);
    expect(isImageFile(makeFile("foto.jpeg", ""))).toBe(true);
  });

  it("rechaza PDF y tipos no-imagen (R12, R22)", () => {
    expect(isImageFile(makeFile("doc.pdf", "application/pdf"))).toBe(false);
    expect(isImageFile(makeFile("notas.txt", "text/plain"))).toBe(false);
    expect(isImageFile(makeFile("hoja.xlsx", ""))).toBe(false);
  });

  it("todas las extensiones canónicas empiezan por punto y en minúscula", () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(ext).toBe(ext.toLowerCase());
      expect(ext.startsWith(".")).toBe(true);
    }
  });
});
