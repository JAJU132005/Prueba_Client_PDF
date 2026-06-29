import { describe, expect, it } from "vitest";

import {
  renderThumbnails,
  type ThumbnailRenderer,
} from "@/pdf/thumbnails";

/** Renderer falso que resuelve `thumb-<i>` y registra los signals recibidos. */
class FakeRenderer implements ThumbnailRenderer {
  readonly signals: AbortSignal[] = [];
  destroyed = false;
  constructor(private readonly total: number) {}
  pageCount(): number {
    return this.total;
  }
  async renderPage(index: number, signal: AbortSignal): Promise<string> {
    this.signals.push(signal);
    return `thumb-${index}`;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

describe("renderThumbnails", () => {
  it("invoca onThumbnail con (0,…),(1,…),… en orden, una por página (R31, R32, R33)", async () => {
    const renderer = new FakeRenderer(3);
    const calls: Array<[number, string]> = [];
    const controller = new AbortController();
    await renderThumbnails(
      renderer,
      (i, url) => calls.push([i, url]),
      controller.signal,
    );
    expect(calls).toEqual([
      [0, "thumb-0"],
      [1, "thumb-1"],
      [2, "thumb-2"],
    ]);
  });

  it("espera cada renderPage antes de iniciar la siguiente (await secuencial, R32)", async () => {
    const events: string[] = [];
    const pending: { resolve?: () => void } = {};
    const renderer: ThumbnailRenderer = {
      pageCount: () => 2,
      renderPage(index: number): Promise<string> {
        events.push(`start-${index}`);
        return new Promise<string>((resolve) => {
          pending.resolve = () => {
            events.push(`end-${index}`);
            resolve(`thumb-${index}`);
          };
        });
      },
      destroy: () => undefined,
    };
    const controller = new AbortController();
    const promise = renderThumbnails(
      renderer,
      () => undefined,
      controller.signal,
    );

    // Solo la página 0 ha comenzado; la 1 no debe empezar hasta resolver la 0.
    await Promise.resolve();
    expect(events).toEqual(["start-0"]);

    // Resolver la página 0 permite iniciar la 1.
    pending.resolve?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toContain("end-0");
    expect(events).toContain("start-1");
    expect(events.indexOf("end-0")).toBeLessThan(events.indexOf("start-1"));

    pending.resolve?.();
    await promise;
  });

  it("con signal ya abortado no invoca onThumbnail (R34)", async () => {
    const renderer = new FakeRenderer(3);
    const calls: number[] = [];
    const controller = new AbortController();
    controller.abort();
    await renderThumbnails(
      renderer,
      (i) => calls.push(i),
      controller.signal,
    );
    expect(calls).toEqual([]);
  });

  it("abortar tras la primera página detiene el recorrido (R34)", async () => {
    const calls: number[] = [];
    const controller = new AbortController();
    const renderer: ThumbnailRenderer = {
      pageCount: () => 3,
      async renderPage(index: number): Promise<string> {
        if (index === 0) {
          controller.abort();
        }
        return `thumb-${index}`;
      },
      destroy: () => undefined,
    };
    await renderThumbnails(
      renderer,
      (i) => calls.push(i),
      controller.signal,
    );
    expect(calls).toEqual([]);
  });

  it("pasa el mismo signal a cada renderPage (R35)", async () => {
    const renderer = new FakeRenderer(3);
    const controller = new AbortController();
    await renderThumbnails(
      renderer,
      () => undefined,
      controller.signal,
    );
    expect(renderer.signals).toHaveLength(3);
    for (const s of renderer.signals) {
      expect(s).toBe(controller.signal);
    }
  });
});
