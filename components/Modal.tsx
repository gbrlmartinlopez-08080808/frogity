"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { pushBackInterceptor } from "@/lib/back";

interface ModalProps {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
}

/** A centred dialog: traps focus, closes on Escape, backdrop tap or the Android back button. */
export default function Modal({ title, icon, onClose, children }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex]") ?? []).filter(
        (el) => !el.hasAttribute("disabled")
      );
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const removeInterceptor = pushBackInterceptor(() => {
      onCloseRef.current();
      return true;
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      removeInterceptor();
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md animate-pop rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        {icon && (
          <div className="mb-4 text-center text-4xl" aria-hidden="true">
            {icon}
          </div>
        )}
        <h2 id={titleId} className="mb-3 text-center text-xl font-bold text-gray-800 dark:text-gray-100">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
