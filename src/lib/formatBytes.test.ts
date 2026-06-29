import { describe, expect, it } from "vitest";

import { InvalidByteValueError } from "@/lib/errors";
import { formatBytes } from "@/lib/formatBytes";

describe("formatBytes", () => {
  it("devuelve '0 B' para 0 (R15)", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("mantiene bytes por debajo de 1024 (R16)", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("escala a KB para valores grandes (R16)", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("escala a MB y GB para valores muy grandes (R16)", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5 GB");
  });

  it("lanza InvalidByteValueError con un valor negativo (R17)", () => {
    expect(() => formatBytes(-1)).toThrow(InvalidByteValueError);
  });

  it("lanza InvalidByteValueError con NaN (R17)", () => {
    expect(() => formatBytes(Number.NaN)).toThrow(InvalidByteValueError);
  });

  it("lanza InvalidByteValueError con Infinity (R17)", () => {
    expect(() => formatBytes(Number.POSITIVE_INFINITY)).toThrow(
      InvalidByteValueError,
    );
  });
});
