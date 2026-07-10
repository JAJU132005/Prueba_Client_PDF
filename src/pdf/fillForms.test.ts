// @vitest-environment node
//
// Dominio de formularios (#25). Se ejecuta en el entorno NODE de Vitest (sin
// jsdom) para poder verificar en T32 que el dominio no toca el DOM ni `window`.
import { unzlibSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import {
  detectFormFields,
  fillForms,
  type FieldFill,
} from "@/pdf/fillForms";
// El fuente del módulo se lee como texto vía `?raw` de Vite (sin `node:fs`)
// para verificar su pureza (sin React, sin DOM). (R24)
import fillFormsSource from "@/pdf/fillForms.ts?raw";
import { FillFormFailedError, InvalidPdfError } from "@/pdf/types";

/** PDF con un campo de cada tipo, sin valores iniciales. */
async function makeFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const form = doc.getForm();

  const name = form.createTextField("fullName");
  name.addToPage(page, { x: 20, y: 350, width: 200, height: 20 });

  const agree = form.createCheckBox("agree");
  agree.addToPage(page, { x: 20, y: 320, width: 15, height: 15 });

  const color = form.createRadioGroup("color");
  color.addOptionToPage("red", page, { x: 20, y: 290, width: 15, height: 15 });
  color.addOptionToPage("blue", page, { x: 60, y: 290, width: 15, height: 15 });

  const country = form.createDropdown("country");
  country.setOptions(["ES", "FR", "DE"]);
  country.addToPage(page, { x: 20, y: 250, width: 100, height: 20 });

  return doc.save();
}

/** PDF con un campo de cada tipo y valores/estados iniciales conocidos. */
async function makeFilledFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const form = doc.getForm();

  const name = form.createTextField("fullName");
  name.setText("Ada");
  name.addToPage(page, { x: 20, y: 350, width: 200, height: 20 });

  const agree = form.createCheckBox("agree");
  agree.addToPage(page, { x: 20, y: 320, width: 15, height: 15 });
  agree.check();

  const color = form.createRadioGroup("color");
  color.addOptionToPage("red", page, { x: 20, y: 290, width: 15, height: 15 });
  color.addOptionToPage("blue", page, { x: 60, y: 290, width: 15, height: 15 });
  color.select("blue");

  const country = form.createDropdown("country");
  country.setOptions(["ES", "FR", "DE"]);
  country.addToPage(page, { x: 20, y: 250, width: 100, height: 20 });
  country.select("FR");

  return doc.save();
}

/** PDF sin ningún campo de formulario. */
async function makePlainPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  return doc.save();
}

