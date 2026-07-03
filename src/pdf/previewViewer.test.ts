import { describe, expect, it } from "vitest";

import {
  MAX_SCALE,
  MIN_SCALE,
  SCALE_STEP,
  createViewerState,
  goToPage,
  nextPage,
  prevPage,
  zoomIn,
  zoomOut,
  type ViewerState,
} from "@/pdf/previewViewer";

describe("previewViewer", () => {
  describe("createViewerState", () => {
    it("arranca en la página 1, zoom 1 y conserva pageCount (R1)", () => {
      const state = createViewerState(7);
      expect(state).toEqual({ pageCount: 7, currentPage: 1, scale: 1 });
    });
  });

  describe("nextPage", () => {
    it("avanza una página (R2)", () => {
      const state = createViewerState(3);
      expect(nextPage(state).currentPage).toBe(2);
    });

    it("no pasa de la última página (clamp superior) (R2)", () => {
      const state: ViewerState = { pageCount: 3, currentPage: 3, scale: 1 };
      expect(nextPage(state).currentPage).toBe(3);
    });
  });

  describe("prevPage", () => {
    it("retrocede una página (R3)", () => {
      const state: ViewerState = { pageCount: 3, currentPage: 2, scale: 1 };
      expect(prevPage(state).currentPage).toBe(1);
    });

    it("no baja de la primera página (clamp inferior) (R3)", () => {
      const state = createViewerState(3);
      expect(prevPage(state).currentPage).toBe(1);
    });
  });

  describe("goToPage", () => {
    it("salta a la página indicada (R4)", () => {
      const state = createViewerState(5);
      expect(goToPage(state, 4).currentPage).toBe(4);
    });

    it("hace clamp por debajo a 1 (R4)", () => {
      const state = createViewerState(5);
      expect(goToPage(state, 0).currentPage).toBe(1);
      expect(goToPage(state, -3).currentPage).toBe(1);
    });

    it("hace clamp por encima a pageCount (R4)", () => {
      const state = createViewerState(5);
      expect(goToPage(state, 99).currentPage).toBe(5);
    });
  });

  describe("zoomIn", () => {
    it("aumenta el zoom un paso (R5)", () => {
      const state = createViewerState(1);
      expect(zoomIn(state).scale).toBe(1 + SCALE_STEP);
    });

    it("no pasa de MAX_SCALE (clamp superior) (R5)", () => {
      const state: ViewerState = {
        pageCount: 1,
        currentPage: 1,
        scale: MAX_SCALE,
      };
      expect(zoomIn(state).scale).toBe(MAX_SCALE);
    });
  });

  describe("zoomOut", () => {
    it("reduce el zoom un paso (R6)", () => {
      const state = createViewerState(1);
      expect(zoomOut(state).scale).toBe(1 - SCALE_STEP);
    });

    it("no baja de MIN_SCALE (clamp inferior) (R6)", () => {
      const state: ViewerState = {
        pageCount: 1,
        currentPage: 1,
        scale: MIN_SCALE,
      };
      expect(zoomOut(state).scale).toBe(MIN_SCALE);
    });
  });

  describe("inmutabilidad (R7)", () => {
    it("ninguna función muta el estado recibido", () => {
      const base: ViewerState = { pageCount: 4, currentPage: 2, scale: 1 };
      const snapshot = { ...base };

      nextPage(base);
      prevPage(base);
      goToPage(base, 3);
      zoomIn(base);
      zoomOut(base);

      expect(base).toEqual(snapshot);
    });

    it("devuelve un objeto nuevo (no la misma referencia)", () => {
      const base = createViewerState(4);
      expect(nextPage(base)).not.toBe(base);
      expect(prevPage(base)).not.toBe(base);
      expect(goToPage(base, 2)).not.toBe(base);
      expect(zoomIn(base)).not.toBe(base);
      expect(zoomOut(base)).not.toBe(base);
    });
  });
});
