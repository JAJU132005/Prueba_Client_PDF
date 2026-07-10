import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorBubble } from "@/components/ErrorBubble";

describe("ErrorBubble", () => {
  it("muestra el mensaje recibido de forma idéntica, sin transformarlo (R26)", () => {
    const message =
      "El PDF está protegido con contraseña y no se pudo procesar.";
    render(<ErrorBubble message={message} />);
    const alert = screen.getByRole("alert");
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(alert).toHaveTextContent(message);
  });

  it("es un contenedor de error accesible (role='alert') junto al panda (R26)", () => {
    const { container } = render(<ErrorBubble message="fallo X" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(container.querySelector("[data-panda-art]")).not.toBeNull();
  });
});
