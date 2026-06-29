import { Link } from "react-router-dom";

import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory, ToolIconId } from "@/lib/tools";

export interface ToolCardProps {
  title: string;
  description: string;
  to: string;
  icon: ToolIconId;
  category: ToolCategory;
}

export function ToolCard(props: ToolCardProps): JSX.Element {
  return (
    <Link
      to={props.to}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <ToolIcon icon={props.icon} category={props.category} />
      <span className="text-lg font-semibold text-text">{props.title}</span>
      <span className="text-sm text-text-muted">{props.description}</span>
    </Link>
  );
}
