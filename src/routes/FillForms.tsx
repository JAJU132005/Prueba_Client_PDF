import { useEffect, useMemo, useRef, useState } from "react";

import { AnnotationEditor } from "@/components/AnnotationEditor";
import { DownloadCta } from "@/components/DownloadCta";
import { Dropzone } from "@/components/Dropzone";
import { ErrorBubble } from "@/components/ErrorBubble";
import { FormFieldOverlay } from "@/components/FormFieldOverlay";
import { ProgressBar } from "@/components/ProgressBar";
import { ToolPageHeader } from "@/components/ToolPageHeader";
import { LivePreview } from "@/components/LivePreview";
import { UndoControls } from "@/components/UndoControls";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import { useUndoableState } from "@/lib/useUndoableState";
import { useUndoKeybinding } from "@/lib/useUndoKeybinding";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import { pdfjsPageCount } from "@/lib/pdfjsPageCounter";
import type { ResourceCost } from "@/lib/resourceCost";
import type { Annotation } from "@/pdf/annotate";
import {
  DEFAULT_TOOL_SETTINGS,
  type ToolSettings,
} from "@/pdf/annotationInteraction";
import {
  addAnnotation,
  createAnnotationState,
  removeAnnotation,
  selectAnnotation,
  updateAnnotation,
  type AnnotationEditorState,
  type AnnotationTool,
} from "@/pdf/annotationModel";
import type {
  FieldFill,
  FormFieldInfo,
  FormModel,
} from "@/pdf/fillForms";
import { pageIndexForField } from "@/pdf/formOverlay";
import { countPdfPages, type PageCounter } from "@/pdf/pageCount";
import type { PageRasterizerFactory } from "@/pdf/rasterize";
import {
  createPdfClient,
  isPdfWorkerError,
  type PdfClient,
} from "@/workers/pdfClient";

type Status = "idle" | "detecting" | "ready" | "processing" | "done" | "error";

/** Validación del Dropzone: un único PDF. */
export const PDF_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".pdf"],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Validación del Dropzone de imagen de anotación (modo sin campos): JPG/PNG. */
export const IMAGE_VALIDATION: FileValidationConfig = {
  allowedExtensions: [".jpg", ".jpeg", ".png"],
  allowedMimeTypes: ["image/jpeg", "image/png"],
  maxBytes: DEFAULT_MAX_FILE_BYTES,
};

/** Aviso visible cuando el PDF no tiene campos de formulario. (R18) */
export const NO_FIELDS_NOTICE =
  "Este PDF no contiene campos de formulario rellenables.";

/** Valor editable de un campo en la UI (texto/opción como string, casilla como boolean). */
type FieldValue = string | boolean;

/** Mapea el `name` estable del error de dominio a un mensaje legible. */
function messageForError(error: unknown): string {
  if (isPdfWorkerError(error)) {
    switch (error.name) {
      case "InvalidPdfError":
        return "El archivo no es un PDF válido.";
      case "FillFormFailedError":
        return "No se pudo rellenar el formulario. Revisa los valores elegidos.";
      case "AnnotateFailedError":
        return "No se pudo añadir el texto encima del PDF.";
      case "InvalidImageError":
        return "La imagen añadida no es un JPG o PNG válido.";
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al procesar el formulario.";
}

/** Estado inicial de cada campo, derivado del modelo detectado. */
function initialValues(model: FormModel): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of model.fields) {
    if (field.type === "checkbox") {
      values[field.name] = field.checked ?? false;
    } else if (field.type === "radio" || field.type === "dropdown") {
      values[field.name] = field.selected ?? "";
    } else {
      values[field.name] = field.value;
    }
  }
  return values;
}

