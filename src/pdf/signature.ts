import type { Annotation, AnnotationColor, PdfPoint } from "@/pdf/annotate";

// ---------------------------------------------------------------------------
// Colocación libre (#30). Geometría pura de arrastrar/
// redimensionar la firma y puente firma → anotaciones de imagen/texto que se
// aplanan con `flattenAnnotations` (vía `pdfClient.annotate`). Sin React/DOM.
// ---------------------------------------------------------------------------

/** Caja de firma en puntos PDF, origen inferior-izquierdo (mismo que pdf-lib). */
export interface FreePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Elemento opcional colocable junto a la firma (fecha o texto libre). */
export interface SignatureExtra {
  id: string;
  kind: "date" | "text";
  /** Texto ya resuelto (la fecha llega formateada por `formatSignatureDate`). */
  text: string;
  /** Ancla inferior-izquierda en puntos PDF. */
  at: PdfPoint;
  fontSize: number;
  color: AnnotationColor;
}

/** Tirador de redimensionado: una de las cuatro esquinas de la caja. */
export type SignatureHandle = "nw" | "ne" | "sw" | "se";

/** Esquina opuesta a cada tirador (queda FIJA al redimensionar). (R4) */
const OPPOSITE_HANDLE: Record<SignatureHandle, SignatureHandle> = {
  nw: "se",
  ne: "sw",
  sw: "ne",
  se: "nw",
};

/** Coordenadas PDF (y-arriba) de las 4 esquinas de una `FreePlacement`. */
function boxCorners(box: FreePlacement): Record<SignatureHandle, PdfPoint> {
  return {
    sw: { x: box.x, y: box.y },
    se: { x: box.x + box.width, y: box.y },
    nw: { x: box.x, y: box.y + box.height },
    ne: { x: box.x + box.width, y: box.y + box.height },
  };
}

/**
 * Ancla exacta `at` + aspecto preservado a un ancho objetivo: `width ===
 * targetWidthPts` y `height === imageHeight * (targetWidthPts / imageWidth)`.
 * Sin ajuste a rejilla. Función pura. (R1)
 */
export function computeSignatureBox(
  imageWidth: number,
  imageHeight: number,
  at: PdfPoint,
  targetWidthPts: number,
): FreePlacement {
  return {
    x: at.x,
    y: at.y,
    width: targetWidthPts,
    height: imageHeight * (targetWidthPts / imageWidth),
  };
}

/**
 * Traslado INMUTABLE de la caja por `(dx, dy)`: `x`/`y` desplazados,
 * `width`/`height` intactos. No muta la entrada. (R2)
 */
export function moveSignatureBox(
  box: FreePlacement,
  dx: number,
  dy: number,
): FreePlacement {
  return {
    x: box.x + dx,
    y: box.y + dy,
    width: box.width,
    height: box.height,
  };
}

/**
 * Redimensiona arrastrando `handle` hasta `to`, con la esquina opuesta FIJA
 * (R4), relación de aspecto `width / height === aspectRatio` preservada (R3) y
 * clamps que garantizan `width >= minSize` y `height >= minSize` (R5). Inmutable.
 */
export function resizeSignatureBox(
  box: FreePlacement,
  handle: SignatureHandle,
  to: PdfPoint,
  aspectRatio: number,
  minSize: number,
): FreePlacement {
  const fixed = boxCorners(box)[OPPOSITE_HANDLE[handle]];

  // Ancho/alto brutos según el puntero; se expanden para CUBRIR y luego se
  // fuerzan al aspecto (height = width / aspectRatio).
  const rawWidth = Math.abs(to.x - fixed.x);
  const rawHeight = Math.abs(to.y - fixed.y);
  let width = Math.max(rawWidth, rawHeight * aspectRatio);

  // Clamp preservando el aspecto: garantiza ambos lados >= minSize. (R5)
  const minWidth = Math.max(minSize, minSize * aspectRatio);
  width = Math.max(width, minWidth);
  const height = width / aspectRatio;

  // La caja crece desde la esquina fija hacia la dirección del tirador.
  const dirX = to.x >= fixed.x ? 1 : -1;
  const dirY = to.y >= fixed.y ? 1 : -1;
  const cornerX = fixed.x + dirX * width;
  const cornerY = fixed.y + dirY * height;

  return {
    x: Math.min(fixed.x, cornerX),
    y: Math.min(fixed.y, cornerY),
    width,
    height,
  };
}

/**
 * Puente firma → anotaciones: por cada índice de `pageIndices`, una anotación
 * `image` con la geometría de `placement` y `data === image` (R6, R7) y, por
 * cada extra, una anotación `text` con su `text`/`at`/`fontSize`/`color` (R8).
 * Con `extras` vacío, solo devuelve imágenes (R9). Sin React/DOM. Puro.
 */
