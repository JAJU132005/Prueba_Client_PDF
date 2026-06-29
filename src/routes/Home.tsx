import { ToolCard } from "@/components/ToolCard";
import { TOOLS } from "@/lib/tools";

export function Home(): JSX.Element {
  return (
    <>
      <section className="py-8">
        <h1 className="text-3xl font-semibold text-text md:text-4xl">
          Tus PDF, sin salir de tu navegador
        </h1>
        <p className="mt-3 max-w-2xl text-base text-text-muted">
          Une, divide, rota y convierte tus PDF directamente en tu navegador.
        </p>
        <p className="mt-2 text-sm text-text-muted">
          Sin subida · sin registro · funciona offline.
        </p>
      </section>

      <section
        aria-label="Herramientas disponibles"
        className="grid grid-cols-1 gap-4 pb-8 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            title={tool.title}
            description={tool.description}
            to={tool.path}
            icon={tool.icon}
            category={tool.category}
          />
        ))}
      </section>
    </>
  );
}
