export function ToolPlaceholder(props: { title: string }): JSX.Element {
  return (
    <section className="py-8">
      <h1 className="text-3xl font-semibold text-ink md:text-4xl">
        {props.title}
      </h1>
      <p className="mt-3 max-w-2xl text-base text-ink-soft">
        Esta herramienta estará disponible pronto. Estamos trabajando para que
        funcione 100% en tu navegador.
      </p>
    </section>
  );
}
