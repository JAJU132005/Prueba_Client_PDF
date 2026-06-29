/**
 * Error de dominio: se pasó un número de bytes inválido (negativo o no finito)
 * a una utilidad que esperaba un valor de tamaño válido.
 */
export class InvalidByteValueError extends Error {
  constructor(value: number) {
    super(`Valor de bytes inválido: ${String(value)}`);
    this.name = "InvalidByteValueError";
  }
}
