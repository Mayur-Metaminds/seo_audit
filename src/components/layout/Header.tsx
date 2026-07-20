import Link from "next/link";
import { SearchCheck } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-card-border bg-sidebar/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent group-hover:bg-accent/20 transition-colors">
            <SearchCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-semibold tracking-tight">SEO Check</span>
            <span className="ml-2 hidden sm:inline text-xs text-muted font-normal">
              Metaminds
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <span className="hidden md:inline">55-Point Technical SEO Audit</span>
        </nav>
      </div>
    </header>
  );
}
