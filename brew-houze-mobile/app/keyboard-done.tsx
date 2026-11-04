"use client";

import { useEffect } from "react";

// The phone's keyboard goes away once it is no longer needed: when a form is sent or a Save, Use, Done or
// Update button is pressed (an address saved, for one), when Go/Enter is pressed in a one-line box, and when
// the customer taps outside the boxes. Phones otherwise keep it up over the page until it is closed by hand.
const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]";
const DONE_BUTTON = /^(save|use|done|update|confirm|add|set|continue|apply|send)\b/i;

function closeKeyboard() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches(EDITABLE)) active.blur();
}

export default function KeyboardDone() {
  useEffect(() => {
    const onSubmit = () => closeKeyboard();
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest?.("button");
      if (button && (button.type === "submit" || DONE_BUTTON.test(button.textContent?.trim() ?? ""))) closeKeyboard();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const box = event.target as HTMLElement | null;
      if (event.key === "Enter" && box instanceof HTMLInputElement && box.matches(EDITABLE) && !box.form) box.blur();
    };
    const onTouchStart = (event: TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !target.closest(`${EDITABLE}, label, button, a, [role=button], [role=option], [role=listbox]`)) closeKeyboard();
    };
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("touchstart", onTouchStart, true);
    };
  }, []);
  return null;
}
