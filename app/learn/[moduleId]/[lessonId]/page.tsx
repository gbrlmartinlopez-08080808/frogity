import { modules } from "@/data/modules";
import LessonClient from "./LessonClient";

export const dynamicParams = false;

export function generateStaticParams() {
  return modules.flatMap((module) =>
    module.lessons.map((lesson) => ({ moduleId: module.id, lessonId: lesson.id }))
  );
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ moduleId: string; lessonId: string }>;
}) {
  const { moduleId, lessonId } = await params;
  // Keyed so that moving to the next lesson always starts from a clean slate.
  return <LessonClient key={lessonId} moduleId={moduleId} lessonId={lessonId} />;
}
