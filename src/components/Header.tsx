import { Link } from "react-router-dom";

import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PandaArt } from "@/components/PandaArt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PRIVACY_BADGE_TEXT } from "@/lib/offlineEducation";

export function Header(): JSX.Element {
  return (
    <header className="bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3.5 px-4 pt-5 md:px-6">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <span className="w-[52px]">
            <PandaArt kind="pose-ligera" />
          </span>
          <span>
            <span className="hand block text-3xl leading-none text-ink">cliente-pdf</span>
            <span className="mono soft block text-[11px]">
              herramientas PDF · 100% en tu navegador
            </span>
          </span>
        </Link>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-3.5">
          <OfflineIndicator />
          <ThemeToggle />
          <span className="badge lv-ligera">
            <span aria-hidden="true">✓</span>
            {PRIVACY_BADGE_TEXT}
          </span>
        </div>
      </div>
    </header>
  );
}
