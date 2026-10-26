"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { btnClass, cx, Notice } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingText,
  confirm,
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  pendingText?: string;
  confirm?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={cx(btnClass(variant, size), className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? (pendingText ?? "Ukládám…") : children}
    </button>
  );
}

/**
 * Formulář se serverovou akcí, který zobrazí chybu nebo potvrzení.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  id,
}: {
  id?: string;
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
}) {
  const [state, formAction] = useActionState(action, {} as ActionResult);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} id={id} action={formAction} className={className}>
      {children}
      {state.error && (
        <div className="mt-3">
          <Notice tone="error">{state.error}</Notice>
        </div>
      )}
      {state.ok && state.message && (
        <div className="mt-3">
          <Notice tone="success">
            <span className="break-all">{state.message}</span>
          </Notice>
        </div>
      )}
    </form>
  );
}

export function Dialog({
  trigger,
  title,
  content,
  wide,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  content: (close: () => void) => ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <>
      {trigger(() => setOpen(true))}
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className={cx(
          "m-auto max-h-[88dvh] w-[calc(100%-1.5rem)] rounded-xl border border-ink-200 bg-white p-0 shadow-xl backdrop:bg-ink-900/40",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        {open && (
          <div>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
              <h2 className="text-base font-semibold">{title}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Zavřít">
                ✕
              </button>
            </div>
            <div className="max-h-[calc(88dvh-4rem)] overflow-y-auto px-4 py-4 sm:px-5">{content(() => setOpen(false))}</div>
          </div>
        )}
      </dialog>
    </>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className={btnClass("secondary", "sm")}
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Zkopírováno" : "Kopírovat"}
      </button>
    </div>
  );
}
