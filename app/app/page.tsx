import type { Metadata } from "next";
import { Workspace } from "@/components/soloop/Workspace";
export const metadata: Metadata = { title: "Workspace | Founder Workspace" };
export default function WorkspacePage() {
  return <Workspace />;
}
