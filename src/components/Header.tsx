import { Link } from "react-router-dom";

import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PRIVACY_BADGE_TEXT } from "@/lib/offlineEducation";

export function Header(): JSX.Element {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link to="/" className="text-lg font-semibold text-text">
          clientpdf
        </Link>
        <div className="flex items-center gap-3">
          <OfflineIndicator />
          <ThemeToggle />
          <span className="inline-flex items-center gap-1 rounded-xl border border-border bg-bg px-3 py-1 text-sm font-medium text-text-muted">
            <span aria-hidden="true">🔒</span>
            {PRIVACY_BADGE_TEXT}
          </span>
        </div>
      </div>
    </header>
  );
}
