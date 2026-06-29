import { describe, expect, it } from "vitest";

import {
  ImagesToPdfFailedError,
  InvalidImageError,
  InvalidPageOrderError,
  InvalidPdfError,
  InvalidRangeError,
  InvalidRotationError,
  MergeFailedError,
  OrganizeFailedError,
  PageNumbersFailedError,
  PdfWorkerError,
  ProbeFailedError,
  RotateFailedError,
  SplitFailedError,
  WatermarkFailedError,
} from "@/pdf/types";

describe("PdfWorkerError / ProbeFailedError", () => {
  it("PdfWorkerError es instancia de Error con name estable (R9)", () => {
    const error = new PdfWorkerError("algo falló");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PdfWorkerError");
  });

  it("ProbeFailedError extiende PdfWorkerError y Error con name estable (R9)", () => {
    const error = new ProbeFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("ProbeFailedError");
  });
});

describe("InvalidPdfError / MergeFailedError", () => {
  it("InvalidPdfError extiende PdfWorkerError y Error con name estable (R9)", () => {
    const error = new InvalidPdfError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("InvalidPdfError");
  });

  it("MergeFailedError extiende PdfWorkerError y Error con name estable (R10)", () => {
    const error = new MergeFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("MergeFailedError");
  });
});

describe("InvalidRangeError / SplitFailedError", () => {
  it("InvalidRangeError extiende PdfWorkerError y Error con name estable (R12)", () => {
    const error = new InvalidRangeError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("InvalidRangeError");
  });

  it("SplitFailedError extiende PdfWorkerError y Error con name estable (R13)", () => {
    const error = new SplitFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("SplitFailedError");
  });
});

describe("InvalidRotationError / RotateFailedError", () => {
  it("InvalidRotationError extiende PdfWorkerError y Error con name estable (R9)", () => {
    const error = new InvalidRotationError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("InvalidRotationError");
  });

  it("RotateFailedError extiende PdfWorkerError y Error con name estable (R10)", () => {
    const error = new RotateFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("RotateFailedError");
  });
});

describe("OrganizeFailedError / InvalidPageOrderError", () => {
  it("OrganizeFailedError extiende PdfWorkerError y Error con name estable (R23)", () => {
    const error = new OrganizeFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("OrganizeFailedError");
  });

  it("InvalidPageOrderError extiende PdfWorkerError y Error con name estable (R24)", () => {
    const error = new InvalidPageOrderError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("InvalidPageOrderError");
  });
});

describe("InvalidImageError / ImagesToPdfFailedError", () => {
  it("InvalidImageError extiende PdfWorkerError y Error con name estable (R27, R28)", () => {
    const error = new InvalidImageError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("InvalidImageError");
  });

  it("ImagesToPdfFailedError extiende PdfWorkerError y Error con name estable (R29, R30)", () => {
    const error = new ImagesToPdfFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("ImagesToPdfFailedError");
  });
});

describe("PageNumbersFailedError", () => {
  it("PageNumbersFailedError extiende PdfWorkerError y Error con name estable (R26, R27)", () => {
    const error = new PageNumbersFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("PageNumbersFailedError");
  });
});

describe("WatermarkFailedError", () => {
  it("WatermarkFailedError extiende PdfWorkerError y Error con name estable (R36, R37)", () => {
    const error = new WatermarkFailedError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PdfWorkerError);
    expect(error.name).toBe("WatermarkFailedError");
  });
});
