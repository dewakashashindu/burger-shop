/** Native-scroll enhancement for the approved Story 03 page.
 * Scoped to one mounted app shell, with complete Strict Mode / route cleanup.
 * The server-rendered document stays readable when motion or APIs are unavailable.
 */
export function mountStoryMotion(root: HTMLElement): (() => void) | undefined {
  const hero = root.querySelector<HTMLElement>(".cinematic-hero");
  const stage = hero?.querySelector<HTMLElement>(".hero-stage");
  const lead = root.querySelector<HTMLElement>(".intro-copy .lead");
  const art = root.querySelector<HTMLElement>(".chef-art");
  const progressBar = root.querySelector<HTMLElement>(".motion-progress");
  const card = hero?.querySelector<HTMLElement>(".place-card");
  const index = hero?.querySelector<HTMLElement>(".place-index");
  const toolbar = root.querySelector<HTMLElement>(".motion-studio");
  if (
    !hero ||
    !stage ||
    !lead ||
    !art ||
    !progressBar ||
    !card ||
    !index ||
    !toolbar ||
    typeof IntersectionObserver === "undefined"
  )
    return;

  // Capture non-null nodes for callbacks that execute after this function returns.
  const nodes = {
    hero,
    stage,
    lead,
    art,
    progressBar,
    card,
    index,
    toolbar,
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const words = Array.from(root.querySelectorAll<HTMLElement>(".read-word"));
  const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const paused = false;
  let frame = 0,
    progress = 0,
    introTimer: ReturnType<typeof setTimeout> | undefined;
  let active = !document.hidden, disposed = false;
  const cleanups: (() => void)[] = [];
  function listen<T extends Event>(
    target: EventTarget,
    type: string,
    callback: (event: T) => void,
    options?: AddEventListenerOptions,
  ) {
    const handler = callback as EventListener;
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (disposed) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -7% 0px" },
  );
  [...root.querySelectorAll<HTMLElement>(".motion-reveal"), art].forEach((el) =>
    observer.observe(el),
  );

  function request() {
    if (!frame && active && !disposed) frame = requestAnimationFrame(render);
  }
  function failSafe() {
    root.classList.remove("motion-on", "intro-play");
    nodes.card.inert = false;
    nodes.index.inert = false;
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function render() {
    frame = 0;
    if (disposed) return;
    try {
      // All geometry reads precede style writes; no per-frame React updates.
      const y = window.scrollY,
        vh = window.innerHeight;
      const hr = nodes.hero.getBoundingClientRect();
      const distance = Math.max(
        1,
        nodes.hero.offsetHeight - nodes.stage.clientHeight,
      );
      const offset = nodes.toolbar.getBoundingClientRect().height;
      const target = clamp((offset - hr.top) / distance);
      const lr = nodes.lead.getBoundingClientRect(),
        ar = nodes.art.getBoundingClientRect();
      const pageProgress = clamp(
        y / Math.max(1, document.documentElement.scrollHeight - vh),
      );
      nodes.progressBar.style.transform = `scaleX(${pageProgress})`;
      if (!reduce.matches && !paused) {
        progress += (target - progress) * 0.16;
        if (Math.abs(target - progress) < 0.0003) progress = target;
        const cardOut = smooth(0.1, 0.36, progress);
        const focus =
          smooth(0.27, 0.5, progress) * (1 - smooth(0.74, 0.9, progress));
        const values: Record<string, number> = {
          "--hero-p": progress,
          "--scene-open": smooth(0, 0.42, progress),
          "--paper-copy": smooth(0.88, 0.99, progress),
          "--hero-focus": focus,
          "--hero-wash": smooth(0.78, 1, progress),
          "--card-out": cardOut,
        };
        Object.entries(values).forEach(([key, value]) =>
          nodes.hero.style.setProperty(key, value.toFixed(5)),
        );
        nodes.hero.style.setProperty(
          "--card-events",
          cardOut > 0.9 ? "none" : "auto",
        );
        nodes.card.inert = cardOut > 0.98;
        nodes.index.inert = cardOut > 0.98;
        nodes.hero.dataset.motionProgress = progress.toFixed(4);
        const read = clamp((vh * 0.92 - lr.top) / (vh * 0.56));
        words.forEach((word, i) =>
          word.style.setProperty(
            "--word-opacity",
            (0.18 + 0.82 * clamp(read * (words.length + 4) - i)).toFixed(3),
          ),
        );
        const drift = clamp((vh - ar.top) / (vh + ar.height)) - 0.5;
        nodes.art.style.setProperty("--chef-drift", drift.toFixed(4));
      }
      const scrubbing =
        !reduce.matches && !paused && Math.abs(target - progress) > 0.0003;
      if (scrubbing) request();
    } catch (error) {
      console.warn("Using readable story motion fallback.", error);
      failSafe();
    }
  }
  function configure() {
    if (disposed) return;
    root.classList.toggle("motion-on", !reduce.matches);
    root.classList.toggle("motion-paused", paused);
    if (reduce.matches) {
      nodes.card.inert = false;
      nodes.index.inert = false;
      root.classList.remove("intro-play");
    }
    request();
  }
  function intro() {
    clearTimeout(introTimer);
    root.classList.remove("intro-play");
    if (reduce.matches || paused || disposed) return;
    void nodes.stage.offsetHeight;
    root.classList.add("intro-play");
    introTimer = setTimeout(() => {
      if (!disposed) root.classList.remove("intro-play");
    }, 2000);
  }
  listen(window, "scroll", request, { passive: true });
  listen(window, "resize", request, { passive: true });
  listen(reduce, "change", () => {
    configure();
    if (!reduce.matches) intro();
  });
  listen(document, "visibilitychange", () => {
    active = !document.hidden;
    if (active) request();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  root.querySelectorAll<HTMLElement>(".location-card").forEach((el) => {
    listen<PointerEvent>(
      el,
      "pointermove",
      (event) => {
        if (!fine.matches || reduce.matches || paused) return;
        const r = el.getBoundingClientRect();
        const x = clamp((event.clientX - r.left) / r.width),
          y = clamp((event.clientY - r.top) / r.height);
        el.style.setProperty("--tilt-x", ((0.5 - y) * 4).toFixed(2) + "deg");
        el.style.setProperty("--tilt-y", ((x - 0.5) * 4).toFixed(2) + "deg");
        el.classList.add("is-hover");
      },
      { passive: true },
    );
    listen(el, "pointerleave", () => el.classList.remove("is-hover"));
  });
  root.querySelectorAll<HTMLElement>(".pill").forEach((el) => {
    listen<PointerEvent>(
      el,
      "pointermove",
      (event) => {
        if (!fine.matches || reduce.matches || paused) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty(
          "--magnet-x",
          ((event.clientX - r.left - r.width / 2) * 0.1).toFixed(1) + "px",
        );
        el.style.setProperty(
          "--magnet-y",
          ((event.clientY - r.top - r.height / 2) * 0.16).toFixed(1) + "px",
        );
      },
      { passive: true },
    );
    listen(el, "pointerleave", () => {
      el.style.setProperty("--magnet-x", "0px");
      el.style.setProperty("--magnet-y", "0px");
    });
  });
  listen<FocusEvent>(root, "focusin", (event) => {
    if (event.target instanceof Element)
      event.target.closest(".motion-reveal")?.classList.add("in-view");
  });
  try {
    configure();
    intro();
    document.fonts?.ready.then(request);
  } catch {
    failSafe();
  }
  return () => {
    disposed = true;
    active = false;
    cancelAnimationFrame(frame);
    clearTimeout(introTimer);
    observer.disconnect();
    cleanups.forEach((fn) => fn());
    failSafe();
    root.classList.remove("motion-paused");
    root
      .querySelectorAll<HTMLElement>(".in-view,.is-hover")
      .forEach((el) => el.classList.remove("in-view", "is-hover"));
  };
}
