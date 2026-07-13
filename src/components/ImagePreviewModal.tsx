import { useEffect, useRef, useState } from "react";

import { PreviewModal } from "@/components/PreviewModal";

export interface ImagePreviewModalProps {
  /** Archivo de imagen a previsualizar. */
  file: File;
  /** Cierra el visor. */
  onClose: () => void;
}

/**
 * Visor ampliado de imagen construido sobre `PreviewModal` (chrome común). La
 * imagen se muestra desde una object URL creada localmente con
 * `URL.createObjectURL(file)` (sin red, R10) que se revoca al cambiar de
 * archivo, cerrar o desmontar (patrón por `ref`, idéntico a `PdfPreviewModal`/
 * `SignPdf.tsx`). (R8, R9, R11)
 */
export function ImagePreviewModal({
  file,
  onClose,
}: ImagePreviewModalProps): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  // Object URL vigente en un ref para revocarla al sustituirla o desmontar sin
  // depender del ciclo de render de React. (R9)
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    // Object URL local a partir de los bytes en memoria del `File`; sin red. (R8, R10)
    const objectUrl = URL.createObjectURL(file);
    urlRef.current = objectUrl;
    setUrl(objectUrl);
    return () => {
      // Al cerrar/desmontar/cambiar de archivo: revocar la object URL. (R9)
      URL.revokeObjectURL(objectUrl);
      if (urlRef.current === objectUrl) {
        urlRef.current = null;
      }
    };
  }, [file]);

  return (
    <PreviewModal label={file.name} onClose={onClose}>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded border-[2.5px] border-ink bg-surface p-2 shadow-doodle">
        {url ? (
          <img
            src={url}
            alt={`Vista previa de ${file.name}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="hand soft text-base" aria-live="polite">
            Cargando imagen…
          </span>
        )}
      </div>
    </PreviewModal>
  );
}
