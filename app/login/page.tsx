import type { Metadata } from "next";
import { LoginDialog } from "@/components/soloop/LoginDialog";
export const metadata: Metadata = { title: "Log in | Founder Workspace" };
export default function Login() {
  return <><div className="login-backdrop" aria-hidden="true" inert><p>Founder Workspace</p></div><LoginDialog /></>;
}
