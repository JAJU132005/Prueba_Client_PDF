import type { ResourceCost } from "@/lib/resourceCost";

export type ToolCategory =
  | "organizar"
  | "convertir"
  | "optimizar"
  | "seguridad";

export type ToolIconId =
  | "merge"
  | "split"
  | "rotate"
  | "organize"
  | "pdf-to-images"
  | "images-to-pdf"
  | "page-numbers"
  | "watermark"
  | "compress"
  | "protect"
  | "annotate"
  | "sign"
  | "fill-forms"
  | "ocr"
  | "redact";

/** Plantilla visual de la herramienta según `design-incoming/README.md`. (#28 R30) */
export type ToolTemplate =
  | "01-multi-file"
  | "02-options"
  | "03-page-select"
  | "04-editor-preview";

export interface Tool {
  id: string;
  title: string;
  description: string;
  path: string;
  category: ToolCategory;
  icon: ToolIconId;
  resourceCost: ResourceCost;
  template: ToolTemplate;
}

export const TOOLS: readonly Tool[] = [
  {
    id: "merge",
    title: "Unir PDF",
    description: "Combina varios PDF en un único documento, en el orden que elijas.",
    path: "/unir",
    category: "organizar",
    icon: "merge",
    template: "01-multi-file",
    resourceCost: "light",
  },
  {
    id: "split",
    title: "Dividir PDF",
    description: "Separa un PDF en varios archivos por páginas o rangos.",
    path: "/dividir",
    category: "organizar",
    icon: "split",
    template: "03-page-select",
    resourceCost: "light",
  },
  {
    id: "rotate",
    title: "Rotar PDF",
    description: "Gira las páginas de tu PDF y guárdalo con la orientación correcta.",
    path: "/rotar",
    category: "organizar",
    icon: "rotate",
    template: "02-options",
    resourceCost: "light",
  },
  {
    id: "organize",
    title: "Organizar páginas",
    description: "Reordena, duplica o elimina páginas de tu documento.",
    path: "/organizar",
    category: "organizar",
    icon: "organize",
    template: "03-page-select",
    resourceCost: "medium",
  },
  {
    id: "pdf-to-images",
    title: "PDF a imágenes",
    description: "Convierte cada página de tu PDF en una imagen descargable.",
    path: "/pdf-a-imagenes",
    category: "convertir",
    icon: "pdf-to-images",
    template: "03-page-select",
    resourceCost: "medium",
  },
  {
    id: "images-to-pdf",
    title: "Imágenes a PDF",
    description: "Reúne tus imágenes en un único PDF listo para compartir.",
    path: "/imagenes-a-pdf",
    category: "convertir",
    icon: "images-to-pdf",
    template: "01-multi-file",
    resourceCost: "light",
  },
  {
    id: "page-numbers",
    title: "Números de página",
    description: "Añade números de página con el formato y la posición que prefieras.",
    path: "/numeros-pagina",
    category: "organizar",
    icon: "page-numbers",
    template: "04-editor-preview",
    resourceCost: "light",
  },
  {
    id: "watermark",
    title: "Marca de agua",
    description: "Estampa un texto o logo como marca de agua sobre tus páginas.",
    path: "/marca-agua",
    category: "organizar",
    icon: "watermark",
    template: "04-editor-preview",
    resourceCost: "light",
  },
  {
    id: "compress",
    title: "Comprimir PDF",
    description: "Reduce el tamaño de tu PDF conservando la mejor calidad posible.",
    path: "/comprimir",
    category: "optimizar",
    icon: "compress",
    template: "02-options",
    resourceCost: "heavy",
  },
  {
    id: "protect",
    title: "Proteger / desbloquear",
    description: "Añade o retira la contraseña de tu PDF de forma local y segura.",
    path: "/proteger",
    category: "seguridad",
    icon: "protect",
    template: "02-options",
    resourceCost: "medium",
  },
  {
    id: "annotate",
    title: "Editar y anotar PDF",
    description: "Añade texto, resaltados, dibujos, formas e imágenes sobre tus páginas.",
    path: "/anotar",
    category: "organizar",
    icon: "annotate",
    template: "04-editor-preview",
    resourceCost: "heavy",
  },
  {
    id: "sign",
    title: "Firmar PDF",
    description: "Coloca tu firma (subida o dibujada) como imagen en la página que elijas.",
    path: "/firmar",
    category: "seguridad",
    icon: "sign",
    template: "04-editor-preview",
    resourceCost: "medium",
  },
  {
    id: "fill-forms",
    title: "Rellenar formularios",
    description: "Detecta y rellena los campos de un formulario PDF; opcionalmente aplana los valores.",
    path: "/rellenar-formularios",
    category: "organizar",
    icon: "fill-forms",
    template: "04-editor-preview",
    resourceCost: "medium",
  },
  {
    id: "ocr",
    title: "Reconocer texto (OCR)",
    description: "Extrae el texto de un PDF escaneado y crea, si quieres, un PDF con texto buscable.",
    path: "/reconocer-texto",
    category: "convertir",
    icon: "ocr",
    template: "02-options",
    resourceCost: "heavy",
  },
  {
    id: "redact",
    title: "Redactar PDF",
    description: "Oculta información sensible de forma permanente: las zonas redactadas se rasterizan y no quedan como texto extraíble.",
    path: "/redactar",
    category: "seguridad",
    icon: "redact",
    template: "04-editor-preview",
    resourceCost: "medium",
  },
  {
    id: "sign-free",
    title: "Firmar PDF (colocación libre)",
    description: "Arrastra tu firma a cualquier posición, ajústala con tiradores y aplícala a varias páginas a la vez.",
    path: "/firmar-libre",
    category: "seguridad",
    icon: "sign",
    template: "04-editor-preview",
    resourceCost: "medium",
  },
] as const;

/** Resuelve el nivel de una herramienta por su `id` estable. undefined si no existe. */
export function getToolResourceCost(id: string): ResourceCost | undefined {
  return TOOLS.find((tool) => tool.id === id)?.resourceCost;
}
