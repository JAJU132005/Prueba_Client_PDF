/**
 * Dominio PURO de la herramienta "Rellenar formularios PDF" (#25). Detecta los
 * campos AcroForm de un PDF con pdf-lib (texto, checkbox, radio, dropdown), los
 * rellena y, opcionalmente, aplana el formulario (`form.flatten()`), incrustando
 * los valores en el contenido de las páginas.
 *
 * Sin React, sin DOM: opera solo sobre `Uint8Array`. La única dependencia es
 * pdf-lib (JS puro), como el resto de la capa de dominio (`annotate.ts`,
 * `watermark.ts`, `pageNumbers.ts`). (R1–R16, R19, R20, R24)
 */

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";

import {
  FillFormFailedError,
  InvalidPdfError,
  type ProgressCallback,
} from "@/pdf/types";

/** Tipos de campo AcroForm soportados. (R3–R6) */
export type FormFieldType = "text" | "checkbox" | "radio" | "dropdown";

/** Descripción serializable (objeto plano) de un campo del formulario. */
export interface FormFieldInfo {
  name: string;
  type: FormFieldType;
  /** text: valor; checkbox: ""; radio/dropdown: opción seleccionada o "". */
  value: string;
  /** checkbox: estado actual. */
  checked?: boolean;
  /** radio/dropdown: opciones disponibles. */
  options?: readonly string[];
  /** radio/dropdown: opción seleccionada o null. */
  selected?: string | null;
}

/** Modelo del formulario detectado. (R1, R7) */
export interface FormModel {
  hasFields: boolean;
  fields: readonly FormFieldInfo[];
}

/** Instrucción de relleno de un campo, discriminada por `kind`. */
export type FieldFill =
  | { name: string; kind: "text"; value: string }
  | { name: string; kind: "checkbox"; checked: boolean }
  | { name: string; kind: "radio"; option: string }
  | { name: string; kind: "dropdown"; option: string };

/** Opciones de `fillForms`: los rellenos y si se aplana la salida. */
export interface FillFormsOptions {
  fills: readonly FieldFill[];
  flatten: boolean;
}

/**
 * (R1–R7, R20, R24) Carga `input` con pdf-lib y deriva el modelo de formulario:
 * recorre `form.getFields()`, clasifica cada campo por `instanceof` y extrae su
 * valor/estado/opciones. Si el PDF no tiene campos AcroForm devuelve
 * `{ hasFields: false, fields: [] }`. Lanza `InvalidPdfError` si no carga.
 *
 * Sin React/DOM: pdf-lib es JS puro.
 */
export async function detectFormFields(
  input: Uint8Array,
): Promise<FormModel> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input);
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido."); // (R20)
  }

  const form = doc.getForm();
  const fields = form.getFields();
  const infos: FormFieldInfo[] = [];

  for (const field of fields) {
    const name = field.getName(); // (R2)

    if (field instanceof PDFTextField) {
      const text = field.getText() ?? ""; // (R3)
      infos.push({ name, type: "text", value: text });
    } else if (field instanceof PDFCheckBox) {
      const checked = field.isChecked(); // (R4)
      infos.push({ name, type: "checkbox", value: "", checked });
    } else if (field instanceof PDFRadioGroup) {
      const options = field.getOptions();
      const selected = field.getSelected() ?? null; // (R5)
      infos.push({
        name,
        type: "radio",
        value: selected ?? "",
        options,
        selected,
      });
    } else if (field instanceof PDFDropdown) {
      const options = field.getOptions();
      const selectedList = field.getSelected(); // string[]
      const selected = selectedList.length > 0 ? selectedList[0] : null; // (R6)
      infos.push({
        name,
        type: "dropdown",
        value: selected ?? "",
        options,
        selected,
      });
    }
    // Otros tipos (botones, listas múltiples) se omiten del modelo editable.
  }

  return { hasFields: infos.length > 0, fields: infos }; // (R1, R7)
}

/**
 * (R8–R16, R19, R20, R24) Carga `input`, valida y aplica cada relleno de
 * `options.fills` sobre el formulario y, si `options.flatten`, aplana el
 * formulario incrustando los valores en el contenido de página. Devuelve los
 * bytes del PDF resultante y emite progreso en [0,1] terminando en 1.
 *
 * - `InvalidPdfError` si los bytes no son un PDF cargable (R20) → sin salida.
 * - `FillFormFailedError` si un relleno referencia un campo inexistente (R12) o
 *   una opción de radio/dropdown fuera de las opciones del campo (R13) → sin
 *   salida.
 *
 * Sin React/DOM.
 */
export async function fillForms(
  input: Uint8Array,
  options: FillFormsOptions,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  onProgress?.(0); // (R19)

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input);
  } catch {
    throw new InvalidPdfError("El archivo no es un PDF válido."); // (R20)
  }

  const form = doc.getForm();
  const byName = new Map(form.getFields().map((f) => [f.getName(), f]));
  const fills = options.fills;
  const n = fills.length;

  for (let i = 0; i < n; i++) {
    const fill = fills[i];

    const field = byName.get(fill.name);
    if (field === undefined) {
      // El campo no existe en el formulario. (R12)
      throw new FillFormFailedError(
        `El formulario no tiene un campo llamado "${fill.name}".`,
      );
    }

    switch (fill.kind) {
      case "text": {
        if (!(field instanceof PDFTextField)) {
          throw new FillFormFailedError(
            `El campo "${fill.name}" no es de texto.`,
          );
        }
        field.setText(fill.value); // (R8)
        break;
      }
      case "checkbox": {
        if (!(field instanceof PDFCheckBox)) {
          throw new FillFormFailedError(
            `El campo "${fill.name}" no es una casilla.`,
          );
        }
        if (fill.checked) {
          field.check(); // (R9)
        } else {
          field.uncheck(); // (R9)
        }
        break;
      }
      case "radio": {
        if (!(field instanceof PDFRadioGroup)) {
          throw new FillFormFailedError(
            `El campo "${fill.name}" no es un grupo de opción.`,
          );
        }
        if (!field.getOptions().includes(fill.option)) {
          // Opción fuera de las opciones del campo. (R13)
          throw new FillFormFailedError(
            `La opción "${fill.option}" no existe en el campo "${fill.name}".`,
          );
        }
        field.select(fill.option); // (R10)
        break;
      }
      case "dropdown": {
        if (!(field instanceof PDFDropdown)) {
          throw new FillFormFailedError(
            `El campo "${fill.name}" no es un desplegable.`,
          );
        }
        if (!field.getOptions().includes(fill.option)) {
          // Opción fuera de las opciones del campo. (R13)
          throw new FillFormFailedError(
            `La opción "${fill.option}" no existe en el campo "${fill.name}".`,
          );
        }
        field.select(fill.option); // (R11)
        break;
      }
    }

    onProgress?.((i + 1) / n); // progreso proporcional
  }

  if (options.flatten) {
    form.flatten(); // (R14, R15): incrusta apariencias y elimina los widgets
  }

  onProgress?.(1); // (R19)
  return doc.save(); // (R8–R16)
}
