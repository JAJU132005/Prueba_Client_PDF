export function Footer(): JSX.Element {
  return (
    <footer className="mt-10 border-t-[3px] border-dashed border-ink-soft">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-4 pb-28 pt-6 md:px-6">
        <span className="hand text-xl">
          Bytes enviados a internet: <b className="zero text-3xl">0</b>
        </span>
        <span className="mono soft text-xs">
          pdf-lib · pdf.js · qpdf-wasm · tesseract — todo corre en tu navegador
        </span>
        <span className="hand soft ml-auto text-lg">
          lo que pasa en tu diario, se queda en tu diario 🤝
        </span>
      </div>
    </footer>
  );
}
