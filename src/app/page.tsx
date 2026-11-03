import { redirect } from "next/navigation";

/** Discovery is the front door; visitors never need an account to start. */
export default function Home() {
  redirect("/discover");
}
