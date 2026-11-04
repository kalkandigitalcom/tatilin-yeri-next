"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  DEFAULT_ROUTING_CONTEXT,
  setRoutingContext,
  type RoutingContext,
} from "@/lib/i18n/routing/context";

/* ===============================================================
   🌐 PUBLIC ROUTING PROVIDER — Çok Dilli Mimari Faz 2 (client)
   ===============================================================
   Server'da kurulan routing bağlamını (ana dil, aktif diller, dil
   slug'ları) client'a taşır. Render SIRASINDA modül bağlamını da
   günceller → `localeHref`, `buildLocaleAlternates`, `localeOfPath`
   gibi senkron yardımcılar client bileşenlerinde de doğru URL üretir
   (SSR ve tarayıcı aynı değeri görür → hydration güvenli).
   =============================================================== */

const RoutingReactContext = createContext<RoutingContext>(DEFAULT_ROUTING_CONTEXT);

export default function PublicRoutingProvider({
  value,
  children,
}: {
  value: RoutingContext;
  children: ReactNode;
}) {
  setRoutingContext(value);
  return (
    <RoutingReactContext.Provider value={value}>{children}</RoutingReactContext.Provider>
  );
}

export function usePublicRouting(): RoutingContext {
  return useContext(RoutingReactContext);
}
