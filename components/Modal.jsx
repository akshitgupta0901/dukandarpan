"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { nextFocusIndex, FOCUSABLE_SELECTOR } from "../lib/focus-trap.mjs";

/**
 * A small accessible modal, no library. role="dialog" with aria-modal, labelled by its title.
 *
 *  - Focus moves into the dialog on open, is trapped there (Tab and Shift+Tab wrap, see
 *    lib/focus-trap.mjs), and returns to whatever had it before when the dialog closes.
 *  - Esc closes it, and so does a click on the dim backdrop (a drag that starts inside the
 *    dialog and ends outside, such as selecting text, does not).
 *  - The page behind doesn't scroll while it is open.
 *
 * Rendered in a portal on document.body so no ancestor's overflow or stacking can clip it.
 * Mount it only while it should be visible: it sets everything up on mount and tears it down on unmount.
 */
export default function Modal({ title, titleId = "modal-title", onClose, children }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const pressStartedOnBackdrop = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusables = () => [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
    (focusables()[0] ?? dialog).focus();

    // On the document, not the dialog, so Esc and Tab behave even if focus ended up on <body>.
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusables();
      const next = nextFocusIndex(nodes.length, nodes.indexOf(document.activeElement), e.shiftKey);
      e.preventDefault();
      (next === -1 ? dialog : nodes[next]).focus();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressStartedOnBackdrop.current) onClose?.();
      }}
    >
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="btn btn-subtle modal-close" onClick={() => onClose?.()} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
