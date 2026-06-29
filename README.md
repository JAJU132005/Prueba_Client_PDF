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

## Licencia

MIT. Ver [LICENSE](./LICENSE).
