import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WIPAS_COOKIE_NAME, verifyWipasSessionToken } from "@/lib/auth";
import WipasGate from "@/components/WipasGate";

export default async function WipasPage() {
  const token = cookies().get(WIPAS_COOKIE_NAME)?.value;
  const authorized = await verifyWipasSessionToken(token);

  if (authorized) {
    redirect("/");
  }

  return <WipasGate />;
}