export function buildSignatureAnnotations(
  placement: FreePlacement,
  image: Uint8Array,
  pageIndices: readonly number[],
  extras: readonly SignatureExtra[],
  makeId: (pageIndex: number, part: string) => string,
): Annotation[] {
  const annotations: Annotation[] = [];
  for (const pageIndex of pageIndices) {
    annotations.push({
      id: makeId(pageIndex, "image"),
      pageIndex,
      kind: "image",
      at: { x: placement.x, y: placement.y },
      width: placement.width,
      height: placement.height,
      data: image,
    });
    for (const extra of extras) {
      annotations.push({
        id: makeId(pageIndex, extra.id),
        pageIndex,
        kind: "text",
        at: { x: extra.at.x, y: extra.at.y },
        text: extra.text,
        fontSize: extra.fontSize,
        color: extra.color,
      });
    }
  }
  return annotations;
}

/** Fecha determinista `AAAA-MM-DD` (UTC, independiente de la zona horaria). (R10) */
export function formatSignatureDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Herramienta de firma unificada (#36). Modelo de LISTA de firmas colocadas:
// varias firmas independientes que se añaden/mueven/redimensionan/eliminan y se
// aplican a N páginas en UNA sola exportación. Operaciones puras, inmutables,
// sin React ni DOM. La conversión firma → anotaciones REUTILIZA
// `buildSignatureAnnotations` (ya testeado en #30). (R1–R10)
// ---------------------------------------------------------------------------

/**
 * Firma colocada e independiente: su imagen, su caja en puntos PDF, su relación
 * de aspecto intrínseca, las páginas donde aparece y los extras opcionales.
 */
export interface PlacedSignature {
  /** Identificador estable de esta firma dentro de la lista. */
  id: string;
  /** Bytes de la imagen de firma (JPG o PNG). */
  image: Uint8Array;
  /** Caja de colocación en puntos PDF (origen inferior-izquierdo). */
  box: FreePlacement;
  /** Relación de aspecto intrínseca (`width / height`) para redimensionar. */
  aspectRatio: number;
  /** Índices 0-indexados de las páginas donde se coloca la firma. */
  pageIndices: readonly number[];
  /** Elementos opcionales colocables junto a la firma (fecha/texto). */
  extras?: readonly SignatureExtra[];
}

/**
 * Añade `sig` al final de la lista, devolviendo una lista NUEVA
 * (`length + 1`) sin mutar `list`. (R1)
 */
export function addPlacedSignature(
  list: readonly PlacedSignature[],
  sig: PlacedSignature,
): PlacedSignature[] {
  return [...list, sig];
}

/**
 * Reemplaza la `box` ÚNICAMENTE de la entrada con ese `id`, devolviendo una
 * lista NUEVA sin mutar `list` ni el resto de entradas. (R2)
 */
export function updatePlacedSignatureBox(
  list: readonly PlacedSignature[],
  id: string,
  box: FreePlacement,
): PlacedSignature[] {
  return list.map((sig) => (sig.id === id ? { ...sig, box } : sig));
}

/**
 * Reemplaza los `pageIndices` ÚNICAMENTE de la entrada con ese `id`, devolviendo
 * una lista NUEVA sin mutar `list` ni el resto de entradas. (R3)
 */
export function updatePlacedSignaturePages(
  list: readonly PlacedSignature[],
  id: string,
  pageIndices: readonly number[],
): PlacedSignature[] {
  return list.map((sig) => (sig.id === id ? { ...sig, pageIndices } : sig));
}

/**
 * Quita la entrada de ese `id`, devolviendo una lista NUEVA con el resto de
 * entradas intactas y sin mutar `list`. (R4)
 */
export function removePlacedSignature(
  list: readonly PlacedSignature[],
  id: string,
): PlacedSignature[] {
  return list.filter((sig) => sig.id !== id);
}

/**
 * Hit-test de selección: devuelve el `id` de la ÚLTIMA firma de `list` (la
 * superior en orden de dibujo) cuya `box` contiene `point`, o `null` si ninguna
 * caja lo contiene. (R5)
 */
export function findSignatureAt(
  list: readonly PlacedSignature[],
  point: PdfPoint,
): string | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const { box } = list[i];
    if (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    ) {
      return list[i].id;
    }
  }
  return null;
}

/**
 * Puente lista de firmas → anotaciones para UNA sola exportación. Por cada firma
 * de `list` reutiliza `buildSignatureAnnotations` (ya testeado en #30): una
 * anotación `image` por página con la geometría de su `box` y sus bytes (R7),
 * correspondientemente distinta por firma (R8), una por cada `pageIndex` (R9), y
 * una anotación `text` por página y extra (R10). Concatena en orden. Pura.
 */
export function buildPlacedSignatureAnnotations(
  list: readonly PlacedSignature[],
  makeId: (signatureId: string, pageIndex: number, part: string) => string,
): Annotation[] {
  const annotations: Annotation[] = [];
  for (const sig of list) {
    annotations.push(
      ...buildSignatureAnnotations(
        sig.box,
        sig.image,
        sig.pageIndices,
        sig.extras ?? [],
        (pageIndex, part) => makeId(sig.id, pageIndex, part),
      ),
    );
  }
  return annotations;
}
