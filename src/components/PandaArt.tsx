/**
 * Biblioteca de ilustraciones SVG "El Diario del Panda" — port React del web
 * component `design-incoming/shared/panda-art.js`. Presentación pura: sin
 * lógica de dominio, sin red. Los colores salen de los tokens CSS
 * (var(--ink), var(--card), …) para funcionar en cuaderno y pizarra.
 * El markup interno es estático (nunca contiene datos del usuario), por lo
 * que su inyección vía dangerouslySetInnerHTML es segura.
 */

const INK = "var(--ink,#2d2a26)";
const PAPER = "var(--card,#fffdf6)";
const SOFT = "var(--ink-soft,#8a857b)";
const RED = "var(--mk-red,#d84438)";
const ORANGE = "var(--mk-orange,#d0821a)";
const GREEN = "#8fd14f";
const GREEND = "#4c7a2c";
const HAND = "font-family:'Gochi Hand',cursive";

function at(x: number, y: number, s: number, inner: string): string {
  return `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`;
}

interface HeadOptions {
  sleep?: boolean;
  shades?: boolean;
  look?: "left" | "right" | "up";
  mouth?: string;
  tongue?: boolean;
  beret?: boolean;
  sherlock?: boolean;
  cap?: boolean;
  tilt?: number;
}

/** Cabeza de panda (centrada en 0,0; ~36px de ancho a escala 1). */
function head(o: HeadOptions = {}): string {
  let eyes: string;
  if (o.sleep) {
    eyes =
      '<path d="M-9 0 q2.5 3 5 0 M4 0 q2.5 3 5 0" fill="none" stroke="var(--panda-eye,#fff)" stroke-width="1.8" stroke-linecap="round"/>';
  } else if (o.shades) {
    eyes =
      '<rect x="-12" y="-4" width="10.5" height="7.5" rx="3" fill="#15130f"/><rect x="1.5" y="-4" width="10.5" height="7.5" rx="3" fill="#15130f"/><line x1="-1.5" y1="-1" x2="1.5" y2="-1" stroke="#15130f" stroke-width="2"/>';
  } else {
    const px = o.look === "left" ? -1.2 : o.look === "right" ? 1.2 : 0;
    const py = o.look === "up" ? -1 : 0.4;
    eyes =
      `<circle cx="-6.5" cy="0" r="2.9" fill="var(--panda-eye,#fff)"/><circle cx="6.5" cy="0" r="2.9" fill="var(--panda-eye,#fff)"/>` +
      `<circle cx="${-6.5 + px}" cy="${py}" r="1.6" fill="${INK}"/>` +
      `<circle cx="${6.5 + px}" cy="${py}" r="1.6" fill="${INK}"/>`;
  }
  const mouth = o.mouth || "M-4 9 Q0 12.5 4 9";
  let extras = "";
  if (o.tongue) {
    extras += `<path d="M1 10.5 q2.5 4.5 4.5 1.5 q.8 -1.8 -1.2 -2.6z" fill="#e58a8a" stroke="${INK}" stroke-width="1"/>`;
  }
  if (o.beret) {
    extras += `<path d="M-14 -13 Q0 -24 14 -13 Q0 -17 -14 -13z" fill="#3b5da8" stroke="${INK}" stroke-width="1.6"/><circle cx="0" cy="-19" r="2" fill="#3b5da8" stroke="${INK}" stroke-width="1.2"/>`;
  }
  if (o.sherlock) {
    extras += `<path d="M-15 -12 L0 -26 L15 -12 Q0 -18 -15 -12z" fill="#e8dcc0" stroke="${INK}" stroke-width="1.6"/><line x1="-15" y1="-12" x2="15" y2="-12" stroke="${INK}" stroke-width="1.6"/>`;
  }
  if (o.cap) {
    extras += `<path d="M-13 -13 Q0 -21 13 -13 L16 -10 L10 -12 Q0 -18 -13 -13z" fill="#d8b23a" stroke="${INK}" stroke-width="1.4"/>`;
  }
  return (
    `<g transform="rotate(${o.tilt || 0})">` +
    `<circle cx="-13" cy="-12" r="6.5" fill="${INK}"/><circle cx="13" cy="-12" r="6.5" fill="${INK}"/>` +
    `<ellipse cx="0" cy="0" rx="17.5" ry="15.5" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>` +
    `<ellipse cx="-6.5" cy="0" rx="5.6" ry="7" fill="${INK}" transform="rotate(-12 -6.5 0)"/>` +
    `<ellipse cx="6.5" cy="0" rx="5.6" ry="7" fill="${INK}" transform="rotate(12 6.5 0)"/>` +
    eyes +
    `<ellipse cx="0" cy="6" rx="2.6" ry="1.9" fill="${INK}"/>` +
    `<path d="${mouth}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` +
    extras +
    "</g>"
  );
}

function body(extra?: string): string {
  return `<ellipse cx="0" cy="0" rx="15" ry="12.5" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>${extra || ""}`;
}

function limb(x1: number, y1: number, x2: number, y2: number, w?: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w || 6}" stroke-linecap="round"/>`;
}

