"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./ui/icons";

const ITEMS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/discover", label: "Discover", icon: "compass" },
  { href: "/garden", label: "My Garden", icon: "sprout" },
  { href: "/shop", label: "Shop", icon: "bag" },
  { href: "/profile", label: "Profile", icon: "user" },
];

/** Floating black pill nav. Community stays hidden until it ships. */
export function FloatingNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) || (href === "/discover" && pathname.startsWith("/plants"));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[560px] px-3"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
    >
      <ul className="flex gap-1 rounded-[28px] bg-ink p-1.5 shadow-nav">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-[3px] rounded-[20px] text-[11px] font-semibold",
                  active ? "text-white" : "text-[#9a9a9a] hover:text-white",
                )}
              >
                <span className={active ? "text-lemon" : undefined}>
                  <Icon name={item.icon} size={24} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
