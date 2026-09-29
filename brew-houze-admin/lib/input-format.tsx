"use client";

import { useLayoutEffect, useRef } from "react";

// Money and mobile number boxes that format as you type. brew-houze-admin, brew-houze-cashier and
// brew-houze-mobile keep identical copies of this file.
//   MoneyField  shows 12,500.50; hands back the plain amount ("12500.50"), so parsing is unchanged
//   PhoneField  shows 0917 123 4567 or +63 917 123 4567 (the servers accept both)

type BoxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode">;

// "12500.5" → "12,500.5" (keeps what was typed after the point).
export function groupMoney(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text === "") return "";
  const [whole, ...rest] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

// What was typed → a plain amount: digits and one point, at most `decimals` decimals.
export function plainMoney(typed: string, decimals = 2): string {
  const cleaned = typed.replace(/[^\d.]/g, "");
  const point = cleaned.indexOf(".");
  if (point < 0) return cleaned;
  return `${cleaned.slice(0, point)}.${cleaned.slice(point + 1).replace(/\./g, "").slice(0, decimals)}`;
}

// Any way of writing a Philippine mobile number → 09XX XXX XXXX, or +63 9XX XXX XXXX when it
// starts with + or 63.
export function formatPhone(typed: string): string {
  const trimmed = typed.trimStart();
  const digits = trimmed.replace(/\D/g, "");
  const international = trimmed.startsWith("+") || (digits.startsWith("63") && digits.length > 2);
  if (international) {
    if (digits.length <= 2) return `+${digits}`;
    const rest = digits.slice(2).replace(/^0/, "").slice(0, 10);
    return ["+63", rest.slice(0, 3), rest.slice(3, 6), rest.slice(6, 10)].filter(Boolean).join(" ");
  }
  const local = (digits.startsWith("9") ? `0${digits}` : digits).slice(0, 11);
  return [local.slice(0, 4), local.slice(4, 7), local.slice(7, 11)].filter(Boolean).join(" ");
}

const significant = (text: string, pattern: RegExp) => text.split("").filter((char) => pattern.test(char)).length;
// Where the caret goes in the new text: after the same number of digits (and points) as before.
function caretAfter(text: string, count: number, pattern: RegExp): number {
  if (count <= 0) return text.startsWith("+") ? 1 : 0;
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (pattern.test(text[index])) seen++;
    if (seen === count) return index + 1;
  }
  return text.length;
}

// A formatted box: shown = format(value); typing goes through clean() back to the owner. Backspace
// on a comma or space removes the digit before it; the caret stays with the digits.
function useFormattedBox(shown: string, pattern: RegExp) {
  const ref = useRef<HTMLInputElement>(null);
  // Typing at the end stays at the end (even when formatting adds or drops a digit, like the 0 of 09).
  const caret = useRef<{ count: number; atEnd: boolean } | null>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (input && caret.current !== null && document.activeElement === input) {
      const at = caret.current.atEnd ? input.value.length : caretAfter(input.value, caret.current.count, pattern);
      input.setSelectionRange(at, at);
    }
    caret.current = null;
  });
  // The typed text with a deleted separator taking its digit along, and how many digits sit before the caret.
  const read = (event: React.ChangeEvent<HTMLInputElement>) => {
    let typed = event.target.value;
    let at = event.target.selectionStart ?? typed.length;
    const removedOne = typed.length === shown.length - 1;
    if (removedOne && significant(typed, pattern) === significant(shown, pattern) && at > 0) {
      typed = typed.slice(0, at - 1) + typed.slice(at);
      at -= 1;
    }
    caret.current = { count: significant(typed.slice(0, at), pattern), atEnd: at >= typed.length };
    return typed;
  };
  return { ref, read };
}

// decimals: 2 for pesos; more for a unit cost (₱0.0425 per ml).
export function MoneyField({ value, onChange, decimals = 2, ...rest }: BoxProps & { value: string | number | null | undefined; onChange: (plain: string) => void; decimals?: number }) {
  const shown = groupMoney(value);
  const { ref, read } = useFormattedBox(shown, /[\d.]/);
  return <input {...rest} ref={ref} type="text" inputMode="decimal" autoComplete="off" value={shown} onChange={(event) => onChange(plainMoney(read(event), decimals))} />;
}

export function PhoneField({ value, onChange, ...rest }: BoxProps & { value: string; onChange: (formatted: string) => void }) {
  const shown = value ? formatPhone(value) : "";
  const { ref, read } = useFormattedBox(shown, /\d/);
  return <input maxLength={16} {...rest} ref={ref} type="tel" inputMode="tel" value={shown} onChange={(event) => onChange(formatPhone(read(event)))} />;
}
