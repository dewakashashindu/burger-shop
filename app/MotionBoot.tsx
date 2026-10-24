"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * The quiet motion layer.
 *
 * It does three things and nothing else:
 *  · photographs settle in when their file lands (never before),
 *  · blocks below the fold rise 14 px as they come into view,
 *  · a grid that had its rows replaced (live menu arriving) cross-fades.
 *
 * Everything is added by JavaScript, so a page that never runs a script — or a
 * guest who asks for reduced motion — sees the plain, complete page. There is a
 * 2.2 s safety net that reveals anything still waiting.
 */

const REVEAL = [
  ".wm-dish-grid > .wm-dish-card",
  ".wm-cat-grid > *",
  ".order-grid > .dish",
  ".cat-grid > .cat-card",
  ".entry-facts",
  ".flow-head",
  ".story-highlights > *",
];
const GRIDS = [".wm-dish-grid", ".order-grid", ".cat-grid"];
const IMAGE_SCOPE = "main img, #reserve-main img, .au-layout img, .wm-website img";

export default function MotionBoot() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cleanups: (() => void)[] = [];

    // ---- 7. the page itself lifts in, once per route --------------------
    const page = document.querySelector<HTMLElement>("main, #reserve-main, .au-layout");
    if (page) {
      page.classList.remove("ms-page");
      void page.offsetWidth;
      page.classList.add("ms-page");
    }

    // ---- 3. photographs settle ------------------------------------------
    const markImage = (img: HTMLImageElement) => {
      if (img.dataset.msImg) return;
      img.dataset.msImg = "1";
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add("ms-img");
        return;
      }
      const onLoad = () => img.classList.add("ms-img");
      img.addEventListener("load", onLoad, { once: true });
      cleanups.push(() => img.removeEventListener("load", onLoad));
    };
    const scanImages = () =>
      document.querySelectorAll<HTMLImageElement>(IMAGE_SCOPE).forEach(markImage);

    // ---- 2. reveal on scroll --------------------------------------------
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("ms-in");
            observer.unobserve(entry.target);
          }
        },
        { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
      );
      io = observer;
    }

    let sequence = 0;
    const mark = (el: Element) => {
      if (!(el instanceof HTMLElement) || el.dataset.msRv) return;
      el.dataset.msRv = "1";
      if (!io) return; // nothing to fade in with — leave it visible
      el.style.setProperty("--ms-d", `${Math.min(sequence++, 6) * 70}ms`);
      el.classList.add("ms-rv");
      const box = el.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.94) el.classList.add("ms-in");
      else io.observe(el);
    };

    let queued = false;
    const scan = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        scanImages();
        document.querySelectorAll(REVEAL.join(",")).forEach(mark);
      });
    };

    scan();

    const safety = window.setTimeout(() => {
      document.querySelectorAll(".ms-rv:not(.ms-in)").forEach((el) => el.classList.add("ms-in"));
    }, 2200);

    // ---- 4. a grid whose rows were replaced ------------------------------
    const gridObservers: MutationObserver[] = [];
    document.querySelectorAll<HTMLElement>(GRIDS.join(",")).forEach((grid) => {
      const mo = new MutationObserver(() => {
        grid.classList.remove("ms-fresh");
        void grid.offsetWidth;
        grid.classList.add("ms-fresh");
      });
      mo.observe(grid, { childList: true });
      gridObservers.push(mo);
    });

    // ---- new blocks from a view change -----------------------------------
    const bodyObserver = new MutationObserver(scan);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(safety);
      io?.disconnect();
      bodyObserver.disconnect();
      gridObservers.forEach((mo) => mo.disconnect());
      cleanups.forEach((fn) => fn());
    };
  }, [pathname]);

  return null;
}
