# clientpdf

Suite de herramientas PDF **100% local**. Une, divide, rota, convierte y protege
tus PDF directamente en el navegador: **tus archivos nunca salen de tu equipo**.

- **Sin backend.** Todo el procesamiento ocurre en tu navegador. Ningún archivo,
  contraseña ni contenido se envía a ningún servidor.
- **Sin registro.** No hay cuentas ni seguimiento.
- **Funciona offline.** Una vez cargada, la app no necesita conexión.

## Stack

TypeScript + React + Vite + Tailwind CSS. Las operaciones pesadas de PDF se
ejecutan en Web Workers para no bloquear la interfaz.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm run build      # build de producción (con typecheck)
npm run test       # tests (Vitest, modo no-watch)
npm run typecheck  # comprobación de tipos
```

## Uso offline / PWA

clientpdf es una **PWA instalable** que funciona **offline** tras la primera
carga. Un **service worker** (generado por `vite-plugin-pwa`/Workbox) precachea
el shell de la app y todos sus assets propios (incluido el worker de pdf.js y
cualquier WASM). No hay `runtimeCaching` ni red en tiempo de ejecución: el
service worker **solo** sirve assets estáticos del propio origen y **nunca**
cachea ni envía archivos del usuario.

### Smoke manual (verificación end-to-end)

El service worker solo se genera y activa en build de producción (en
`npm run dev` está deshabilitado). Para verificar el comportamiento **offline**:

1. `npm run build && npm run preview` y abre la URL del preview en un navegador
   con soporte PWA (Chrome/Edge).
2. Comprueba que aparece el icono de **instalar** en la barra de direcciones e
   instala la app (debe abrir en ventana `standalone`).
3. Activa **DevTools → Network → Offline** (o desconecta la red) y **recarga**:
   la app DEBE seguir abriendo y navegar entre rutas sin error (shell servido
   por el service worker).
4. Estando **offline**, usa una herramienta (p. ej. *Unir PDF*): carga 2 PDFs,
   une y descarga el resultado. DEBE funcionar sin conexión (todo el procesado
   es local en el Web Worker; los assets ya están precacheados).
5. En **DevTools → Application → Service Workers** confirma que hay un service
   worker activo, y en **Cache Storage** que solo hay assets del propio origen
   (sin peticiones salientes con datos del usuario).

## Licencia

MIT. Ver [LICENSE](./LICENSE).
