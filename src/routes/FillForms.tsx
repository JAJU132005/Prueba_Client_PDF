import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Dropzone } from "@/components/Dropzone";
import { LivePreview } from "@/components/LivePreview";
import { ResourceCostNote } from "@/components/ResourceCostNote";
import { downloadBlob, pdfBytesToBlob } from "@/lib/download";
import {
  DEFAULT_MAX_FILE_BYTES,
  type FileValidationConfig,
} from "@/lib/fileValidation";
import type {
  FieldFill,
  FormFieldInfo,
  FormModel,
} from "@/pdf/fillForms";
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

/** Aviso visible cuando el PDF no tiene campos de formulario. (R25) */
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
      default:
        break;
    }
  }
  return "Ocurrió un error inesperado al rellenar el formulario.";
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
  /** Factoría de rasterizador para LivePreview (tests). */
  createRasterizer?: PageRasterizerFactory;
}

/**
 * Herramienta "Rellenar formularios PDF" (#25). Dropzone (1 PDF) →
 * `detectForm` en el worker → si hay campos, editor por campo + toggle de
 * aplanado + "Rellenar y descargar" (op `fillForms` en el worker) → descarga
 * local del Blob. Si no hay campos, informa y ofrece añadir texto encima
 * enlazando a la herramienta de anotación (#23). Previsualiza el PDF cargado con
 * `LivePreview` (#20). Cero red; la UI no contiene lógica de PDF.
 */
export function FillForms({
  client,
  createRasterizer,
}: FillFormsProps = {}): JSX.Element {
  const pdfClient = useMemo(() => client ?? createPdfClient(), [client]);

  const [files, setFiles] = useState<File[]>([]);
  const [model, setModel] = useState<FormModel | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [flatten, setFlatten] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const detectSeq = useRef(0);

  useEffect(() => {
    return () => {
      detectSeq.current += 1;
    };
  }, []);

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
    if (next.length > 0) {
      void detect(next[0]);
    }
  }

  function setFieldValue(name: string, value: FieldValue): void {
    setValues((prev) => ({ ...prev, [name]: value }));
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
        { fills, flatten },
        (p) => setProgress(p),
      );
      downloadBlob(pdfBytesToBlob(out), "formulario-relleno.pdf"); // (R23)
      setStatus("done");
    } catch (error) {
      setErrorMessage(messageForError(error));
      setStatus("error");
    }
  }

  const hasPdf = files.length > 0;

  return (
    <section className="py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-text md:text-4xl">
            Rellenar formularios PDF
          </h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% local
          </span>
        </div>
        <p className="max-w-2xl text-base text-text-muted">
          Detecta los campos de un formulario PDF (texto, casillas, opciones y
          desplegables) y rellénalos. Opcionalmente, aplana el formulario para
          fijar los valores. Tu archivo se procesa en tu navegador y nunca se
          sube a ningún servidor.
        </p>
        <ResourceCostNote toolId="fill-forms" />
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <Dropzone
          files={files}
          onFilesChange={handleFilesChange}
          validation={PDF_VALIDATION}
          multiple={false}
          label="Arrastra tu PDF o haz clic para seleccionar"
        />

        {status === "detecting" && (
          <p className="text-sm text-text-muted" aria-live="polite">
            Analizando el formulario…
          </p>
        )}

        {hasPdf && (
          <LivePreview
            file={files[0]}
            pageIndex={0}
            overlays={[]}
            createRasterizer={createRasterizer}
          />
        )}

        {/* Caso sin campos: informar y ofrecer añadir texto encima (R25, R26) */}
        {model && !model.hasFields && (
          <div
            role="note"
            className="flex flex-col gap-3 rounded-2xl border border-border bg-primary/5 p-4 text-sm text-text-muted"
          >
            <p>{NO_FIELDS_NOTICE}</p>
            <p>
              Puedes añadir texto encima del documento con la herramienta de
              anotación.
            </p>
            <Link
              to="/anotar"
              className="inline-flex w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
            >
              Añadir texto encima
            </Link>
          </div>
        )}

        {/* Caso con campos: editor por campo (R1–R11) */}
        {model && model.hasFields && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
              <legend className="px-2 text-sm font-medium text-text">
                Campos del formulario
              </legend>
              {model.fields.map((field) => (
                <FieldEditor
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => setFieldValue(field.name, value)}
                />
              ))}
            </fieldset>

            <label className="flex items-center gap-2 text-sm text-text">
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
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              >
                Rellenar y descargar
              </button>
            </div>
          </form>
        )}

        {status === "processing" && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>Procesando localmente…</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={progress}
              className="h-2 w-full overflow-hidden rounded-full bg-border"
            >
              <div
                className="h-full bg-primary transition-[width] duration-150 ease-out motion-reduce:transition-none"
                style={{ width: `${String(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {status === "done" && (
          <div
            role="status"
            className="rounded-2xl border border-border bg-surface p-6 text-sm font-medium text-text"
          >
            ¡Listo! Tu formulario relleno se ha descargado.
          </div>
        )}

        {status === "error" && errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger"
          >
            {errorMessage}
          </div>
        )}
      </div>
    </section>
  );
}

interface FieldEditorProps {
  field: FormFieldInfo;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
}

/** Editor de un único campo, según su tipo. Presentacional. */
function FieldEditor({ field, value, onChange }: FieldEditorProps): JSX.Element {
  const labelId = `field-${field.name}`;

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4"
        />
        {field.name}
      </label>
    );
  }

  if (field.type === "radio" || field.type === "dropdown") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={labelId} className="text-sm font-medium text-text">
          {field.name}
        </label>
        <select
          id={labelId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
      <label htmlFor={labelId} className="text-sm font-medium text-text">
        {field.name}
      </label>
      <input
        id={labelId}
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </div>
  );
}
