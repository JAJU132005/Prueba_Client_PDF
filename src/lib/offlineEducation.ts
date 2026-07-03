/**
 * Copy centralizado de la capa de educación PWA (#22). Fuente única de texto,
 * testable, para el badge de privacidad, el aviso de primera visita, el modal
 * de ayuda y el indicador de conexión. No hace red ni toca almacenamiento.
 */

/** Cadena del badge de confianza del Header, reutilizada por la ayuda. (R12) */
export const PRIVACY_BADGE_TEXT = "100% local";

/** Texto exacto del aviso de primera visita. (R1) */
export const BANNER_MESSAGE =
  "Funciona sin internet · instálala para usarla offline";

/** Pasos de instalación en escritorio. (R7) */
export const INSTALL_STEPS_DESKTOP: readonly string[] = [
  "Abre el menú del navegador o busca el icono de instalar en la barra de direcciones.",
  "Elige «Instalar clientpdf» (o «Instalar aplicación»).",
  "Confirma la instalación; la app quedará disponible como ventana propia.",
];

/** Pasos de instalación en móvil. (R8) */
export const INSTALL_STEPS_MOBILE: readonly string[] = [
  "Abre el menú del navegador (⋮ o el icono de compartir).",
  "Pulsa «Añadir a pantalla de inicio» o «Instalar aplicación».",
  "Confirma; el icono de clientpdf aparecerá en tu pantalla de inicio.",
];

/** Pasos para usar la app sin conexión. (R9) */
export const OFFLINE_USAGE_STEPS: readonly string[] = [
  "Abre clientpdf al menos una vez con conexión para que se guarde en tu dispositivo.",
  "Después podrás abrirla sin internet: las herramientas siguen funcionando.",
  "Todo el procesamiento ocurre en tu navegador; tus archivos no se envían a ningún servidor.",
];

/** Etiqueta del estado en línea del indicador. (R17) */
export const ONLINE_LABEL = "En línea";

/** Etiqueta del estado sin conexión del indicador. (R16) */
export const OFFLINE_LABEL = "Sin conexión";

/** Mensaje tranquilizador cuando no hay conexión. (R16) */
export const OFFLINE_REASSURANCE =
  "Sin conexión: la app sigue funcionando en tu navegador";

/** Recordatorio breve de privacidad reutilizado en la ayuda. (R12) */
export const PRIVACY_REMINDER =
  "Recuerda: el procesamiento es 100% local, tus archivos nunca salen de tu navegador.";
