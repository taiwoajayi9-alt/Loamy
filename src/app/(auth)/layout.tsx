import Link from "next/link";
import { Wordmark } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 px-4 py-6">
      <Link href="/discover" className="self-start text-[26px]" aria-label="Back to Loamy">
        <Wordmark />
      </Link>
      {children}
    </main>
  );
}
