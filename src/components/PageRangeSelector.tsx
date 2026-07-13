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
          className="btn !px-4 !py-1 !text-base"
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => onChange(selectEven(value))}
          className="btn !px-4 !py-1 !text-base"
        >
          Pares
        </button>
        <button
          type="button"
          onClick={() => onChange(selectOdd(value))}
          className="btn !px-4 !py-1 !text-base"
        >
          Impares
        </button>
        <button
          type="button"
          onClick={() => onChange(invertSelection(value))}
          className="btn !px-4 !py-1 !text-base"
        >
          Invertir
        </button>
      </div>

      {/* Control de rango desde-hasta (R20) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="range-from"
            className="hand text-sm text-ink-soft"
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
            className="hand w-20 border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1 text-base text-ink outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="range-to"
            className="hand text-sm text-ink-soft"
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
            className="hand w-20 border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1 text-base text-ink outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleApplyRange}
          className="btn !px-4 !py-1 !text-base"
        >
          Aplicar rango
        </button>
      </div>

      {rangeError && (
        <div
          role="alert"
          className="hand rounded-scrap border-[2.5px] border-mk-red p-2 text-base text-mk-red"
        >
          {rangeError}
        </div>
      )}

      {/* Casillas/miniaturas clicables (R18, R19) */}
      <ul className="grid list-none grid-cols-3 gap-3.5 p-0 sm:grid-cols-4 md:grid-cols-6">
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
                className="pagecell w-full overflow-hidden bg-cover bg-center motion-reduce:transition-none"
                style={url ? { backgroundImage: `url(${url})` } : undefined}
              >
                <span
                  className={
                    url ? "rounded bg-surface/80 px-1.5 py-0.5" : undefined
                  }
                >
                  {i + 1}
                </span>
                {selected && (
                  <span className="check" aria-hidden="true">
                    ✓
                  </span>
                )}
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
            className="hand text-base text-ink"
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
              className="hand w-full max-w-xs border-0 border-b-[2.5px] border-dashed border-ink bg-paper px-2 py-1 text-base text-ink outline-none placeholder:text-ink-soft"
            />
            <button
              type="button"
              onClick={handleApplyAdvanced}
              className="btn !px-4 !py-1 !text-base"
            >
              Aplicar selección avanzada
            </button>
          </div>
          {advancedError && (
            <div
              role="alert"
              className="hand rounded-scrap border-[2.5px] border-mk-red p-2 text-base text-mk-red"
            >
              {advancedError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
