export type ResourceCost = "light" | "medium" | "heavy";

/** Etiqueta legible mostrada en badge y nota. (R4, R8) */
export const RESOURCE_COST_LABEL: Record<ResourceCost, string> = {
  light: "Ligera",
  medium: "Media",
  heavy: "Pesada",
};

/** Frase explicativa del nivel para la página de la herramienta. (R8) */
export const RESOURCE_COST_EXPLANATION: Record<ResourceCost, string> = {
  light: "Consume pocos recursos: funciona con fluidez incluso en equipos modestos.",
  medium: "Consumo moderado de memoria y CPU: puede tardar un poco en documentos grandes.",
  heavy: "Uso intensivo de memoria: en documentos grandes puede ir lento o agotar la memoria del dispositivo.",
};

/** Clases Tailwind (fondo + texto) por nivel; distintas por nivel. (R5) */
export const RESOURCE_COST_BADGE_CLASSES: Record<ResourceCost, string> = {
  light: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  heavy: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

/** Texto del aviso de memoria en móvil para herramientas pesadas. (R9) */
export const HEAVY_MOBILE_WARNING =
  "En un dispositivo móvil esta herramienta puede consumir mucha memoria. Si el documento es grande, considera usar un ordenador.";
