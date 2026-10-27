"use client";

import { useEffect } from "react";

// Errors always reach the person, even while a window (dialog) is open:
// - An error that appears on the page behind an open window (many windows report a failed save
//   through the page's own alert) is shown again on top, as a banner over the window. The banner
//   goes when that error is cleared, the window closes, or it is dismissed.
// - An error that appears inside the window but is scrolled out of sight is scrolled into view.
// Errors already on the page before a window opened are not repeated. Watches role="alert".
// (The same file is in the admin, cashier and mobile apps.)
export default function DialogAlerts() {
  useEffect(() => {
    let banner: HTMLDivElement | null = null;
    let shownFor: Element | null = null;
    const seen = new WeakMap<Element, string>();

    const topDialog = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter((dialog) => dialog.isConnected && dialog.getClientRects().length > 0);
      return dialogs[dialogs.length - 1] ?? null;
    };
    const hide = () => {
      banner?.remove();
      banner = null;
      shownFor = null;
    };
    const show = (alert: Element, text: string) => {
      if (!banner) {
        banner = document.createElement("div");
        banner.setAttribute("role", "alert");
        banner.setAttribute("data-relayed-alert", "");
        banner.style.cssText = "position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:flex-start;gap:12px;"
          + "width:min(560px,calc(100vw - 32px));padding:12px 14px 12px 16px;border-radius:14px;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;"
          + "font:600 13.5px/1.45 system-ui,sans-serif;box-shadow:0 12px 32px rgba(61,43,31,.25)";
        const message = document.createElement("span");
        message.style.flex = "1";
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.setAttribute("aria-label", "Dismiss");
        close.style.cssText = "border:none;background:transparent;color:#B91C1C;font:700 18px/1 system-ui,sans-serif;cursor:pointer;padding:0 2px";
        close.addEventListener("click", hide);
        banner.append(message, close);
        document.body.appendChild(banner);
      }
      (banner.firstChild as HTMLSpanElement).textContent = text;
      shownFor = alert;
    };

    const check = () => {
      const dialog = topDialog();
      const alerts = Array.from(document.querySelectorAll('[role="alert"]')).filter((alert) => !alert.hasAttribute("data-relayed-alert"));
      for (const alert of alerts) {
        const text = (alert.textContent ?? "").trim();
        const before = seen.get(alert);
        seen.set(alert, text);
        if (!dialog || !text || text === before) continue;
        if (dialog.contains(alert)) {
          // Inside the window: make sure it can be seen.
          const box = alert.getBoundingClientRect();
          if (box.top < 0 || box.bottom > window.innerHeight) alert.scrollIntoView({ block: "nearest", behavior: "smooth" });
          else {
            let parent = alert.parentElement;
            while (parent && parent !== dialog) {
              const area = parent.getBoundingClientRect();
              if (parent.scrollHeight > parent.clientHeight && (box.top < area.top || box.bottom > area.bottom)) { alert.scrollIntoView({ block: "nearest", behavior: "smooth" }); break; }
              parent = parent.parentElement;
            }
          }
        } else {
          show(alert, text);
        }
      }
      // The relayed error was cleared, or no window is open any more.
      if (banner && (!dialog || !shownFor || !shownFor.isConnected || !(shownFor.textContent ?? "").trim())) hide();
    };

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; check(); });
    });
    check();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); hide(); };
  }, []);
  return null;
}
