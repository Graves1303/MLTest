import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AdminSubNav from "@/components/AdminSubNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isHrAdmin) redirect("/dashboard");

  return (
    <div>
      <AdminSubNav />
      {children}
    </div>
  );
}