/** Deriva los rellenos serializables a partir del estado editable de la UI. */
function buildFills(
  fields: readonly FormFieldInfo[],
  values: Record<string, FieldValue>,
): FieldFill[] {
  const fills: FieldFill[] = [];
  for (const field of fields) {
    const value = values[field.name];
    switch (field.type) {
      case "text":
        fills.push({
          name: field.name,
          kind: "text",
          value: typeof value === "string" ? value : "",
        });
        break;
      case "checkbox":
        fills.push({
          name: field.name,
          kind: "checkbox",
          checked: value === true,
        });
        break;
      case "radio":
        if (typeof value === "string" && value !== "") {
          fills.push({ name: field.name, kind: "radio", option: value });
        }
        break;
      case "dropdown":
        if (typeof value === "string" && value !== "") {
          fills.push({ name: field.name, kind: "dropdown", option: value });
        }
        break;
    }
  }
  return fills;
}

export interface FillFormsProps {
  /** Cliente inyectable (tests). Por defecto se crea uno con worker real. */
  client?: PdfClient;
  /** Factoría de rasterizador para LivePreview / editor (tests). */
  createRasterizer?: PageRasterizerFactory;
  /** Contador de páginas inyectable (modo sin campos, tests). Por defecto `pdfjsPageCount`. */
  countPages?: PageCounter;
  /** Generador de ids de anotación inyectable (tests deterministas). */
  createId?: () => string;
}

/**
 * Herramienta "Rellenar formularios PDF" (#25 + overlay visual #31). Dropzone
 * (1 PDF) → `detectForm` en el worker.
 *
 * - **Con campos:** editor por campo + toggle de aplanado + overlay visual de
 *   los widgets sobre la vista previa (`LivePreview` + `FormFieldOverlay`). Clic
 *   en un marcador enfoca su editor; enfocar un editor destaca su marcador y, si
 *   el widget está en otra página, la vista previa salta a ella. "Rellenar y
 *   descargar" → `fillForms` en el worker → descarga local del Blob. (R8–R13,
 *   R19, R20, R22, R23)
 * - **Sin campos:** aviso + editor de anotaciones inline (#29) DENTRO de la
 *   misma ruta → "Añadir texto encima y descargar" incrusta las anotaciones con
 *   `pdfClient.annotate` (aplanado en el worker) → descarga local. (R14–R18, R22,
 *   R23)
 *
 * Cero red; la UI no contiene lógica de PDF.
 */
