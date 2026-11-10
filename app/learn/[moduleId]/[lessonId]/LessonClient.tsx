"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import ConfettiAnimation from "@/components/ConfettiAnimation";
import ListenButton from "@/components/ListenButton";
import Modal from "@/components/Modal";
import ProgressBar from "@/components/ProgressBar";
import { useApp } from "@/context/AppContext";
import { achievements } from "@/data/achievements";
import { modules } from "@/data/modules";
import { pushBackInterceptor } from "@/lib/back";
import { splitLeadingEmoji } from "@/lib/content";
import { isLessonUnlocked, requiredCorrect } from "@/lib/progress";
import type { LessonContent, LessonOutcome, Question } from "@/types";

type Phase = "content" | "quiz" | "result";

/** A question with its options in display order (`correct` is the index after shuffling). */
interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  xpReward: number;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Shuffles answer order so the right answer isn't predictable by position. */
function prepareQuiz(questions: Question[], shuffleQuestions: boolean): QuizQuestion[] {
  const ordered = shuffleQuestions ? shuffled(questions) : questions;
  return ordered.map((q) => {
    const order = shuffled(q.options.map((_, index) => index));
    return {
      id: q.id,
      question: q.question,
      options: order.map((index) => q.options[index]),
      correct: order.indexOf(q.correctAnswer),
      explanation: q.explanation,
      xpReward: q.xpReward,
    };
  });
}

const CARD_STYLES: Record<LessonContent["type"], { label: string; icon: string; className: string }> = {
  text: { label: "", icon: "", className: "" },
  example: {
    label: "Example",
    icon: "📝",
    className: "border-blue-500 bg-blue-50 dark:bg-blue-900/20",
  },
  tip: {
    label: "Tip",
    icon: "💡",
    className: "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20",
  },
  scenario: {
    label: "Scenario",
    icon: "🎭",
    className: "border-purple-500 bg-purple-50 dark:bg-purple-900/20",
  },
};

const primaryButton =
  "w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-lg transition-all hover:from-purple-600 hover:to-pink-600 active:scale-[0.98]";
const secondaryButton =
  "w-full rounded-xl border-2 border-gray-300 py-4 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";

