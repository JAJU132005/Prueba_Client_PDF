import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PandaArt, type PandaArtKind } from "@/components/PandaArt";

const ALL_KINDS: PandaArtKind[] = [
  "unir",
  "dividir",
  "rotar",
  "organizar",
  "pdf-a-imagenes",
  "imagenes-a-pdf",
  "numeros",
  "marca-de-agua",
  "comprimir",
  "proteger",
  "firmar",
  "rellenar",
  "redactar",
  "editar",
  "ocr",
  "pose-ligera",
  "pose-media",
  "pose-pesada",
  "portada",
  "nube",
  "comic1",
  "comic2",
  "comic3",
  "trituradora",
];

describe("PandaArt", () => {
  it("renderiza un SVG inline con contenido para cada uno de los 24 kinds (R10)", () => {
    for (const kind of ALL_KINDS) {
      const { container, unmount } = render(<PandaArt kind={kind} />);
      const svg = container.querySelector("svg");
      expect(svg, `kind ${kind} sin svg`).not.toBeNull();
      expect(svg?.getAttribute("viewBox"), `kind ${kind} sin viewBox`).toBeTruthy();
      expect(svg?.innerHTML.length, `kind ${kind} vacío`).toBeGreaterThan(50);
      unmount();
    }
  });

  it("usa los colores de los tokens para funcionar en claro y oscuro (R10)", () => {
    const { container } = render(<PandaArt kind="unir" />);
    const markup = container.querySelector("svg")?.innerHTML ?? "";
    expect(markup).toContain("var(--ink");
    // #41: hojas/papeles y ojos tokenizados (no #fff quemado) para la pizarra.
    expect(markup).toContain("var(--surface");
    expect(markup).toContain("var(--panda-eye");
  });

  it("con label expone role='img' y aria-label (R11)", () => {
    const { container } = render(
      <PandaArt kind="trituradora" label="Trituradora feliz" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Trituradora feliz");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
  });

  it("sin label marca la ilustración como decorativa con aria-hidden (R44)", () => {
    const { container } = render(<PandaArt kind="pose-ligera" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
  });
});
