import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TopBar from "@/components/TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <TopBar user={user} />
      <main className="flex-1 w-full max-w-[880px] mx-auto px-6 py-8">{children}</main>
    </>
  );
}
