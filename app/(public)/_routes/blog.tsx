import type { Metadata } from "next";

import BlogIndexPageBody from "@/app/components/blog/BlogIndexPageBody";
import BlogDetailPageBody from "@/app/components/blog/BlogDetailPageBody";
import { buildBlogDetailMetadata, buildBlogIndexMetadata } from "@/app/components/blog/blog-metadata";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* 🌐 Faz 6 Dalga 3 — BLOG: TEK, dile duyarlı route modülleri
   (route anahtarları: "blog", "blogPost"). Eski üç kopya
   (`(public)/blog`, `(public)/en|de/blog` ve `[slug]` `locale-page.tsx`)
   zaten aynı gövde/metadata yardımcılarını çağırıyordu; dil artık
   dispatcher'dan AÇIKÇA gelir. `params.slug` TEKNİK ANAHTARDIR (dil
   slug'ı dispatcher'da çözülür, kanonik değilse 308). Yayın filtresi,
   yayın tarihi, kapak ve yazar gövdede AYNEN. */
export function BlogIndexRoutePage({ locale }: LocaleRouteProps) {
  return <BlogIndexPageBody locale={locale} />;
}

export async function blogIndexRouteMetadata({ locale }: LocaleRouteProps): Promise<Metadata> {
  return buildBlogIndexMetadata(locale);
}

export const blogIndexRouteModule: UnifiedLocalePageModule = {
  Page: BlogIndexRoutePage,
  generateMetadata: blogIndexRouteMetadata,
};

export function BlogPostRoutePage({ locale, params }: LocaleRouteProps) {
  return <BlogDetailPageBody params={Promise.resolve({ slug: params.slug })} locale={locale} />;
}

export async function blogPostRouteMetadata({ locale, params }: LocaleRouteProps): Promise<Metadata> {
  return buildBlogDetailMetadata(Promise.resolve({ slug: params.slug }), locale);
}

export const blogPostRouteModule: UnifiedLocalePageModule = {
  Page: BlogPostRoutePage,
  generateMetadata: blogPostRouteMetadata,
};
