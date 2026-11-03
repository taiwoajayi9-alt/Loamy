import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Loamy admin" }, robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[880px] items-center gap-4 px-4 py-3">
          <Link href="/admin" aria-label="Admin home">
            <Wordmark />
          </Link>
          <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-lemon">Admin</span>
          <nav className="ml-auto flex flex-wrap justify-end gap-x-4 gap-y-1 text-small font-semibold">
            <Link href="/admin/plants" className="hover:underline">Plants</Link>
            <Link href="/admin/products" className="hover:underline">Shop</Link>
            <Link href="/admin/orders" className="hover:underline">Orders</Link>
            <Link href="/admin/promos" className="hover:underline">Promos</Link>
            <Link href="/admin/help" className="hover:underline">Help</Link>
            <Link href="/discover" className="text-ink-muted hover:underline">View app</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
