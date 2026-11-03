import { AnalyticsConsent } from "@/components/analytics";
import { FloatingNav } from "@/components/floating-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnalyticsConsent />
      {children}
      <FloatingNav />
    </>
  );
}
