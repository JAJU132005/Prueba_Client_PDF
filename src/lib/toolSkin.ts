import type { PandaArtKind } from "@/components/PandaArt";
import type { ResourceCost } from "@/lib/resourceCost";
import { getToolResourceCost } from "@/lib/tools";

/**
 * Metadatos de PIEL por herramienta para el diseño "El Diario del Panda":
 * escena, glifo del icono garabato, título de escena, onomatopeya y copy del
 * botón de acción. Presentación pura: sin lógica de dominio. (#28)
 */

export interface ToolSkin {
  /** Escena `PandaArt` de la herramienta (mismo slug del entregable). */
  scene: PandaArtKind;
  /** Glifo del icono garabateado (`.tool-icon`). */
  glyph: string;
  /** Título manuscrito de la tarjeta de escena. */
  sceneTitle: string;
  /** Onomatopeya garabateada de la escena. */
  onomatopoeia: string;
  /** Copy del botón de acción principal. */
  actionLabel: string;
}

export const TOOL_SKINS: Record<string, ToolSkin> = {
  merge: {
    scene: "unir",
    glyph: "＋",
    sceneTitle: "La grapadora gigante",
    onomatopoeia: "¡CLACK!",
    actionLabel: "Unir con la grapadora",
  },
  split: {
    scene: "dividir",
    glyph: "✂",
    sceneTitle: "Tijeras y línea punteada",
    onomatopoeia: "✂ ¡RAS!",
    actionLabel: "Cortar por la línea punteada",
  },
  rotate: {
    scene: "rotar",
    glyph: "90°",
    sceneTitle: "El panda tuerce el cuello",
    onomatopoeia: "¡ÑIIIC!",
    actionLabel: "Girar páginas",
  },
  organize: {
    scene: "organizar",
    glyph: "1↔3",
    sceneTitle: "El tablón de corcho",
    onomatopoeia: "¡PLOP!",
    actionLabel: "Exportar",
  },
  "pdf-to-images": {
    scene: "pdf-a-imagenes",
    glyph: "→img",
    sceneTitle: "El panda fotógrafo",
    onomatopoeia: "¡FLASH!",
    actionLabel: "Convertir",
  },
  "images-to-pdf": {
    scene: "imagenes-a-pdf",
    glyph: "→pdf",
    sceneTitle: "Álbum de recortes",
    onomatopoeia: "¡ZAS!",
    actionLabel: "Cerrar el álbum con moño",
  },
  "page-numbers": {
    scene: "numeros",
    glyph: "#1",
    sceneTitle: "El sello numerador",
    onomatopoeia: "¡KA-CHUNK!",
    actionLabel: "Añadir números",
  },
  watermark: {
    scene: "marca-de-agua",
    glyph: "≋",
    sceneTitle: "El rodillo de pintura fantasma",
    onomatopoeia: "~fssshh~",
    actionLabel: "Pasar el rodillo",
  },
  compress: {
    scene: "comprimir",
    glyph: "→←",
    sceneTitle: "La prensa panda",
    onomatopoeia: "¡CRONCH!",
    actionLabel: "Comprimir",
  },
  protect: {
    scene: "proteger",
    glyph: "•••",
    sceneTitle: "El candado del diario",
    onomatopoeia: "¡CLIC!",
    actionLabel: "Proteger",
  },
  annotate: {
    scene: "editar",
    glyph: "✎",
    sceneTitle: "El estuche completo",
    onomatopoeia: "¡PSSSH!",
    actionLabel: "Exportar PDF anotado",
  },
  sign: {
    scene: "firmar",
    glyph: "✗﹏",
    sceneTitle: "El autógrafo",
    onomatopoeia: "firma aquí ✗",
    actionLabel: "Firmar PDF",
  },
  "fill-forms": {
    scene: "rellenar",
    glyph: "10/10",
    sceneTitle: "El examen escolar",
    onomatopoeia: "10/10",
    actionLabel: "Rellenar y descargar",
  },
  ocr: {
    scene: "ocr",
    glyph: "Aa?",
    sceneTitle: "El panda detective",
    onomatopoeia: "¡AJÁ!",
    actionLabel: "Reconocer texto",
  },
  redact: {
    scene: "redactar",
    glyph: "█▌",
    sceneTitle: "Expediente clasificado",
    onomatopoeia: "shhh…",
    actionLabel: "Redactar y descargar",
  },
  "sign-free": {
    scene: "firmar",
    glyph: "✍",
    sceneTitle: "Coloca tu autógrafo donde quieras",
    onomatopoeia: "arrastra ✍",
    actionLabel: "Firmar PDF",
  },
};

/** Piel de una herramienta por su id estable. undefined si no existe. */
export function getToolSkin(id: string): ToolSkin | undefined {
  return TOOL_SKINS[id];
}

/** Frase de nivel manuscrita del encabezado de herramienta. */
export const LEVEL_PHRASE: Record<ResourceCost, string> = {
  light: "Tu dispositivo ni se despeina.",
  medium: "Ahí va la cosa: dale unos segundos.",
  heavy: "Modo bestia: tu dispositivo va a sudar.",
};

/** Clase de subrayador (`hl-*`) derivada del nivel de la herramienta. */
export function getToolHlClass(id: string): string {
  const level = getToolResourceCost(id);
  return level === "heavy"
    ? "hl-pesada"
    : level === "medium"
      ? "hl-media"
      : "hl-ligera";
}

/** Clase de nivel (`lv-*`) para botones primarios y fondos de icono. */
export function getToolLvClass(id: string): string {
  const level = getToolResourceCost(id);
  return level === "heavy"
    ? "lv-pesada"
    : level === "medium"
      ? "lv-media"
      : "lv-ligera";
}
