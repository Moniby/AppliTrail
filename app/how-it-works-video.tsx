"use client";

import { useEffect, useRef, useState } from "react";

export default function HowItWorksVideo() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function closeVideo() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeVideo();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return <>
    <button
      ref={triggerRef}
      className="how-it-works-trigger"
      type="button"
      onClick={() => setOpen(true)}
    >
      See how it works
    </button>

    {open && <div
      className="walkthrough-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeVideo();
      }}
    >
      <section
        aria-labelledby="walkthrough-title"
        aria-modal="true"
        className="walkthrough-modal"
        role="dialog"
      >
        <header>
          <div>
            <span>30-SECOND WALKTHROUGH</span>
            <h2 id="walkthrough-title">See AppliTrail in action</h2>
          </div>
          <button
            ref={closeRef}
            aria-label="Close walkthrough video"
            className="walkthrough-close"
            type="button"
            onClick={closeVideo}
          >
            ×
          </button>
        </header>
        <video
          aria-label="A 30-second walkthrough of AppliTrail"
          autoPlay
          controls
          playsInline
          preload="metadata"
          src="/applitrail-walkthrough.mp4"
        >
          Your browser does not support embedded video.
        </video>
      </section>
    </div>}
  </>;
}
