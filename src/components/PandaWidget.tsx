import { useEffect, useRef, useState } from "react";

/**
 * Panda de guardia — port React del web component
 * `design-incoming/shared/panda-widget.js`. Presentación pura: ojos que
 * siguen el cursor, parpadeo, sueño tras 30 s, reacción a dragover de
 * archivos y easter eggs al clic/tecla. Sin lógica de dominio, sin red y sin
 * almacenamiento. No bloquea la interacción: pointer-events solo sobre el
 * propio panda. Respeta prefers-reduced-motion (R9, R13).
 */

const PATCH = "var(--panda-patch,#2d2a26)";
const FUR = "var(--panda-fur,#fffdf6)";

const EGGS = [
  "¡Hola! Soy el panda de guardia.",
  "¿Un poco de bambú?",
  "Psst… esto queda entre tú y yo 🤫",
  "Bytes enviados a internet: 0. Lo juro.",
  "Lo que pasa en tu navegador, se queda en tu navegador.",
];

const IDLE_SLEEP_MS = 30_000;
const BLINK_INTERVAL_MS = 4_600;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function PandaWidget(): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [asleep, setAsleep] = useState(false);
  const eggIndexRef = useRef(0);
  const asleepRef = useRef(false);
  const timersRef = useRef<{ say?: number; idle?: number; drag?: number; scroll?: number }>({});

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const timers = timersRef.current;

    function sleep(): void {
      if (reduced) {
        return;
      }
      asleepRef.current = true;
      setAsleep(true);
      if (eyesRef.current) {
        eyesRef.current.style.transform = "scaleY(0.12)";
      }
    }

    function wake(): void {
      if (!asleepRef.current) {
        return;
      }
      asleepRef.current = false;
      setAsleep(false);
      if (eyesRef.current) {
        eyesRef.current.style.transform = "scaleY(1)";
      }
    }

    function resetIdle(): void {
      wake();
      window.clearTimeout(timers.idle);
      timers.idle = window.setTimeout(sleep, IDLE_SLEEP_MS);
    }
    resetIdle();

    function onMove(event: MouseEvent): void {
      resetIdle();
      if (reduced || !svgRef.current || !pupilsRef.current) {
        return;
      }
      const r = svgRef.current.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.45;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const d = Math.max(1, Math.hypot(dx, dy));
      pupilsRef.current.style.transform = `translate(${((dx / d) * 3).toFixed(1)}px,${((dy / d) * 3).toFixed(1)}px)`;
    }

    function onScroll(): void {
      resetIdle();
      if (reduced || !pupilsRef.current) {
        return;
      }
      pupilsRef.current.style.transform = "translate(0,-3px)";
      window.clearTimeout(timers.scroll);
      timers.scroll = window.setTimeout(() => {
        if (pupilsRef.current) {
          pupilsRef.current.style.transform = "translate(0,0)";
        }
      }, 500);
    }

    function onKey(): void {
      resetIdle();
    }

    function onDragOver(): void {
      resetIdle();
      setBubble("¡Suéltalo aquí, prometo no chismosear!");
      window.clearTimeout(timers.say);
      timers.say = window.setTimeout(() => setBubble(null), 1800);
      if (!reduced && svgRef.current) {
        svgRef.current.style.transform = "translateY(-6px) rotate(-4deg)";
        window.clearTimeout(timers.drag);
        timers.drag = window.setTimeout(() => {
          if (svgRef.current) {
            svgRef.current.style.transform = "";
          }
        }, 1200);
      }
    }

    let blinkTimer: number | undefined;
    if (!reduced) {
      blinkTimer = window.setInterval(() => {
        if (asleepRef.current || !eyesRef.current) {
          return;
        }
        eyesRef.current.style.transform = "scaleY(0.12)";
        window.setTimeout(() => {
          if (!asleepRef.current && eyesRef.current) {
            eyesRef.current.style.transform = "scaleY(1)";
          }
        }, 140);
      }, BLINK_INTERVAL_MS);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragover", onDragOver);

    return () => {
      window.clearInterval(blinkTimer);
      window.clearTimeout(timers.idle);
      window.clearTimeout(timers.say);
      window.clearTimeout(timers.drag);
      window.clearTimeout(timers.scroll);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragover", onDragOver);
    };
  }, []);

  function handleGreet(): void {
    const timers = timersRef.current;
    setBubble(EGGS[eggIndexRef.current % EGGS.length]);
    eggIndexRef.current += 1;
    window.clearTimeout(timers.say);
    timers.say = window.setTimeout(() => setBubble(null), 2800);
    if (!prefersReducedMotion() && svgRef.current) {
      const svg = svgRef.current;
      svg.style.transform = "rotate(3deg) scale(1.05)";
      window.setTimeout(() => {
        svg.style.transform = "";
      }, 250);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleGreet();
    }
  }

  return (
    <div
      className="fixed bottom-2 right-4 z-40 w-[132px]"
      style={{ pointerEvents: "none" }}
      data-panda-widget
    >
      {bubble && (
        <div
          role="status"
          className="absolute bottom-[120px] right-1 w-[200px] border-[2.5px] p-[9px_12px] font-hand text-base leading-tight"
          style={{
            background: FUR,
            color: PATCH,
            borderColor: PATCH,
            borderRadius: "18px 22px 20px 24px/24px 18px 26px 18px",
            boxShadow: "3px 4px 0 rgba(0,0,0,.18)",
          }}
        >
          {bubble}
        </div>
      )}
      {asleep && (
        <div
          aria-hidden="true"
          className="absolute -top-2 right-0.5 rotate-12 font-hand text-xl font-bold"
          style={{ color: "#8a857b" }}
        >
          Z z z…
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 132 120"
        width="132"
        height="120"
        role="button"
        tabIndex={0}
        aria-label="Panda de guardia: haz clic para saludarlo. Vigila que nada salga de tu navegador."
        onClick={handleGreet}
        onKeyDown={handleKeyDown}
        className="block cursor-pointer transition-transform motion-reduce:transition-none"
        style={{ pointerEvents: "auto" }}
      >
        <rect x="113" y="48" width="7" height="58" rx="3" fill="#79b84a" />
        <line x1="113" y1="66" x2="120" y2="66" stroke="#4c7a2c" strokeWidth="2" />
        <line x1="113" y1="86" x2="120" y2="86" stroke="#4c7a2c" strokeWidth="2" />
        <ellipse cx="108" cy="45" rx="10" ry="4" fill="#8fd14f" transform="rotate(-28 108 45)" />
        <ellipse cx="125" cy="42" rx="9" ry="3.6" fill="#8fd14f" transform="rotate(22 125 42)" />
        <circle cx="28" cy="27" r="15" fill={PATCH} />
        <circle cx="92" cy="27" r="15" fill={PATCH} />
        <ellipse cx="60" cy="63" rx="48" ry="44" fill={FUR} stroke={PATCH} strokeWidth="4" />
        <ellipse cx="41" cy="56" rx="14" ry="17" fill={PATCH} transform="rotate(-14 41 56)" />
        <ellipse cx="79" cy="56" rx="14" ry="17" fill={PATCH} transform="rotate(14 79 56)" />
        <g
          ref={eyesRef}
          style={{ transformBox: "fill-box", transformOrigin: "center", transition: "transform .12s" }}
        >
          <circle cx="41" cy="58" r="6.5" fill="var(--panda-eye,#fff)" />
          <circle cx="79" cy="58" r="6.5" fill="var(--panda-eye,#fff)" />
          <g ref={pupilsRef} style={{ transition: "transform .15s" }}>
            <circle cx="41" cy="58" r="3.2" fill={PATCH} />
            <circle cx="79" cy="58" r="3.2" fill={PATCH} />
          </g>
        </g>
        <ellipse cx="60" cy="76" rx="6.5" ry="4.6" fill={PATCH} />
        <path d="M53 87 Q60 93 67 87" fill="none" stroke={PATCH} strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