export function FillForms({
  client,
  createRasterizer,
  countPages,
  createId,
}: FillFormsProps = {}): JSX.Element {
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);
  const counter = countPages ?? pdfjsPageCount;

  const [files, setFiles] = useState<File[]>([]);
  const [model, setModel] = useState<FormModel | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [flatten, setFlatten] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Resultado listo para la descarga click-driven (#39 R11, R16): Blob local +
  // nombre de salida + nivel de coste del camino que lo generó.
  const [result, setResult] = useState<{
    blob: Blob;
    name: string;
    cost: ResourceCost;
  } | null>(null);

  // Estado del overlay visual de campos (#31).
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Estado del editor de anotaciones inline (modo sin campos, #31 reusa #29).
  // Versionado con historial de deshacer (#37 R28); la capa de anotación es la
  // que soporta undo/redo. Los campos AcroForm usan el undo NATIVO del input
  // (R20), no este historial.
  const editorHistory = useUndoableState<AnnotationEditorState>(
    createAnnotationState(),
  );
  const editorState = editorHistory.present;
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageData, setImageData] = useState<Uint8Array | null>(null);

  const detectSeq = useRef(0);
  /** Registro de los controles de cada campo, para enfocarlos desde el overlay. */
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  // Bandera de gesto activo (mover/redimensionar) del editor de anotaciones. (#37 R32)
  const gestureActiveRef = useRef(false);

  useEffect(() => {
    return () => {
      detectSeq.current += 1;
    };
  }, []);

  // Atajo Ctrl+Z / Ctrl+Shift+Z sobre la capa de anotación del modo sin campos;
  // se ignora con foco en los inputs de los campos (undo nativo). (#37 R28, R31)
  useUndoKeybinding({
    onUndo: editorHistory.undo,
    onRedo: editorHistory.redo,
    enabled: model !== null && !model.hasFields && pageCount > 0,
  });

  // Carga los bytes de la imagen de anotación cuando cambia el archivo elegido.
  useEffect(() => {
    if (imageFiles.length === 0) {
      setImageData(null);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      const bytes = new Uint8Array(await imageFiles[0].arrayBuffer());
      if (!cancelled) {
        setImageData(bytes);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageFiles]);

  const annotations = editorState.annotations;

  async function detect(file: File): Promise<void> {
    const seq = ++detectSeq.current;
    setStatus("detecting");
    setErrorMessage(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = await pdfClient.detectForm(bytes);
      if (seq !== detectSeq.current) {
        return;
      }
      setModel(detected);
      setValues(initialValues(detected));
      setStatus("ready");
      // El editor de anotaciones inline (sin campos) necesita el nº de páginas.
      if (!detected.hasFields) {
        const result = await countPdfPages(bytes, counter);
        if (seq !== detectSeq.current) {
          return;
        }
        if (result.status === "counted") {
          setPageCount(result.pages);
        }
      }
    } catch (error) {
      if (seq !== detectSeq.current) {
        return;
      }
      setModel(null);
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  function handleFilesChange(next: File[]): void {
    detectSeq.current += 1;
    setFiles(next);
    setModel(null);
    setValues({});
    setFlatten(false);
    setProgress(0);
    setErrorMessage(null);
    setStatus("idle");
    setPreviewPageIndex(0);
    setPageCount(0);
    setFocusedField(null);
    setResult(null);
    editorHistory.reset(createAnnotationState()); // (#37 R33)
    gestureActiveRef.current = false;
    setActiveTool(null);
    setImageFiles([]);
    setImageData(null);
    fieldRefs.current = {};
    if (next.length > 0) {
      void detect(next[0]);
    }
  }

  function setFieldValue(name: string, value: FieldValue): void {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  /** Enfoca un campo: lo destaca y salta a la página de su widget si procede. (R12, R13) */
  function handleFieldFocus(name: string): void {
    setFocusedField(name);
    const field = model?.fields.find((f) => f.name === name);
    if (field) {
      setPreviewPageIndex((current) => pageIndexForField(field, current)); // (R13)
    }
  }

  /** Clic en un marcador: enfoca el editor del campo (que a su vez lo destaca). (R11) */
  function handleMarkerActivate(name: string): void {
    handleFieldFocus(name);
    fieldRefs.current[name]?.focus(); // (R11)
  }

  async function handleSubmit(): Promise<void> {
    if (files.length === 0 || !model || !model.hasFields) {
      return;
    }
    setStatus("processing");
    setProgress(0);
    setErrorMessage(null);
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const fills = buildFills(model.fields, values);
      const out = await pdfClient.fillForms(
        bytes,
        { fills, flatten }, // (R19, R20)
        (p) => setProgress(p),
      );
      // Click-driven (#39 R11, R16): guardamos el Blob local (sin red) para que
      // el usuario lo descargue con el botón guiado del estado `done`.
      setResult({
        blob: pdfBytesToBlob(out),
        name: "formulario-relleno.pdf",
        cost: "medium",
      });
      setStatus("done");
    } catch (error) {
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  async function handleAnnotateExport(): Promise<void> {
    if (files.length === 0 || annotations.length === 0) {
      return; // (R17)
    }
    setStatus("processing");
    setProgress(0);
    setErrorMessage(null);
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const out = await pdfClient.annotate(
        bytes,
        annotations, // (R16)
        (p) => setProgress(p),
      );
      // Click-driven (#39 R11, R16): Blob local guardado para descarga guiada.
      setResult({
        blob: pdfBytesToBlob(out),
        name: "documento-anotado.pdf",
        cost: "heavy",
      });
      setStatus("done");
    } catch (error) {
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  /** Descarga local por Blob; sin red. (#39 R11, R12 · #25 R23) */
  function handleDownload(): void {
    if (result) {
      downloadBlob(result.blob, result.name);
    }
  }

  const hasPdf = files.length > 0;
  const withFields = model !== null && model.hasFields;
  const noFields = model !== null && !model.hasFields;
  const canAnnotateExport =
    noFields && annotations.length > 0 && status !== "processing";

  return (
    <section className="py-8">
      <ToolPageHeader toolId="fill-forms" />

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF aquí — ¡prometo no chismosear!"
        />

        {status === "detecting" && (
          <p className="text-sm text-ink-soft" aria-live="polite">
            Analizando el formulario…
          </p>
        )}

        {/* Vista previa con overlay visual de campos (R8–R10). El overlay solo
            se monta en el modo con campos; en el modo sin campos la edición vive
            en el `AnnotationEditor`. */}
        {hasPdf && (
          <>
            {withFields && pageCount > 1 && (
              <div
                className="flex items-center gap-3"
                role="group"
                aria-label="Navegación de páginas"
              >
                <button
                  type="button"
                  className="btn"
                  disabled={previewPageIndex <= 0}
                  onClick={() =>
                    setPreviewPageIndex((i) => Math.max(0, i - 1))
                  }
                >
                  Página anterior
                </button>
                <span className="hand text-lg text-ink" aria-live="polite">
                  Página {previewPageIndex + 1} de {pageCount}
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={previewPageIndex >= pageCount - 1}
                  onClick={() =>
                    setPreviewPageIndex((i) => Math.min(pageCount - 1, i + 1))
                  }
                >
                  Página siguiente
                </button>
              </div>
            )}
            <LivePreview
              file={files[0]}
              pageIndex={previewPageIndex}
              overlays={[]}
              onPageCount={setPageCount}
              createRasterizer={createRasterizer}
              renderInteractiveOverlay={
                withFields
                  ? ({ pageSize, scale }) => (
                      <FormFieldOverlay
                        fields={model.fields}
                        pageIndex={previewPageIndex}
                        pageSize={pageSize}
                        scale={scale}
                        focusedField={focusedField}
                        onFocusField={handleMarkerActivate}
                      />
                    )
                  : undefined
              }
            />
          </>
        )}

        {/* Caso sin campos: aviso + editor de anotaciones inline (R14, R15, R18) */}
        {noFields && (
          <div className="flex flex-col gap-4">
            <div
              role="note"
              className="rounded-2xl border border-line bg-hl-green/50 p-4 text-sm text-ink-soft"
            >
              <p>{NO_FIELDS_NOTICE}</p>
              <p>
                Puedes añadir texto y marcas encima del documento con el editor de
                abajo.
              </p>
            </div>

            {pageCount > 0 && (
              <>
                <div className="flex flex-col gap-2">
                  <span className="hand text-lg text-ink">
                    Imagen para la herramienta de imagen (opcional)
                  </span>
                  <Dropzone
                    files={imageFiles}
                    onFilesChange={setImageFiles}
                    validation={IMAGE_VALIDATION}
                    multiple={false}
                    label="Arrastra una imagen (JPG o PNG) o haz clic para seleccionar"
                  />
                </div>

                <UndoControls
                  canUndo={editorHistory.canUndo}
                  canRedo={editorHistory.canRedo}
                  onUndo={editorHistory.undo}
                  onRedo={editorHistory.redo}
                />

                <AnnotationEditor
                  file={files[0]}
                  pageCount={pageCount}
                  annotations={annotations}
                  activePageIndex={previewPageIndex}
                  onActivePageChange={setPreviewPageIndex}
                  activeTool={activeTool}
                  onToolChange={setActiveTool}
                  onAddAnnotation={(a: Annotation) =>
                    editorHistory.set((prev) => addAnnotation(prev, a))
                  }
                  onUpdateAnnotation={(a: Annotation) => {
                    // Gesto de mover/redimensionar → coalescido; edición de
                    // texto → commit discreto. (#37 R28, R32)
                    if (gestureActiveRef.current) {
                      editorHistory.updateGesture((prev) =>
                        updateAnnotation(prev, a),
                      );
                    } else {
                      editorHistory.set((prev) => updateAnnotation(prev, a));
                    }
                  }}
                  onRemoveAnnotation={(id: string) =>
                    editorHistory.set((prev) => removeAnnotation(prev, id))
                  }
                  selectedId={editorState.selectedId}
                  onSelectionChange={(id: string | null) =>
                    editorHistory.replace((prev) => selectAnnotation(prev, id))
                  }
                  settings={settings}
                  onSettingsChange={setSettings}
                  onGestureStart={() => {
                    gestureActiveRef.current = true;
                    editorHistory.beginGesture();
                  }}
                  onGestureEnd={() => {
                    editorHistory.endGesture();
                    gestureActiveRef.current = false;
                  }}
                  imageData={imageData}
                  createId={createId}
                  createRasterizer={createRasterizer}
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleAnnotateExport()}
                    disabled={!canAnnotateExport}
                    className="btn btn-primary lv-pesada"
                  >
                    Añadir texto encima y descargar
                  </button>
                  {annotations.length === 0 && (
                    <span className="hand soft text-base">
                      Añade al menos una anotación con las herramientas.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Caso con campos: editor por campo (R19, R20) */}
        {withFields && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <fieldset className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-6">
              <legend className="px-2 text-sm font-medium text-ink">
                Campos del formulario
              </legend>
              {model.fields.map((field) => (
                <FieldEditor
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => setFieldValue(field.name, value)}
                  onFocus={() => handleFieldFocus(field.name)}
                  registerRef={(el) => {
                    fieldRefs.current[field.name] = el;
                  }}
                />
              ))}
            </fieldset>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={flatten}
                onChange={(event) => setFlatten(event.target.checked)}
                className="h-4 w-4"
              />
              Aplanar el formulario (fija los valores, no editables)
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={status === "processing"}
                className="btn btn-primary lv-media"
              >
                Rellenar y descargar
              </button>
            </div>
          </form>
        )}

        {status === "processing" && (
          <div className="flex max-w-[640px] flex-col gap-2.5" aria-live="polite">
            <p className="hand m-0 text-xl text-ink">El panda pasa tus respuestas a tinta…</p>
            <ProgressBar value={progress} />
          </div>
        )}

        {status === "done" && result && (
          <div className="flex max-w-[640px] flex-col gap-4">
            {/* Anuncio accesible sin mover el foco (#39 R5, R15); copy de "listo
                para descargar" coherente con el flujo click-driven (#39 R16). */}
            <div role="status" className="card hand text-xl text-ink">
              <span className="hl-media">¡Listo!</span> Tu documento está listo —
              descárgalo abajo.
            </div>
            <DownloadCta
              onDownload={handleDownload}
              costLevel={result.cost}
              label="⇩ Descargar documento"
            />
          </div>
        )}

        {status === "error" && errorMessage && (
          <ErrorBubble message={errorMessage} />
        )}
      </div>
    </section>
  );
}

interface FieldEditorProps {
  field: FormFieldInfo;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
  /** Notifica que este campo recibió el foco (para destacar su marcador). (R12) */
  onFocus: () => void;
  /** Registra el control focusable del campo, para enfocarlo desde el overlay. (R11) */
  registerRef: (el: HTMLElement | null) => void;
}

/** Editor de un único campo, según su tipo. Presentacional. */
function FieldEditor({
  field,
  value,
  onChange,
  onFocus,
  registerRef,
}: FieldEditorProps): JSX.Element {
  const labelId = `field-${field.name}`;

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          ref={registerRef}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          onFocus={onFocus}
          className="h-4 w-4"
          aria-label={field.name}
        />
        {field.name}
      </label>
    );
  }

  if (field.type === "radio" || field.type === "dropdown") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={labelId} className="hand text-lg text-ink">
          {field.name}
        </label>
        <select
          ref={registerRef}
          id={labelId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          className="rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-green"
        >
          <option value="">— Sin seleccionar —</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={labelId} className="hand text-lg text-ink">
        {field.name}
      </label>
      <input
        ref={registerRef}
        id={labelId}
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        className="rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mk-green"
      />
    </div>
  );
}
