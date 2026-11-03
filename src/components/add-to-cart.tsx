import { addToCartAction } from "@/app/(app)/shop/actions";
import { SubmitButton } from "@/components/submit-button";

/** Server-action form: works without JavaScript. */
export function AddToCart({ slug, back, soldOut, full = false, label = "Add to cart" }: { slug: string; back: string; soldOut: boolean; full?: boolean; label?: string }) {
  if (soldOut) return <span className="text-small font-medium text-danger-ink">Sold out</span>;
  return (
    <form action={addToCartAction} className={full ? "w-full" : undefined}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton full={full} size={full ? "md" : "sm"} pendingLabel="Adding…">{label}</SubmitButton>
    </form>
  );
}