export default function LessonClient({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const { userProgress, userPreferences, submitQuiz, feedback } = useApp();
  const router = useRouter();

  const currentModule = modules.find((m) => m.id === moduleId);
  const lesson = currentModule?.lessons.find((l) => l.id === lessonId);

  const [phase, setPhase] = useState<Phase>("content");
  const [contentIndex, setContentIndex] = useState(0);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctIds, setCorrectIds] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<LessonOutcome | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Guards against a double tap submitting the same attempt twice. */
  const submitted = useRef(false);

  const moduleHref = `/learn/${moduleId}`;
  const inQuiz = phase === "quiz";

  // Leaving mid-quiz throws the attempt away, so ask first (header arrow and Android back).
  useEffect(() => {
    if (!inQuiz) return;
    return pushBackInterceptor(() => {
      setConfirmLeave(true);
      return true;
    });
  }, [inQuiz]);

  // Each new card starts at the top, in view.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase, contentIndex, questionIndex]);

  if (!currentModule || !lesson) {
    return (
      <AppShell title="Lesson not found" backHref={currentModule ? moduleHref : "/learn"} width="narrow" showNav={false}>
        <div className="rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-gray-800">
          <div className="mb-3 text-5xl" aria-hidden="true">
            🧭
          </div>
          <p className="mb-6 text-gray-600 dark:text-gray-400">We couldn&apos;t find that lesson.</p>
          <Link href="/learn" className={`${primaryButton} block`}>
            Browse all modules
          </Link>
        </div>
      </AppShell>
    );
  }

  const wasCompleted = userProgress.completedLessons.includes(lesson.id);

  if (!isLessonUnlocked(userProgress, currentModule, lesson)) {
    return (
      <AppShell title={lesson.title} subtitle={currentModule.title} backHref={moduleHref} width="narrow" showNav={false}>
        <div className="rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-gray-800">
          <div className="mb-3 text-5xl" aria-hidden="true">
            🔒
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-800 dark:text-gray-100">This lesson is locked</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Complete the previous lesson in {currentModule.title} to unlock it.
          </p>
          <Link href={moduleHref} className={`${primaryButton} block`}>
            Go to {currentModule.title}
          </Link>
        </div>
      </AppShell>
    );
  }

  const difficulty = userPreferences.difficultyLevel;
  const needed = requiredCorrect(difficulty, lesson.quiz.length);
  const totalSteps = lesson.content.length + lesson.quiz.length;
  const stepsDone =
    phase === "content"
      ? contentIndex
      : phase === "quiz"
        ? lesson.content.length + questionIndex + (checked ? 1 : 0)
        : totalSteps;

  /* ----- Actions ----- */

  const startQuiz = () => {
    setQuiz(prepareQuiz(lesson.quiz, difficulty === "hard"));
    setQuestionIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrectIds([]);
    setOutcome(null);
    submitted.current = false;
    setPhase("quiz");
  };

  const finish = (finalCorrectIds: string[]) => {
    if (submitted.current) return;
    submitted.current = true;
    const result = submitQuiz(lesson, finalCorrectIds);
    setOutcome(result);
    setPhase("result");
    if (!result.passed) feedback("fail", "error");
    else if (result.newBadges.length > 0 || result.leveledUp) feedback("achievement", "success");
    else feedback("complete", "success");
  };

  const nextContent = () => {
    feedback("tap", "light");
    if (contentIndex < lesson.content.length - 1) setContentIndex(contentIndex + 1);
    else if (lesson.quiz.length > 0) startQuiz();
    else finish([]);
  };

  const checkAnswer = () => {
    if (selected === null || checked) return;
    const question = quiz[questionIndex];
    const isCorrect = selected === question.correct;
    if (isCorrect) setCorrectIds((ids) => [...ids, question.id]);
    setChecked(true);
    feedback(isCorrect ? "correct" : "wrong", isCorrect ? "success" : "error");
  };

  const nextQuestion = () => {
    if (!checked) return;
    if (questionIndex < quiz.length - 1) {
      setQuestionIndex(questionIndex + 1);
      setSelected(null);
      setChecked(false);
    } else {
      finish(correctIds);
    }
  };

  const reviewLesson = () => {
    setContentIndex(0);
    setOutcome(null);
    submitted.current = false;
    setPhase("content");
  };

  /* ----- Screens ----- */

  const renderContent = () => {
    const content = lesson.content[contentIndex];
    const style = CARD_STYLES[content.type];
    const isLastCard = contentIndex === lesson.content.length - 1;
    // Copy often starts with its own emoji; use it as the card icon instead of doubling up.
    const { emoji, rest } = content.type === "text" ? { emoji: null, rest: content.content } : splitLeadingEmoji(content.content);

    return (
      <div key={`content-${contentIndex}`} className="animate-slide-in">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {style.label ? `${style.label} • ` : ""}Card {contentIndex + 1} of {lesson.content.length}
          </span>
          <ListenButton key={`listen-content-${contentIndex}`} text={content.content} autoPlay={userPreferences.autoReadAloud} />
        </div>

        <div className="mb-8 min-h-32">
          {content.type === "text" ? (
            <p
              className={`text-lg leading-relaxed whitespace-pre-line text-gray-700 dark:text-gray-200 ${
                content.emphasis ? "font-semibold" : ""
              }`}
            >
              {content.content}
            </p>
          ) : (
            <div className={`rounded-r-xl border-l-4 p-4 ${style.className}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {emoji ?? style.icon}
                </span>
                <p
                  className={`min-w-0 flex-1 leading-relaxed whitespace-pre-line text-gray-700 dark:text-gray-200 ${
                    content.type === "tip" ? "font-medium" : ""
                  }`}
                >
                  {rest}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {contentIndex > 0 && (
            <button type="button" onClick={() => setContentIndex(contentIndex - 1)} className={secondaryButton}>
              ← Previous
            </button>
          )}
          <button type="button" onClick={nextContent} className={primaryButton}>
            {!isLastCard ? "Next →" : lesson.quiz.length > 0 ? "Start Quiz 🎯" : "Finish"}
          </button>
        </div>
        {isLastCard && lesson.quiz.length > 0 && (
          <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
            {lesson.quiz.length} questions • get {needed} right to pass
          </p>
        )}
      </div>
    );
  };

  const renderQuiz = () => {
    const question = quiz[questionIndex];
    if (!question) return null;
    const isCorrect = selected === question.correct;
    const spoken = checked
      ? `${isCorrect ? "Correct!" : "Not quite."} ${question.explanation}`
      : `${question.question}. ${question.options
          .map((option, index) => `Option ${String.fromCharCode(65 + index)}: ${option}.`)
          .join(" ")}`;

    return (
      <div key={`question-${questionIndex}`} className="animate-slide-in">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="rounded-full bg-purple-100 px-4 py-2 text-sm font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
            Question {questionIndex + 1} of {quiz.length}
          </span>
          <ListenButton
            key={`listen-q-${questionIndex}-${checked}`}
            text={spoken}
            autoPlay={userPreferences.autoReadAloud}
          />
        </div>

        <h2 className="mb-5 text-xl font-bold text-gray-800 sm:text-2xl dark:text-gray-100">{question.question}</h2>

        <div className="space-y-3" role="group" aria-label="Answer options">
          {question.options.map((option, index) => {
            const isRight = index === question.correct;
            const isPicked = index === selected;
            const state = checked
              ? isRight
                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                : isPicked
                  ? "animate-shake border-red-500 bg-red-50 dark:bg-red-900/20"
                  : "border-gray-200 opacity-50 dark:border-gray-700"
              : isPicked
                ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                : "border-gray-200 hover:border-purple-300 dark:border-gray-700 dark:hover:border-purple-600";
            const bubble = checked
              ? isRight
                ? "bg-green-500 text-white"
                : isPicked
                  ? "bg-red-500 text-white"
                  : "bg-gray-200 text-gray-500 dark:bg-gray-700"
              : isPicked
                ? "bg-purple-500 text-white"
                : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
            return (
              <button
                key={index}
                type="button"
                disabled={checked}
                aria-pressed={isPicked}
                onClick={() => {
                  setSelected(index);
                  feedback("tap", "light");
                }}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] ${state}`}
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold ${bubble}`}
                  >
                    {checked && isRight ? "✓" : checked && isPicked ? "✗" : String.fromCharCode(65 + index)}
                  </span>
                  <span className="min-w-0 flex-1 text-gray-800 dark:text-gray-100">{option}</span>
                  {checked && (isRight || isPicked) && (
                    <span className="sr-only">{isRight ? "(correct answer)" : "(your answer, incorrect)"}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {checked && (
            <div
              className={`mt-5 animate-slide-up rounded-xl border p-4 ${
                isCorrect
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                  : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">
                  {isCorrect ? "🎉" : "💡"}
                </span>
                <div>
                  <h3 className="mb-1 font-bold text-gray-800 dark:text-gray-100">
                    {isCorrect ? `Correct! +${question.xpReward} XP` : "Not quite!"}
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{question.explanation}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5">
          {checked ? (
            <button type="button" onClick={nextQuestion} className={primaryButton}>
              {questionIndex < quiz.length - 1 ? "Next Question →" : "See Results 🎉"}
            </button>
          ) : (
            <button
              type="button"
              onClick={checkAnswer}
              disabled={selected === null}
              className={
                selected === null
                  ? "w-full cursor-not-allowed rounded-xl bg-gray-200 py-4 font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  : primaryButton
              }
            >
              {selected === null ? "Choose an answer" : "Check Answer"}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderResult = () => {
    if (!outcome) return null;
    const lessonIndex = currentModule.lessons.findIndex((l) => l.id === lesson.id);
    const nextLesson = currentModule.lessons[lessonIndex + 1];
    const moduleFinished = !nextLesson;
    const totalXp = outcome.xpEarned + outcome.bonusXp;
    const badges = achievements.filter((a) => outcome.newBadges.includes(a.id));

    if (!outcome.passed) {
      return (
        <div className="animate-fade-in text-center">
          <div className="mb-4 text-6xl" aria-hidden="true">
            💪
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-800 dark:text-gray-100">Almost there!</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            You got {outcome.correct} of {outcome.total} right. You need {outcome.requiredCorrect} to pass this
            lesson. Give it another go!
          </p>
          <div className="space-y-3">
            <button type="button" onClick={startQuiz} className={primaryButton}>
              Try the quiz again
            </button>
            <button type="button" onClick={reviewLesson} className={secondaryButton}>
              Review the lesson first
            </button>
          </div>
        </div>
      );
    }

    const highlights: { icon: string; text: string }[] = [
      { icon: "🎯", text: `${outcome.correct} of ${outcome.total} correct (${Math.round(outcome.accuracy)}%)` },
      totalXp > 0
        ? {
            icon: "⭐",
            text: `+${totalXp} XP${outcome.bonusXp > 0 ? ` (includes ${outcome.bonusXp} bonus XP)` : ""}`,
          }
        : { icon: "🔁", text: "Review complete. You already earned this lesson's XP." },
      ...(outcome.leveledUp ? [{ icon: "🆙", text: `Level up! You reached level ${outcome.newLevel}` }] : []),
      ...(outcome.streakExtended
        ? [{ icon: "🔥", text: `${outcome.streak}-day streak${outcome.streak === 1 ? " started" : ""}!` }]
        : []),
      ...(outcome.dailyGoalJustMet ? [{ icon: "✅", text: "Daily goal reached!" }] : []),
    ];

    return (
      <div className="animate-fade-in text-center">
        <div className="mb-4 animate-pop text-6xl" aria-hidden="true">
          {moduleFinished && outcome.firstCompletion ? "🏆" : "🎉"}
        </div>
        <h2 className="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">
          {moduleFinished && outcome.firstCompletion ? "Module complete!" : "Lesson complete!"}
        </h2>
        <p className="mb-6 text-gray-600 dark:text-gray-400">{lesson.title}</p>

        <ul className="mb-6 space-y-2 text-left">
          {highlights.map((item, index) => (
            <li
              key={item.text}
              className="flex animate-slide-up items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-700/50"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <span className="text-xl" aria-hidden="true">
                {item.icon}
              </span>
              <span className="font-medium text-gray-800 dark:text-gray-100">{item.text}</span>
            </li>
          ))}
        </ul>

        {badges.length > 0 && (
          <div className="mb-6 rounded-xl border-2 border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/20">
            <h3 className="mb-3 font-bold text-gray-800 dark:text-gray-100">
              {badges.length === 1 ? "Achievement unlocked!" : `${badges.length} achievements unlocked!`}
            </h3>
            <ul className="space-y-2 text-left">
              {badges.map((badge) => (
                <li key={badge.id} className="flex animate-pop items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 text-2xl shadow"
                  >
                    {badge.icon}
                  </span>
                  <span>
                    <span className="block font-semibold text-gray-800 dark:text-gray-100">{badge.title}</span>
                    <span className="block text-sm text-gray-600 dark:text-gray-400">
                      {badge.description} • +{badge.xpReward} XP
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3">
          {nextLesson ? (
            <button
              type="button"
              onClick={() => router.replace(`/learn/${moduleId}/${nextLesson.id}`)}
              className={primaryButton}
            >
              Next lesson: {nextLesson.title} →
            </button>
          ) : (
            <Link href="/learn" replace className={`${primaryButton} block`}>
              Choose another module →
            </Link>
          )}
          <Link href="/dashboard" replace className={`${secondaryButton} block`}>
            Back to home
          </Link>
        </div>
      </div>
    );
  };

  return (
    <AppShell
      title={lesson.title}
      subtitle={`${currentModule.title} • ${lesson.estimatedMinutes} min`}
      backHref={moduleHref}
      onBack={inQuiz ? () => setConfirmLeave(true) : undefined}
      width="narrow"
      showNav={false}
      headerBelow={
        <div className="mt-3">
          <ProgressBar value={(stepsDone / totalSteps) * 100} label="Lesson progress" height="h-2" />
        </div>
      }
    >
      <ConfettiAnimation show={phase === "result" && !!outcome?.passed && userPreferences.animationsEnabled} />

      <div
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl sm:p-8 dark:border-gray-700 dark:bg-gray-800"
      >
        {phase === "content" && renderContent()}
        {phase === "quiz" && renderQuiz()}
        {phase === "result" && renderResult()}
      </div>

      {wasCompleted && phase === "content" && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 dark:border-green-800 dark:bg-green-900/20">
            <span aria-hidden="true">✓</span>
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Completed • you&apos;re reviewing this lesson
            </span>
          </div>
        </div>
      )}

      {confirmLeave && (
        <Modal title="Leave this quiz?" icon="🚪" onClose={() => setConfirmLeave(false)}>
          <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Your answers so far won&apos;t be saved and you&apos;ll need to start the quiz again.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirmLeave(false)} className={primaryButton.replace("py-4", "py-3")}>
              Keep going
            </button>
            <button
              type="button"
              onClick={() => router.replace(moduleHref)}
              className={secondaryButton.replace("py-4", "py-3")}
            >
              Leave
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
