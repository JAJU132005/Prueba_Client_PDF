import { PandaArt } from "@/components/PandaArt";
import { ToolCard } from "@/components/ToolCard";
import { TOOLS } from "@/lib/tools";

export function Home(): JSX.Element {
  return (
    <>
      {/* Hero: portada del diario (R28) */}
      <section className="flex flex-wrap items-start gap-11 pt-6">
        <div className="min-w-[320px] flex-1 basis-[500px]">
          <h1 className="hand m-0 text-[clamp(38px,5vw,58px)] font-normal leading-[1.08] text-ink">
            Tus PDF,{" "}
            <span className="shadow-[inset_0_-14px_0_var(--hl-green)]">
              sin salir de tu navegador
            </span>
          </h1>
          <p className="mb-1 mt-4 max-w-[56ch] text-[19px] font-semibold">
            Une, divide, rota y convierte tus PDF directamente en tu navegador.
          </p>
          <p className="mono soft mb-5 mt-0 text-sm">
            sin subida · sin registro · funciona offline
          </p>
          <div className="card inline-flex -rotate-1 items-baseline gap-3.5 !px-5 !py-3">
            <span className="hand text-[22px]">Bytes enviados a internet:</span>
            <span className="zero text-[58px] leading-none">0</span>
          </div>
        </div>
        <div className="flex min-w-[280px] shrink basis-[360px] flex-col gap-4">
          <div className="rotate-[1.2deg] rounded-scrap border-[2.5px] border-dashed border-ink bg-card p-2">
            <PandaArt
              kind="portada"
              label="Portada del diario: cuaderno con candado y panda saludando"
            />
          </div>
          <div className="-rotate-[0.8deg] rounded-[14px] border-[2.5px] border-dashed border-ink-soft bg-card px-3.5 pb-0.5 pt-2">
            <span className="mx-auto block w-[150px]">
              <PandaArt kind="nube" label="Nube tachada: aquí no hay nube" />
            </span>
            <p className="hand mb-2 mt-1 text-center text-[17px]">
              aquí no hay nube — todo pasa en tu navegador
            </p>
          </div>
        </div>
      </section>

      {/* Rejilla de herramientas en el ORDEN del entregable (R27, R31) + #30 */}
      <section
        aria-label="Herramientas disponibles"
        className="grid grid-cols-1 gap-7 pb-8 pt-7 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TOOLS.map((tool, index) => (
          <ToolCard
            key={tool.id}
            title={tool.title}
            description={tool.description}
            to={tool.path}
            icon={tool.icon}
            category={tool.category}
            resourceCost={tool.resourceCost}
            index={index}
          />
        ))}
      </section>

      {/* Cómo funciona: cómic de 3 viñetas + nota de instalación (R29) */}
      <section id="como-funciona" className="pt-8">
        <h2 className="hand mb-5 mt-0 text-4xl font-normal text-ink">
          <span className="shadow-[inset_0_-10px_0_var(--hl-orange)]">
            Cómo funciona
          </span>{" "}
          <span className="soft text-[22px]">(cómic de 3 viñetas)</span>
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="-rotate-[0.7deg]">
            <div className="rounded-[10px] border-[2.5px] border-ink-soft p-1">
              <PandaArt
                kind="comic1"
                label="Viñeta 1: tu archivo entra a tu navegador por una puerta"
              />
            </div>
            <p className="hand mb-0 mt-3 text-[19px]">
              1. Tu archivo entra a tu navegador.
            </p>
          </div>
          <div className="rotate-[0.8deg]">
            <div className="rounded-[10px] border-[2.5px] border-ink-soft p-1">
              <PandaArt
                kind="comic2"
                label="Viñeta 2: se procesa dentro de una caja fuerte, con el panda de guardia"
              />
            </div>
            <p className="hand mb-0 mt-3 text-[19px]">
              2. Se procesa dentro, con el panda de guardia.
            </p>
          </div>
          <div className="-rotate-[0.4deg]">
            <div className="rounded-[10px] border-[2.5px] border-ink-soft p-1">
              <PandaArt
                kind="comic3"
                label="Viñeta 3: el archivo sale por la misma puerta, sellado. Sin servidores."
              />
            </div>
            <p className="hand mb-0 mt-3 text-[19px]">
              3. Sale por la misma puerta. Sin servidores.
            </p>
          </div>
        </div>
        <p className="hand soft mb-0 mt-5 text-lg">
          Para instalarla: menú del navegador → «Instalar aplicación». Una vez
          instalada, funciona sin conexión.
        </p>
      </section>
    </>
  );
}
