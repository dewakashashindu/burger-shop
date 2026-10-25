"use client";

import { useEffect, useRef } from "react";

/**
 * The looping clip that fills the arch in the landing hero.
 *
 * Three jobs beyond a plain <video> tag:
 *  1. ask for playback explicitly — some browsers ignore the autoplay hint on
 *     a video React inserts after the first paint;
 *  2. try once more on the first tap, so a visitor who lands on a still gets
 *     motion the moment they touch the page;
 *  3. stop decoding while the hero is scrolled away, so the rest of the page
 *     stays light.
 */
export default function HeroClip({
  src,
  poster,
  className = "arch-image__clip",
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const tryPlay = () => {
      const attempt = video.play();
      if (attempt) attempt.catch(() => {});
    };

    tryPlay();
    video.addEventListener("canplay", tryPlay);
    video.addEventListener("loadeddata", tryPlay);

    const firstTouch = () => {
      tryPlay();
      window.removeEventListener("pointerdown", firstTouch);
      window.removeEventListener("keydown", firstTouch);
    };
    window.addEventListener("pointerdown", firstTouch);
    window.addEventListener("keydown", firstTouch);

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          if (entry.isIntersecting) tryPlay();
          else video.pause();
        },
        { threshold: 0.05 },
      );
      observer.observe(video);
    }

    return () => {
      video.removeEventListener("canplay", tryPlay);
      video.removeEventListener("loadeddata", tryPlay);
      window.removeEventListener("pointerdown", firstTouch);
      window.removeEventListener("keydown", firstTouch);
      observer?.disconnect();
    };
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
    />
  );
}
