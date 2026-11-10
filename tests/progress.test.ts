import { describe, expect, it } from "vitest";
import { achievements } from "@/data/achievements";
import { modules } from "@/data/modules";
import { parentPath } from "@/lib/back";
import { splitLeadingEmoji, tipOfTheDay } from "@/lib/content";
import { addDays, dayKey, daysBetween } from "@/lib/dates";
import {
  applyQuizResult,
  createInitialProgress,
  effectiveStreak,
  findNextLesson,
  isLessonUnlocked,
  lessonsDoneToday,
  levelFromXp,
  requiredCorrect,
  sanitizePreferences,
  sanitizeProfile,
  sanitizeProgress,
} from "@/lib/progress";
import { toSpokenText } from "@/lib/speech";
import type { Lesson, UserProgress } from "@/types";

const fundamentals = modules[0];
const lesson = (index: number): Lesson => fundamentals.lessons[index];
const allCorrect = (l: Lesson) => l.quiz.map((q) => q.id);
const at = (day: string, hour = 15) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, hour);
};

function pass(progress: UserProgress, l: Lesson, day: string, opts: { hour?: number; goal?: number } = {}) {
  return applyQuizResult(progress, {
    lesson: l,
    correctQuestionIds: allCorrect(l),
    difficulty: "medium",
    dailyGoal: opts.goal ?? 3,
    now: at(day, opts.hour),
  });
}

describe("lesson data", () => {
  it("has unique ids, valid answers and consistent ordering", () => {
    const ids = new Set<string>();
    for (const m of modules) {
      m.lessons.forEach((l, index) => {
        expect(l.moduleId).toBe(m.id);
        expect(l.order).toBe(index + 1);
        expect(l.content.length).toBeGreaterThan(0);
        expect(l.quiz.length).toBeGreaterThan(0);
        for (const id of [l.id, ...l.quiz.map((q) => q.id)]) {
          expect(ids.has(id)).toBe(false);
          ids.add(id);
        }
        for (const q of l.quiz) {
          expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
          expect(q.correctAnswer).toBeLessThan(q.options.length);
          expect(new Set(q.options).size).toBe(q.options.length);
        }
      });
    }
  });
});

