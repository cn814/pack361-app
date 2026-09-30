"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/** A form button that dims and shows a spinner while its form is being sent. */
export default function SubmitButton({ children, className = "", disabled, ...rest }: ComponentProps<"button">) {
  const { pending, data } = useFormStatus();
  // In forms with several buttons, only the one that was pressed shows the spinner.
  const mine = pending && (!rest.name || data?.get(rest.name) === rest.value);
  return (
    <button {...rest} disabled={disabled || pending} aria-busy={mine || undefined} className={`${className} ${mine ? "is-busy" : ""}`}>
      {children}
    </button>
  );
}
