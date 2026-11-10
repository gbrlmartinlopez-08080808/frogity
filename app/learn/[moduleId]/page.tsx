import { modules } from "@/data/modules";
import ModuleClient from "./ModuleClient";

export const dynamicParams = false;

export function generateStaticParams() {
  return modules.map((module) => ({ moduleId: module.id }));
}

export default async function ModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  return <ModuleClient moduleId={moduleId} />;
}
