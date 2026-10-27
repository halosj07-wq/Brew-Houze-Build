"use client";

import { useEffect } from "react";

// Every text box in the app refuses emoji and other characters that don't belong in the café's records:
// pictographs (with the joiners, variation selectors, skin tones and flag letters that build them),
// private-use symbols and invisible control characters. Accented letters (ñ, é), ₱, ©, ®, ™ and ordinary
// punctuation are kept. Typed or pasted characters are taken out as soon as they arrive, before React
// reads the value, so the page's state never holds them. A box can opt out with data-allow-emoji.
// Number boxes are kept within range the same way: never above their max (9,999,999 when the box
// sets none) and never negative when their min is 0 or more, so a huge or negative amount can't be
// typed in. Peso boxes (MoneyField) ask for the same note through an "input-limit" event.
// (The same file is in the admin, cashier and mobile apps.)
const ILLEGAL = /(?![©®™])[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Co}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}​‍︎️⃣﻿\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const TEXT_TYPES = new Set(["text", "search", "email", "tel", "url", "password"]);
const NUMBER_MAX = 9_999_999;

export function cleanText(value: string): string {
  return value.replace(ILLEGAL, "");
}

function isTextBox(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return !target.hasAttribute("data-allow-emoji");
  return target instanceof HTMLInputElement && TEXT_TYPES.has(target.type) && !target.hasAttribute("data-allow-emoji");
}

export default function InputGuard() {
  useEffect(() => {
    let note: HTMLDivElement | null = null;
    let hideTimer = 0;
    const tell = (message = "Emojis and special symbols can't be used here.") => {
      if (!note) {
        note = document.createElement("div");
        note.setAttribute("role", "status");
        note.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);"
          + "padding:9px 14px;border-radius:10px;background:#2B1D16;color:#FFF4E4;font:600 13px/1.35 system-ui,sans-serif;"
          + "box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none;transition:opacity .2s;opacity:0";
        document.body.appendChild(note);
      }
      note.textContent = message;
      note.style.opacity = "1";
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => { if (note) note.style.opacity = "0"; }, 2400);
    };
    const clean = (box: HTMLInputElement | HTMLTextAreaElement) => {
      const value = box.value;
      ILLEGAL.lastIndex = 0;
      if (!ILLEGAL.test(value)) return;
      const caret = box.selectionStart ?? value.length;
      const cleaned = cleanText(value);
      const before = cleanText(value.slice(0, caret)).length;
      // The prototype's setter, not React's: React then sees the change and passes the clean value on.
      const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(box, cleaned);
      try { box.setSelectionRange(before, before); } catch { /* email and similar boxes have no caret */ }
      tell();
    };
    const setValue = (box: HTMLInputElement, value: string) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(box, value);
    const keepInRange = (box: HTMLInputElement) => {
      const value = box.valueAsNumber;
      if (!Number.isFinite(value)) return;
      const max = box.max !== "" && Number.isFinite(Number(box.max)) ? Number(box.max) : NUMBER_MAX;
      const min = box.min !== "" && Number.isFinite(Number(box.min)) ? Number(box.min) : null;
      if (value > max) { setValue(box, String(max)); tell(`The most this box takes is ${max.toLocaleString("en-PH")}.`); }
      else if (value < 0 && min !== null && min >= 0) { setValue(box, ""); tell("This box can't be negative."); }
    };
    const onInput = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "number") { keepInRange(event.target); return; }
      if ((event as InputEvent).isComposing || !isTextBox(event.target)) return;
      clean(event.target);
    };
    const onLimit = (event: Event) => tell(String((event as CustomEvent).detail ?? ""));
    const onCompositionEnd = (event: Event) => { if (isTextBox(event.target)) clean(event.target); };
    // Capture on the window runs before React's own listeners on the document.
    window.addEventListener("input", onInput, true);
    window.addEventListener("compositionend", onCompositionEnd, true);
    window.addEventListener("input-limit", onLimit);
    return () => {
      window.removeEventListener("input-limit", onLimit);
      window.removeEventListener("input", onInput, true);
      window.removeEventListener("compositionend", onCompositionEnd, true);
      window.clearTimeout(hideTimer);
      note?.remove();
    };
  }, []);
  return null;
}
