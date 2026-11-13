import Link from "next/link";
import { Puzzle, ChevronRight } from "lucide-react";

import { PLUGINS } from "@/lib/plugins/registry";

/* Eklentiler — kayıtlı eklentilerin listesi (lib/plugins/registry.ts). */
export default function PluginsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-[var(--color-stone-900)]">Eklentiler</h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-1">
          Harici sistemlerle entegrasyonlar. Her eklenti mevcut rezervasyon ve iCal akışından bağımsız çalışır.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {PLUGINS.map((p) => (
          <Link
            key={p.key}
            href={p.href}
            className="group rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 hover:border-[var(--color-stone-300)] transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-stone-100)] text-[var(--color-stone-700)]">
                <Puzzle size={18} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[16px] text-[var(--color-stone-900)]">{p.name}</h2>
                <p className="text-[13px] text-[var(--color-stone-500)] mt-1">{p.description}</p>
              </div>
              <ChevronRight size={16} className="text-[var(--color-stone-400)] mt-1" aria-hidden />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
