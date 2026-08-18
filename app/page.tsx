import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WIPAS_COOKIE_NAME, verifyWipasSessionToken } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export default async function HomePage() {
  const token = cookies().get(WIPAS_COOKIE_NAME)?.value;
  const authorized = await verifyWipasSessionToken(token);

  if (!authorized) {
    redirect("/wipas");
  }

  return <Dashboard />;
}
