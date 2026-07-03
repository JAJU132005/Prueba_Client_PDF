import { describe, expect, it } from "vitest";

import {
  OCR_LARGE_FILE_BYTES,
  OCR_LARGE_FILE_MOBILE_WARNING,
  shouldWarnLargeFileOnMobile,
} from "@/lib/ocrMemory";

describe("ocrMemory — shouldWarnLargeFileOnMobile (R38)", () => {
  it("móvil y archivo >= umbral → true (R38)", () => {
    expect(shouldWarnLargeFileOnMobile(true, OCR_LARGE_FILE_BYTES)).toBe(true);
    expect(shouldWarnLargeFileOnMobile(true, OCR_LARGE_FILE_BYTES + 1)).toBe(
      true,
    );
  });

  it("móvil pero archivo por debajo del umbral → false (R38)", () => {
    expect(shouldWarnLargeFileOnMobile(true, OCR_LARGE_FILE_BYTES - 1)).toBe(
      false,
    );
  });

  it("no móvil, aunque el archivo sea grande → false (R38)", () => {
    expect(shouldWarnLargeFileOnMobile(false, OCR_LARGE_FILE_BYTES)).toBe(false);
  });

  it("el texto del aviso no está vacío", () => {
    expect(OCR_LARGE_FILE_MOBILE_WARNING.trim().length).toBeGreaterThan(0);
  });
});