describe("dates", () => {
  it("counts calendar days across month and DST boundaries", () => {
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-01", "2026-10-31")).toBe(-1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("quiz results", () => {
  it("awards lesson and question XP once, and the first-lesson badge with its bonus", () => {
    const { progress, outcome } = pass(createInitialProgress(), lesson(0), "2026-05-01");
    expect(outcome.passed).toBe(true);
    expect(outcome.firstCompletion).toBe(true);
    expect(outcome.xpEarned).toBe(10 + 15);
    expect(outcome.newBadges).toEqual(["first-lesson"]);
    expect(outcome.bonusXp).toBe(50);
    expect(progress.xp).toBe(75);
    expect(progress.completedLessons).toEqual(["fund-1"]);

    const again = pass(progress, lesson(0), "2026-05-01");
    expect(again.outcome.xpEarned).toBe(0);
    expect(again.outcome.firstCompletion).toBe(false);
    expect(again.progress.xp).toBe(75);
    expect(again.progress.completedLessons).toEqual(["fund-1"]);
  });

  it("pays only the improvement when a lesson is replayed with a better score", () => {
    const l = lesson(0);
    const first = applyQuizResult(createInitialProgress(), {
      lesson: l,
      correctQuestionIds: allCorrect(l).slice(0, 2),
      difficulty: "medium",
      dailyGoal: 3,
      now: at("2026-05-01"),
    });
    expect(first.outcome.xpEarned).toBe(10 + 10);
    const second = pass(first.progress, l, "2026-05-01");
    expect(second.outcome.xpEarned).toBe(5);
  });

  it("does not complete the lesson when the pass mark is missed", () => {
    const l = lesson(0);
    const { progress, outcome } = applyQuizResult(createInitialProgress(), {
      lesson: l,
      correctQuestionIds: allCorrect(l).slice(0, 1),
      difficulty: "medium",
      dailyGoal: 3,
      now: at("2026-05-01"),
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.requiredCorrect).toBe(2);
    expect(progress.completedLessons).toEqual([]);
    expect(progress.xp).toBe(0);
    expect(progress.currentStreak).toBe(0);
    expect(progress.quizAttempts).toBe(1);
    expect(progress.quizzesPassed).toBe(0);
    expect(Math.round(progress.averageAccuracy)).toBe(33);
  });

  it("sets pass marks by difficulty", () => {
    expect([requiredCorrect("easy", 3), requiredCorrect("medium", 3), requiredCorrect("hard", 3)]).toEqual([1, 2, 3]);
    expect(requiredCorrect("medium", 0)).toBe(0);
    expect(requiredCorrect("easy", 1)).toBe(1);
  });
});

describe("streaks", () => {
  it("grows by one per day, ignores extra lessons the same day, and resets after a gap", () => {
    let p = pass(createInitialProgress(), lesson(0), "2026-05-01").progress;
    expect(p.currentStreak).toBe(1);
    p = pass(p, lesson(1), "2026-05-01").progress;
    expect(p.currentStreak).toBe(1);
    const day2 = pass(p, lesson(2), "2026-05-02");
    expect(day2.outcome.streakExtended).toBe(true);
    expect(day2.progress.currentStreak).toBe(2);
    p = pass(day2.progress, lesson(3), "2026-05-05").progress;
    expect(p.currentStreak).toBe(1);
    expect(p.longestStreak).toBe(2);
  });

  it("reads as zero once a day has been missed, without losing the record", () => {
    const p = pass(createInitialProgress(), lesson(0), "2026-05-01").progress;
    expect(effectiveStreak(p, "2026-05-01")).toBe(1);
    expect(effectiveStreak(p, "2026-05-02")).toBe(1);
    expect(effectiveStreak(p, "2026-05-03")).toBe(0);
    expect(p.longestStreak).toBe(1);
  });

  it("survives the device clock moving backwards", () => {
    let p = pass(createInitialProgress(), lesson(0), "2026-05-10").progress;
    p = pass(p, lesson(1), "2026-05-08").progress;
    expect(p.currentStreak).toBe(1);
    expect(p.lastActiveDay).toBe("2026-05-08");
  });

  it("unlocks the 7-day streak and comeback badges", () => {
    let p = createInitialProgress();
    let badges: string[] = [];
    for (let i = 0; i < 7; i++) {
      const result = pass(p, lesson(i), addDays("2026-05-01", i));
      p = result.progress;
      badges = badges.concat(result.outcome.newBadges);
    }
    expect(p.currentStreak).toBe(7);
    expect(badges).toContain("streak-7");
    const back = pass(p, lesson(7), "2026-05-20");
    expect(back.outcome.newBadges).toContain("comeback");
  });
});

describe("daily goal", () => {
  it("counts each lesson once per day and resets the next day", () => {
    let p = pass(createInitialProgress(), lesson(0), "2026-05-01", { goal: 2 }).progress;
    p = pass(p, lesson(0), "2026-05-01", { goal: 2 }).progress;
    expect(lessonsDoneToday(p, "2026-05-01")).toBe(1);
    const met = pass(p, lesson(1), "2026-05-01", { goal: 2 });
    expect(met.outcome.dailyGoalJustMet).toBe(true);
    expect(met.progress.goalStreak).toBe(1);
    const extra = pass(met.progress, lesson(2), "2026-05-01", { goal: 2 });
    expect(extra.outcome.dailyGoalJustMet).toBe(false);
    expect(lessonsDoneToday(extra.progress, "2026-05-02")).toBe(0);
  });
});

describe("achievements", () => {
  it("every achievement can be earned by finishing the course consistently", () => {
    let p = createInitialProgress();
    let day = "2026-01-01";
    const order = modules.flatMap((m) => m.lessons);
    // Two lessons a day, with one early and one late session along the way.
    for (let i = 0; i < order.length; i++) {
      if (i % 2 === 0 && i > 0) day = addDays(day, 1);
      const hour = i === 4 ? 6 : i === 5 ? 23 : 15;
      p = pass(p, order[i], day, { hour, goal: 2 }).progress;
    }
    // Keep reviewing daily for a month, then five in one day, then return after a break.
    for (let i = 0; i < 12; i++) {
      day = addDays(day, 1);
      p = pass(p, order[i], day, { goal: 1 }).progress;
    }
    day = addDays(day, 1);
    for (let i = 0; i < 5; i++) p = pass(p, order[i], day, { goal: 1 }).progress;
    p = pass(p, order[0], addDays(day, 9), { goal: 1 }).progress;

    const missing = achievements.map((a) => a.id).filter((id) => !p.unlockedBadges.includes(id));
    expect(missing).toEqual([]);
    expect(levelFromXp(p.xp)).toBeGreaterThanOrEqual(20);
  });

  it("only refers to modules that exist", () => {
    expect(achievements.find((a) => a.id === "all-modules")?.description).toContain(String(modules.length));
  });
});

describe("navigation helpers", () => {
  it("unlocks lessons in order", () => {
    const fresh = createInitialProgress();
    expect(isLessonUnlocked(fresh, fundamentals, lesson(0))).toBe(true);
    expect(isLessonUnlocked(fresh, fundamentals, lesson(1))).toBe(false);
    const p = pass(fresh, lesson(0), "2026-05-01").progress;
    expect(isLessonUnlocked(p, fundamentals, lesson(1))).toBe(true);
    expect(isLessonUnlocked(p, fundamentals, lesson(2))).toBe(false);
  });

  it("suggests the started module first, then preferred topics, then nothing when done", () => {
    const fresh = createInitialProgress();
    expect(findNextLesson(fresh, [])?.lesson.id).toBe("fund-1");
    expect(findNextLesson(fresh, ["investing"])?.lesson.id).toBe("invest-1");
    const started = pass(fresh, lesson(0), "2026-05-01").progress;
    expect(findNextLesson(started, ["investing"])?.lesson.id).toBe("fund-2");
    const done = { ...fresh, completedLessons: modules.flatMap((m) => m.lessons.map((l) => l.id)) };
    expect(findNextLesson(done, [])).toBeNull();
  });

  it("maps every screen to its parent for the back button", () => {
    expect(parentPath("/learn/fundamentals/fund-1/")).toBe("/learn/fundamentals");
    expect(parentPath("/learn/fundamentals")).toBe("/learn");
    expect(parentPath("/learn/")).toBe("/dashboard");
    expect(parentPath("/settings")).toBe("/dashboard");
    expect(parentPath("/dashboard")).toBeNull();
    expect(parentPath("/")).toBeNull();
  });
});

describe("stored data", () => {
  it("falls back to defaults for missing or corrupt data", () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile("nope")).toBeNull();
    expect(sanitizeProgress([1, 2, 3])).toEqual(createInitialProgress());
    const prefs = sanitizePreferences({ theme: "neon", dailyGoalLessons: 999, dailyReminderTime: "25:99" });
    expect(prefs.theme).toBe("system");
    expect(prefs.dailyGoalLessons).toBe(10);
    expect(prefs.dailyReminderTime).toBe("18:00");
  });

  it("cleans up names and clamps ages", () => {
    const profile = sanitizeProfile({ name: "  <b>Sam</b>   the   Great and Powerful Wizard ", age: 99 });
    expect(profile?.name).toBe("bSam/b the Great and");
    expect(profile?.age).toBe(19);
  });

  it("migrates saves from the first release", () => {
    const legacy = {
      xp: 30,
      level: 1,
      currentStreak: 4,
      longestStreak: 4,
      lastActivityDate: new Date(2026, 4, 1, 10).toISOString(),
      completedLessons: ["fund-1", "fund-2", "not-a-lesson", "fund-1"],
      unlockedBadges: ["first-lesson", "level-50"],
      moduleProgress: {},
      dailyGoalProgress: 7,
      totalLessonsCompleted: 2,
      totalQuizzesCompleted: 2,
      averageAccuracy: 83.3,
    };
    const p = sanitizeProgress(legacy);
    expect(p.completedLessons).toEqual(["fund-1", "fund-2"]);
    expect(p.unlockedBadges).toEqual(["first-lesson"]);
    expect(p.lastActiveDay).toBe("2026-05-01");
    expect(p.currentStreak).toBe(4);
    expect(p.quizzesPassed).toBe(2);
    expect(p.quizAttempts).toBe(2);
  });
});

describe("content helpers", () => {
  it("makes lesson text speakable", () => {
    expect(toSpokenText("🎯 Start small! Even $5/week adds up to $260/year!")).toBe(
      "Start small! Even $5 per week adds up to $260 per year!"
    );
    expect(toSpokenText("The 50/30/20 Rule")).toBe("The 50 30 20 Rule");
    expect(toSpokenText("Tutoring ($15-30/hr)")).toBe("Tutoring ($15 to 30 per hour)");
    expect(toSpokenText("NEEDS:\n- Food\n- Shelter")).toBe("NEEDS: Food. Shelter");
    expect(toSpokenText("4 times/month at $3 each")).toBe("4 times per month at $3 each");
    expect(toSpokenText("(100% + 50%) / 2 items = 75% / 2")).toBe("(100% + 50%) divided by 2 items = 75% divided by 2");
    expect(toSpokenText("Secure websites (https://, lock icon)")).toBe("Secure websites (https, lock icon)");
    expect(toSpokenText("🔥💰")).toBe("");
  });

  it("separates a leading emoji from copy", () => {
    expect(splitLeadingEmoji("💡 Money itself isn't wealth")).toEqual({ emoji: "💡", rest: "Money itself isn't wealth" });
    expect(splitLeadingEmoji("Plain text")).toEqual({ emoji: null, rest: "Plain text" });
  });

  it("shows one stable tip per day", () => {
    expect(tipOfTheDay("2026-05-01")).toBe(tipOfTheDay("2026-05-01"));
    expect(tipOfTheDay("2026-05-01")).not.toBe(tipOfTheDay("2026-05-02"));
  });
});
