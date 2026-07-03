import { describe, expect, it } from "vitest";

import {
  countPdfPages,
  formatPageCount,
  type PageCounter,
} from "@/pdf/pageCount";

const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

describe("formatPageCount", () => {
  it("pluraliza 1 como '1 página' (R3)", () => {
    expect(formatPageCount(1)).toBe("1 página");
  });

  it("pluraliza N>1 como 'N páginas' (R2)", () => {
    expect(formatPageCount(2)).toBe("2 páginas");
    expect(formatPageCount(10)).toBe("10 páginas");
  });

  it("usa el plural también para 0 páginas (R2)", () => {
    expect(formatPageCount(0)).toBe("0 páginas");
  });
});

describe("countPdfPages", () => {
  it("counter que resuelve N → 'counted' con N (R2)", async () => {
    const counter: PageCounter = async () => 7;
    const result = await countPdfPages(bytes, counter);
    expect(result).toEqual({ status: "counted", pages: 7 });
  });

  it("counter que resuelve 1 → 'counted' y formatea '1 página' (R3)", async () => {
    const counter: PageCounter = async () => 1;
    const result = await countPdfPages(bytes, counter);
    expect(result).toEqual({ status: "counted", pages: 1 });
    if (result.status === "counted") {
      expect(formatPageCount(result.pages)).toBe("1 página");
    }
  });

  it("counter que lanza → 'unavailable' sin propagar la excepción (R10)", async () => {
    const counter: PageCounter = async () => {
      throw new Error("PDF cifrado o corrupto");
    };
    const result = await countPdfPages(bytes, counter);
    expect(result).toEqual({ status: "unavailable" });
  });

  it("signal ya abortado + counter que resuelve → 'cancelled', no 'counted' (R14a)", async () => {
    const controller = new AbortController();
    controller.abort();
    const counter: PageCounter = async () => 5;
    const result = await countPdfPages(bytes, counter, controller.signal);
    expect(result).toEqual({ status: "cancelled" });
  });

  it("signal abortado durante el conteo + counter que lanza → 'cancelled' (R14a)", async () => {
    const controller = new AbortController();
    const counter: PageCounter = async () => {
      controller.abort();
      throw new Error("abortado");
    };
    const result = await countPdfPages(bytes, counter, controller.signal);
    expect(result).toEqual({ status: "cancelled" });
  });

  it("pasa el mismo signal al counter (R1)", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const counter: PageCounter = async (_input, signal) => {
      received = signal;
      return 3;
    };
    await countPdfPages(bytes, counter, controller.signal);
    expect(received).toBe(controller.signal);
  });
});
