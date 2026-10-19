import { MainApp } from "@/components/main-app";
import { PhoneSessionHost } from "@/components/phone-session-host";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <PhoneSessionHost><MainApp resumeAfterIdentitySwitch={typeof params["phone-session"] === "string"} /></PhoneSessionHost>;
}
