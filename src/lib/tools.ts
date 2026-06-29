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
  | "protect";

export interface Tool {
  id: string;
  title: string;
  description: string;
  path: string;
  category: ToolCategory;
  icon: ToolIconId;
}

export const TOOLS: readonly Tool[] = [
  {
    id: "merge",
    title: "Unir PDF",
    description: "Combina varios PDF en un único documento, en el orden que elijas.",
    path: "/unir",
    category: "organizar",
    icon: "merge",
  },
  {
    id: "split",
    title: "Dividir PDF",
    description: "Separa un PDF en varios archivos por páginas o rangos.",
    path: "/dividir",
    category: "organizar",
    icon: "split",
  },
  {
    id: "rotate",
    title: "Rotar PDF",
    description: "Gira las páginas de tu PDF y guárdalo con la orientación correcta.",
    path: "/rotar",
    category: "organizar",
    icon: "rotate",
  },
  {
    id: "organize",
    title: "Organizar páginas",
    description: "Reordena, duplica o elimina páginas de tu documento.",
    path: "/organizar",
    category: "organizar",
    icon: "organize",
  },
  {
    id: "pdf-to-images",
    title: "PDF a imágenes",
    description: "Convierte cada página de tu PDF en una imagen descargable.",
    path: "/pdf-a-imagenes",
    category: "convertir",
    icon: "pdf-to-images",
  },
  {
    id: "images-to-pdf",
    title: "Imágenes a PDF",
    description: "Reúne tus imágenes en un único PDF listo para compartir.",
    path: "/imagenes-a-pdf",
    category: "convertir",
    icon: "images-to-pdf",
  },
  {
    id: "page-numbers",
    title: "Números de página",
    description: "Añade números de página con el formato y la posición que prefieras.",
    path: "/numeros-pagina",
    category: "organizar",
    icon: "page-numbers",
  },
  {
    id: "watermark",
    title: "Marca de agua",
    description: "Estampa un texto o logo como marca de agua sobre tus páginas.",
    path: "/marca-agua",
    category: "organizar",
    icon: "watermark",
  },
  {
    id: "compress",
    title: "Comprimir PDF",
    description: "Reduce el tamaño de tu PDF conservando la mejor calidad posible.",
    path: "/comprimir",
    category: "optimizar",
    icon: "compress",
  },
  {
    id: "protect",
    title: "Proteger / desbloquear",
    description: "Añade o retira la contraseña de tu PDF de forma local y segura.",
    path: "/proteger",
    category: "seguridad",
    icon: "protect",
  },
] as const;