/** Panda de pie: origen = centro del cuerpo. armL/armR sobreescriben brazos. */
function panda(
  x: number,
  y: number,
  s: number,
  ho?: HeadOptions,
  armL?: string | null,
  armR?: string | null,
): string {
  const inner =
    limb(-7, 6, -10, 20) +
    limb(7, 6, 10, 20) +
    body() +
    (armL || limb(-11, -3, -19, 5)) +
    (armR || limb(11, -3, 19, 5)) +
    at(0, -23, 1, head(ho || {}));
  return at(x, y, s, inner);
}

function sweat(x: number, y: number): string {
  return `<path d="M${x} ${y} q3.4 5.5 0 7.5 q-3.4 -2 0 -7.5z" fill="#a9d8f0" stroke="#4a90b8" stroke-width="1.2"/>`;
}

function paper(
  x: number,
  y: number,
  w: number,
  h: number,
  rot?: number,
  lines?: number | null,
  extra?: string,
): string {
  let g = `<rect width="${w}" height="${h}" rx="3" fill="var(--surface,#fff)" stroke="${INK}" stroke-width="2.4"/>`;
  const n = lines == null ? 4 : lines;
  for (let i = 1; i <= n; i++) {
    g += `<line x1="${w * 0.14}" y1="${(h * i) / (n + 1)}" x2="${w * 0.86}" y2="${(h * i) / (n + 1)}" stroke="#cfc9bb" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  return `<g transform="translate(${x} ${y}) rotate(${rot || 0})">${g}${extra || ""}</g>`;
}

function ono(
  x: number,
  y: number,
  txt: string,
  color?: string,
  size?: number,
  rot?: number,
): string {
  return `<text x="${x}" y="${y}" style="${HAND};font-size:${size || 20}px" fill="${color || ORANGE}" transform="rotate(${rot || -6} ${x} ${y})">${txt}</text>`;
}

function tape(x: number, y: number, rot?: number): string {
  return `<rect x="${x}" y="${y}" width="26" height="9" rx="1.5" fill="rgba(255,222,116,.85)" stroke="rgba(0,0,0,.15)" stroke-width="1" transform="rotate(${rot || -8} ${x} ${y})"/>`;
}

function bamboo(x: number, y: number, h: number): string {
  let g = `<rect x="-3.5" y="0" width="7" height="${h}" rx="3" fill="${GREEN}" stroke="${GREEND}" stroke-width="1.6"/>`;
  for (let i = 1; i < h / 16; i++) {
    g += `<line x1="-3.5" y1="${i * 16}" x2="3.5" y2="${i * 16}" stroke="${GREEND}" stroke-width="1.6"/>`;
  }
  g += `<ellipse cx="-8" cy="-2" rx="8" ry="3" fill="${GREEN}" transform="rotate(-30 -8 -2)"/><ellipse cx="8" cy="-3" rx="7" ry="2.6" fill="${GREEN}" transform="rotate(26 8 -3)"/>`;
  return at(x, y, 1, g);
}

export type PandaArtKind =
  | "pose-ligera"
  | "pose-media"
  | "pose-pesada"
  | "portada"
  | "nube"
  | "comic1"
  | "comic2"
  | "comic3"
  | "trituradora"
  | "unir"
  | "dividir"
  | "rotar"
  | "organizar"
  | "pdf-a-imagenes"
  | "imagenes-a-pdf"
  | "numeros"
  | "marca-de-agua"
  | "comprimir"
  | "proteger"
  | "firmar"
  | "rellenar"
  | "redactar"
  | "editar"
  | "ocr";

interface ArtDefinition {
  vb: string;
  svg: () => string;
}

const ART: Record<PandaArtKind, ArtDefinition> = {
  /* ---------- POSES DE NIVEL (badges) ---------- */
  "pose-ligera": {
    vb: "0 0 96 66",
    svg: () =>
      limb(20, 58, 62, 30, 4) +
      limb(20, 30, 62, 58, 4) +
      limb(14, 40, 70, 40, 4) +
      at(
        40,
        34,
        0.85,
        `<ellipse cx="0" cy="4" rx="15" ry="12" fill="${PAPER}" stroke="${INK}" stroke-width="2.6" transform="rotate(-18)"/>` +
          limb(-10, 12, -20, 20) +
          limb(2, 14, -6, 24) +
          limb(10, 0, 24, 2) +
          at(-8, -17, 1, head({ tilt: -14, mouth: "M-4 9 Q0 12 4 9" })),
      ) +
      at(
        74,
        44,
        1,
        `<rect x="-5" y="-8" width="10" height="16" rx="2" fill="#fdf3b8" stroke="${INK}" stroke-width="1.8"/><line x1="1" y1="-8" x2="6" y2="-20" stroke="${GREEND}" stroke-width="2.4" stroke-linecap="round"/>`,
      ) +
      `<text x="6" y="14" style="${HAND};font-size:11px" fill="${SOFT}">ahhh…</text>`,
  },
  "pose-media": {
    vb: "0 0 96 66",
    svg: () =>
      `<path d="M8 30 h14 M6 40 h12" stroke="${SOFT}" stroke-width="2.4" stroke-linecap="round"/>` +
      at(
        52,
        38,
        0.85,
        limb(-6, 8, -16, 18) +
          limb(6, 8, 16, 14) +
          `<ellipse cx="0" cy="0" rx="15" ry="12.5" fill="${PAPER}" stroke="${INK}" stroke-width="2.6" transform="rotate(8)"/>` +
          limb(-10, -6, -22, -2) +
          limb(10, -4, 20, -12) +
          at(8, -22, 1, head({ tilt: 10, tongue: true, mouth: "M-4 9 Q0 11 4 9" })),
      ) +
      sweat(76, 10),
  },
  "pose-pesada": {
    vb: "0 0 96 66",
    svg: () =>
      `<path d="M28 6 q-3 -4 0 -7 M68 6 q3 -4 0 -7" stroke="${SOFT}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      limb(22, 14, 74, 14, 5) +
      `<circle cx="20" cy="14" r="9" fill="${INK}"/><circle cx="76" cy="14" r="9" fill="${INK}"/>` +
      at(
        48,
        44,
        0.85,
        limb(-7, 8, -10, 20) +
          limb(7, 8, 10, 20) +
          body() +
          limb(-10, -6, -16, -26) +
          limb(10, -6, 16, -26) +
          at(0, -23, 1, head({ mouth: "M-4 11 Q0 8.5 4 11" })),
      ) +
      `<path d="M14 34 l-4 3 M82 34 l4 3" stroke="${SOFT}" stroke-width="2" stroke-linecap="round"/>`,
  },

  /* ---------- PORTADA / HERO ---------- */
  portada: {
    vb: "0 0 360 240",
    svg: () => {
      let spiral = "";
      for (let i = 0; i < 8; i++) {
        spiral += `<circle cx="78" cy="${48 + i * 22}" r="5" fill="none" stroke="${INK}" stroke-width="2.4"/>`;
      }
      return (
        `<rect x="70" y="30" width="220" height="185" rx="10" fill="${PAPER}" stroke="${INK}" stroke-width="3.5"/>` +
        `<line x1="92" y1="30" x2="92" y2="215" stroke="${INK}" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"/>` +
        spiral +
        tape(252, 26, 10) +
        `<text x="185" y="82" text-anchor="middle" style="${HAND};font-size:29px" fill="${INK}">Mi diario</text>` +
        `<text x="185" y="110" text-anchor="middle" style="${HAND};font-size:16px" fill="${SOFT}">(y el de mis PDF)</text>` +
        `<path d="M185 128 q22 -3 44 0" stroke="${RED}" stroke-width="3" fill="none" stroke-linecap="round" transform="translate(-22 0)"/>` +
        at(
          276,
          128,
          1,
          `<path d="M-8 0 v-9 a8 8 0 0 1 16 0 v9" fill="none" stroke="${INK}" stroke-width="3.4"/>` +
            `<rect x="-13" y="0" width="26" height="22" rx="5" fill="#d8b23a" stroke="${INK}" stroke-width="2.8"/>` +
            `<circle cx="0" cy="10" r="5" fill="none" stroke="${INK}" stroke-width="2.2"/><line x1="0" y1="10" x2="3" y2="6" stroke="${INK}" stroke-width="2"/>`,
        ) +
        panda(140, 185, 1.15, { look: "right" }, limb(-11, -3, -20, -18), null) +
        `<text x="94" y="152" style="${HAND};font-size:15px" fill="${SOFT}" transform="rotate(-4 94 152)">¡hola!</text>` +
        bamboo(322, 150, 66)
      );
    },
  },
  nube: {
    vb: "0 0 200 110",
    svg: () =>
      `<g fill="${PAPER}" stroke="${INK}" stroke-width="3">` +
      `<circle cx="62" cy="62" r="26"/><circle cx="100" cy="46" r="32"/><circle cx="140" cy="64" r="24"/><rect x="52" y="58" width="98" height="30" rx="14"/></g>` +
      `<circle cx="88" cy="52" r="3" fill="${INK}"/><circle cx="112" cy="52" r="3" fill="${INK}"/>` +
      `<path d="M92 66 q8 -6 16 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<line x1="34" y1="18" x2="168" y2="96" stroke="${RED}" stroke-width="7" stroke-linecap="round"/>` +
      `<line x1="168" y1="18" x2="34" y2="96" stroke="${RED}" stroke-width="7" stroke-linecap="round"/>`,
  },

  /* ---------- CÓMIC ---------- */
  comic1: {
    vb: "0 0 300 150",
    svg: () =>
      `<rect x="176" y="24" width="86" height="112" rx="4" fill="none" stroke="${INK}" stroke-width="3.4"/>` +
      `<rect x="186" y="32" width="66" height="104" fill="${PAPER}" stroke="${INK}" stroke-width="2.6" transform="skewY(-4)"/>` +
      `<circle cx="242" cy="90" r="3.5" fill="${INK}"/>` +
      `<text x="219" y="16" text-anchor="middle" style="${HAND};font-size:13px" fill="${SOFT}">tu navegador</text>` +
      paper(
        46,
        50,
        54,
        68,
        -4,
        3,
        `<circle cx="20" cy="24" r="2.4" fill="${INK}"/><circle cx="34" cy="24" r="2.4" fill="${INK}"/><path d="M21 34 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
      ) +
      `<path d="M112 84 h44 m-10 -8 l10 8 l-10 8" fill="none" stroke="${GREEND}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  comic2: {
    vb: "0 0 300 150",
    svg: () =>
      `<rect x="88" y="38" width="124" height="100" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="3.6"/>` +
      `<rect x="100" y="50" width="100" height="76" rx="5" fill="none" stroke="${INK}" stroke-width="2.2"/>` +
      `<circle cx="150" cy="88" r="17" fill="none" stroke="${INK}" stroke-width="3"/>` +
      `<line x1="150" y1="88" x2="160" y2="78" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="104" cy="42" r="2.5" fill="${INK}"/><circle cx="196" cy="42" r="2.5" fill="${INK}"/><circle cx="104" cy="132" r="2.5" fill="${INK}"/><circle cx="196" cy="132" r="2.5" fill="${INK}"/>` +
      at(150, 26, 0.8, head({})) +
      `<text x="150" y="12" text-anchor="middle" style="${HAND};font-size:12px" fill="${SOFT}">panda de guardia</text>` +
      `<text x="248" y="80" style="${HAND};font-size:13px" fill="${SOFT}" transform="rotate(-5 248 80)">clic,</text>` +
      `<text x="248" y="98" style="${HAND};font-size:13px" fill="${SOFT}" transform="rotate(-5 248 98)">clic…</text>`,
  },
  comic3: {
    vb: "0 0 300 150",
    svg: () =>
      `<rect x="38" y="24" width="86" height="112" rx="4" fill="none" stroke="${INK}" stroke-width="3.4"/>` +
      `<rect x="48" y="32" width="66" height="104" fill="${PAPER}" stroke="${INK}" stroke-width="2.6" transform="skewY(4)"/>` +
      `<path d="M138 84 h44 m-10 -8 l10 8 l-10 8" fill="none" stroke="${GREEND}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
      paper(
        202,
        48,
        56,
        72,
        5,
        3,
        `<g transform="rotate(-14 28 30)"><rect x="6" y="22" width="44" height="16" rx="3" fill="none" stroke="${RED}" stroke-width="2.2"/>` +
          `<text x="28" y="34" text-anchor="middle" style="${HAND};font-size:10px" fill="${RED}">TOP SECRET</text></g>`,
      ) +
      `<text x="150" y="128" text-anchor="middle" style="${HAND};font-size:13px" fill="${SOFT}">sin servidores por ningún lado</text>`,
  },

  /* ---------- TRITURADORA ---------- */
  trituradora: {
    vb: "0 0 300 130",
    svg: () => {
      let conf = "";
      const cs = [GREEN, ORANGE, RED, GREEN, ORANGE, RED, GREEN];
      for (let i = 0; i < 7; i++) {
        conf += `<rect x="${108 + i * 14}" y="${96 + (i % 3) * 9}" width="7" height="7" fill="${cs[i]}" transform="rotate(${((i * 31) % 60) - 30} ${110 + i * 14} ${98 + (i % 3) * 9})"/>`;
      }
      return (
        paper(128, 6, 46, 34, -5, 2) +
        `<rect x="96" y="34" width="110" height="56" rx="9" fill="${PAPER}" stroke="${INK}" stroke-width="3.2"/>` +
        `<rect x="112" y="30" width="78" height="9" rx="4" fill="${INK}"/>` +
        `<circle cx="132" cy="58" r="3.2" fill="${INK}"/><circle cx="170" cy="58" r="3.2" fill="${INK}"/>` +
        `<path d="M136 70 q15 10 30 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` +
        conf +
        `<text x="228" y="66" style="${HAND};font-size:14px" fill="${SOFT}" transform="rotate(-5 228 66)">ñam ñam</text>`
      );
    },
  },

  /* ---------- ESCENAS DE LAS 15 HERRAMIENTAS ---------- */
  unir: {
    vb: "0 0 320 170",
    svg: () =>
      paper(36, 96, 64, 46, -3, 2) +
      paper(42, 84, 64, 46, 2, 2) +
      paper(48, 72, 64, 46, -1, 2) +
      at(
        180,
        118,
        1,
        `<rect x="-52" y="8" width="112" height="16" rx="8" fill="${INK}"/>` +
          `<g transform="rotate(-16 -46 8)"><rect x="-52" y="-10" width="106" height="15" rx="7" fill="${RED}" stroke="${INK}" stroke-width="2.6"/></g>` +
          `<rect x="-58" y="2" width="16" height="12" rx="4" fill="${INK}"/>`,
      ) +
      ono(196, 52, "¡CLACK!", ORANGE, 24, -8) +
      panda(276, 118, 1, { look: "left" }, limb(-11, -3, -24, -8), null) +
      `<rect x="60" y="88" width="12" height="4" rx="2" fill="${INK}" transform="rotate(-1 66 90)"/>`,
  },
  dividir: {
    vb: "0 0 320 170",
    svg: () =>
      paper(52, 24, 92, 122, -2, 5) +
      `<line x1="40" y1="88" x2="168" y2="82" stroke="${INK}" stroke-width="2.6" stroke-dasharray="7 7" stroke-linecap="round"/>` +
      at(
        190,
        84,
        1.15,
        `<line x1="-26" y1="-14" x2="26" y2="12" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
          `<line x1="-26" y1="12" x2="26" y2="-14" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
          `<circle cx="32" cy="16" r="7.5" fill="none" stroke="${INK}" stroke-width="3.4"/>` +
          `<circle cx="32" cy="-18" r="7.5" fill="none" stroke="${INK}" stroke-width="3.4"/>` +
          `<circle cx="-26" cy="-1" r="2.6" fill="${INK}"/>`,
      ) +
      ono(216, 40, "¡RAS!", ORANGE, 21, -10) +
      panda(272, 122, 0.95, { look: "left" }),
  },
  rotar: {
    vb: "0 0 320 170",
    svg: () => {
      let ticks = "";
      const marks: Array<[number, string]> = [
        [0, "90°"],
        [90, "180°"],
        [180, "270°"],
      ];
      for (const [deg, label] of marks) {
        const a = ((-90 + deg) * Math.PI) / 180;
        ticks += `<text x="${108 + Math.cos(a) * 52}" y="${88 + Math.sin(a) * 52 + 5}" text-anchor="middle" style="${HAND};font-size:14px" fill="${SOFT}">${label}</text>`;
      }
      return (
        `<circle cx="108" cy="88" r="36" fill="${PAPER}" stroke="${INK}" stroke-width="3.4"/>` +
        `<circle cx="108" cy="88" r="26" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="3 6"/>` +
        `<line x1="108" y1="88" x2="132" y2="68" stroke="${RED}" stroke-width="4.5" stroke-linecap="round"/>` +
        `<circle cx="108" cy="88" r="5" fill="${INK}"/>` +
        ticks +
        `<path d="M158 46 a52 52 0 0 1 30 26 m-2 -12 l2 12 l-12 0" fill="none" stroke="${GREEND}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
        panda(252, 116, 1.05, { tilt: 24, look: "left" }) +
        paper(216, 22, 44, 58, 24, 3)
      );
    },
  },
  organizar: {
    vb: "0 0 320 170",
    svg: () => {
      function pola(x: number, y: number, rot: number, cross: boolean): string {
        return (
          `<g transform="translate(${x} ${y}) rotate(${rot})">` +
          `<rect width="46" height="54" fill="var(--surface,#fff)" stroke="${INK}" stroke-width="2.2"/>` +
          `<rect x="5" y="5" width="36" height="34" fill="#cfc9bb"/>` +
          `<circle cx="23" cy="-1" r="4.5" fill="${RED}" stroke="${INK}" stroke-width="1.8"/>` +
          (cross
            ? `<line x1="4" y1="6" x2="42" y2="38" stroke="${RED}" stroke-width="4" stroke-linecap="round"/><line x1="42" y1="6" x2="4" y2="38" stroke="${RED}" stroke-width="4" stroke-linecap="round"/>`
            : "") +
          "</g>"
        );
      }
      return (
        `<rect x="24" y="20" width="188" height="128" rx="6" fill="#e6c48f" stroke="${INK}" stroke-width="3.2"/>` +
        `<rect x="32" y="28" width="172" height="112" rx="4" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2"/>` +
        pola(46, 44, -5, false) +
        pola(102, 40, 4, false) +
        pola(154, 48, -3, true) +
        panda(268, 112, 0.95, { tongue: true, look: "left" }, limb(-11, -3, -22, 2), limb(11, -3, 22, 2)) +
        `<rect x="244" y="118" width="48" height="26" rx="3" fill="#e6c48f" stroke="${INK}" stroke-width="2.4"/>` +
        sweat(296, 74)
      );
    },
  },
  "pdf-a-imagenes": {
    vb: "0 0 320 170",
    svg: () =>
      `<path d="M96 34 l10 -12 M88 40 l-14 -8 M106 44 l6 -14" stroke="${ORANGE}" stroke-width="3" stroke-linecap="round"/>` +
      at(
        150,
        78,
        1,
        `<rect x="-58" y="-26" width="116" height="60" rx="10" fill="${PAPER}" stroke="${INK}" stroke-width="3.2"/>` +
          `<circle cx="0" cy="4" r="20" fill="none" stroke="${INK}" stroke-width="3.2"/><circle cx="0" cy="4" r="10" fill="${INK}"/>` +
          `<rect x="-50" y="-20" width="18" height="10" rx="3" fill="${INK}"/>` +
          `<circle cx="44" cy="-12" r="5" fill="${RED}" stroke="${INK}" stroke-width="2"/>` +
          `<rect x="-34" y="34" width="68" height="7" rx="3" fill="${INK}"/>`,
      ) +
      `<g transform="translate(122 122) rotate(4)"><rect width="56" height="62" fill="var(--surface,#fff)" stroke="${INK}" stroke-width="2.4"/><rect x="6" y="6" width="44" height="40" fill="#cfc9bb"/><text x="28" y="58" text-anchor="middle" style="${HAND};font-size:11px" fill="${SOFT}">pág. 1</text></g>` +
      panda(258, 106, 1, { look: "left" }, limb(-11, -3, -26, -10), null) +
      ono(216, 34, "¡FLASH!", ORANGE, 20, -8),
  },
  "imagenes-a-pdf": {
    vb: "0 0 320 170",
    svg: () =>
      `<rect x="34" y="28" width="196" height="122" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="3.4"/>` +
      `<line x1="132" y1="28" x2="132" y2="150" stroke="${INK}" stroke-width="2.4"/>` +
      `<g transform="translate(52 48) rotate(-4)"><rect width="60" height="46" fill="#cfe6f2" stroke="${INK}" stroke-width="2.2"/><circle cx="16" cy="16" r="7" fill="#f2d24c"/><path d="M4 40 l16 -14 l12 8 l12 -12 l12 18z" fill="#7fb069"/></g>` +
      tape(48, 42, -14) +
      tape(96, 88, 8) +
      `<g transform="translate(148 56) rotate(3)"><rect width="60" height="46" fill="#f2dede" stroke="${INK}" stroke-width="2.2"/><circle cx="30" cy="20" r="10" fill="#e58a8a"/><path d="M22 38 q8 6 16 0" stroke="${INK}" stroke-width="2" fill="none"/></g>` +
      tape(144, 50, -10) +
      at(
        258,
        52,
        1,
        `<path d="M0 0 l-16 -10 v20z M0 0 l16 -10 v20z" fill="${RED}" stroke="${INK}" stroke-width="2"/><circle cx="0" cy="0" r="4.5" fill="${RED}" stroke="${INK}" stroke-width="2"/>`,
      ) +
      panda(272, 118, 0.95, { look: "left" }, limb(-11, -3, -24, -14), null),
  },
  numeros: {
    vb: "0 0 320 170",
    svg: () =>
      paper(
        48,
        30,
        104,
        118,
        -1,
        5,
        `<rect x="70" y="92" width="22" height="16" rx="3" fill="rgba(255,249,168,.9)" stroke="${INK}" stroke-width="1.8" transform="rotate(-3 81 100)"/>` +
          `<text x="81" y="104" text-anchor="middle" style="${HAND};font-size:12px" fill="${INK}">1</text>`,
      ) +
      at(
        196,
        84,
        1.1,
        `<rect x="-8" y="-38" width="16" height="20" rx="6" fill="${INK}"/>` +
          `<rect x="-14" y="-20" width="28" height="10" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="2.4"/>` +
          `<path d="M-14 -10 L-22 6 h44 L14 -10z" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>` +
          `<rect x="-22" y="6" width="44" height="8" rx="2" fill="${INK}"/>`,
      ) +
      ono(224, 40, "¡KA-CHUNK!", ORANGE, 21, -7) +
      panda(272, 122, 0.95, { look: "left" }, limb(-11, -3, -26, -16), null),
  },
  "marca-de-agua": {
    vb: "0 0 320 170",
    svg: () =>
      paper(
        44,
        24,
        110,
        126,
        -1,
        5,
        `<text x="55" y="72" text-anchor="middle" style="${HAND};font-size:15px" fill="#4a6a8a" opacity=".32" transform="rotate(-28 55 66)">CONFIDENCIAL</text>`,
      ) +
      at(
        206,
        66,
        1,
        `<rect x="-26" y="-12" width="52" height="22" rx="10" fill="#9db8d8" opacity=".75" stroke="${INK}" stroke-width="2.6"/>` +
          `<path d="M26 -1 h14 v24" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>` +
          `<rect x="34" y="23" width="12" height="26" rx="4" fill="${ORANGE}" stroke="${INK}" stroke-width="2.2"/>`,
      ) +
      panda(262, 124, 0.95, { cap: true, look: "left", mouth: "M-4 9 Q0 10.5 4 9" }, limb(-11, -3, -22, -22), null) +
      `<text x="180" y="140" style="${HAND};font-size:13px" fill="${SOFT}">~fssshh~</text>`,
  },
  comprimir: {
    vb: "0 0 320 170",
    svg: () => {
      let stack = "";
      for (let i = 0; i < 5; i++) {
        stack += `<rect x="${96 - i}" y="${118 - i * 9}" width="${128 + i * 2}" height="8" rx="3" fill="var(--surface,#fff)" stroke="${INK}" stroke-width="2"/>`;
      }
      return (
        stack +
        `<path d="M84 128 l-8 6 M244 128 l8 6 M88 108 l-9 2 M240 108 l9 2" stroke="${SOFT}" stroke-width="2.4" stroke-linecap="round"/>` +
        at(
          160,
          64,
          1.05,
          limb(-9, 6, -20, 12) +
            limb(9, 6, 20, 12) +
            body() +
            limb(-11, -4, -22, 4) +
            limb(11, -4, 22, 4) +
            at(0, -23, 1, head({ mouth: "M-4 10 Q0 8 4 10" })),
        ) +
        sweat(196, 30) +
        ono(232, 62, "¡CRONCH!", ORANGE, 20, -8) +
        at(52, 118, 1, `<path d="M0 20 l7 -20 M0 20 l-7 -20 M0 20 l0 -22" stroke="${SOFT}" stroke-width="2" stroke-linecap="round"/>`)
      );
    },
  },
  proteger: {
    vb: "0 0 320 170",
    svg: () =>
      `<rect x="52" y="30" width="150" height="116" rx="10" fill="${PAPER}" stroke="${INK}" stroke-width="3.4"/>` +
      `<line x1="70" y1="30" x2="70" y2="146" stroke="${INK}" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"/>` +
      `<text x="136" y="72" text-anchor="middle" style="${HAND};font-size:17px" fill="${INK}">querido PDF…</text>` +
      `<rect x="186" y="74" width="30" height="14" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>` +
      at(
        226,
        96,
        1.15,
        `<path d="M-9 0 v-10 a9 9 0 0 1 18 0 v10" fill="none" stroke="${INK}" stroke-width="3.6"/>` +
          `<rect x="-15" y="0" width="30" height="26" rx="6" fill="#d8b23a" stroke="${INK}" stroke-width="3"/>` +
          `<circle cx="0" cy="12" r="6.5" fill="none" stroke="${INK}" stroke-width="2.4"/>` +
          `<line x1="0" y1="12" x2="4" y2="7" stroke="${INK}" stroke-width="2.2"/>`,
      ) +
      panda(282, 122, 0.95, { look: "left", mouth: "M-4 9 Q0 10 4 9" }, limb(-11, -3, -26, -12), null) +
      `<text x="238" y="52" style="${HAND};font-size:15px" fill="${SOFT}" transform="rotate(-6 238 52)">clic…</text>`,
  },
  firmar: {
    vb: "0 0 320 170",
    svg: () =>
      paper(
        46,
        34,
        130,
        104,
        -1,
        3,
        `<text x="18" y="82" style="${HAND};font-size:16px" fill="${INK}">✗</text>` +
          `<path d="M32 80 q10 -8 18 0 q8 8 16 -2 q8 -8 16 2" fill="none" stroke="#1d3a8f" stroke-width="2.4" stroke-linecap="round"/>`,
      ) +
      at(
        216,
        76,
        1,
        `<g transform="rotate(38)"><rect x="-7" y="-44" width="14" height="52" rx="6" fill="#2f4a7a" stroke="${INK}" stroke-width="2.4"/>` +
          `<path d="M-7 8 L0 26 L7 8z" fill="#d8b23a" stroke="${INK}" stroke-width="2.2"/>` +
          `<line x1="0" y1="14" x2="0" y2="22" stroke="${INK}" stroke-width="1.8"/></g>`,
      ) +
      panda(272, 124, 0.95, { look: "left" }) +
      `<text x="204" y="140" style="${HAND};font-size:13px" fill="${SOFT}">firma aquí</text>`,
  },
  rellenar: {
    vb: "0 0 320 170",
    svg: () =>
      paper(
        48,
        22,
        132,
        130,
        -1,
        0,
        `<text x="66" y="24" text-anchor="middle" style="${HAND};font-size:14px" fill="${INK}">EXAMEN</text>` +
          `<text x="14" y="52" style="${HAND};font-size:12px" fill="${INK}">1. Nombre:</text><line x1="72" y1="54" x2="118" y2="54" stroke="${INK}" stroke-width="2"/>` +
          `<text x="14" y="80" style="${HAND};font-size:12px" fill="${INK}">2. Fecha:</text><line x1="66" y1="82" x2="118" y2="82" stroke="${INK}" stroke-width="2"/>` +
          `<text x="14" y="108" style="${HAND};font-size:12px" fill="${INK}">3. Motivo:</text><line x1="70" y1="110" x2="118" y2="110" stroke="${INK}" stroke-width="2"/>`,
      ) +
      at(
        212,
        90,
        1,
        `<g transform="rotate(-42)"><rect x="-5" y="-30" width="10" height="44" rx="2" fill="#f2d24c" stroke="${INK}" stroke-width="2.2"/><path d="M-5 14 L0 26 L5 14z" fill="#e8c9a0" stroke="${INK}" stroke-width="2"/><rect x="-5" y="-36" width="10" height="7" rx="2" fill="#e58a8a" stroke="${INK}" stroke-width="2"/></g>`,
      ) +
      panda(268, 122, 0.95, { look: "left" }, limb(-11, -3, -24, -10), null) +
      `<g transform="rotate(-10 254 44)"><circle cx="254" cy="44" r="17" fill="none" stroke="${RED}" stroke-width="2.6"/><text x="254" y="49" text-anchor="middle" style="${HAND};font-size:13px" fill="${RED}">10/10</text></g>`,
  },
  redactar: {
    vb: "0 0 320 170",
    svg: () =>
      paper(
        52,
        24,
        124,
        126,
        -1,
        0,
        `<line x1="16" y1="28" x2="108" y2="28" stroke="#cfc9bb" stroke-width="3"/>` +
          `<rect x="14" y="42" width="82" height="12" rx="2" fill="#15130f"/>` +
          `<line x1="16" y1="70" x2="108" y2="70" stroke="#cfc9bb" stroke-width="3"/>` +
          `<rect x="14" y="84" width="64" height="12" rx="2" fill="#15130f"/>` +
          `<line x1="16" y1="112" x2="108" y2="112" stroke="#cfc9bb" stroke-width="3"/>` +
          `<g transform="rotate(-12 62 106)"><rect x="22" y="96" width="86" height="20" rx="3" fill="none" stroke="${RED}" stroke-width="2.6"/>` +
          `<text x="65" y="111" text-anchor="middle" style="${HAND};font-size:12px" fill="${RED}">CLASIFICADO ✔</text></g>`,
      ) +
      at(
        252,
        112,
        1.05,
        limb(-7, 6, -10, 20) +
          limb(7, 6, 10, 20) +
          `<path d="M-16 -8 L16 -8 L12 12 L-12 12z" fill="#7a705e" stroke="${INK}" stroke-width="2.6"/>` +
          `<path d="M-16 -8 l6 8 M16 -8 l-6 8" stroke="${INK}" stroke-width="2.2"/>` +
          limb(-13, -2, -22, 8) +
          limb(13, -2, 22, 8) +
          at(0, -24, 1, head({ shades: true, mouth: "M-4 9 L4 9" })),
      ) +
      `<text x="216" y="34" style="${HAND};font-size:13px" fill="${SOFT}" transform="rotate(-5 216 34)">shhh…</text>`,
  },
  editar: {
    vb: "0 0 320 170",
    svg: () => {
      function util(x: number, c: string, tip: boolean): string {
        return (
          `<g transform="translate(${x} 0) rotate(-6)"><rect x="-4" y="-26" width="8" height="40" rx="3" fill="${c}" stroke="${INK}" stroke-width="2"/>` +
          (tip
            ? `<path d="M-4 14 L0 24 L4 14z" fill="#e8c9a0" stroke="${INK}" stroke-width="1.8"/>`
            : `<rect x="-4" y="14" width="8" height="8" rx="2" fill="${INK}"/>`) +
          "</g>"
        );
      }
      return (
        `<rect x="40" y="96" width="150" height="46" rx="8" fill="#b86a4a" stroke="${INK}" stroke-width="3"/>` +
        `<rect x="46" y="58" width="138" height="40" rx="6" fill="#a05a3e" stroke="${INK}" stroke-width="2.6" transform="rotate(-7 46 98)"/>` +
        at(70, 96, 1, util(0, "#f2d24c", true) + util(26, GREEN, false) + util(52, "#e58a8a", true) + util(78, "#7ab8d8", false)) +
        panda(258, 116, 1, { beret: true, look: "left" }, limb(-11, -3, -26, -14), null) +
        ono(228, 44, "¡arte!", ORANGE, 18, -8)
      );
    },
  },
  ocr: {
    vb: "0 0 320 170",
    svg: () =>
      paper(
        44,
        24,
        120,
        126,
        -1,
        0,
        `<text x="20" y="40" style="${HAND};font-size:15px" fill="#b3ab9c">Lorem ipsum</text>` +
          `<text x="20" y="66" style="${HAND};font-size:15px" fill="#b3ab9c">dolor sit amet</text>` +
          `<text x="20" y="118" style="${HAND};font-size:15px" fill="#b3ab9c">adipiscing elit</text>`,
      ) +
      `<circle cx="118" cy="88" r="30" fill="rgba(150,222,80,.18)" stroke="${INK}" stroke-width="4"/>` +
      `<text x="118" y="95" text-anchor="middle" style="${HAND};font-size:17px" fill="${GREEND}">consec…</text>` +
      `<line x1="140" y1="110" x2="168" y2="134" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
      panda(240, 118, 1, { sherlock: true, look: "left" }, limb(-11, -3, -26, -6), null) +
      `<g transform="translate(268 44)">` +
      `<line x1="0" y1="0" x2="44" y2="8" stroke="${INK}" stroke-width="1.8"/>` +
      `<path d="M4 1 l0 10 l10 -4z" fill="${GREEN}" stroke="${GREEND}" stroke-width="1.4"/>` +
      `<path d="M22 4 l0 10 l10 -4z" fill="${ORANGE}" stroke="${INK}" stroke-width="1.4"/>` +
      `</g>` +
      ono(232, 30, "¡AJÁ!", ORANGE, 19, -8),
  },
};

export interface PandaArtProps {
  kind: PandaArtKind;
  /** Con label la ilustración es informativa (role="img"); sin él, decorativa. */
  label?: string;
  className?: string;
}

export function PandaArt(props: PandaArtProps): JSX.Element {
  const art = ART[props.kind];
  return (
    <svg
      viewBox={art.vb}
      className={props.className}
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : true}
      style={{ display: "block", width: "100%", height: "auto" }}
      data-panda-art={props.kind}
      // Markup SVG estático generado localmente; nunca contiene datos del usuario.
      dangerouslySetInnerHTML={{ __html: art.svg() }}
    />
  );
}
