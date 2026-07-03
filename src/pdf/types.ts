/** Callback de progreso de una operación. Valor en [0, 1]. */
export type ProgressCallback = (progress: number) => void;

/**
 * Error base de toda operación de worker. Las herramientas (#5+) derivan sus
 * errores de aquí para que el `name` cruce el límite del worker y la UI lo mapee
 * a un mensaje legible.
 */
export class PdfWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfWorkerError";
  }
}

/** Error de la operación trivial `probe`, para testear la propagación. */
export class ProbeFailedError extends PdfWorkerError {
  constructor(message = "La operación de prueba falló deliberadamente.") {
    super(message);
    this.name = "ProbeFailedError";
  }
}

/** Uno de los PDFs de entrada no es un PDF válido/cargable. (R9) */
export class InvalidPdfError extends PdfWorkerError {
  constructor(message = "Uno de los archivos no es un PDF válido.") {
    super(message);
    this.name = "InvalidPdfError";
  }
}

/** La unión no puede completarse (p. ej. menos de 2 PDFs). (R10) */
export class MergeFailedError extends PdfWorkerError {
  constructor(message = "No se pudo unir los PDFs.") {
    super(message);
    this.name = "MergeFailedError";
  }
}

/** La especificación de rangos está vacía, mal formada o fuera de límites. (R12) */
export class InvalidRangeError extends PdfWorkerError {
  constructor(message = "El rango de páginas no es válido.") {
    super(message);
    this.name = "InvalidRangeError";
  }
}

/** La división no puede completarse (p. ej. el PDF no tiene páginas). (R13) */
export class SplitFailedError extends PdfWorkerError {
  constructor(message = "No se pudo dividir el PDF.") {
    super(message);
    this.name = "SplitFailedError";
  }
}

/** El ángulo de rotación no es un múltiplo válido de 90. (R9) */
export class InvalidRotationError extends PdfWorkerError {
  constructor(message = "El ángulo de rotación no es válido.") {
    super(message);
    this.name = "InvalidRotationError";
  }
}

/** La rotación no puede completarse (p. ej. el PDF no tiene páginas). (R10) */
export class RotateFailedError extends PdfWorkerError {
  constructor(message = "No se pudo rotar el PDF.") {
    super(message);
    this.name = "RotateFailedError";
  }
}

/**
 * La organización no puede completarse: el PDF tiene 0 páginas o no se conserva
 * ninguna (todas marcadas para eliminar). (R23)
 */
export class OrganizeFailedError extends PdfWorkerError {
  constructor(message = "No se pudo organizar el PDF.") {
    super(message);
    this.name = "OrganizeFailedError";
  }
}

/** Algún índice del orden de páginas está fuera de rango. (R24) */
export class InvalidPageOrderError extends PdfWorkerError {
  constructor(message = "El orden de páginas no es válido.") {
    super(message);
    this.name = "InvalidPageOrderError";
  }
}

/** Una imagen de entrada no es un JPG/PNG válido o incrustable. (R27, R28) */
export class InvalidImageError extends PdfWorkerError {
  constructor(message = "Una de las imágenes no es válida.") {
    super(message);
    this.name = "InvalidImageError";
  }
}

/** La conversión a PDF no puede completarse (p. ej. lista vacía). (R29, R30) */
export class ImagesToPdfFailedError extends PdfWorkerError {
  constructor(message = "No se pudo crear el PDF a partir de las imágenes.") {
    super(message);
    this.name = "ImagesToPdfFailedError";
  }
}

/**
 * La numeración no puede completarse: el PDF tiene 0 páginas o las opciones
 * numéricas (startNumber/fontSize) no son válidas. (R26, R27)
 */
export class PageNumbersFailedError extends PdfWorkerError {
  constructor(message = "No se pudo añadir la numeración al PDF.") {
    super(message);
    this.name = "PageNumbersFailedError";
  }
}

/**
 * La marca de agua no puede completarse: el PDF tiene 0 páginas, o la opacidad,
 * el ángulo, el texto o el tamaño de fuente no son válidos. (R36, R37)
 */
export class WatermarkFailedError extends PdfWorkerError {
  constructor(message = "No se pudo añadir la marca de agua al PDF.") {
    super(message);
    this.name = "WatermarkFailedError";
  }
}

/** La compresión no puede completarse (p. ej. nivel de calidad inválido). (R16) */
export class CompressFailedError extends PdfWorkerError {
  constructor(message = "No se pudo comprimir el PDF.") {
    super(message);
    this.name = "CompressFailedError";
  }
}

/**
 * El aplanado de anotaciones no puede completarse: la lista de anotaciones está
 * vacía o alguna referencia un índice de página fuera del rango del documento.
 * (R30, R31)
 */
export class AnnotateFailedError extends PdfWorkerError {
  constructor(message = "No se pudo aplanar las anotaciones en el PDF.") {
    super(message);
    this.name = "AnnotateFailedError";
  }
}

/** La contraseña aportada para desbloquear el PDF es incorrecta. (R13) */
export class IncorrectPasswordError extends PdfWorkerError {
  constructor(message = "La contraseña es incorrecta.") {
    super(message);
    this.name = "IncorrectPasswordError";
  }
}

/**
 * Proteger/desbloquear no puede completarse: la contraseña está vacía o el modo
 * no es válido. (R2, R3)
 */
export class ProtectFailedError extends PdfWorkerError {
  constructor(message = "No se pudo proteger o desbloquear el PDF.") {
    super(message);
    this.name = "ProtectFailedError";
  }
}

/**
 * Firmar (firma visual) no puede completarse: `pageIndex` fuera del rango del
 * documento o `widthPts` no finito o menor o igual que 0. (R5, R8)
 */
export class SignFailedError extends PdfWorkerError {
  constructor(message = "No se pudo firmar el PDF.") {
    super(message);
    this.name = "SignFailedError";
  }
}

/**
 * Rellenar el formulario no puede completarse: un relleno referencia un campo
 * inexistente, o una opción de radio/dropdown fuera de las opciones del campo.
 * (R12, R13)
 */
export class FillFormFailedError extends PdfWorkerError {
  constructor(message = "No se pudo rellenar el formulario.") {
    super(message);
    this.name = "FillFormFailedError";
  }
}

/**
 * El OCR no puede completarse: la lista de páginas está vacía o el idioma
 * solicitado no pertenece a `OCR_LANGUAGES`. (R7, R8, R25)
 */
export class OcrFailedError extends PdfWorkerError {
  constructor(message = "No se pudo reconocer el texto del PDF.") {
    super(message);
    this.name = "OcrFailedError";
  }
}

/**
 * La redacción no puede completarse: no se proporcionó ninguna página redactada,
 * o alguna referencia un índice de página fuera del rango del documento o
 * repetido. (R12, R13)
 */
export class RedactFailedError extends PdfWorkerError {
  constructor(message = "No se pudo redactar el PDF.") {
    super(message);
    this.name = "RedactFailedError";
  }
}
