import { useTheme } from "@/design/theme";

export function ThemeToggle(): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button type="button" onClick={toggleTheme} className="btn text-sm">
      {isDark ? "modo cuaderno ☀" : "modo pizarra ☾"}
    </button>
  );
}
