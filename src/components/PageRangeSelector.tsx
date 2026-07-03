import { useState } from "react";

import {
  fromText,
  invertSelection,
  selectAll,
  selectEven,
  selectOdd,
  selectRange,
  togglePage,
  type PageSelectionState,
} from "@/pdf/pageSelection";
import { InvalidRangeError } from "@/pdf/types";

export interface PageRangeSelectorProps {
  /** Número de páginas del PDF. */
  pageCount: number;
  /** Estado de selección controlado por el padre. */
  value: PageSelectionState;
  /** Notifica el nuevo estado de selección. */
  onChange: (next: PageSelectionState) => void;
  /**
   * Miniaturas 0-indexadas provistas por la ruta (opcional). Si faltan, se
   * pintan casillas numeradas. El componente NO renderiza pdf.js: las miniaturas
   * las genera la ruta con el render async cancelable existente. (R24)
   */
  thumbnails?: Record<number, string>;
  /** Muestra el campo de texto avanzado opcional. */
  showAdvanced?: boolean;
}

/**
 * Selector de páginas visual y controlado. Toda la lógica de selección vive en
 * el módulo puro `@/pdf/pageSelection`; este componente solo orquesta clics,
 * atajos y el campo avanzado. Sin red, sin pdf.js. (R18–R24)
 */
export function PageRangeSelector({
  pageCount,
  value,
  onChange,
  thumbnails,
  showAdvanced = false,
}: PageRangeSelectorProps): JSX.Element {
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [advancedText, setAdvancedText] = useState("");
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const indices = Array.from({ length: Math.max(0, pageCount) }, (_, i) => i);

  function handleApplyRange(): void {
    setRangeError(null);
    try {
      const next = selectRange(value, Number(rangeFrom), Number(rangeTo));
      onChange(next);
    } catch (error) {
      if (error instanceof InvalidRangeError) {
        setRangeError(error.message);
        return;
      }
      throw error;
    }
  }

  function handleApplyAdvanced(): void {
    setAdvancedError(null);
    try {
      const next = fromText(advancedText, pageCount);
      onChange(next); // (R21)
    } catch (error) {
      if (error instanceof InvalidRangeError) {
        // Mensaje legible en un role="alert"; NO se invoca onChange. (R22a, R22b)
        setAdvancedError(error.message);
        return;
      }
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Atajos (R20) */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(selectAll(value))}
          className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => onChange(selectEven(value))}
          className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          Pares
        </button>
        <button
          type="button"
          onClick={() => onChange(selectOdd(value))}
          className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          Impares
        </button>
        <button
          type="button"
          onClick={() => onChange(invertSelection(value))}
          className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          Invertir
        </button>
      </div>

      {/* Control de rango desde-hasta (R20) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="range-from"
            className="text-xs font-medium text-text-muted"
          >
            Desde
          </label>
          <input
            id="range-from"
            type="number"
            min={1}
            max={pageCount}
            value={rangeFrom}
            onChange={(event) => setRangeFrom(event.target.value)}
            aria-label="Desde la página"
            className="w-20 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="range-to"
            className="text-xs font-medium text-text-muted"
          >
            Hasta
          </label>
          <input
            id="range-to"
            type="number"
            min={1}
            max={pageCount}
            value={rangeTo}
            onChange={(event) => setRangeTo(event.target.value)}
            aria-label="Hasta la página"
            className="w-20 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <button
          type="button"
          onClick={handleApplyRange}
          className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          Aplicar rango
        </button>
      </div>

      {rangeError && (
        <div
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/5 p-2 text-xs text-danger"
        >
          {rangeError}
        </div>
      )}

      {/* Casillas/miniaturas clicables (R18, R19) */}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {indices.map((i) => {
          const selected = value.selected.has(i);
          const url = thumbnails?.[i];
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onChange(togglePage(value, i))}
                aria-pressed={selected}
                aria-label={`Página ${String(i + 1)}`}
                data-testid={`select-page-${String(i)}`}
                className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-cover bg-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
                  selected
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:border-primary/50"
                }`}
                style={url ? { backgroundImage: `url(${url})` } : undefined}
              >
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs ${
                    url
                      ? "bg-surface/80 text-text"
                      : "text-text"
                  }`}
                >
                  {i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Campo de texto avanzado opcional (R21, R22a, R22b) */}
      {showAdvanced && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="advanced-range"
            className="text-sm font-medium text-text"
          >
            Rango avanzado (opcional)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="advanced-range"
              type="text"
              value={advancedText}
              onChange={(event) => setAdvancedText(event.target.value)}
              placeholder="1-3,5"
              aria-label="Especificación de rangos avanzada"
              className="w-full max-w-xs rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={handleApplyAdvanced}
              className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              Aplicar selección avanzada
            </button>
          </div>
          {advancedError && (
            <div
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/5 p-2 text-xs text-danger"
            >
              {advancedError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
