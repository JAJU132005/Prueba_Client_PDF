import type { ToolCategory, ToolIconId } from "@/lib/tools";

const CATEGORY_CLASSES: Record<ToolCategory, string> = {
  organizar: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  convertir: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  optimizar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  seguridad: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

const ICON_PATHS: Record<ToolIconId, JSX.Element> = {
  merge: (
    <>
      <path d="M7 4h6l4 4v3" />
      <path d="M17 13v3a2 2 0 0 1-2 2H9" />
      <path d="M7 4v6a2 2 0 0 0 2 2h8" />
    </>
  ),
  split: (
    <>
      <path d="M12 3v18" />
      <path d="M7 8 4 12l3 4" />
      <path d="m17 8 3 4-3 4" />
    </>
  ),
  rotate: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v5h-5" />
    </>
  ),
  organize: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  "pdf-to-images": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 8" />
    </>
  ),
  "images-to-pdf": (
    <>
      <path d="M6 3h9l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m16 16-4-4-5 4" />
    </>
  ),
  "page-numbers": (
    <>
      <path d="M6 3h9l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 15h1v-4l-1.5 1" />
      <path d="M13 13a1.5 1.5 0 1 1 2.6 1L13 17h3" />
    </>
  ),
  watermark: (
    <>
      <path d="M6 3h9l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  compress: (
    <>
      <path d="M12 3v6" />
      <path d="m9 6 3-3 3 3" />
      <path d="M12 21v-6" />
      <path d="m9 18 3 3 3-3" />
      <path d="M4 12h16" />
    </>
  ),
  protect: (
    <>
      <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};

export function ToolIcon(props: {
  icon: ToolIconId;
  category: ToolCategory;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${CATEGORY_CLASSES[props.category]}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        {ICON_PATHS[props.icon]}
      </svg>
    </span>
  );
}