describe("detectFormFields", () => {
  it("detecta y lista campos de un AcroForm con nombre y tipo (R1,R2)", async () => {
    const model = await detectFormFields(await makeFormPdf());
    expect(model.hasFields).toBe(true);
    const byName = Object.fromEntries(
      model.fields.map((f) => [f.name, f.type]),
    );
    expect(byName).toEqual({
      fullName: "text",
      agree: "checkbox",
      color: "radio",
      country: "dropdown",
    });
  });

  it("modela texto/checkbox/radio/dropdown con valor y opciones (R3,R4,R5,R6)", async () => {
    const model = await detectFormFields(await makeFilledFormPdf());
    const byName = new Map(model.fields.map((f) => [f.name, f]));

    const text = byName.get("fullName");
    expect(text?.type).toBe("text");
    expect(text?.value).toBe("Ada"); // (R3)

    const checkbox = byName.get("agree");
    expect(checkbox?.type).toBe("checkbox");
    expect(checkbox?.checked).toBe(true); // (R4)

    const radio = byName.get("color");
    expect(radio?.type).toBe("radio");
    expect(radio?.options).toEqual(["red", "blue"]); // (R5)
    expect(radio?.selected).toBe("blue");

    const dropdown = byName.get("country");
    expect(dropdown?.type).toBe("dropdown");
    expect(dropdown?.options).toEqual(["ES", "FR", "DE"]); // (R6)
    expect(dropdown?.selected).toBe("FR");
  });

  it("sin AcroForm devuelve hasFields=false y lista vacía (R7)", async () => {
    const model = await detectFormFields(await makePlainPdf());
    expect(model).toEqual({ hasFields: false, fields: [] });
  });

  it("bytes no-PDF lanzan InvalidPdfError (R20)", async () => {
    await expect(
      detectFormFields(new Uint8Array([1, 2, 3, 4])),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });
});

describe("detectFormFields — geometría de widgets (#31, R1,R2,R3,R27)", () => {
  it("reporta el rect y el pageIndex de cada campo (R1, R27)", async () => {
    const model = await detectFormFields(await makeFormPdf());
    const byName = new Map(model.fields.map((f) => [f.name, f]));

    const name = byName.get("fullName");
    expect(name?.widgets).toHaveLength(1);
    const w = name?.widgets?.[0];
    expect(w?.pageIndex).toBe(0);
    // El rect refleja el usado en addToPage ({x:20,y:350,w:200,h:20}); pdf-lib lo
    // infla ~0,5px por el borde del widget, así que comparamos con tolerancia.
    expect(Math.abs((w?.rect.x ?? 0) - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs((w?.rect.y ?? 0) - 350)).toBeLessThanOrEqual(1);
    expect(Math.abs((w?.rect.width ?? 0) - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs((w?.rect.height ?? 0) - 20)).toBeLessThanOrEqual(1);
  });

  it("un grupo radio con dos opciones reporta dos widgets (R2)", async () => {
    const model = await detectFormFields(await makeFormPdf());
    const color = model.fields.find((f) => f.name === "color");
    expect(color?.type).toBe("radio");
    expect(color?.widgets).toHaveLength(2);
    for (const widget of color?.widgets ?? []) {
      expect(widget.pageIndex).toBe(0);
    }
  });

  it("conserva los atributos existentes junto a widgets (R3, R27)", async () => {
    const model = await detectFormFields(await makeFilledFormPdf());
    const text = model.fields.find((f) => f.name === "fullName");
    // Los atributos de #25 se conservan intactos…
    expect(text?.type).toBe("text");
    expect(text?.value).toBe("Ada");
    // …y `widgets` es un atributo adicional opcional.
    expect(Array.isArray(text?.widgets)).toBe(true);
  });
});

/**
 * Extrae el texto de TODOS los streams del PDF de salida, inflando los que estén
 * comprimidos con FlateDecode (formato zlib) — pdf-lib comprime las apariencias
 * aplanadas — para poder buscar en ellos el valor incrustado en el contenido.
 */
function decodedStreamsText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  let text = "";
  let idx = 0;
  for (;;) {
    const s = raw.indexOf("stream", idx);
    if (s === -1) break;
    let start = s + "stream".length;
    if (bytes[start] === 0x0d) start++;
    if (bytes[start] === 0x0a) start++;
    const e = raw.indexOf("endstream", start);
    if (e === -1) break;
    let end = e;
    while (end > start && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) {
      end--;
    }
    const chunk = bytes.slice(start, end);
    try {
      text += new TextDecoder("latin1").decode(unzlibSync(chunk));
    } catch {
      text += new TextDecoder("latin1").decode(chunk);
    }
    idx = e + "endstream".length;
  }
  return text;
}

/** Codifica una cadena ASCII como string hexadecimal PDF en mayúsculas. */
function toPdfHex(value: string): string {
  let hex = "";
  for (let i = 0; i < value.length; i++) {
    hex += value.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex.toUpperCase();
}

/** Recarga los bytes y devuelve el formulario del PDF de salida. */
async function reloadForm(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getForm();
}

describe("fillForms — la salida conserva los valores", () => {
  it("rellenar un campo de texto se refleja al releer el formulario (R8)", async () => {
    const out = await fillForms(await makeFormPdf(), {
      fills: [{ name: "fullName", kind: "text", value: "Grace" }],
      flatten: false,
    });
    const form = await reloadForm(out);
    expect(form.getTextField("fullName").getText()).toBe("Grace");
  });

  it("marcar/desmarcar checkbox se refleja al releer (R9)", async () => {
    const checked = await fillForms(await makeFormPdf(), {
      fills: [{ name: "agree", kind: "checkbox", checked: true }],
      flatten: false,
    });
    expect((await reloadForm(checked)).getCheckBox("agree").isChecked()).toBe(
      true,
    );

    const unchecked = await fillForms(await makeFilledFormPdf(), {
      fills: [{ name: "agree", kind: "checkbox", checked: false }],
      flatten: false,
    });
    expect(
      (await reloadForm(unchecked)).getCheckBox("agree").isChecked(),
    ).toBe(false);
  });

  it("seleccionar opción de radio se refleja al releer (R10)", async () => {
    const out = await fillForms(await makeFormPdf(), {
      fills: [{ name: "color", kind: "radio", option: "red" }],
      flatten: false,
    });
    expect((await reloadForm(out)).getRadioGroup("color").getSelected()).toBe(
      "red",
    );
  });

  it("seleccionar opción de dropdown se refleja al releer (R11)", async () => {
    const out = await fillForms(await makeFormPdf(), {
      fills: [{ name: "country", kind: "dropdown", option: "DE" }],
      flatten: false,
    });
    expect(
      (await reloadForm(out)).getDropdown("country").getSelected(),
    ).toContain("DE");
  });
});

describe("fillForms — validación de rellenos", () => {
  it("campo inexistente lanza FillFormFailedError sin salida (R12)", async () => {
    await expect(
      fillForms(await makeFormPdf(), {
        fills: [{ name: "ghost", kind: "text", value: "x" }],
        flatten: false,
      }),
    ).rejects.toBeInstanceOf(FillFormFailedError);
  });

  it("opción inválida en radio/dropdown lanza FillFormFailedError (R13)", async () => {
    await expect(
      fillForms(await makeFormPdf(), {
        fills: [{ name: "color", kind: "radio", option: "green" }],
        flatten: false,
      }),
    ).rejects.toBeInstanceOf(FillFormFailedError);

    await expect(
      fillForms(await makeFormPdf(), {
        fills: [{ name: "country", kind: "dropdown", option: "US" }],
        flatten: false,
      }),
    ).rejects.toBeInstanceOf(FillFormFailedError);
  });
});

describe("fillForms — aplanado", () => {
  it("aplanar produce un PDF sin campos editables (R14)", async () => {
    const out = await fillForms(await makeFormPdf(), {
      fills: [{ name: "fullName", kind: "text", value: "Turing" }],
      flatten: true,
    });
    expect((await reloadForm(out)).getFields()).toHaveLength(0);
  });

  it("aplanar deja el valor incrustado y visible en la página (R15)", async () => {
    const out = await fillForms(await makeFormPdf(), {
      fills: [{ name: "fullName", kind: "text", value: "HELLOWORLD123" }],
      flatten: true,
    });
    expect((await reloadForm(out)).getFields()).toHaveLength(0);
    // El valor se dibuja en el contenido de página (apariencia aplanada), no
    // queda como campo editable. pdf-lib emite el texto como string hexadecimal
    // dentro del stream de apariencia; lo buscamos en los streams inflados.
    expect(decodedStreamsText(out)).toContain(toPdfHex("HELLOWORLD123"));
  });

  it("sin aplanar conserva los campos editables (R16)", async () => {
    const out = await fillForms(await makeFormPdf(), {
      fills: [{ name: "fullName", kind: "text", value: "Editable" }],
      flatten: false,
    });
    const form = await reloadForm(out);
    expect(form.getFields().length).toBeGreaterThan(0);
    expect(form.getTextField("fullName").getText()).toBe("Editable");
  });
});

describe("fillForms — progreso e invariantes", () => {
  it("progreso emite 0..1 terminando en 1 (R19)", async () => {
    const progress: number[] = [];
    const fills: FieldFill[] = [
      { name: "fullName", kind: "text", value: "a" },
      { name: "agree", kind: "checkbox", checked: true },
    ];
    await fillForms(
      await makeFormPdf(),
      { fills, flatten: false },
      (p) => progress.push(p),
    );
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });

  it("bytes no-PDF lanzan InvalidPdfError (R20)", async () => {
    await expect(
      fillForms(new Uint8Array([9, 9, 9, 9]), { fills: [], flatten: false }),
    ).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it("no realiza peticiones de red (R22)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // En el entorno node de Vitest no existe XMLHttpRequest; su ausencia ya
    // impide cualquier XHR. Verificamos además que fetch no se invoca.
    expect((globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest).toBe(
      undefined,
    );

    const pdf = await makeFormPdf();
    await detectFormFields(pdf);
    await fillForms(pdf, {
      fills: [{ name: "fullName", kind: "text", value: "z" }],
      flatten: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("fillForms — dominio puro sobre Uint8Array (R24)", () => {
  it("el dominio opera sobre Uint8Array sin tocar el DOM ni React (R24, T32)", async () => {
    // Entorno node: sin jsdom, no existe el DOM ni `window`.
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");

    const pdf = await makeFormPdf();
    const model = await detectFormFields(pdf);
    expect(model.hasFields).toBe(true);

    const out = await fillForms(pdf, {
      fills: [{ name: "fullName", kind: "text", value: "puro" }],
      flatten: false,
    });
    expect(out).toBeInstanceOf(Uint8Array);

    // El fuente no importa React ni referencia el DOM.
    expect(fillFormsSource).not.toMatch(/from\s+["']react["']/);
    expect(fillFormsSource).not.toMatch(/\bdocument\b/);
    expect(fillFormsSource).not.toMatch(/\bwindow\b/);
  });
});
