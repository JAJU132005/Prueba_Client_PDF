import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { OfflineEducationBanner } from "@/components/OfflineEducationBanner";

export function Layout(props: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <Header />
      <OfflineEducationBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
        {props.children}
      </main>
      <Footer />
    </div>
  );
}
