/* OmniAct project page: gallery, charts, video players. No dependencies. */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) n.append(c);
    return n;
  };

  /* ------------------------------------------------------------------ */
  /* Disabled link buttons (resources not public yet)                    */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('a[aria-disabled="true"]').forEach((a) =>
    a.addEventListener("click", (e) => e.preventDefault()));

  /* ------------------------------------------------------------------ */
  /* Loading order: the font and hero image are preloaded in <head>; all */
  /* other images and the video thumbnails (posters) load eagerly; video */
  /* files start only after the window "load" event and after their own */
  /* thumbnail has arrived. Clicks (play, pick a clip) still act at once. */
  /* ------------------------------------------------------------------ */
  const pageLoaded = new Promise((res) => {
    if (document.readyState === "complete") res(); else window.addEventListener("load", res, { once: true });
  });
  const imgReady = (src) => new Promise((res) => {
    if (!src) return res();
    const i = new Image(); i.onload = i.onerror = () => res(); i.src = src;
  });

  /* Autoplay muted videos only while they are on screen */
  const io = !reduceMotion && "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const { target: v, isIntersecting } of entries) {
      v._visible = isIntersecting;
      if (isIntersecting && !v.dataset.userPaused) {
        if (v.dataset.src && !v.getAttribute("src")) v.src = v.dataset.src;
        v.play().catch(() => {});
      } else if (!isIntersecting && !v.paused) {
        v.dataset.autoPause = "1";              // scrolled away: not a user pause
        v.pause();
      }
    }
  }, { threshold: 0.35 }) : null;
  // Track user pauses (so scrolling back does not restart a clip the viewer stopped); start observing, and with it
  // loading, only once the rest of the page and this video's thumbnail are in.
  const watch = (v) => {
    v.addEventListener("pause", () => { if (v.dataset.autoPause) delete v.dataset.autoPause; else if (!v.ended) v.dataset.userPaused = "1"; });
    v.addEventListener("play", () => { delete v.dataset.userPaused; });
    if (!io) { v.controls = true; return; }
    pageLoaded.then(() => imgReady(v.getAttribute("poster"))).then(() => io.observe(v));
  };
  // Point a video at a new clip. Its thumbnail shows first; a clip that was already loaded is swapped for the new
  // one only after the new thumbnail has arrived, and keeps playing if it is on screen.
  const setClip = (v, src, poster) => {
    const token = (v._clip = (v._clip || 0) + 1);
    v.dataset.src = src;
    delete v.dataset.userPaused;
    delete v.dataset.autoPause;
    if (!io) { v.poster = poster; v.src = src; return token; } // no autoplay: preload="none", nothing loads before play
    const hadSrc = !!v.getAttribute("src");
    if (hadSrc) { v.removeAttribute("src"); v.load(); }      // drop the old clip so the new thumbnail is what shows
    v.poster = poster;
    if (!hadSrc) return token;                                // not loaded yet: watch() / the observer will load it
    imgReady(poster).then(() => {
      if (v._clip !== token) return;                          // another clip was picked meanwhile
      if (v.getAttribute("src") !== src) v.src = src;
      if (v._visible) v.play().catch(() => {});
    });
    return token;
  };

  /* ------------------------------------------------------------------ */
  /* Embodiment gallery: show a few random rows, reshuffle on demand     */
  /* ------------------------------------------------------------------ */
  const N_ROWS = 70, SHOW = 4;
  const rowsBox = $("#gallery-rows");
  let deck = [];
  const drawRows = () => {
    if (deck.length < SHOW) {
      deck = Array.from({ length: N_ROWS }, (_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    }
    rowsBox.replaceChildren(...deck.splice(0, SHOW).map((i) => el("img", {
      src: `static/img/gallery/row${String(i).padStart(2, "0")}.webp`, width: "1600", height: "135", fetchpriority: "low", decoding: "async",
      alt: "A generated robot arm at rest followed by six frames of one of its simulated training trajectories.",
    })));
  };
  if (rowsBox) { drawRows(); $("#shuffle").addEventListener("click", drawRows); }

  /* ------------------------------------------------------------------ */
  /* Bar charts                                                          */
  /* ------------------------------------------------------------------ */
  const CHARTS = {
    "chart-bench": [
      ["OmniAct", 63.0, true], ["UMI (all views)", 57.9], ["UMI-on-Air", 21.4], ["UMI", 21.1],
      ["π0.5-DROID", 17.8], ["MolmoAct2-DROID", 14.7], ["DreamZero-DROID", 10.0], ["MolmoAct2-YAM", 4.4],
    ],
    "chart-franka": [
      ["OmniAct", 69.1, true], ["MolmoBot", 63.0], ["π0.5-DROID", 28.2], ["MolmoAct2-DROID", 22.5], ["DreamZero-DROID", 13.2],
    ],
  };
  for (const [id, rows] of Object.entries(CHARTS)) {
    const box = document.getElementById(id);
    if (!box) continue;
    const max = parseFloat(box.dataset.max || "100");
    box.setAttribute("role", "list");
    const bars = [];
    for (const [name, v, ours] of rows) {
      const bar = el("div", { class: "chart-bar" });
      bars.push([bar, v / max * 100]);
      box.append(el("div", { class: "chart-row" + (ours ? " ours" : ""), role: "listitem", "aria-label": `${name}: ${v.toFixed(1)}%` }, [
        el("div", { class: "chart-label", text: name, title: name }),
        el("div", { class: "chart-track" }, [bar]),
        el("div", { class: "chart-value", text: v.toFixed(1) + "%" }),
      ]));
    }
    const grow = () => bars.forEach(([b, w]) => { b.style.width = Math.min(w, 100) + "%"; });
    if (reduceMotion || !("IntersectionObserver" in window)) grow();
    else new IntersectionObserver((es, obs) => { if (es.some((e) => e.isIntersecting)) { grow(); obs.disconnect(); } }, { threshold: 0.3 }).observe(box);
  }

  /* ------------------------------------------------------------------ */
  /* OpenYAM clips                                                       */
  /* ------------------------------------------------------------------ */
  const BOWL = "“Pick up the green cube and place it in or on the white bowl.”";
  const YAM = [
    { group: "Clutter and reach", id: "three", title: "Three objects", text: "“Pick up the green cube and place it in or on the receptacle.”" },
    { group: "Clutter and reach", id: "five", title: "Five objects", text: BOWL },
    { group: "Clutter and reach", id: "five_closer", title: "Closer together", text: "Five objects placed closer together. " + BOWL },
    { group: "Clutter and reach", id: "five_edge", title: "Near the edge", text: "Five objects, with the cube near the front edge of the table. " + BOWL },
    { group: "Clutter and reach", id: "five_on_top", title: "Cube on the box", text: "Five objects, with the cube resting on top of the box. " + BOWL },
    { group: "Clutter and reach", id: "five_unreachable", title: "Hard to reach", text: "Five objects in a hard-to-reach layout. " + BOWL },
    { group: "Clutter and reach", id: "arm_stretch", title: "Far target", text: "The cube is far from the bowl, so the arm extends its long final link toward it. " + BOWL },
    { group: "Perturbations", id: "rearranged", title: "Rearranged", text: "After the policy commits to its initial direction, we rearrange the scene. " + BOWL },
    { group: "Perturbations", id: "rearranged_and_target_moved_last_second", title: "Bowl moved last second", text: "The scene is rearranged, then the bowl is moved after the policy has picked the cube and is already hovering over the old location. " + BOWL },
    { group: "Perturbations", id: "object_taken_out_of_target", title: "Cube taken out", text: "The cube starts inside the bowl and is taken out after the policy starts to act. " + BOWL },
  ];
  const yamVideo = $("#yam-video"), yamCap = $("#yam-caption"), yamClips = $("#yam-clips");
  if (yamVideo && yamClips) {
    const groups = {};
    const select = (clip, play) => {
      yamClips.querySelectorAll(".pill").forEach((p) => p.setAttribute("aria-selected", String(p.dataset.id === clip.id)));
      const token = setClip(yamVideo, `static/video/openyam/${clip.id}.mp4`, `static/video/openyam/${clip.id}.webp`);
      yamCap.innerHTML = `<b>${clip.title}.</b> ${clip.text}`;
      if (play) {                                             // the viewer picked a clip: load it right after its thumbnail
        imgReady(yamVideo.getAttribute("poster")).then(() => {
          if (yamVideo._clip !== token) return;
          if (yamVideo.getAttribute("src") !== yamVideo.dataset.src) yamVideo.src = yamVideo.dataset.src;
          yamVideo.play().catch(() => {});
        });
      }
    };
    for (const clip of YAM) {
      if (!groups[clip.group]) {
        groups[clip.group] = el("div", { class: "clip-group", role: "tablist", "aria-label": clip.group }, [el("span", { class: "clip-group-label", text: clip.group })]);
        yamClips.append(groups[clip.group]);
      }
      const b = el("button", { class: "pill", type: "button", role: "tab", "data-id": clip.id, text: clip.title });
      b.addEventListener("click", () => select(clip, true));
      groups[clip.group].append(b);
    }
    yamVideo.removeAttribute("src");
    yamVideo.querySelectorAll("source").forEach((s) => s.remove());
    select(YAM[1], false);
    watch(yamVideo);
  }

  /* ------------------------------------------------------------------ */
  /* Franka: nine policies on the same setup                             */
  /* ------------------------------------------------------------------ */
  // Outcome per setup 1..20 (1 = success), from the evaluation videos.
  const POLICIES = [
    { id: "omniact", name: "OmniAct", ours: true, seen: false, outcome: "11110011010111011101" },
    { id: "molmoact2_3v", name: "MolmoAct2-DROID", seen: true, outcome: "11101111111100110010" },
    { id: "dreamzero", name: "DreamZero-DROID", seen: true, outcome: "00111111011110011111" },
    { id: "pi05", name: "π0.5-DROID", seen: true, outcome: "11111011000110110110" },
    { id: "molmobot", name: "MolmoBot", seen: true, outcome: "11001000000111001010" },
    { id: "lap", name: "LAP-3B", seen: true, outcome: "11010101010001100000" },
    { id: "umi", name: "UMI (all views)", seen: false, outcome: "11000011010000011111" },
    { id: "umi_on_air", name: "UMI-on-Air", seen: false, outcome: "00100000000000000000" },
    { id: "umi_wrist", name: "UMI", seen: false, outcome: "00000000000000000010" },
  ];
  const TASKS = [["red cube", "blue plate"], ["red cube", "pink bowl"], ["purple cup", "cyan plate"], ["wooden cube", "pink bowl"]];
  // The arrow is drawn, not typed: the Inter subsets the page ships have no U+2192 glyph.
  const ARROW = '<svg class="arrow" viewBox="0 0 16 10" aria-hidden="true"><path d="M1 5h13M10 1.5L14 5l-4 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const taskHTML = ([a, b]) => `${a} ${ARROW}<span class="visually-hidden">to</span> ${b}`;
  const taskText = ([a, b]) => `${a} to ${b}`;
  const pad = (s) => String(s).padStart(2, "0");
  const ICON_OK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_NO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const setupsBox = $("#setups"), grid = $("#franka-grid"), title = $("#setup-title");
  if (setupsBox && grid) {
    const cards = POLICIES.map((p) => {
      const v = el("video", { muted: "", loop: "", playsinline: "", preload: "none" });
      v.muted = true;
      v.addEventListener("click", () => { if (!v.getAttribute("src")) v.src = v.dataset.src; if (v.paused) v.play().catch(() => {}); else v.pause(); });
      const badge = el("span", { class: "badge" });
      const card = el("article", { class: "vcard" + (p.ours ? " ours" : "") }, [
        el("div", { class: "vcard-head" }, [
          el("span", { class: "vcard-name", text: p.name }),
          el("span", { class: "vcard-tag", text: p.seen ? "trained on Franka" : "never saw Franka" }),
        ]),
        v,
        el("div", { class: "vcard-foot" }, [badge]),
      ]);
      grid.append(card);
      return { p, v, badge };
    });

    const choose = (s) => {
      setupsBox.querySelectorAll(".setup-btn").forEach((b) => b.setAttribute("aria-selected", String(+b.dataset.setup === s)));
      title.innerHTML = `Setup ${s} <span>· ${taskHTML(TASKS[Math.floor((s - 1) / 5)])}</span>`;
      for (const { p, v, badge } of cards) {
        setClip(v, `static/video/franka/${p.id}/setup${pad(s)}.mp4`, `static/video/franka/${p.id}/setup${pad(s)}.webp`);
        const ok = p.outcome[s - 1] === "1";
        badge.className = "badge " + (ok ? "ok" : "no");
        badge.innerHTML = (ok ? ICON_OK : ICON_NO) + (ok ? "Success" : "Failure");
        v.setAttribute("aria-label", `${p.name}, setup ${s}: ${ok ? "success" : "failure"}`);
      }
    };

    TASKS.forEach((task, t) => {
      setupsBox.append(el("div", { class: "setup-task", html: taskHTML(task) }));
      for (let k = 1; k <= 5; k++) {
        const s = t * 5 + k;
        const b = el("button", { class: "setup-btn", type: "button", role: "tab", "data-setup": String(s), "aria-label": `Setup ${s}: ${taskText(task)}` }, [
          el("img", { src: `static/img/setups/setup${pad(s)}.webp`, width: "192", height: "192", alt: "" }),
          el("span", { text: String(s) }),
        ]);
        b.addEventListener("click", () => choose(s));
        setupsBox.append(b);
      }
    });
    choose(7);
    cards.forEach(({ v }) => watch(v));
  }

  /* ------------------------------------------------------------------ */
  /* Copy BibTeX                                                         */
  /* ------------------------------------------------------------------ */
  const copyBtn = $("#copy-bib");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    const text = $("#bib-text").textContent;
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = "Copied"; }
    catch { const r = document.createRange(); r.selectNodeContents($("#bib-text")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copyBtn.textContent = "Press Ctrl+C"; }
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 1800);
  });

  /* ------------------------------------------------------------------ */
  /* Highlight the current section in the nav                            */
  /* ------------------------------------------------------------------ */
  const links = [...document.querySelectorAll(".navlinks a")];
  if ("IntersectionObserver" in window && links.length) {
    const byId = Object.fromEntries(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const navIO = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { links.forEach((a) => a.classList.remove("active")); byId[e.target.id]?.classList.add("active"); }
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach((id) => { const s = document.getElementById(id); if (s) navIO.observe(s); });
  }
})();
