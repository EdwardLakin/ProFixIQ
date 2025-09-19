import { redirect } from "next/navigation";

export default function Page({ params }: { params: { id: string } }) {
  // Send legacy route to the consolidated detail page in "tech" mode by default.
  redirect();
}
