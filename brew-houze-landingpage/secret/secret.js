// Brew Houze × aespa: the secret themes of the portal (styles in secret.css, whiplash.css,
// dirtywork.css and armageddon.css; photos and sound in whiplash/, dirty-work/ and armageddon/).
//
// The "© Brew Houze" line in the footer opens the theme picker: the café, Whiplash, Dirty Work,
// Armageddon or Drama, straight from any of them. Each
// theme has the four members (plates that open photo cards), an intro that follows its own sound
// clip, and music that loops while the theme is on. index.html sets the theme before the page
// paints (so a reload keeps it without a flash) and provides showToast().
(() => {
  const root = document.documentElement;
  const THEME_KEY = "brew-houze-theme"; // the theme that is on, or "cafe"
  const LAST_KEY = "brew-houze-theme-next"; // the theme last picked (loaded ahead in the café)
  const SOUND_KEY = "brew-houze-aespa-sound"; // "off" when the visitor muted the music
  const ORDER = ["whiplash", "dirtywork", "armageddon", "drama"]; // the picker's order, after the café
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked: lasts until reload */ } },
  };
  const motionOK = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const toast = (message) => { if (typeof window.showToast === "function") window.showToast(message); };
  // A file of the site as a full URL (for url() in inline custom properties, which resolve late).
  const siteUrl = (file) => new URL(file, document.baseURI).href;

  // ── The members ──
  const MEMBERS = {
    karina: { name: "Karina", hangul: "카리나", short: "Leader · main dancer", real: "Yu Ji-min (유지민)", born: "April 11, 2000", from: "Suwon, South Korea", role: "Leader · main dancer · lead rapper", about: "aespa’s leader and center, known for sharp, powerful dancing and a commanding stage presence." },
    giselle: { name: "Giselle", hangul: "지젤", short: "Main rapper", real: "Uchinaga Aeri (内永枝利)", born: "October 30, 2000", from: "Japan and South Korea, raised in Tokyo", role: "Main rapper · sub vocalist", about: "aespa’s main rapper, who moves easily between Korean, Japanese and English." },
    winter: { name: "Winter", hangul: "윈터", short: "Main vocalist · lead dancer", real: "Kim Min-jeong (김민정)", born: "January 1, 2001", from: "Yangsan, South Korea", role: "Main vocalist · lead dancer", about: "A main vocalist with a clear, powerful voice, and one of the group’s lead dancers." },
    ningning: { name: "Ningning", hangul: "닝닝", short: "Main vocalist", real: "Ning Yizhuo (宁艺卓)", born: "October 23, 2002", from: "Harbin, China", role: "Main vocalist · the youngest", about: "The youngest member and a main vocalist, known for her strong live vocals." },
  };
  const memberOrder = Object.keys(MEMBERS);
  // The back of the Dirty Work cards: a funny, a cute and a cool fact per member. They are built only
  // from things that are certain (birthdays, hometowns, positions, aespa's avatar concept), with a
  // playful twist. Edit freely; each is [label, text].
  const DIRTY_FACTS = {
    karina: [
      ["Funny", "aespa’s concept gives every member an avatar, so there is also an æ-Karina. Technically, the group has two leaders."],
      ["Cute", "She is the oldest member, but only just: Giselle was born the same year, six months later."],
      ["Cool", "The leader and the center, the one out front when the formation hits."],
    ],
    giselle: [
      ["Funny", "Her birthday is October 30, the day before Halloween. Costume planning starts early."],
      ["Cute", "Her birthday is exactly one week after Ningning’s, just two years earlier."],
      ["Cool", "She raps in Korean, Japanese and English."],
    ],
    winter: [
      ["Funny", "Her name is Winter and she was born on January 1. Very on brand."],
      ["Cute", "She gets a year older on New Year’s Day, so the whole world celebrates with her."],
      ["Cool", "Main vocalist and lead dancer: she carries the high notes and the choreography."],
    ],
    ningning: [
      ["Funny", "Born one week before Giselle’s birthday, two years later, so their parties are practically back to back."],
      ["Cute", "The maknae, the youngest of the four, born October 23, 2002."],
      ["Cool", "She grew up in Harbin, China’s “Ice City”, famous for its giant ice and snow festival."],
    ],
  };

  // ── Intros: each cue on its beat of the theme's intro clip (ms from its start) ──
  // An intro is { end, cues, mount(box, photos) → show(step) }. The player (playIntro) follows the
  // clip's own clock, so the cues stay in time even if the sound starts late; without sound they
  // follow the page clock instead.

  // Whiplash: the album's chrome camera. The clip's three opening stabs (0.06 / 0.30 / 0.53 s)
  // snap it closer out of the dark (its green button glowing); in the pause it pushes in and dives
  // through the lens into the viewfinder (REC, timecode, focus brackets). The groove's four hits
  // (1.13 / 1.37 / 1.73 / 1.97 s) are camera flashes, each whip-panning in a group photo; the next
  // two (2.21 / 2.44 s) drop the members in as four strips, two at a time, and they go grey in the
  // lull. The logo whips in in chrome on 3.04 s, and the crash (3.27 s) flips to white with the
  // black logo, strobing on the last two hits; the clip runs straight into track 1.
  const whiplashIntro = {
    end: 3750,
    cues: [
      [0, "dark"], [60, "lens", 1], [300, "lens", 2], [530, "lens", 3], [910, "dive"],
      [1130, "shot", 0], [1370, "shot", 1], [1730, "shot", 2], [1970, "shot", 3],
      [2210, "strips", 2], [2440, "strips", 4], [2650, "fade", 4],
      [3040, "logo"], [3270, "final"], [3510, "final-invert"], [3630, "final"],
    ],
    hits: new Set(["lens", "shot", "strips", "logo", "final", "final-invert"]),
    mount(box, photos, flashes) {
      box.innerHTML = `
        <div class="wl-device"><img src="whiplash/device.webp" alt="" draggable="false" /><i class="wl-led"></i></div>
        <div class="wl-shots"></div>
        <div class="wl-strips">${memberOrder.map((key, index) => `<figure><figcaption><b>0${index + 1}</b>${escapeHtml(MEMBERS[key].name)}</figcaption></figure>`).join("")}</div>
        <div class="wl-hud"><i class="wl-corner"></i><i class="wl-corner"></i><i class="wl-corner"></i><i class="wl-corner"></i><i class="wl-focus"></i>
          <span class="wl-rec">REC</span><span class="wl-tc">00:00:00:00</span><span class="wl-meta">ISO 0320 · 1/8000 · ƒ1.4</span><span class="wl-count"></span></div>
        <i class="wl-streaks"></i>
        <div class="wl-logo"></div>
        <div class="wl-final"><i></i><b></b><small>Brew Houze × aespa</small></div>
        <i class="wl-pop"></i>`;
      box.querySelector(".wl-shots").append(...flashes);
      box.querySelectorAll(".wl-strips figure").forEach((figure, index) => figure.prepend(photos[index]));
      const count = box.querySelector(".wl-count");
      // The viewfinder's timecode runs at 24 frames a second while the intro is on.
      const tc = box.querySelector(".wl-tc");
      const began = performance.now();
      const tick = () => {
        const ms = performance.now() - began;
        if (ms > 6000) return;
        const frames = Math.floor(ms / 1000 * 24);
        tc.textContent = `00:00:${String(Math.floor(frames / 24)).padStart(2, "0")}:${String(frames % 24).padStart(2, "0")}`;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return (step) => {
        const [, scene, value] = this.cues[step];
        const shot = scene === "shot" ? flashes[value] : null;
        const ready = !shot || (shot.complete && shot.naturalWidth > 0);
        flashes.forEach((img) => img.classList.toggle("is-current", img === shot));
        const classes = ["wl-intro", `is-${ready ? scene : "dive"}`];
        if (scene === "lens") classes.push(`is-lens-${value}`);
        if (scene === "strips" || scene === "fade") classes.push(`is-strips-${value}`);
        if (shot) { classes.push(value % 2 ? "is-from-left" : "is-from-right"); count.textContent = `SHOT 0${value + 1}/04`; }
        if (scene === "strips") count.textContent = "æ · 04";
        box.className = classes.join(" ");
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
    },
  };

  // ── The secret scenes (the glowing lyric of the bridge opens them; see playScene) ──
  // A scene is { src, className, cues [[seconds into the clip, name]], mount(box, video) →
  // { show(cue, now), tick(now), unmount() } }: the MV from the bridge to the end, bleeding in and
  // out of the page in the era's way, following the video's own clock. The page stays scrollable
  // and usable under it.
  // Mirrors: canvases in the page that show a part of the video (drawn every frame while on
  // screen), so the MV plays inside the page's own parts. wall: the box the video is spread over
  // (as cover); a mirror shows the part of it under the mirror.
  const viewportWall = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
  function drawMirror(canvas, video, wall) {
    if (!mirrorsDue || !video.videoWidth) return;
    wall ??= canvas.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom < 0 || box.top > window.innerHeight) return;
    const scale = Math.max(wall.width / video.videoWidth, wall.height / video.videoHeight);
    const left = wall.left + (wall.width - video.videoWidth * scale) / 2;
    const top = wall.top + (wall.height - video.videoHeight * scale) / 2;
    const ratio = mirrorRatio();
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    canvas.getContext("2d").drawImage(video, (box.left - left) / scale, (box.top - top) / scale, box.width / scale, box.height / scale, 0, 0, width, height);
  }
  // A mirror framed on one spot of the video instead: centred on x (0-1 of its width), from top
  // (0-1 of its height) down, as big as fits within maxWidth / maxHeight (fractions too).
  function drawCrop(canvas, video, x, top, maxWidth, maxHeight) {
    if (!mirrorsDue || !video.videoWidth) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom < 0 || box.top > window.innerHeight) return;
    const aspect = box.width / box.height;
    let height = maxHeight * video.videoHeight;
    let width = height * aspect;
    if (width > maxWidth * video.videoWidth) { width = maxWidth * video.videoWidth; height = width / aspect; }
    const ratio = mirrorRatio();
    const w = Math.round(box.width * ratio);
    const h = Math.round(box.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.getContext("2d").drawImage(video, x * video.videoWidth - width / 2, top * video.videoHeight, width, height, 0, 0, w, h);
  }
  // Phones and tablets run the scenes lighter: the mirrors drawn about 24 times a second at 1x, the
  // costliest effects off (html[data-scene-lite], see the scene styles). On a computer the mirrors
  // are drawn up to 60 times a second. mirrorsDue is set by the scene player every frame.
  const SCENE_LITE = window.matchMedia("(pointer: coarse)").matches || /iP(hone|ad|od)/.test(navigator.userAgent);
  let mirrorsDue = true;
  const mirrorRatio = () => (SCENE_LITE ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  // An SVG as a CSS url() (for the masks the scenes draw).
  const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const mirror = (className) => { const canvas = document.createElement("canvas"); canvas.className = className; canvas.setAttribute("aria-hidden", "true"); return canvas; };
  // What is on screen now, of the page's parts (for the focus box to lock onto).
  const onScreen = (selector) => [...document.querySelectorAll(selector)].filter((el) => { const box = el.getBoundingClientRect(); return box.width > 30 && box.top > 40 && box.bottom < window.innerHeight - 40; });

  // Whiplash (126 BPM). The page stays; the MV bleeds into it, through the camera:
  //   everywhere  every app card turns into a monitor playing the MV; a green autofocus box locks
  //               onto a new part of the page on every beat; the viewfinder frames the screen
  //   bridge (0-16.41 s)  the MV plays inside the four member plates, one wide shot across their
  //                       photos, a blur of it glowing behind the header; the page dims around them
  //   drop (16.41 s)      a white flash; the MV bursts out through a slit and fills the screen
  //   chorus              by the bar: the MV whips in through racing slits across the screen (the
  //                       page between them), then the shutter fires and the frame drops onto the
  //                       page as a snapshot (SHOT 04 · 00:00:22:10), where it stays as you scroll
  //   break (32.9 s)      the page goes dark and the MV shows only through the WHIPLASH logo, grey
  //   giselle (18.23 s)   Giselle, pink-haired, at the start of the chorus: the autofocus locks onto her
  //                       plate, which lifts in chrome and plays her, the page dark around it; the
  //                       shutter fires on her hits and drops her snapshot onto the page
  //   final (37.36 s)     it rips back in from the side, blurred with speed, then the slits again
  //   end (47.83 s)       it pulls back into the logo, which shrinks away; the snapshots blow away
  const WL_BAR = 240 / 126;
  // The final pose (from 47.83 s): the four stand in a row, mirrored against the plates (left to
  // right Ningning, Winter, Giselle, Karina); each plate frames its own member, head down.
  const WL_POSE = { karina: 0.848, giselle: 0.634, winter: 0.377, ningning: 0.16 };
  const whiplashScene = {
    src: "whiplash/scene.mp4",
    className: "wl-scene",
    cues: [[0, "bridge"], [16.41, "drop"], [17.3, "chorus"], [18.23, "giselle"], [21.37, "chorus"], [32.9, "break"], [37.36, "final"], [38.3, "chorus2"], [47.83, "end"]],
    mount(box, video) {
      box.innerHTML = `
        <i class="wls-dim"></i>
        <div class="wls-slits">${"<div></div>".repeat(6)}</div>
        <div class="wls-screen"></div>
        <i class="wls-flash"></i>
        <div class="wls-focus"><b>AF · LOCK</b></div>
        <p class="wls-subject" aria-hidden="true">Subject <b>Giselle</b> <span>지젤</span></p>
        <div class="wls-hud"><i class="wls-corner"></i><i class="wls-corner"></i><i class="wls-corner"></i><i class="wls-corner"></i>
          <span class="wls-rec">REC</span><span class="wls-tc">00:00:00:00</span><span class="wls-shot">STANDBY</span></div>`;
      box.querySelector(".wls-screen").append(video);
      const tc = box.querySelector(".wls-tc");
      const shot = box.querySelector(".wls-shot");
      const focus = box.querySelector(".wls-focus");
      const slits = [...box.querySelectorAll(".wls-slits > div")].map((slit) => { const canvas = mirror("wls-slit"); slit.append(canvas); return canvas; });
      // The mirrors in the page: the plates' photos, a blur behind the header, and every app card.
      const lineup = document.getElementById("ae-lineup");
      lineup.scrollIntoView({ block: "center" });
      const plates = [...lineup.querySelectorAll(".ae-member")].map((plate) => { const canvas = mirror("wls-plate"); plate.querySelector(".ae-photo")?.after(canvas); return canvas; });
      const hero = document.querySelector(".hero");
      const ambient = mirror("wls-ambient");
      hero.prepend(ambient);
      const cards = [...document.querySelectorAll(".card")].map((card, index) => { const canvas = mirror("wls-card"); canvas.style.setProperty("--i", index % 6); card.prepend(canvas); return canvas; });
      // The snapshots: the frame on the shutter, dropped onto the page (they scroll with it).
      const snaps = [];
      const snapshot = (now, caption) => {
        if (!video.videoWidth) return;
        const width = Math.round(Math.min(250, window.innerWidth * 0.42));
        const figure = document.createElement("figure");
        figure.className = "wls-snap";
        figure.setAttribute("aria-hidden", "true");
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 225;
        canvas.getContext("2d").drawImage(video, 0, 0, 400, 225);
        const frames = Math.floor(now * 30);
        figure.innerHTML = `<figcaption><b>${caption ?? `SHOT ${String(Math.floor((now - 16.41) / WL_BAR) + 1).padStart(2, "0")}`}</b> 00:00:${String(Math.floor(frames / 30)).padStart(2, "0")}:${String(frames % 30).padStart(2, "0")}</figcaption>`;
        figure.prepend(canvas);
        const left = window.scrollX + 16 + Math.random() * Math.max(0, window.innerWidth - width - 32);
        const top = window.scrollY + 70 + Math.random() * Math.max(0, window.innerHeight - width * 0.75 - 150);
        figure.style.cssText = `left: ${left.toFixed(0)}px; top: ${top.toFixed(0)}px; width: ${width}px; --r: ${(Math.random() * 18 - 9).toFixed(1)}deg`;
        document.body.append(figure);
        snaps.push(figure);
        if (snaps.length > 8) snaps.shift().remove();
      };
      // The autofocus box: onto a part of the page on screen.
      const lockOn = (beat) => {
        const targets = onScreen(".ae-member, .card, .section h2, .guide-item, .hero h1, .tips li");
        if (!targets.length) return;
        const target = targets[(((beat * 7 + 3) % targets.length) + targets.length) % targets.length].getBoundingClientRect();
        focus.style.cssText = `left: ${target.left - 6}px; top: ${target.top - 6}px; width: ${target.width + 12}px; height: ${target.height + 12}px`;
        focus.classList.remove("is-locked");
        void focus.offsetWidth;
        focus.classList.add("is-locked");
      };
      // Giselle: her plate, and the shutter on her hits (measured).
      const giselle = plates.find((canvas) => canvas.closest(".ae-member")?.dataset.member === "giselle");
      const focusLabel = focus.querySelector("b");
      const WL_GISELLE_HITS = [18.45, 18.88, 19.29, 19.84, 20.32, 20.85, 21.17];
      let nextShutter = 0;
      let bleed = "";
      let lastBar = null;
      let lastBeat = null;
      return {
        show(cue, now) {
          box.style.setProperty("--bar-lag", `${(-(((now - 16.41) % WL_BAR) + WL_BAR) % WL_BAR).toFixed(3)}s`);
          if (cue === "end") {
            snaps.forEach((figure, index) => { figure.style.setProperty("--k", index); figure.classList.add("is-gone"); });
            plates.forEach((canvas) => canvas.classList.add("is-framed"));
          }
        },
        tick(now) {
          const frames = Math.floor(now * 30);
          tc.textContent = `00:00:${String(Math.floor(frames / 30)).padStart(2, "0")}:${String(frames % 30).padStart(2, "0")}`;
          shot.textContent = now < 16.41 ? "BRIDGE · PLATES" : `SHOT ${String(Math.floor((now - 16.41) / WL_BAR) + 1).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          const chorus = cue === "chorus" || cue === "chorus2";
          const bar = Math.floor((now - 16.41) / WL_BAR);
          const beat = Math.floor((now - 16.41) / (WL_BAR / 4));
          // By the bar in the choruses: the slits on the even bars, the snapshot on the odd ones.
          const next = chorus ? (bar % 2 === 0 ? "slits" : "page") : "";
          if (next !== bleed) { bleed = next; box.dataset.bleed = next; }
          if (bar !== lastBar) { lastBar = bar; if (chorus && bar % 2 === 1) snapshot(now); }
          if (beat !== lastBeat) { lastBeat = beat; if (cue !== "end" && cue !== "load" && cue !== "break" && cue !== "giselle") lockOn(beat); }
          focusLabel.textContent = cue === "giselle" ? "AF · GISELLE" : "AF · LOCK";
          // Giselle: the box stays locked on her plate; the shutter fires on her hits, the first one a snapshot.
          if (cue === "giselle" && giselle) {
            const at = giselle.closest(".ae-member").getBoundingClientRect();
            focus.style.cssText = `left: ${at.left - 8}px; top: ${at.top - 8}px; width: ${at.width + 16}px; height: ${at.height + 16}px`;
            if (nextShutter > 0 && now < WL_GISELLE_HITS[nextShutter - 1] - 0.5) nextShutter = 0;
            while (nextShutter < WL_GISELLE_HITS.length && WL_GISELLE_HITS[nextShutter] <= now) {
              if (now - WL_GISELLE_HITS[nextShutter] < 0.2) {
                box.classList.remove("is-shutter"); void box.offsetWidth; box.classList.add("is-shutter");
                if (nextShutter === 1) snapshot(now, "GISELLE · 지젤");
              }
              nextShutter++;
            }
          }
          // The mirrors (only those on screen are drawn).
          const photos = plates.filter((canvas) => canvas.isConnected && !(cue === "giselle" && canvas === giselle));
          if (cue === "giselle" && giselle) drawCrop(giselle, video, 0.49, 0, 0.34, 0.95);
          if (cue === "end") photos.forEach((canvas) => drawCrop(canvas, video, WL_POSE[canvas.closest(".ae-member")?.dataset.member] ?? 0.5, 0.13, 0.225, 0.8));
          else if (photos.length) {
            const boxes = photos.map((canvas) => canvas.getBoundingClientRect());
            const wall = { left: Math.min(...boxes.map((b) => b.left)), top: Math.min(...boxes.map((b) => b.top)), width: 0, height: 0 };
            wall.width = Math.max(...boxes.map((b) => b.right)) - wall.left;
            wall.height = Math.max(...boxes.map((b) => b.bottom)) - wall.top;
            photos.forEach((canvas) => drawMirror(canvas, video, wall));
          }
          drawMirror(ambient, video, hero.getBoundingClientRect());
          cards.forEach((canvas) => drawMirror(canvas, video));
          if (bleed === "slits") slits.forEach((canvas) => drawMirror(canvas, video, viewportWall()));
        },
        unmount() {
          [...plates, ambient, ...cards].forEach((canvas) => canvas.remove());
          snaps.forEach((figure) => figure.remove());
        },
      };
    },
  };

  // Dirty Work (98 BPM). The page stays; the MV gets on it like dirt, water and work. It follows the
  // song itself: its bass and its melody (DW_ENV, measured from the MV's sound 20 times a second)
  // drive the mud, the shimmer, the tapes and the logo, and the choreo's hits move the page.
  //   bridge (0-20 s)      mud lands on the page on the bass hits: splats that are smeared windows
  //                        onto the MV behind the page, flecks flying, drips running down (they scroll
  //                        with the page); the plates play it in grimy sepia
  //   wet (20 s)           the rain: the mud rinses off, rain streaks the page (harder with the
  //                        melody), water drops slide down the screen, each showing the MV upside down
  //   ningning (24.45 s)   her close-up in her plate, lifted in gold, the rest dark, her name stamped
  //   wet2 (26.3 s)        the splash: spray and ripples, then the drops again
  //   strobe (36.8 s)      the rain strobe flickers the page
  //   drop (39.21 s)       two caution tapes slam across the screen in an X, the MV inside them
  //   chorus               by the bar: the tapes (throbbing with the bass) whip back in, then a gold
  //                        DIRTY WORK stamp of the frame thuds onto the page; gold shimmer on the melody
  //   breakdown (56 s)     the long dance take through the giant DIRTY WORK logo (pulsing with the
  //                        bass), gold sparks; every 2 bars it gives the stage back to the plates
  //   shake (58.7 s)       the page shaken on every hit of the choreo
  //   hips (62 s)          the page sways with their hips, left and right, dropping low on each hit
  //   strobe2 (75.57 s)    the reflective jackets strobe; the tapes and stamps are ripped off
  //   iris (77.6 s)        the last wide shot closes to a circle, the drain pipe of the bridge
  //   title (79.75 s)      the MV's own DIRTY WORK and aespa cards print onto the page itself (the
  //                        page's own logo steps aside for them)
  const DW_BEAT = 60 / 98;
  const DW_DROP = 39.21; // bar 1 of the chorus (the grid of the rest of the MV)
  // The song's bass and its melody (treble), 0-63 a character, 20 a second from the start of the MV.
  const DW_ENV = { low: "uKRIDzylciXMFnmi847uzDCBErpswk9EUZEHDmwBywBxojinouXSw60553lXVCd86a79SZF92033343365b88becbcdafxwDzzAPMylkkd6o-YKxu200cyzzAywxtsqngLYLxrjkzCGHIwyqpolsTRl85344oX_ra6456cSYD800174434555300144423fAzByzAJNzmol85lMYsf81013swwuspqplhieKVPhehhlgb77eouwxzzUSq31320pWZn61000dVYB722343333551232664222dnomhhuROtlqptwzMWBsuxxyAfeddddnCDEEDSUGkcbczAAABuDAAEEzpmnqtjvDszJGnnmipiotwnqrnggrmnhtuxyztsvxutormnnqqROlikhknsrqrb9aghqV-KfbbqvcbjoRYWQLJfbbflpuxqrniz--nmqsxzK--Q8bbdgq_-QqnknlfrDHzACABClfabnjoqpnnhFW_xxtywvtrmusutwuytvxuyytqwyBB_WSvsrsuxBywtqnptwMV-ErywzwJ--PssvyAzTQItwysqtxByrswtxzrppstvvvtronBZUnjlpqpF--uffdjnpyrvpvrsojzGJSXREEFcchjqrvtorvuF-_qoqspnK--Dieefnw--MtqniijAFLBDBCFIfhkjoknprrrrJ-YGzryxaLTRwrvymtiywkjrhplkrnpT-JgynqtsCtjuuCqzApedb7fddaggda9ffafdd789jjfa76geb7ec88da97beb8baa8xNInqpqomEORkuyvuqpuFNUUZMBpoknFWEjfgdgihfhopmqmrINJCBFzDrF--xuyACDDLGxHzBndppjloooroqnomoomnvttrsJVOqrllioAJJvCCyxvnyGENFGIrosrlDKzhjefgeikdoppolnBLQTIKQDBJ--OTNMUVLIMttwDifrnihnpomihfiheiihnqqrrDPCmppqnmOOKszzzwwuzHJR_WJDusqqIVEgbdefgbfgmqnqooDNFEHIEztw--GQPNLSRSKvvzxmjpomlqpoqqmionqpnqrpuvuO-PqursooLSIzAEECvwuTWRUUGFppqqKNBjfecdhdihqnonponjkmkholhmmhoekrqmmjebijfaafjfdaeeahdieacbfbc8aaaANFssqnooKKHtuAAzvsDQRUURFqwrpqMUAiddbbceddkkhiikESOIKIBFEQ--suwDAFJQVpBJBkkookktqofabacfcdemqoomnU-SwvpqpoKNKxAFJBBuDOXQSVKyqnnsELziffcdechgnpmnkhLXPQRTKFCT--GTXV_ZROSnuwxjhnlkisnoqnkhllmnmhlmnmlIOBpklkihSMEpwzDxCxEW_Z-TKzqtotJYygbdba9dadookpmmGUHPPMFEAS--wHLQQWRTSnDEypipolkspoebb9ggdfgnppnnrT-IwuqqnnKRDuBDJDFxzNNUNNJDnqovBQuijeeheeihlnplkiwqvpxuwwtwyxtuuAyBuqqosrpqggihdhjrnihnhilljeigkejotyyBBzzwutwxxAAxyvwzwyzAwg10000000000000000000000100121010000100012312132314122010010100001000000000000000000000000000000000000000000", high: "vxtpAQytKSFtAVpnqwJKAFEptMNquvqxrruiaTHttaqGncIwpnstneEBvrrjlvWvte8uvkdte0gjwxHOAsrule--JErnqogjhiCBqusppkcsidDVn65GvoimkdckrsrunwktPrq-Xwc9Frihtgeowlj7tDwGzp6yQvtgmFFxvu21pvxxyxAxvnGA-LBDHGKJFCzCQBBlxAvcAVLfD-zsyyKQTFslrMEECAADqdBnbZJHGHCuyMBtoDttCqAD83MBwO-MCKLOMMqononwAvstvurqm6ZEyzBEBTNFwyBFJPUrHSGqEgBUIAGGxttvovvnCsqqqtxxrLP-ColkojyBwrbxZKLDHKLqJKlnHQUSCAMWZXTIKKIHHMSLEFqmxMSQWJFxqOQORNRPQ-_KCzFBKWyzwpororslfrqqplfqnmnjg-wigfcjnlhe8pmj8Gsoe5l97GYGAByBsoidacmmdbLxrc8999YTGHGAwsold9rqwkbvICjjAtCMDxrhqurqoqmxutrliBuqrhjGBrlkhqsspndrmgbqmmniob9AOJDyvurnhhmhqramslFElom8HFGFGEGyuyAyvrplhFumhonkOPwxtnlnutqnfmrqsllrpopnf-yqomejqoifdpklatrsl8k97ZQrstpvlgkiefprkdCtkbadbb-wpoqppjheflwnd64AGt8njiBBvpkgisurlhgotqkgkqpkidgIohdebjjgedavGCBIvlabcbkGFBysqpsCCAvtumezNSQKpywFXP_TSHP_S----DBDDJDuqrgc-XxurpsokokcaevHGFEvlgytu-zBECyByMuphpkwuqimiCvjaQMuphgqmFJpwonOmrSDDBvosv-vrswtsnpnzAoijkhdkgqtkaMEohffspxxlqomztkyHADwxtD-yswBGDDyxAIIrojg9jdprf9PDkhb9qktIsvnGFcEsrBwtrsE-EBzBCIECFGuDvvwrmmblpd7YLAxxruxTHk9sBwqsrtnghI-S-CyzzuxrqnkkzutpndmmvxhaPAqqmgqnEMvyurJVzsDyyxsrC_qlptruoojjhrmgfc9rFCta8WHndegtGNpqmrWEbwpArpnmoC-uooppzDDxwuIIIzAjjBCwjltAxnhjoy-MIxzSLkpAEBxsllqzDHIMQSRPPOKGCwurpHywuoh-IvrrmrvromlgtsklixtrtvtM-IxstBNJEIJqzpieeengikbe-MDyxrvrfahjpxunljwslmihL-BuuvwEyspfeojjfcewotqec-HtljtzqDnzspAxwRJKFAAGBS-GEAABvvDvogomlgb9nqvob9_CofdgqwEeBxqHxcRMRGHDBCW_DFHHIHAAzAyxyyxurymlsjm-EupqvAlifcbfnrkmjFoiiljRXAtqqyDGDAyyAqshgfpiknbf_CtpmiujimfcqAvomlConmkE--CxzwwwponJFonplgiuntvkc-GrljizsJAwuuoInbKKDAzyuW-BwADFzxolwDyAEEAmhjwuqlvDztletxJSJytMEcOCHIEAtrwxDIIMLDEDyCDxqga8448a83233332264223331000000000000000000000000000000000000000001000011000001000000000000000000000000000000000000000000000000000000" };
  const DW_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";
  const dwLevel = (band, now) => { const text = DW_ENV[band]; const i = Math.max(0, Math.min(text.length - 1, Math.floor(now * 20))); return DW_CHARS.indexOf(text[i]) / 63; };
  // The choreo's hits (measured): Ningning's, the shake at 0:59, and the hip sways from 1:02.
  const DW_HITS = [[24.47, "ning"], [25.46, "ning"], [26.05, "ning"],
    ...[58.8, 59.26, 59.41, 59.76, 60.01, 60.33].map((t) => [t, "jolt"]),
    ...[62.12, 62.44, 62.9, 63.43, 63.78, 64.16, 64.45, 64.83, 65.23, 65.47, 65.91].map((t) => [t, "hip"])];
  // A mud splat: a blob with a few drops, as an SVG mask (seeded, so each one differs).
  function splatMask(seed) {
    let state = seed % 2147483646 + 1;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const count = 16;
    const points = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radius = 24 + rand() * 12 + (rand() < 0.3 ? 8 : 0);
      return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
    });
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let path = `M${mid(points[count - 1], points[0]).map((v) => v.toFixed(1)).join(" ")}`;
    points.forEach((point, i) => { const next = mid(point, points[(i + 1) % count]); path += ` Q${point.map((v) => v.toFixed(1)).join(" ")} ${next.map((v) => v.toFixed(1)).join(" ")}`; });
    const drops = Array.from({ length: 5 }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 40 + rand() * 7;
      return `<circle cx='${(50 + Math.cos(angle) * radius).toFixed(1)}' cy='${(50 + Math.sin(angle) * radius).toFixed(1)}' r='${(1.2 + rand() * 2.4).toFixed(1)}'/>`;
    }).join("");
    // Its drips: a few runs down from its lower edge.
    const drips = Array.from({ length: 3 }, () => { const x = 30 + rand() * 40; const w = 1.6 + rand() * 2.4; return `<path d='M${(x - w).toFixed(1)} 60 L${(x + w).toFixed(1)} 60 L${(x + w * 0.5).toFixed(1)} ${(90 + rand() * 9).toFixed(1)} Q${x.toFixed(1)} 100 ${(x - w * 0.5).toFixed(1)} ${(90 + rand() * 9).toFixed(1)} Z'/>`; }).join("");
    return { splat: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${path}'/>${drops}</svg>`), drips: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>${drips}</svg>`) };
  }
  // A water drop on the screen: the MV under it, magnified and upside down, as a real drop shows it.
  function drawDrop(canvas, video) {
    if (!mirrorsDue || !video.videoWidth) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || box.bottom < 0 || box.top > window.innerHeight) return;
    const scale = Math.max(window.innerWidth / video.videoWidth, window.innerHeight / video.videoHeight);
    const left = (window.innerWidth - video.videoWidth * scale) / 2;
    const top = (window.innerHeight - video.videoHeight * scale) / 2;
    const reach = box.width * 1.4; // how much of the screen the drop gathers
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const size = Math.round(box.width * mirrorRatio());
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(-1, 0, 0, -1, size, size);
    ctx.drawImage(video, (cx - reach - left) / scale, (cy - reach - top) / scale, (reach * 2) / scale, (reach * 2) / scale, 0, 0, size, size);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const dirtyWorkScene = {
    src: "dirty-work/scene.mp4",
    className: "dw-scene",
    cues: [[0, "bridge"], [20, "wet"], [24.45, "ningning"], [26.3, "wet2"], [36.8, "strobe"], [DW_DROP, "drop"], [40.4, "chorus"], [56, "breakdown"], [58.7, "shake"], [60.5, "breakdown2"], [62, "hips"], [66.2, "breakdown3"], [75.57, "strobe2"], [77.6, "iris"], [79.75, "title"], [82.3, "title2"]],
    mount(box, video) {
      const tape = (name, text) => `<div class="dws-tape ${name}"><canvas class="dws-tape-video" aria-hidden="true"></canvas><span>${text.repeat(12)}</span><span>${text.repeat(12)}</span></div>`;
      box.innerHTML = `
        <i class="dws-dim"></i>
        <i class="dws-rain"></i>
        <div class="dws-screen"></div>
        <div class="dws-drops">${"<i><canvas aria-hidden='true'></canvas></i>".repeat(12)}</div>
        <div class="dws-splash">${"<i></i>".repeat(16)}<b></b><b></b></div>
        ${tape("is-a", "DIRTY WORK ✦ ")}${tape("is-b", "DIRTY WORKER VER. ✦ ")}
        <i class="dws-shimmer"></i>
        <div class="dws-sparks">${"<i>✦</i>".repeat(12)}</div>
        <p class="dws-name" aria-hidden="true">Ningning <span>닝닝</span></p>
        <i class="dws-flash"></i>
        <p class="dws-tag"><b>⚠ Dirty Work</b> <span class="dws-time">00:00</span></p>`;
      box.querySelector(".dws-screen").append(video);
      const time = box.querySelector(".dws-time");
      const tapes = [...box.querySelectorAll(".dws-tape-video")];
      const drops = [...box.querySelectorAll(".dws-drops canvas")];
      // The plates: the MV across their photos, as in the bridge of Whiplash, but grimy.
      const lineup = document.getElementById("ae-lineup");
      lineup.scrollIntoView({ block: "center" });
      const hero = document.querySelector(".hero");
      const plates = [...lineup.querySelectorAll(".ae-member")].map((plate) => { const canvas = mirror("dws-plate"); plate.querySelector(".ae-photo")?.after(canvas); return canvas; });
      const ningning = lineup.querySelector('.ae-member[data-member="ningning"] .dws-plate');
      // The print: the title cards, screened onto the page (outside the scene, so it blends with the page).
      const print = mirror("dws-print");
      document.body.append(print);
      // What lands on the page (it scrolls with it): the mud and the stamps.
      const muds = [];
      const stamps = [];
      let seed = 7;
      const landing = (width, height) => ({
        left: window.scrollX + 12 + Math.random() * Math.max(0, window.innerWidth - width - 24),
        top: window.scrollY + 60 + Math.random() * Math.max(0, window.innerHeight - height - 120),
      });
      const splat = (strength) => {
        const size = Math.round(Math.min(340, window.innerWidth * 0.5) * (0.5 + strength * 0.5));
        const at = landing(size, size * 1.4);
        const masks = splatMask(seed += 97);
        const el = document.createElement("div");
        el.className = "dws-mud";
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = `left: ${at.left.toFixed(0)}px; top: ${at.top.toFixed(0)}px; width: ${size}px; height: ${size}px; --splat: ${masks.splat}; --drips: ${masks.drips}; --r: ${(Math.random() * 40 - 20).toFixed(0)}deg`;
        el.innerHTML = `<div class="dws-splat"></div><i class="dws-drip"></i><div class="dws-flecks">${Array.from({ length: 7 }, () => `<i style="--fx: ${(Math.random() * 2 - 1).toFixed(2)}; --fy: ${(Math.random() * 2 - 1).toFixed(2)}"></i>`).join("")}</div>`;
        el.firstChild.append(mirror("dws-splat-video"));
        document.body.append(el);
        muds.push(el);
        if (muds.length > (SCENE_LITE ? 6 : 12)) muds.shift().remove();
      };
      const stamp = () => {
        if (!video.videoWidth) return;
        const width = Math.round(Math.min(380, window.innerWidth * 0.62));
        const at = landing(width, width * 835 / 1600);
        const el = document.createElement("div");
        el.className = "dws-stamp";
        el.setAttribute("aria-hidden", "true");
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 250;
        const crop = video.videoWidth / (480 / 250);
        canvas.getContext("2d").drawImage(video, 0, (video.videoHeight - crop) / 2, video.videoWidth, crop, 0, 0, 480, 250);
        el.append(canvas);
        el.style.cssText = `left: ${at.left.toFixed(0)}px; top: ${at.top.toFixed(0)}px; width: ${width}px; --r: ${(Math.random() * 16 - 8).toFixed(1)}deg`;
        document.body.append(el);
        stamps.push(el);
        if (stamps.length > 6) stamps.shift().remove();
      };
      // The choreo's hits: the page shaken or swaying, her plate pulsing.
      let nextHit = 0;
      let hipSide = 1;
      const restart = (el, name) => { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); };
      const hit = (kind) => {
        if (kind === "jolt") restart(root, "is-dw-jolt");
        if (kind === "hip") { hipSide = -hipSide; root.classList.remove("is-dw-hip-l", "is-dw-hip-r"); void root.offsetWidth; root.classList.add(hipSide < 0 ? "is-dw-hip-l" : "is-dw-hip-r"); }
        if (kind === "ning") restart(box, "is-ning-hit");
      };
      let bleed = "";
      let lastBar = null;
      let lastSplat = -9;
      let lastLevels = "";
      return {
        show(cue) {
          // The mud rinses off in the rain, the stamps rip off from the second strobe (also when skipped past).
          if (cue !== "bridge") muds.forEach((el, i) => { el.style.setProperty("--k", i); el.classList.add("is-rinsed"); });
          if (["strobe2", "iris", "title", "title2"].includes(cue)) stamps.forEach((el, i) => { el.style.setProperty("--k", i); el.classList.add("is-ripped"); });
          box.style.setProperty("--beat-lag", `${(-((((video.currentTime - DW_DROP) % DW_BEAT) + DW_BEAT) % DW_BEAT)).toFixed(3)}s`);
        },
        tick(now) {
          time.textContent = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          // The song, now: its bass and its melody drive the page's parts.
          const low = dwLevel("low", now);
          const high = dwLevel("high", now);
          const levels = `${(Math.round(low * 10) / 10).toFixed(1)} ${(Math.round(high * 10) / 10).toFixed(1)}`;
          if (levels !== lastLevels) {
            lastLevels = levels;
            const [l, h] = levels.split(" ");
            for (const el of SCENE_LITE ? [box] : [box, hero, lineup]) { el.style.setProperty("--low", l); el.style.setProperty("--high", h); }
          }
          // The choreo's hits (only when reached in play, not skipped past).
          if (nextHit > 0 && now < DW_HITS[nextHit - 1][0] - 0.5) { const i = DW_HITS.findIndex(([t]) => t > now); nextHit = i < 0 ? DW_HITS.length : i; }
          while (nextHit < DW_HITS.length && DW_HITS[nextHit][0] <= now) { if (now - DW_HITS[nextHit][0] < 0.2) hit(DW_HITS[nextHit][1]); nextHit++; }
          // Mud on the bass hits of the bridge.
          if (cue === "bridge" && low > 0.58 && now - lastSplat > 0.55) { lastSplat = now; splat(low); }
          if (now < lastSplat) lastSplat = now - 1;
          const bar = Math.floor((now - DW_DROP) / (DW_BEAT * 4));
          let next = "";
          if (cue === "chorus") {
            next = bar % 2 === 0 ? "tapes" : "page";
            if (bar !== lastBar) { lastBar = bar; if (bar % 2 === 1) stamp(); }
          }
          if (cue === "drop") next = "tapes";
          if (cue.startsWith("breakdown")) next = Math.floor(bar / 2) % 2 === 0 ? "logo" : "plates";
          if (cue === "shake") next = "logo";
          if (cue === "hips") next = "plates";
          if (next !== bleed) { bleed = next; box.dataset.bleed = next; }
          // The mirrors (only those on screen are drawn).
          const photos = cue.startsWith("title") ? [] : plates.filter((canvas) => canvas.isConnected && !(cue === "ningning" && canvas === ningning));
          if (photos.length) {
            const boxes = photos.map((canvas) => canvas.getBoundingClientRect());
            const wall = { left: Math.min(...boxes.map((b) => b.left)), top: Math.min(...boxes.map((b) => b.top)), width: 0, height: 0 };
            wall.width = Math.max(...boxes.map((b) => b.right)) - wall.left;
            wall.height = Math.max(...boxes.map((b) => b.bottom)) - wall.top;
            photos.forEach((canvas) => drawMirror(canvas, video, wall));
          }
          if (cue === "ningning" && ningning) drawCrop(ningning, video, 0.5, 0, 0.5, 1);
          muds.forEach((el) => drawMirror(el.firstChild.firstChild, video, viewportWall()));
          if (cue.startsWith("wet") || cue === "ningning") drops.forEach((canvas, i) => { if (!SCENE_LITE || i < 6) drawDrop(canvas, video); });
          if (bleed === "tapes") tapes.forEach((canvas) => drawMirror(canvas, video, viewportWall()));
          if (cue === "title" || cue === "title2") drawMirror(print, video, viewportWall());
        },
        unmount() {
          [...plates, print, ...muds, ...stamps].forEach((el) => el.remove());
          root.classList.remove("is-dw-jolt", "is-dw-hip-l", "is-dw-hip-r");
          for (const el of [hero, lineup]) { el.style.removeProperty("--low"); el.style.removeProperty("--high"); }
        },
      };
    },
  };

  // Armageddon (92 BPM; its bars from 2.25 s). The page stays; the MV breaks in like a signal:
  //   signal (0-7.47 s)    the MV on a CRT monitor in the middle of the page, rolling and tearing
  //                        (no vertical hold), static and NO SIGNAL, until it locks on the bar
  //   orbit (7.47 s)       the orbit emblem as a round lens onto the MV, its rings turning (2 bars)
  //   freeze (12.69 s)     ice crystals grow from the middle across the page, the MV frozen in them
  //   scan (17.91 s)       an ice scanner sweeps down the screen every bar, the MV showing through
  //   stomp (20.93 s)      each half-time stomp sends out an ice shockwave that is a ring of the MV
  //   karina (25.54 s)     target locked on Karina: brackets snap onto her plate, which lifts and plays
  //                        her close-up while the rest goes dark; the page shakes on every stomp
  //   glitch (28.03 s)     the MV tears through the page in slices jumping sideways, red and blue
  //   danger (33.27 s)     "Incoming danger" counts to 100%, the alert flashing
  //   drop (36.17 s)       the explosion: the MV fills the screen for an instant and bursts into glass
  //                        shards flying outward, a white-hot flash and a shockwave knocking the page back
  //   chorus               by the bar: the MV locked in closing target brackets, then the page with
  //                        every app card, guide item and plate a CCTV feed while the scanner sweeps
  //   wave (57.02 s)       the body wave: the MV ripples in slices, the plates wave, the page shakes
  //   wings (58.47 s)      the golden wings take the screen          outro (59.7 s)  the MV only
  //                        through the ice ARMAGEDDON logo
  //   end (67.23 s)        the ring of fire through the orbit lens, grown huge, the rings closing on it
  const AM_BEAT = 60 / 92;
  const AM_BAR1 = 2.253; // a downbeat (the grid of the whole MV)
  // The choreo's hits (measured, some between the beats): the page jolts on each, in the tunnel
  // stomps with Karina and in the body wave.
  const AM_HITS = [25.74, 26.06, 26.73, 27.36, 27.68, 57.05, 57.41, 57.69, 57.95, 58.24];
  // The cameras: each feed frames the MV differently ([x, top, width, height] as fractions).
  const AM_CAMS = [[0.5, 0.05, 0.9, 0.9], [0.3, 0.1, 0.35, 0.5], [0.7, 0.2, 0.4, 0.45], [0.45, 0.35, 0.3, 0.4], [0.62, 0.02, 0.5, 0.6], [0.2, 0.3, 0.4, 0.55], [0.55, 0.15, 0.25, 0.35], [0.8, 0.4, 0.35, 0.5]];
  // Ice crystals: sharp spikes and shards out from the middle (a mask that grows over the page).
  function crystalMask() {
    let state = 23;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const point = (a, r) => `${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`;
    let shapes = "";
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + rand() * 0.2;
      const reach = 26 + rand() * 24;
      const width = 0.08 + rand() * 0.1;
      shapes += `<path d='M${point(angle - width, 6)} L${point(angle, reach)} L${point(angle + width, 6)} Z'/>`;
      if (rand() < 0.6) shapes += `<path d='M${point(angle + 0.12, reach * 0.45)} L${point(angle + 0.3, reach * 0.8)} L${point(angle + 0.2, reach * 0.42)} Z'/>`;
    }
    shapes += `<polygon points='${Array.from({ length: 6 }, (_, i) => point((i / 6) * Math.PI * 2, 12).replace(" ", ",")).join(" ")}'/>`;
    return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${shapes}</svg>`);
  }
  // The explosion's shards: triangles from the middle to the screen's edge that tile it together.
  function shardPolygons(count) {
    // A point on the edge, going round it (0-100 the top, 100-200 the right, 200-300 the bottom, 300-400 the left).
    const edge = (s) => { s = ((s % 400) + 400) % 400; if (s < 100) return [s, 0]; if (s < 200) return [100, s - 100]; if (s < 300) return [300 - s, 100]; return [0, 400 - s]; };
    let state = 5;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const cuts = Array.from({ length: count }, (_, i) => (i + 0.2 + rand() * 0.6) * (400 / count));
    return cuts.map((from, i) => {
      const to = i + 1 < count ? cuts[i + 1] : cuts[0] + 400;
      const points = [[50, 50], edge(from)];
      for (const corner of [100, 200, 300, 400, 500]) if (corner > from && corner < to) points.push(edge(corner));
      points.push(edge(to));
      const mid = edge((from + to) / 2);
      return { polygon: `polygon(${points.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(", ")})`, dx: (mid[0] - 50) * 1.6, dy: (mid[1] - 50) * 1.6, rot: (rand() * 80 - 40).toFixed(0) };
    });
  }
  const armageddonScene = {
    src: "armageddon/scene.mp4",
    className: "am-scene",
    cues: [[0, "signal"], [7.47, "orbit"], [12.69, "freeze"], [17.91, "scan"], [20.93, "stomp"], [25.54, "karina"], [28.03, "glitch"], [33.27, "danger"], [36.17, "drop"], [37.4, "chorus"], [57.02, "wave"], [58.47, "wings"], [59.7, "outro"], [67.23, "end"]],
    mount(box, video) {
      const shards = shardPolygons(11);
      box.innerHTML = `
        <i class="ams-dim"></i>
        <div class="ams-screen"></div>
        <div class="ams-crt"><canvas class="ams-crt-video" aria-hidden="true"></canvas><i class="ams-static"></i><span class="ams-crt-label">NO SIGNAL</span></div>
        <div class="ams-scan"></div>
        <div class="ams-slices">${"<div></div>".repeat(7)}</div>
        <div class="ams-waves">${Array.from({ length: 14 }, (_, i) => `<div style="--i: ${i}"></div>`).join("")}</div>
        <div class="ams-shards">${shards.map((shard) => `<i style="clip-path: ${shard.polygon}; --dx: ${shard.dx.toFixed(1)}vw; --dy: ${shard.dy.toFixed(1)}vh; --rot: ${shard.rot}deg"></i>`).join("")}</div>
        <i class="ams-wave-ring"></i>
        <div class="ams-orbit"><div class="ams-lens"></div><i></i><i></i><i></i></div>
        <i class="ams-target"></i>
        <i class="ams-lock"></i>
        <p class="ams-locked" aria-hidden="true">Target locked <b>Karina</b> <span>카리나</span></p>
        <div class="ams-alert"><b>Incoming danger</b><span class="ams-level"><span>${Array.from({ length: 101 }, (_, n) => `<i>${n}%</i>`).join("")}</span></span></div>
        <i class="ams-flash"></i>
        <p class="ams-tag"><i></i> SIGNAL · <span class="ams-time">00:00</span></p>`;
      box.querySelector(".ams-screen").append(video);
      box.style.setProperty("--crystal", crystalMask());
      const time = box.querySelector(".ams-time");
      const crt = box.querySelector(".ams-crt-video");
      const crtLabel = box.querySelector(".ams-crt-label");
      const lens = mirror("ams-lens-video");
      box.querySelector(".ams-lens").append(lens);
      const scan = mirror("ams-scan-video");
      box.querySelector(".ams-scan").append(scan);
      const slices = [...box.querySelectorAll(".ams-slices > div")].map((slice) => { slice.append(mirror("ams-slice")); return slice; });
      const waves = [...box.querySelectorAll(".ams-waves > div")].map((band) => { const canvas = mirror("ams-slice"); band.append(canvas); return canvas; });
      const shardEls = [...box.querySelectorAll(".ams-shards > i")];
      const lock = box.querySelector(".ams-lock");
      // The feeds in the page: app cards, guide items and plates, each a camera.
      const lineup = document.getElementById("ae-lineup");
      lineup.scrollIntoView({ block: "center" });
      const karina = lineup.querySelector('.ae-member[data-member="karina"]');
      const feeds = [...document.querySelectorAll(".card, .guide-item, #ae-lineup .ae-member")].map((host, index) => {
        const canvas = mirror("ams-feed");
        const label = document.createElement("span");
        label.className = "ams-cam";
        label.setAttribute("aria-hidden", "true");
        label.textContent = `CAM ${String(index + 1).padStart(2, "0")}`;
        host.prepend(canvas);
        host.append(label);
        return { host, canvas, label, cam: AM_CAMS[index % AM_CAMS.length] };
      });
      const karinaFeed = feeds.find((feed) => feed.host === karina);
      let bleed = "";
      let lastBeat = null;
      let nextHit = 0;
      const jolt = () => { root.classList.remove("is-am-jolt"); void root.offsetWidth; root.classList.add("is-am-jolt"); };
      return {
        show(cue, now) {
          box.style.setProperty("--beat-lag", `${(-((((now - AM_BAR1) % AM_BEAT) + AM_BEAT) % AM_BEAT)).toFixed(3)}s`);
          box.style.setProperty("--bar-lag", `${(-((((now - AM_BAR1) % (AM_BEAT * 4)) + AM_BEAT * 4) % (AM_BEAT * 4))).toFixed(3)}s`);
          // Stomps come on beats 1 and 3: their lag within a half bar.
          box.style.setProperty("--half-lag", `${(-((((now - AM_BAR1) % (AM_BEAT * 2)) + AM_BEAT * 2) % (AM_BEAT * 2))).toFixed(3)}s`);
          // The explosion: the frame of the blast, frozen onto the shards that fly apart.
          if (cue === "drop" && video.videoWidth) {
            const frame = document.createElement("canvas");
            frame.width = 960;
            frame.height = Math.round((960 * video.videoHeight) / video.videoWidth);
            frame.getContext("2d").drawImage(video, 0, 0, frame.width, frame.height);
            const image = `url("${frame.toDataURL("image/jpeg", 0.82)}")`;
            shardEls.forEach((shard) => { shard.style.backgroundImage = image; });
          }
        },
        tick(now) {
          time.textContent = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          const bar = Math.floor((now - AM_BAR1) / (AM_BEAT * 4));
          const next = cue === "chorus" ? (bar % 2 === 0 ? "target" : "feeds") : "";
          if (next !== bleed) { bleed = next; box.dataset.bleed = next; }
          const view = viewportWall();
          // A band that slides carries its picture with it: the screen, shifted as far as the band is.
          const sliding = (canvas) => { const at = canvas.getBoundingClientRect(); return { left: at.left, top: 0, width: at.width, height: window.innerHeight }; };
          // The choreo's hits (only when reached in play, not skipped past).
          if (nextHit > 0 && now < AM_HITS[nextHit - 1] - 0.5) nextHit = AM_HITS.findIndex((t) => t > now) < 0 ? AM_HITS.length : AM_HITS.findIndex((t) => t > now);
          while (nextHit < AM_HITS.length && AM_HITS[nextHit] <= now) { if (now - AM_HITS[nextHit] < 0.2) jolt(); nextHit++; }
          // The CRT: its own picture (it rolls with it), locking in on the second bar.
          if (cue === "signal") {
            drawMirror(crt, video);
            const locked = now >= 4.86;
            crtLabel.textContent = locked ? "● SIGNAL LOCKED" : "NO SIGNAL";
            box.classList.toggle("is-locked", locked);
          }
          if (cue === "orbit" || cue === "end") drawMirror(lens, video, view);
          if (cue === "scan" || bleed === "feeds") drawMirror(scan, video, view);
          // The glitch: the slices jump to new offsets on every eighth note.
          if (cue === "glitch") {
            const beat = Math.floor((now - AM_BAR1) / (AM_BEAT / 2));
            if (beat !== lastBeat) { lastBeat = beat; slices.forEach((slice) => slice.style.setProperty("--x", `${((Math.random() - 0.5) * 16).toFixed(1)}vw`)); }
            slices.forEach((slice) => drawMirror(slice.firstChild, video, sliding(slice.firstChild)));
          }
          if (cue === "wave") waves.forEach((canvas, i) => { if (i % 2 === 0) drawMirror(canvas, video, sliding(canvas)); });
          // Karina: the brackets follow her plate (wherever it is scrolled), her close-up in it.
          if (cue === "karina" && karina) {
            const at = karina.getBoundingClientRect();
            lock.style.cssText = `left: ${(at.left - 10).toFixed(0)}px; top: ${(at.top - 10).toFixed(0)}px; width: ${(at.width + 20).toFixed(0)}px; height: ${(at.height + 20).toFixed(0)}px`;
            if (karinaFeed) drawCrop(karinaFeed.canvas, video, 0.5, 0, 0.42, 1);
          }
          if (cue === "chorus") feeds.forEach(({ canvas, cam }) => drawCrop(canvas, video, cam[0], cam[1], cam[2], cam[3]));
        },
        unmount() {
          feeds.forEach(({ canvas, label }) => { canvas.remove(); label.remove(); });
          root.classList.remove("is-am-jolt");
        },
      };
    },
  };

  // Drama (131 BPM; its bars from 1.05 s; the MV is widescreen, 2.35:1). "Scene Ver.": the page is
  // the set, the MV is shot on it:
  //   spot (0-11.59 s)     a red spotlight drifts over the dimmed page, the MV only in its beam
  //   flame (11.59 s)      the page catches fire: the MV burns up the screen from the bottom behind
  //                        a wall of flame tongues, embers rising, the page glowing orange
  //   slash (15.2 s)       every 2 bars a claw slash (the logo's three torn strokes) rips across the
  //                        page with the MV inside, from alternate sides
  //   eye (31.47 s)        the red eye: the page flushes red
  //   impact (32.19 s)     the chorus hits: white then red, the MV slams in, the glass cracks from
  //                        the middle and a shockwave rings out, the page jolting
  //   chorus (and 2-4)     by the bar: cinema (the MV full screen, widescreen, a SCENE slate), then
  //                        billboard (the MV lighting the header, claws ripping on beats 1 and 3)
  //   noir (38.5 s)        the page drains to black and white with the MV, grain and vignette;
  //                        only the slate keeps its red
  //   winter (46.85 s)     the page goes dark but for Winter's plate, lifted in a red glow; the MV
  //                        through her star emblem, her name sweeping in
  //   spin (53.25 s)       the MV on a red turntable disc, a quarter turn on every beat with the
  //                        pointing choreo, the plates swaying
  //   hush (61 s)          the spotlight again, slow           end (66.95 s)  each member framed in
  //                        her own plate through the camera's pull-back, FIN
  const DR_BEAT = 60 / 131;
  const DR_BAR1 = 1.046; // a downbeat (the impact at 32.19 s is one)
  // The ending: left to right on the billboard stage Ningning, Winter, Karina, Giselle; the camera
  // pulls back, so each is tracked: [time, x of each (0-1), top, height, max width] (fractions).
  const DR_END = { ningning: 0, winter: 1, karina: 2, giselle: 3 };
  const DR_END_KEYS = [[67.0, [0.303, 0.431, 0.566, 0.719], 0.5, 0.34, 0.125], [69.4, [0.344, 0.459, 0.581, 0.694], 0.515, 0.22, 0.108], [71.5, [0.347, 0.459, 0.569, 0.681], 0.52, 0.2, 0.104]];
  function drEndFrame(now, slot) {
    const keys = DR_END_KEYS;
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (now >= keys[i][0] && now <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; }
    const k = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (now - a[0]) / (b[0] - a[0])));
    const mix = (x, y) => x + (y - x) * k;
    return [mix(a[1][slot], b[1][slot]), mix(a[2], b[2]), mix(a[4], b[4]), mix(a[3], b[3])];
  }
  // SVG masks (stretched over the screen): the burning edge, its flame tongues, the claw slashes.
  function flameEdge(filled) {
    let state = 11;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    let path = "M0 30";
    for (let x = 0; x < 100; x += 4) {
      const peak = 2 + rand() * 16;
      path += ` Q${(x + 1).toFixed(1)} ${(peak + 6).toFixed(1)} ${(x + 2).toFixed(1)} ${peak.toFixed(1)} Q${(x + 3).toFixed(1)} ${(peak + 10).toFixed(1)} ${x + 4} ${(22 + rand() * 8).toFixed(1)}`;
    }
    if (filled) return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 200' preserveAspectRatio='none'><path d='${path} L100 200 L0 200 Z'/></svg>`);
    return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 40' preserveAspectRatio='none'><defs><linearGradient id='f' x1='0' y1='1' x2='0' y2='0'><stop offset='0' stop-color='#FFF1B0'/><stop offset='0.35' stop-color='#FF9A1F'/><stop offset='0.75' stop-color='#F30306' stop-opacity='0.7'/><stop offset='1' stop-color='#F30306' stop-opacity='0'/></linearGradient></defs><path d='${path} L100 40 L0 40 Z' fill='url(#f)'/></svg>`);
  }
  function clawMask(flip) {
    const stroke = (x1, y1, x2, y2, w) => `<path d='M${x1} ${y1} L${x2} ${y2 - w * 0.5} L${x2 + 1.5} ${y2 + w * 0.3} L${x1 + 2} ${y1 + w}Z'/>`;
    const strokes = stroke(-5, 78, 105, 18, 9) + stroke(-5, 96, 105, 38, 12) + stroke(0, 112, 105, 58, 8);
    return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><g${flip ? " transform='translate(100 0) scale(-1 1)'" : ""}>${strokes}</g></svg>`);
  }
  const dramaScene = {
    src: "drama/scene.mp4",
    className: "dr-scene",
    cues: [[0, "spot"], [11.59, "flame"], [15.2, "slash"], [31.47, "eye"], [32.19, "impact"], [33.1, "chorus"], [38.5, "noir"], [43.3, "chorus2"], [46.85, "winter"], [51.77, "chorus3"], [53.25, "spin"], [56.5, "chorus4"], [61.0, "hush"], [66.95, "end"]],
    mount(box, video) {
      box.innerHTML = `
        <i class="drs-dim"></i>
        <div class="drs-screen"></div>
        <div class="drs-lamp"></div>
        <i class="drs-fire"></i>
        <div class="drs-embers">${"<i></i>".repeat(14)}</div>
        <i class="drs-crack"></i><i class="drs-wave"></i>
        <i class="drs-claw"></i><i class="drs-claw is-b"></i>
        <i class="drs-grain"></i>
        <p class="drs-name" aria-hidden="true">Winter <span>윈터</span></p>
        <i class="drs-flash"></i>
        <p class="drs-slate">Scene 01</p>
        <p class="drs-take"><i></i> aespa ‘Drama’ · Take 01 · <span class="drs-time">00:00</span></p>`;
      box.querySelector(".drs-screen").append(video);
      box.style.setProperty("--burn", flameEdge(true));
      box.style.setProperty("--flames", flameEdge(false));
      box.style.setProperty("--claw-a", clawMask(false));
      box.style.setProperty("--claw-b", clawMask(true));
      const time = box.querySelector(".drs-time");
      const slate = box.querySelector(".drs-slate");
      const lamp = mirror("drs-lamp-video");
      box.querySelector(".drs-lamp").append(lamp);
      // The page's parts: the header as a billboard, and the plates for the ending.
      const lineup = document.getElementById("ae-lineup");
      lineup.scrollIntoView({ block: "center" });
      const hero = document.querySelector(".hero");
      const billboard = mirror("drs-billboard");
      hero.prepend(billboard);
      const plates = [...lineup.querySelectorAll(".ae-member")].map((plate) => { const canvas = mirror("drs-plate"); plate.querySelector(".ae-photo")?.after(canvas); return canvas; });
      let bleed = "";
      let lastSlash = null;
      let scene = 1;
      const slates = { spot: "Scene 01", flame: "Scene 02 · Fire", slash: "Scene 03", eye: "Scene 03", impact: "I’m the Drama", noir: "Scene 04 · Noir", winter: "Winter · 윈터", spin: "Scene 06 · Turn", hush: "Scene 07", end: "Fin · aespa ‘Drama’" };
      return {
        show(cue, now) {
          box.style.setProperty("--beat-lag", `${(-((((now - DR_BAR1) % DR_BEAT) + DR_BEAT) % DR_BEAT)).toFixed(3)}s`);
          box.style.setProperty("--bar-lag", `${(-((((now - DR_BAR1) % (DR_BEAT * 4)) + DR_BEAT * 4) % (DR_BEAT * 4))).toFixed(3)}s`);
          if (slates[cue]) slate.textContent = slates[cue];
          if (cue.startsWith("chorus")) slate.textContent = `Scene 05 · Take ${String(++scene).padStart(2, "0")}`;
        },
        tick(now) {
          time.textContent = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          const bar = Math.floor((now - DR_BAR1) / (DR_BEAT * 4));
          const next = cue.startsWith("chorus") ? (bar % 2 === 0 ? "cinema" : "billboard") : "";
          if (next !== bleed) { bleed = next; box.dataset.bleed = next; }
          // The slashes: a new one every 2 bars, from alternate sides.
          if (cue === "slash") {
            const slash = Math.floor(bar / 2);
            if (slash !== lastSlash) {
              lastSlash = slash;
              box.dataset.slash = slash % 2 ? "b" : "a";
              box.classList.remove("is-slash");
              void box.offsetWidth;
              box.classList.add("is-slash");
            }
          }
          if (cue === "spot" || cue === "hush") drawMirror(lamp, video, viewportWall());
          if (bleed === "billboard") drawMirror(billboard, video, hero.getBoundingClientRect());
          if (cue === "end") plates.forEach((canvas) => {
            const slot = DR_END[canvas.closest(".ae-member")?.dataset.member];
            if (slot === undefined) return;
            const [x, top, width, height] = drEndFrame(now, slot);
            drawCrop(canvas, video, x, top, width, height);
          });
        },
        unmount() {
          [billboard, ...plates].forEach((canvas) => canvas.remove());
        },
      };
    },
  };

  // Dirty Work: the clip is two phrases with the same rhythm, a big hit then a triple hit (about
  // 0.76 / 0.83 / 0.90 s, and again 1.67 / 1.75 / 1.83 s), and it runs straight into track 1. Blackletter DIRTY slams in on the first
  // hit and WORK on the triple (the middle hit flashes the card orange); the second phrase opens
  // the "aespa ‘Dirty Work’" labels and flashes the four members, each with her gold initial, and
  // it lands on the gold DIRTY WORK logo. Between the phrases, the hits at 1.14 / 1.30 / 1.44 /
  // 1.52 s strobe the four group photos in orange and black.
  const dirtyWorkIntro = {
    end: 2500,
    cues: [
      [0, "dirty"], [760, "work"], [830, "invert"], [900, "work"],
      [1140, "flash", 0], [1300, "flash", 1], [1440, "flash", 2], [1520, "flash", 3],
      [1590, "photo", 0], [1670, "photo", 1], [1750, "photo", 2], [1830, "photo", 3], [1910, "final"],
    ],
    hits: new Set(["dirty", "work", "invert", "flash", "photo", "final"]),
    mount(box, photos, flashes) {
      box.innerHTML = `
        <div class="dw-grain"></div>
        <span class="dw-label is-left">aespa ‘Dirty Work’</span><span class="dw-label is-right">Dirty Worker Ver.</span>
        <div class="dw-stack" role="img" aria-label="Dirty Work"><i class="dw-word is-dirty"></i><i class="dw-word is-work"></i></div>
        <div class="dw-flashes"></div><div class="dw-photos"></div><i class="dw-initial"></i>
        <div class="dw-final"><img src="dirty-work/logo-gold.webp" alt="" draggable="false" /><small>Brew Houze × aespa</small></div>`;
      box.querySelector(".dw-flashes").append(...flashes);
      box.querySelector(".dw-photos").append(...photos);
      const initial = box.querySelector(".dw-initial");
      return (step) => {
        const [, scene, value] = this.cues[step];
        const photo = scene === "photo" ? photos[value] : scene === "flash" ? flashes[value] : null;
        const ready = !photo || (photo.complete && photo.naturalWidth > 0);
        photos.forEach((img) => img.classList.toggle("is-current", img === photo));
        flashes.forEach((img) => img.classList.toggle("is-current", img === photo));
        initial.textContent = scene === "photo" ? MEMBERS[memberOrder[value]].name[0] : "";
        box.className = `dw-intro is-${ready ? scene : "labels"}`;
        // Every hit shakes the frame; restart the animation each time.
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
    },
  };

  // Armageddon: "Incoming danger. Armageddon or manipulation?" (the album's photo book) typed in
  // hard cuts on the opening hits; the logo slams in ice cyan with an RGB split on the big hit
  // (0.54 s); the four evenly spaced hits (0.71 / 0.87 / 1.03 / 1.20 s) flash each member with
  // her signature written across the photo; in the silence a scanner sweeps on the stab (1.55 s)
  // and the blip (1.78 s) round the orbit emblem; the drop (2.06 s) floods the screen ice cyan
  // with the black logo, and the clip runs straight into track 1. The group photos show like surveillance footage: the fisheye one behind the
  // second caption, the hooded one in the silence, and the other two uncovered by the scanner's sweeps.
  const armageddonIntro = {
    end: 2660,
    cues: [
      [0, "boot"], [60, "type", "Incoming danger."], [380, "type", "Armageddon or manipulation?", 1], [540, "logo"],
      [710, "photo", 0], [870, "photo", 1], [1030, "photo", 2], [1200, "photo", 3],
      [1370, "void", null, 3], [1550, "scan", null, 0], [1780, "scan-up", null, 2], [2060, "final"],
    ],
    hits: new Set(["type", "logo", "photo", "scan", "scan-up", "final"]),
    mount(box, photos, flashes) {
      const chrome = `<img src="armageddon/logo-chrome.webp" alt="" draggable="false" />`;
      box.innerHTML = `
        <div class="am-lines"></div>
        <div class="am-feed"></div>
        <p class="am-type"><span></span></p>
        <div class="am-logo"><i>${chrome}</i><i>${chrome}</i><i>${chrome}</i></div>
        <div class="am-photos"></div>
        <div class="am-sign"></div>
        <span class="am-who"></span>
        <div class="am-orbit"><i></i><i></i><i></i></div>
        <i class="am-scan"></i>
        <span class="am-tag is-left">aespa · The 1st Album</span><span class="am-tag is-right">Armageddon</span>
        <div class="am-final"><img src="armageddon/logo-black.webp" alt="" draggable="false" /><small>Brew Houze × aespa</small></div>`;
      box.querySelector(".am-photos").append(...photos);
      box.querySelector(".am-feed").append(...flashes);
      const type = box.querySelector(".am-type span");
      const sign = box.querySelector(".am-sign");
      const who = box.querySelector(".am-who");
      return (step) => {
        const [, scene, value, feed] = this.cues[step];
        const photo = scene === "photo" ? photos[value] : null;
        const ready = !photo || (photo.complete && photo.naturalWidth > 0);
        photos.forEach((img) => img.classList.toggle("is-current", img === photo));
        const footage = feed === undefined ? null : flashes[feed];
        flashes.forEach((img) => img.classList.toggle("is-current", img === footage && img.complete && img.naturalWidth > 0));
        if (scene === "type") type.textContent = value;
        if (photo) {
          const key = memberOrder[value];
          sign.style.setProperty("--sign", `url("${siteUrl(`armageddon/${key}-signature.svg`)}")`);
          who.textContent = `0${value + 1} · ${MEMBERS[key].name}`;
        }
        box.className = `am-intro is-${ready ? scene : "void"}`;
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
    },
  };

  // Drama: "Scene ver." in red and black. The clip's two booms (0.07 / 0.99 s) rip two red-edged
  // slashes across the dark into an X, each showing a scene; in the silence the third scene holds
  // in letterbox with the album line; the rolling bass hits (2.83 / 3.11 / 3.38 / 3.61 s) cut to the
  // four members, each with her emblem stamped in red; the big chop (3.73 s) floods the screen red
  // with the DRAMA logo in black, the loudest hit (4.19 s) turns it black with the logo in red, and
  // 4.36 s floods red again, straight into track 1.
  const dramaIntro = {
    end: 4630,
    cues: [
      [0, "dark"], [70, "slash", 1], [990, "slash", 2], [1450, "hold"], [2640, "rise"],
      [2830, "member", 0], [3110, "member", 1], [3380, "member", 2], [3610, "member", 3],
      [3730, "flood"], [3870, "flood"], [4190, "invert"], [4360, "flood"],
    ],
    hits: new Set(["slash", "member", "flood", "invert"]),
    mount(box, photos, flashes) {
      box.innerHTML = `
        <div class="dr-shot is-a"></div><div class="dr-shot is-b"></div><div class="dr-scene"></div>
        <div class="dr-members"></div><i class="dr-emblem"></i><span class="dr-who"></span>
        <div class="dr-bars"><i></i><i></i></div>
        <p class="dr-caption is-left">aespa · The 4th Mini Album</p><p class="dr-caption is-right">Scene Ver.</p>
        <div class="dr-logo"></div><div class="dr-grain"></div>`;
      box.querySelector(".dr-shot.is-a").append(flashes[0]);
      box.querySelector(".dr-shot.is-b").append(flashes[1]);
      box.querySelector(".dr-scene").append(flashes[2], flashes[3]);
      box.querySelector(".dr-members").append(...photos);
      const emblem = box.querySelector(".dr-emblem");
      const who = box.querySelector(".dr-who");
      return (step) => {
        const [, scene, value] = this.cues[step];
        const photo = scene === "member" ? photos[value] : null;
        const ready = !photo || (photo.complete && photo.naturalWidth > 0);
        photos.forEach((img) => img.classList.toggle("is-current", img === photo));
        if (photo) {
          const key = memberOrder[value];
          emblem.style.setProperty("--emblem", `url("${siteUrl(`drama/${key}-emblem.webp`)}")`);
          who.textContent = MEMBERS[key].name;
        }
        const classes = ["dr-intro", `is-${ready ? scene : "rise"}`];
        // The slashes stay once ripped: the second joins the first as an X.
        if (scene === "slash" && value === 2) classes.push("is-x");
        box.className = classes.join(" ");
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
    },
  };

  // ── The themes ──
  const THEMES = {
    whiplash: {
      era: "Whiplash", folder: "whiplash/", tag: "WHIPLASH",
      title: "Brew Houze × aespa · Whiplash", toast: "Brew Houze × aespa · WHIPLASH",
      sub: "Whiplash · System portal", h1: "Every Brew Houze app. Whiplash fast.", footer: "Brew Houze × aespa · Whiplash · café management system",
      // joined: the intro clip runs straight into the loop (the song continues), so both play on
      // the loop's Web Audio clock, the loop starting on the very sample the intro ends.
      // Track 1 is the chorus (10 bars at 126 BPM), track 2 the bridge (9 bars); both are played for
      // exactly their bars (length), so track 2 keeps the silence it ends on and track 1 comes back
      // on the beat. The bridge (seconds into track 2): the verse with its snaps on beats 2 and 4,
      // the riser (7.62 s), the two-beat cut (14.29 s), the three sub-bass slams (15.24 s), and the
      // silent last beat (16.67 s). Its effects are its own (fx, styled in whiplash.css).
      introClip: "whiplash/intro.mp3", loops: [{ src: "whiplash/track-1.mp3", length: 19.048 }, { src: "whiplash/track-2.mp3", length: 17.143 }], joined: true, intro: whiplashIntro, introClass: "wl-intro", back: "spec",
      stage: {
        beat: 60 / 126, parts: [19.048, 17.143], grid: 19.048,
        lyrics: [
        "One look, give 'em whiplash",
        "Beat drop with a big flash",
        "집중해 좀 더 think fast",
        "Day one, know I been bad",
        "무리해도 can't touch that",
        "Under pressure, body sweating, can you focus?",
        "어디서나 거침없어 I'm the coldest",
        "Just close your eyes, breathe in and visualize",
        "Whip-whiplash, whip-whiplash",
        "It's glowing and it's flashy",
        "알아, 적당함이 뭔지 keep it classy",
        "기횐 오직 one time, unforgettable",
        "I'm the highlight 비춰 red light",
        "Yeah, tonight it's all about me",
        "만들어갈 history",
      ],
        fx: `<i class="wlx-glint"></i><div class="wlx-streaks">${"<b></b>".repeat(10)}</div><div class="wlx-rev">${Array.from({ length: 14 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</div><i class="wlx-lid is-top"></i><i class="wlx-lid is-bottom"></i><i class="wlx-flash"></i><i class="wlx-logo"></i>`,
        sections: [[0, "calm"], ...[[0, "snap"], [7.619, "rise"], [14.286, "cut"], [15.238, "whip"], [16.667, "out"]].map(([at, name]) => [19.048 + at, name])],
      },
      extras: ["device.webp", "logo-white.webp"],
      scene: whiplashScene,
    },
    dirtywork: {
      era: "Dirty Work", folder: "dirty-work/", tag: "Dirty Work", back: "facts",
      title: "Brew Houze × aespa · Dirty Work", toast: "Brew Houze × aespa · Dirty Work",
      sub: "Dirty Work · System portal", h1: "Every Brew Houze app. We do the dirty work.", footer: "Brew Houze × aespa · Dirty Work · café management system",
      // The intro runs straight into track 1 (the chorus, 8 bars at 98 BPM); tracks 1 and 2 (the
      // bridge, 16 bars) then take turns with no gap. The bridge (seconds into track 2): the grind
      // (a full bar, then sparse bars whose beat 3 drops out: the freezes at 3.67 / 8.57 /
      // 13.47 s), the build (14.69 s), the drive (19.59 s), and the drum fill (36.73 s) with a slam
      // on its last beat (38.57 s). Its effects are its own (fx, styled in dirtywork.css).
      introClip: "dirty-work/intro.mp3", loops: ["dirty-work/track-1.mp3", "dirty-work/track-2.mp3"], joined: true, intro: dirtyWorkIntro, introClass: "dw-intro",
      stage: {
        beat: 60 / 98, parts: [19.616, 39.218], grid: 19.616,
        lyrics: [
        "World domination, I don't gotta say it",
        "Set 'em on fire",
        "I don't really wanna play nicely, nicely",
        "Open your eyes, come and bite me",
        "Sharp teeth, bite first",
        "Real bad business, that's dirty work",
        "Bold eyes, cold stare",
        "I'm not an it girl, more like a hit girl",
        "Call me the reaper, I'm knock, knock, knocking",
        "It's me, it's me, a little baddie",
        "Hold tight, get tough",
        "We don't see you as a threat",
        "Kick up the dust, let 'em talk about it",
        "Drop it low, low, low",
        "Work it out, work it out",
      ],
        fx: `<div class="dwx-tape is-top"><span>${"Dirty Work ✦ ".repeat(16)}</span></div><div class="dwx-tape is-bottom"><span>${"Dirty Worker Ver. ✦ ".repeat(14)}</span></div><i class="dwx-stamp"></i><i class="dwx-gold"></i><i class="dwx-still"></i><div class="dwx-sparks">${"<i>✦</i>".repeat(12)}</div>`,
        sections: [[0, "calm"], ...[[0, "grind"], [3.674, "freeze"], [4.286, "grind"], [8.571, "freeze"], [9.184, "grind"], [13.469, "freeze"], [14.082, "grind"], [14.694, "build"], [19.592, "drive"], [36.735, "fill"], [38.571, "slam"]].map(([at, name]) => [19.616 + at, name])],
      },
      extras: ["logo-gold.webp", "logo-gold-cut.webp", "logo-white.webp"],
      scene: dirtyWorkScene,
    },
    armageddon: {
      era: "Armageddon", folder: "armageddon/", tag: "ARMAGEDDON", back: "signature",
      title: "Brew Houze × aespa · Armageddon", toast: "Brew Houze × aespa · ARMAGEDDON",
      sub: "Armageddon · System portal", h1: "Every Brew Houze app. Only we can define it.", footer: "Brew Houze × aespa · Armageddon · café management system",
      // The intro (one bar at 92 BPM) runs straight into track 1 (the chorus, 8 bars); tracks 1 and 2
      // (the bridge, 13 bars) then take turns with no gap, each played for exactly its bars. The
      // bridge (seconds into track 2): the drive with its snares on beats 2 and 4 (bars 1-4, then
      // 5-8 at 10.43 s), the bar that drains to silence (20.87 s), the half-time stomps on beats 1
      // and 3 (23.48 s), the strike (31.30 s) and the silent last beat (33.26 s). Its effects are its
      // own (fx, styled in armageddon.css).
      introClip: "armageddon/intro.mp3", introLength: 2.609, loops: [{ src: "armageddon/track-1.mp3", length: 20.870 }, { src: "armageddon/track-2.mp3", length: 33.913 }], joined: true, intro: armageddonIntro, introClass: "am-intro",
      stage: {
        beat: 60 / 92, parts: [20.870, 33.913], grid: 20.870,
        lyrics: [
        "Armageddon",
        "I'ma get 'em",
        "Shoot",
        "I'ma bite back",
        "사라진 feedback 시작된 code black",
        "Bang, chitty bang bang",
        "널 향해 겨눠 get it, gone",
        "이젠 널 끝내 better run",
        "Full shot, pull it up Armageddon",
        "We never play nice",
        "Three to get ready 우린 shoot and go",
        "정의해 이젠 나만의 complete",
        "Born like a queen, born like a king",
        "Throw it back, throw it back",
        "끝과 시작의 Armageddon",
      ],
        fx: `<div class="amx-orbit"><i></i><i></i><i></i></div><i class="amx-bracket"></i><div class="amx-alert"><b>Incoming danger</b><span class="amx-level"><span>${Array.from({ length: 101 }, (_, n) => `<i>${n}%</i>`).join("")}</span></span></div><i class="amx-dark"></i><i class="amx-line"></i><div class="amx-rings"><i></i><i></i></div><div class="amx-logo"><i></i><i></i><i></i></div><i class="amx-flash"></i>`,
        sections: [[0, "calm"], ...[[0, "orbit"], [10.435, "lock"], [20.870, "void"], [23.478, "stomp"], [31.304, "strike"], [33.261, "blackout"]].map(([at, name]) => [20.870 + at, name])],
      },
      extras: ["logo-black.webp", "logo-white.webp", "logo-chrome.webp", ...["karina", "giselle", "winter", "ningning"].map((key) => `${key}-signature.svg`)],
      scene: armageddonScene,
    },
    // The intro runs straight into track 1; tracks 1 and 2 then take turns with no gap (1, 2, 1, 2…).
    // Track 1 is the theme as it is; during track 2 the page moves with the music (see the stage
    // below).
    drama: {
      era: "Drama", folder: "drama/", tag: "DRAMA", back: "emblem",
      title: "Brew Houze × aespa · Drama", toast: "Brew Houze × aespa · Drama",
      sub: "Drama · System portal", h1: "Every Brew Houze app. I’m the Drama.", footer: "Brew Houze × aespa · Drama · café management system",
      introClip: "drama/intro.mp3", loops: ["drama/track-1.mp3", "drama/track-2.mp3"], joined: true, intro: dramaIntro, introClass: "dr-intro",
      // Track 1 is the chorus (16 bars at 131 BPM), track 2 the bridge (17 bars). The bridge
      // (seconds into track 2): the groove with its clap on beat 3 (bars 1-7), the riser (12.82 s),
      // the drive accented on beats 1 and 3 (14.66 s), the hit (24.73 s), three lone stabs (25.65 /
      // 26.57 / 27.48 s), the hush and its pickup (27.94 / 28.86 s), and the slam back into the
      // chorus with its second hit (29.31 / 30.23 s). Its effects are its own (fx, styled in drama.css).
      stage: {
        beat: 60 / 131, parts: [29.304, 31.168], grid: 29.304,
        lyrics: [
        "I'm the drama",
        "Ziggy-ziggy-zag, I'm new",
        "Hold up, what? Oh, my God",
        "You better watch out",
        "I li-li-like me when I roll",
        "Li-li-like me when I'm savage",
        "One, two, it's time to go",
        "Yeah, I'm coming",
        "I bring, I bring all the drama-ma-ma-ma",
        "With my girls in the back",
        "I break trauma-ma-ma-ma",
        "나로 시작되는 drama",
        "깜짝 놀랄 다음 scene",
        "Into the real world",
        "Oh, I'ma make it my way",
        "너로 시작될 my drama",
      ],
        fx: `<i class="drx-spot"></i><div class="drx-emblems"><i></i><i></i><i></i><i></i></div><i class="drx-beam"></i><i class="drx-beam is-b"></i><i class="drx-claw"></i><i class="drx-claw is-b"></i><div class="drx-scene"><i></i><i></i><i></i></div><i class="drx-flash"></i><i class="drx-logo"></i><b class="drx-slate"></b>`,
        sections: [[0, "calm"], ...[[0, "spot"], [12.824, "rise"], [14.656, "drive"], [24.733, "hit"], [25.649, "stab1"], [26.565, "stab2"], [27.481, "stab3"], [27.939, "hush"], [28.855, "pickup"], [29.313, "encore"], [30.229, "encore2"]].map(([at, name]) => [29.304 + at, name])],
      },
      extras: ["logo.webp", ...["karina", "giselle", "winter", "ningning"].flatMap((key) => [`${key}-emblem.webp`, `${key}-back.webp`])],
      scene: dramaScene,
    },
  };
  // Every theme also has four group photos (flash-1..4.webp) that its intro flashes. Its photos, group
  // photos and extras (loaded ahead with them: the intro and the card backs use them) are warmed
  // before the click. Each loop repeats as a true loop: sample-exact with Web Audio, no gap, no fade.
  const photoOf = (theme, key) => `${THEMES[theme].folder}${key}.webp`;
  const flashesOf = (theme) => [1, 2, 3, 4].map((n) => `${THEMES[theme].folder}flash-${n}.webp`);

  // ── Page parts the themes change (the café versions are kept to switch back) ──
  const footerYear = document.getElementById("footer-year");
  const yearText = `© ${new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric" })} Brew Houze`;
  const brandName = document.querySelector(".brand-name");
  const brandSub = document.querySelector(".brand-sub");
  const heading = document.querySelector(".hero h1");
  const footerText = document.querySelector("footer .wrap > span:first-child");
  const cafe = { title: document.title, brand: brandName.innerHTML, sub: brandSub.textContent, h1: heading.textContent, footer: footerText.textContent };
  const lineup = document.getElementById("ae-lineup");

  // The photo card and the sound button (built once, shown only in a secret theme).
  document.body.insertAdjacentHTML("beforeend", `
    <div class="ae-pc-modal" id="ae-pc-modal" role="dialog" aria-modal="true" aria-labelledby="ae-pc-title" hidden>
      <button type="button" class="ae-pc-close" id="ae-pc-close" aria-label="Close the photo card">×</button>
      <div>
        <div class="ae-pc-stage">
          <div class="ae-pc" id="ae-pc">
            <div class="ae-pc-face ae-pc-front">
              <img id="ae-pc-img" alt="" draggable="false" />
              <i class="ae-pc-sheen" aria-hidden="true"></i>
              <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip the card to read about her">æ</button>
              <span class="ae-pc-tag" id="ae-pc-tag"></span>
              <div class="ae-pc-caption"><strong id="ae-pc-title"></strong><span id="ae-pc-hangul"></span></div>
            </div>
            <div class="ae-pc-face ae-pc-back" id="ae-pc-back"></div>
          </div>
        </div>
        <div class="ae-pc-nav"><button type="button" id="ae-pc-prev" aria-label="Previous member">‹</button><span id="ae-pc-count"></span><button type="button" id="ae-pc-next" aria-label="Next member">›</button></div>
      </div>
    </div>
    <button type="button" class="ae-sound" id="ae-sound" aria-pressed="false"><span class="ae-sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span id="ae-sound-label">Sound off</span></button>`);

  let current = THEMES[root.dataset.theme] ? root.dataset.theme : null;

  function renderLineup(theme) {
    const t = THEMES[theme];
    lineup.innerHTML = `<p class="ae-collab"><b>Brew Houze × aespa</b> · ${escapeHtml(t.era)}</p><ol>${memberOrder.map((key, index) => {
      const m = MEMBERS[key];
      return `<li class="ae-member" style="--delay: ${index * 0.35}s" data-member="${key}" role="button" tabindex="0" aria-label="Open ${escapeHtml(m.name)}’s photo card">`
        + `<img draggable="false" class="ae-photo" src="${photoOf(theme, key)}" alt="" loading="lazy" onerror="this.remove()" />`
        + (t.back === "signature" ? `<span class="am-plate-sign" aria-hidden="true" style="--sign: url('${siteUrl(`${t.folder}${key}-signature.svg`)}')"></span>` : "")
        + (t.back === "emblem" ? `<span class="dr-plate-emblem" aria-hidden="true" style="--emblem: url('${siteUrl(`${t.folder}${key}-emblem.webp`)}')"></span>` : "")
        + `<span class="ae-num">0${index + 1}</span><span class="ae-initial" aria-hidden="true">${escapeHtml(m.name[0])}</span>`
        + `<span class="ae-hangul" aria-hidden="true">${escapeHtml(m.hangul)}</span><p class="ae-name">${escapeHtml(m.name)}</p><p class="ae-role">${escapeHtml(m.short)}</p></li>`;
    }).join("")}</ol>`;
  }

  // ── The secret scene's button: in each era's own look, rising at the bottom of the screen only
  // while the page's text is the song's lyrics (the bridge); it goes when the chorus comes back ──
  const CTAS = {
    whiplash: { kicker: "● REC", label: "Shoot the secret take" },
    dirtywork: { kicker: "⚠ Dirty Worker Ver.", label: "Clock in for the dirty work" },
    armageddon: { kicker: "● Incoming", label: "Intercept the signal" },
    drama: { kicker: "Scene 00 · Take 01", label: "Action" },
  };
  const cta = document.createElement("div");
  cta.className = "ae-cta";
  cta.id = "ae-cta";
  document.body.append(cta);
  function renderCta(theme) {
    const t = theme ? THEMES[theme] : null;
    const words = theme ? CTAS[theme] : null;
    if (!t?.scene || !words) { cta.innerHTML = ""; return; }
    cta.innerHTML = `<button type="button" class="ae-cta-btn is-${theme}" aria-label="Play the secret ${escapeHtml(t.era)} scene" tabindex="-1">`
      + `<i class="ae-cta-icon" aria-hidden="true"></i><span class="ae-cta-text"><small>${escapeHtml(words.kicker)}</small><b>${escapeHtml(words.label)}</b></span></button>`;
  }
  function showCta(on) {
    if (cta.classList.contains("is-on") === on) return;
    cta.classList.toggle("is-on", on);
    cta.querySelector(".ae-cta-btn")?.setAttribute("tabindex", on ? "0" : "-1");
  }

  // ── The stage: each theme's bridge moves the page ──
  // Every loop is track 1 (the chorus) then track 2 (the bridge). During the chorus (and the
  // intro) the theme is as it is; during the bridge the page moves with the music. It follows the
  // music's own clock (the part heard now, see position()); without sound, the same timeline on the
  // page's clock. THEMES[x].stage: the beat, the loop's parts (or its cycle), the grid (where the
  // bridge's bar 1 starts), the theme's own effects (fx, the markup put in .ae-fx and styled in the
  // theme's stylesheet) and the sections [seconds into the loop, name], "calm" first. The stage is
  // html[data-stage]; --stage-beat and --stage-bar are the theme's beat and bar, and --stage-lag
  // starts the beat animations in step with the bars when a section starts.
  const stageFx = document.createElement("div");
  stageFx.className = "ae-fx";
  stageFx.setAttribute("aria-hidden", "true");
  document.body.appendChild(stageFx);
  let stageFrame = 0;
  let stageName = "";
  let stageClock = 0;
  const stageOf = (theme) => THEMES[theme]?.stage ?? null;
  const stageCycle = (stage) => stage.parts ? stage.parts.reduce((sum, part) => sum + part, 0) : stage.cycle;
  function setStage(name, lag = 0) {
    if (name === stageName) return;
    stageName = name;
    root.style.setProperty("--stage-lag", `${(-lag).toFixed(3)}s`);
    root.dataset.stage = name;
  }
  // ── The lyrics: through the bridge, the page's text turns into lines of the song ──
  // Every two bars the lines are dealt again over the headings, notes, cards, guide, tips, plates
  // and footer (the buttons, links, status and QR codes stay as they are); each theme brings its
  // lines in its own way (.ae-lyric, styled in its stylesheet). The real text stays for screen
  // readers, and it all comes back when the bridge ends.
  const LYRIC_TARGETS = ".hero h1, .hero .lead, .ae-collab, .ae-name, .ae-role, .section .eyebrow, .section h2, .section-note, .card h3, .card .who, .card .desc, .guide-item strong, .guide-item span, .tips li, footer .wrap > span:first-child";
  const LYRIC_SHORT = ".ae-name, .ae-role, .ae-collab, .section .eyebrow, .card h3, .card .who, .guide-item strong";
  const lyricSaved = new Map(); // element → [its own markup, its text]
  let lyricDeal = -1;
  function dealLyrics(lines, deal) {
    if (deal === lyricDeal) return;
    lyricDeal = deal;
    const targets = lyricSaved.size ? [...lyricSaved.keys()] : [...document.querySelectorAll(LYRIC_TARGETS)];
    // Small spots (names, labels, titles) take the short lines.
    const short = lines.filter((line) => line.length <= 24);
    // Each kind of spot (the four names, the four roles…) is dealt in turn, so siblings differ.
    const dealt = new Map(); // kind → how many lines it has been given this deal
    targets.forEach((el, i) => {
      if (!lyricSaved.has(el)) {
        lyricSaved.set(el, [el.innerHTML, el.textContent]);
        // Each keeps at least its own height, so the page does not jump about.
        el.style.minHeight = `${el.offsetHeight}px`;
      }
      const pool = short.length && el.matches(LYRIC_SHORT) ? short : lines;
      const kind = `${el.tagName}.${el.className}`;
      const k = dealt.get(kind) ?? 0;
      dealt.set(kind, k + 1);
      // Each kind starts at its own place in the lines (the names and the roles apart).
      const start = [...kind].reduce((sum, c) => sum + c.charCodeAt(0) * 7, 0);
      const line = pool[(deal * 7 + k + start) % pool.length];
      el.innerHTML = `<span class="ae-sr">${escapeHtml(lyricSaved.get(el)[1])}</span><span class="ae-lyric" aria-hidden="true" style="--ly-i: ${i % 9}">${escapeHtml(line)}</span>`;
    });
    // While the lyrics are on, the theme's scene button rises at the bottom of the screen.
    showCta(Boolean(current && THEMES[current]?.scene));
  }
  function restoreLyrics() {
    showCta(false);
    lyricSaved.forEach(([html], el) => { el.innerHTML = html; el.style.minHeight = ""; });
    lyricSaved.clear();
    lyricDeal = -1;
  }

  function stageTick() {
    const stage = current ? stageOf(current) : null;
    if (!stage) return;
    const player = players[current];
    let at = null; // seconds into the loop; -1 during the intro
    if (player && player.playing()) {
      const heard = player.position();
      if (heard) {
        at = heard.index < 0 ? -1 : (stage.parts ? stage.parts.slice(0, heard.index).reduce((sum, part) => sum + part, 0) : 0) + heard.offset;
        if (at >= 0) stageClock = performance.now() - at * 1000;
      }
    } else {
      const cycle = stageCycle(stage);
      at = (((performance.now() - stageClock) / 1000) % cycle + cycle) % cycle;
    }
    if (at !== null) {
      if (at < 0) { setStage("calm"); restoreLyrics(); }
      else {
        let section = stage.sections[0];
        for (const entry of stage.sections) if (at >= entry[0]) section = entry;
        const [begins, name] = section;
        // The beat animations start in step with the bridge's bars (grid: where its bar 1 starts).
        const bar = stage.beat * 4;
        const grid = stage.grid ?? stage.sections[1]?.[0] ?? 0;
        setStage(name, begins === 0 && name === "calm" ? 0 : ((at - grid) % bar + bar) % bar);
        if (name === "calm" || !stage.lyrics) restoreLyrics();
        else dealLyrics(stage.lyrics, Math.floor((at - grid) / (bar * 2)));
      }
    }
    stageFrame = requestAnimationFrame(stageTick);
  }
  function startStage(theme) {
    cancelAnimationFrame(stageFrame);
    stageName = "";
    restoreLyrics();
    const stage = stageOf(theme);
    if (!stage) { delete root.dataset.stage; return; }
    root.style.setProperty("--stage-beat", `${Math.round(stage.beat * 1000)}ms`);
    root.style.setProperty("--stage-bar", `${Math.round(stage.beat * 4000)}ms`);
    // The theme's own effects.
    stageFx.innerHTML = stage.fx;
    stageClock = performance.now();
    setStage("calm");
    if (motionOK()) stageFrame = requestAnimationFrame(stageTick);
  }
  function stopStage() {
    cancelAnimationFrame(stageFrame);
    stageName = "";
    restoreLyrics();
    delete root.dataset.stage;
  }

  function applyTheme(theme) {
    current = theme;
    if (theme) startStage(theme); else stopStage();
    const t = theme ? THEMES[theme] : null;
    if (t) { root.dataset.theme = theme; root.dataset.secret = ""; } else { delete root.dataset.theme; delete root.dataset.secret; }
    brandName.innerHTML = t ? "Brew Houze <b>×</b> aespa" : cafe.brand;
    brandSub.textContent = t ? t.sub : cafe.sub;
    heading.textContent = t ? t.h1 : cafe.h1;
    footerText.textContent = t ? t.footer : cafe.footer;
    document.title = t ? t.title : cafe.title;
    footerYear.textContent = t ? `${yearText} × aespa` : yearText;
    document.querySelector('meta[name="color-scheme"]').setAttribute("content", t ? "dark" : "light");
    if (t) renderLineup(theme); else { lineup.innerHTML = ""; closeMember(); }
    renderCta(theme);
  }

  // ── Sound ──
  // The music player (the same for every theme): its files played back to back with Web Audio,
  // sample-exact, then from the top again. The silence the MP3 encoder adds at both ends of each file
  // is trimmed, so the repeat is seamless.
  // prime() runs inside the click (phones only start audio in a tap); start() plays from the top
  // at full volume, straight after the intro (no fade), and resolves false if the browser still wants a tap. mute()/unmute() keep the
  // place; stop() ends it; hide()/show() pause it while the tab is hidden.
  const VOLUME = 0.6;
  function stitchedLoop(srcs, introSrc = null) {
    let ctx = null;
    let gain = null;
    let parts = null;
    let introPart = null;
    let loading = null;
    let sources = [];
    let nextAt = 0;
    let index = 0;
    let timer = null;
    let generation = 0;
    let hiddenSuspend = false;
    const context = () => {
      if (!ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioContextClass();
        gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);
      }
      return ctx;
    };
    // length (seconds from the first sound): the part is played for exactly that long, its own
    // silence at the end included (a part that ends on a rest).
    const trim = (buffer, length) => {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const loud = (i) => channels.some((data) => Math.abs(data[i]) > 1e-4);
      let first = 0;
      while (first < buffer.length && !loud(first)) first++;
      let last = buffer.length - 1;
      while (last > first && !loud(last)) last--;
      const offset = first / buffer.sampleRate;
      return { buffer, offset, duration: length ? Math.min(length, buffer.duration - offset) : (last + 1 - first) / buffer.sampleRate };
    };
    const load = () => {
      if (!loading) {
        const decode = async (entry) => {
          const { src, length } = typeof entry === "string" ? { src: entry } : entry;
          const response = await fetch(src);
          if (!response.ok) throw new Error(`Could not load ${src}`);
          return trim(await context().decodeAudioData(await response.arrayBuffer()), length);
        };
        loading = Promise.all([Promise.all(srcs.map(decode)), introSrc ? decode(introSrc) : null])
          .then(([decoded, intro]) => { parts = decoded; introPart = intro; }, (error) => { loading = null; throw error; });
      }
      return loading;
    };
    // Keeps about six seconds of music queued, each part starting exactly where the last one ends.
    // What is scheduled when (on the audio clock): which part plays now (see position()).
    let timeline = [];
    const schedule = () => {
      while (parts && nextAt < ctx.currentTime + 6) {
        const part = parts[index];
        timeline.push({ index, at: nextAt, end: nextAt + part.duration });
        const node = ctx.createBufferSource();
        node.buffer = part.buffer;
        node.connect(gain);
        node.start(nextAt, part.offset, part.duration);
        node.onended = () => { sources = sources.filter((s) => s !== node); };
        sources.push(node);
        nextAt += part.duration;
        index = (index + 1) % parts.length;
      }
    };
    const ramp = (to, ms) => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(to, now + ms / 1000);
    };
    const halt = () => {
      clearInterval(timer);
      timer = null;
      sources.forEach((node) => { try { node.stop(); } catch { /* already stopped */ } });
      sources = [];
      timeline = [];
    };
    const running = async () => {
      try { await Promise.race([ctx.resume(), new Promise((ok) => setTimeout(ok, 400))]); } catch { /* not allowed yet */ }
      return ctx.state === "running";
    };
    const player = {
      prime() { context().resume().catch(() => undefined); load().catch(() => undefined); },
      // Playing (and not muted): the music the listener hears now is on the audio clock.
      playing: () => Boolean(ctx && timer && ctx.state === "running"),
      // The part heard now: { index (-1: the intro), offset in seconds }, or null between parts.
      position() {
        if (!player.playing()) return null;
        const now = ctx.currentTime - (ctx.outputLatency || 0);
        timeline = timeline.filter((entry) => entry.end > now - 2);
        const entry = timeline.find((item) => now >= item.at && now < item.end);
        return entry ? { index: entry.index, offset: now - entry.at } : null;
      },
      // Decoded ahead (before the click) so a joined intro can start at once.
      preload() { load().catch(() => undefined); },
      // A joined theme: its intro clip, then the loop from the sample the intro ends on. Resolves the
      // intro's clock (ms into the clip file, for the cues), or null when it cannot start by the
      // deadline (the intro then runs silent and the loop starts after it as usual).
      async startWithIntro(deadline) {
        const mine = ++generation;
        context();
        try { await load(); } catch { return null; }
        if (!introPart || !(await running()) || mine !== generation || performance.now() > deadline) return null;
        halt();
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(VOLUME, ctx.currentTime);
        const at = ctx.currentTime + 0.05;
        const node = ctx.createBufferSource();
        node.buffer = introPart.buffer;
        node.connect(gain);
        node.start(at, introPart.offset, introPart.duration);
        timeline.push({ index: -1, at, end: at + introPart.duration });
        node.onended = () => { sources = sources.filter((s) => s !== node); };
        sources.push(node);
        index = 0;
        nextAt = at + introPart.duration;
        schedule();
        timer = setInterval(schedule, 1000);
        return () => (ctx.currentTime - at + introPart.offset) * 1000;
      },
      async start() {
        const mine = ++generation;
        context();
        try { await load(); } catch { return false; }
        if (!(await running()) || mine !== generation) return false;
        halt();
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(VOLUME, ctx.currentTime);
        index = 0;
        nextAt = ctx.currentTime + 0.06;
        schedule();
        timer = setInterval(schedule, 1000);
        return true;
      },
      async unmute() {
        if (!timer) return player.start();
        generation++;
        if (!(await running())) return false;
        ramp(VOLUME, 900);
        return true;
      },
      mute() {
        if (!ctx || !timer) return;
        const mine = ++generation;
        ramp(0, 450);
        setTimeout(() => { if (mine === generation) ctx.suspend(); }, 480);
      },
      stop() {
        if (!ctx || !timer) return;
        const mine = ++generation;
        ramp(0, 450);
        setTimeout(() => { if (mine === generation) { halt(); ctx.suspend(); } }, 480);
      },
      hide() { if (ctx && timer && ctx.state === "running") { hiddenSuspend = true; ctx.suspend(); } },
      show() { if (!hiddenSuspend) return Promise.resolve(true); hiddenSuspend = false; return running(); },
    };
    return player;
  }

  const players = {};
  const playerFor = (theme) => (players[theme] ??= stitchedLoop(THEMES[theme].loops, THEMES[theme].joined ? { src: THEMES[theme].introClip, length: THEMES[theme].introLength } : null));
  const clips = {};
  const clipFor = (theme) => { if (!clips[theme]) { clips[theme] = new Audio(THEMES[theme].introClip); clips[theme].preload = "auto"; } return clips[theme]; };
  // The next theme's intro sound, photos and extra images, loaded before the click so the intro
  // never skips a member.
  const warmed = {};
  function warm(theme) {
    if (THEMES[theme].joined) playerFor(theme).preload(); else clipFor(theme);
    if (warmed[theme]) return;
    const t = THEMES[theme];
    warmed[theme] = [...memberOrder.map((key) => photoOf(theme, key)), ...flashesOf(theme), ...(t.extras ?? []).map((file) => `${t.folder}${file}`)].map((src) => { const img = new Image(); img.src = src; return img; });
  }

  const soundButton = document.getElementById("ae-sound");
  const soundWanted = () => store.get(SOUND_KEY) !== "off";
  function showSoundState(state) {
    // state: "on" playing, "off" muted, "waiting" wanted but the browser needs a tap first.
    soundButton.classList.toggle("is-on", state === "on");
    soundButton.classList.toggle("is-waiting", state === "waiting");
    soundButton.setAttribute("aria-pressed", String(state === "on"));
    soundButton.setAttribute("aria-label", state === "on" ? "Turn the music off" : "Play the music");
    document.getElementById("ae-sound-label").textContent = state === "on" ? "Sound on" : state === "waiting" ? "Tap for sound" : "Sound off";
  }
  soundButton.addEventListener("click", async () => {
    if (!current) return;
    const player = playerFor(current);
    if (soundButton.classList.contains("is-on")) { store.set(SOUND_KEY, "off"); player.mute(); showSoundState("off"); return; }
    store.set(SOUND_KEY, "on");
    player.prime();
    showSoundState((await player.unmute()) ? "on" : "waiting");
  });
  document.addEventListener("visibilitychange", () => {
    if (!current) return;
    const player = playerFor(current);
    if (document.visibilityState === "hidden") player.hide();
    else void player.show().then((ok) => { if (!ok) showSoundState("waiting"); });
  });

  // ── The intro player ──
  // Resolves { joined: true } when a joined theme's music is already running (intro into loop).
  function playIntro(theme, withSound) {
    const t = THEMES[theme];
    const spec = t.intro;
    return new Promise((done) => {
      const box = document.createElement("div");
      box.className = t.introClass;
      box.setAttribute("aria-hidden", "true");
      // The members' and the group photos, loaded now (one not ready in time is skipped).
      const image = (src) => { const img = new Image(); img.alt = ""; img.draggable = false; img.src = src; return img; };
      const photos = memberOrder.map((key) => image(photoOf(theme, key)));
      const show = spec.mount(box, photos, flashesOf(theme).map(image));
      document.body.appendChild(box);
      show(0);
      let shown = 0;
      let clock = null;
      const frame = () => {
        const now = clock();
        let step = 0;
        spec.cues.forEach(([at], i) => { if (now >= at) step = i; });
        if (step !== shown) { shown = step; show(step); }
        if (now >= spec.end) {
          box.classList.add("is-out");
          setTimeout(() => box.remove(), 260);
          done({ joined });
          return;
        }
        requestAnimationFrame(frame);
      };
      let joined = false;
      const silent = () => { const start = performance.now(); clock = () => performance.now() - start; requestAnimationFrame(frame); };
      if (!withSound) { silent(); return; }
      if (t.joined) {
        // Follow the audio clock the intro and the loop share (or run silent if it cannot start soon).
        void playerFor(theme).startWithIntro(performance.now() + 700).then((audioClock) => {
          if (audioClock) { joined = true; clock = audioClock; } else silent();
          if (audioClock) requestAnimationFrame(frame);
        });
        return;
      }
      // Wait (briefly) for the sound to actually start, then follow it.
      const clip = clipFor(theme);
      clip.currentTime = 0;
      let settled = false;
      const giveUp = setTimeout(() => { if (settled) return; settled = true; clip.pause(); silent(); }, 700);
      clip.play().then(() => {
        if (settled) { clip.pause(); return; }
        settled = true;
        clearTimeout(giveUp);
        const start = performance.now();
        // The clip's clock, or the page clock once the clip has ended.
        clock = () => (clip.ended ? performance.now() - start : clip.currentTime * 1000);
        requestAnimationFrame(frame);
      }, () => { if (settled) return; settled = true; clearTimeout(giveUp); silent(); });
    });
  }

  // ── Switching ──
  const lastTheme = () => (ORDER.includes(store.get(LAST_KEY)) ? store.get(LAST_KEY) : ORDER[0]);
  let switching = false;
  // Switches to a theme (null: the café), from the café or straight from another theme.
  async function switchTo(entering) {
    if (switching || entering === current) return;
    stopScene?.(false);
    switching = true;
    const leaving = current;
    const motion = motionOK();
    // Entering plays the intro (with its sound) while the page switches and goes back to the top
    // behind it. Leaving fades the music out.
    const sound = Boolean(entering) && soundWanted();
    if (sound) playerFor(entering).prime();
    const intro = entering && motion ? playIntro(entering, sound) : null;
    if (leaving) { playerFor(leaving).stop(); if (!THEMES[leaving].joined) clipFor(leaving).pause(); }
    applyTheme(entering);
    window.scrollTo({ top: 0, behavior: "instant" });
    store.set(THEME_KEY, entering ?? "cafe");
    if (entering) store.set(LAST_KEY, entering);
    const played = intro ? await intro : null;
    if (entering) showSoundState(played?.joined ? "on" : sound ? ((await playerFor(entering).start()) ? "on" : "waiting") : "off");
    switching = false;
    if (motion) {
      const flash = document.createElement("div");
      flash.className = "ae-flash";
      document.body.appendChild(flash);
      flash.addEventListener("animationend", () => flash.remove());
    }
    toast(entering ? THEMES[entering].toast : "☕ Back to the café");
  }

  // ── The theme picker ──
  // A popover over the "© Brew Houze" line: a photocard for each era (its group photo and logo) and
  // one for the café; the one on now is marked. A theme's sound and photos load when its card is
  // pointed at, touched or focused, so the intro is ready by the tap.
  const PICKS = {
    whiplash: { logo: "whiplash/logo-white.webp", tint: "#F2F4F7", mask: true },
    dirtywork: { logo: "dirty-work/logo-white.webp", tint: "#EE6A2A", mask: true },
    armageddon: { logo: "armageddon/logo-white.webp", tint: "#BFF4F1", mask: true },
    drama: { logo: "drama/logo.webp", tint: "#F30306", mask: false },
  };
  const picker = document.createElement("div");
  picker.className = "ae-picker";
  picker.id = "ae-picker";
  picker.hidden = true;
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Choose a theme");
  const pickCard = (theme) => {
    if (!theme) return `<button type="button" class="ae-pick is-cafe" data-pick="cafe" role="radio" style="--i: 0"><span class="ae-pick-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5c-.6.8-.6 1.7 0 2.5M11.5 3.5c-.6.8-.6 1.7 0 2.5M15 3.5c-.6.8-.6 1.7 0 2.5"/></svg></span><span class="ae-pick-name">Café</span></button>`;
    const p = PICKS[theme];
    return `<button type="button" class="ae-pick" data-pick="${theme}" role="radio" style="--i: ${ORDER.indexOf(theme) + 1}; --tint: ${p.tint}">`
      + `<span class="ae-pick-art" data-src="${flashesOf(theme)[0]}"><i class="ae-pick-logo${p.mask ? " is-mask" : ""}" style="--logo: url('${siteUrl(p.logo)}')"></i></span>`
      + `<span class="ae-pick-name">${escapeHtml(THEMES[theme].era)}</span></button>`;
  };
  picker.innerHTML = `<p class="ae-picker-head"><b>Brew Houze</b> × aespa <span>· pick an era</span></p>`
    + `<div class="ae-picker-row" role="radiogroup" aria-label="Themes">${[null, ...ORDER].map(pickCard).join("")}</div>`;
  document.body.appendChild(picker);
  footerYear.setAttribute("aria-haspopup", "dialog");
  footerYear.setAttribute("aria-controls", "ae-picker");
  footerYear.setAttribute("aria-expanded", "false");
  const pickButtons = [...picker.querySelectorAll(".ae-pick")];
  // Above the line, its tail pointing at it, kept on screen.
  function placePicker() {
    const at = footerYear.getBoundingClientRect();
    const width = picker.offsetWidth;
    const left = Math.max(16, Math.min(at.left + at.width / 2 - width / 2, window.innerWidth - 16 - width));
    picker.style.left = `${left}px`;
    picker.style.bottom = `${window.innerHeight - at.top + 14}px`;
    picker.style.setProperty("--tail-x", `${Math.min(Math.max(18, at.left + at.width / 2 - left), width - 18)}px`);
  }
  function openPicker() {
    picker.querySelectorAll(".ae-pick-art[data-src]").forEach((art) => { art.style.backgroundImage = `url('${siteUrl(art.dataset.src)}')`; art.removeAttribute("data-src"); });
    const on = current ?? "cafe";
    pickButtons.forEach((button) => {
      const isOn = button.dataset.pick === on;
      button.setAttribute("aria-checked", String(isOn));
      button.tabIndex = isOn ? 0 : -1;
    });
    picker.hidden = false;
    footerYear.setAttribute("aria-expanded", "true");
    placePicker();
    picker.classList.remove("is-open");
    void picker.offsetWidth;
    picker.classList.add("is-open");
    pickButtons.find((button) => button.dataset.pick === on)?.focus({ preventScroll: true });
    window.addEventListener("resize", placePicker);
    window.addEventListener("scroll", placePicker, { passive: true });
  }
  function closePicker(refocus = false) {
    if (picker.hidden) return;
    picker.hidden = true;
    footerYear.setAttribute("aria-expanded", "false");
    window.removeEventListener("resize", placePicker);
    window.removeEventListener("scroll", placePicker);
    if (refocus) footerYear.focus({ preventScroll: true });
  }
  const togglePicker = () => { if (picker.hidden) openPicker(); else closePicker(); };
  picker.addEventListener("click", (event) => {
    const button = event.target.closest(".ae-pick");
    if (!button) return;
    closePicker(true);
    void switchTo(button.dataset.pick === "cafe" ? null : button.dataset.pick);
  });
  const warmPick = (event) => { const button = event.target.closest?.(".ae-pick"); if (button && button.dataset.pick !== "cafe") warm(button.dataset.pick); };
  picker.addEventListener("pointerover", warmPick);
  picker.addEventListener("pointerdown", warmPick);
  picker.addEventListener("focusin", warmPick);
  // Arrow keys move between the cards (one tab stop), Escape closes.
  picker.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closePicker(true); return; }
    if (event.key === "Tab") { closePicker(); return; }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const home = { Home: 0, End: pickButtons.length - 1 }[event.key];
    if (step === undefined && home === undefined) return;
    event.preventDefault();
    const now = pickButtons.indexOf(document.activeElement);
    const next = home ?? (now + step + pickButtons.length) % pickButtons.length;
    pickButtons.forEach((button, index) => { button.tabIndex = index === next ? 0 : -1; });
    pickButtons[next].focus();
  });
  document.addEventListener("pointerdown", (event) => { if (!picker.hidden && !picker.contains(event.target) && event.target !== footerYear) closePicker(); });

  // ── The secret scene ──
  // The glowing lyric fades the theme out (its music and its stage) and plays the scene: the MV
  // bleeding in and out of the page, with its own sound (muted if the visitor turned the music off). When it ends
  // (or is skipped) the theme comes back as it is after its intro: track 1 from the top.
  let scenePlaying = false;
  let stopScene = null; // ends the scene now (resume: bring the theme back after it)
  function playScene(theme) {
    const t = THEMES[theme];
    const spec = t.scene;
    if (!spec || scenePlaying || switching) return;
    scenePlaying = true;
    const box = document.createElement("div");
    box.className = `ae-scene ${spec.className}`;
    // (Transparent: the page stays, and the scene plays over it and in it.)
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", `${t.era}: the secret scene`);
    box.dataset.cue = "load";
    const video = document.createElement("video");
    video.src = spec.src;
    video.preload = "auto";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.muted = !soundWanted();
    const scene = spec.mount(box, video);
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "ae-scene-skip";
    skip.textContent = "Skip ›";
    box.append(skip);
    document.body.appendChild(box);
    root.dataset.scene = theme;
    playerFor(theme).stop();
    stopStage();
    skip.focus({ preventScroll: true });
    // Started inside the click, so phones let it play with sound. If the browser still refuses the
    // sound (some embedded browsers do), it plays muted with a "Tap for sound" button.
    const unmute = document.createElement("button");
    unmute.type = "button";
    unmute.className = "ae-scene-sound";
    unmute.textContent = "🔊 Tap for sound";
    unmute.hidden = true;
    box.append(unmute);
    unmute.addEventListener("click", () => { video.muted = false; void video.play().catch(() => undefined); unmute.hidden = true; });
    video.play().catch(() => {
      video.muted = true;
      video.play().then(() => { if (soundWanted()) unmute.hidden = false; }, () => finish());
    });
    let cue = "";
    let frame = 0;
    let lastMirrors = 0;
    if (SCENE_LITE) root.dataset.sceneLite = "";
    const tick = () => {
      const now = video.currentTime;
      const clock = performance.now();
      mirrorsDue = clock - lastMirrors >= (SCENE_LITE ? 40 : 15);
      if (mirrorsDue) lastMirrors = clock;
      let name = "load";
      if (!video.paused || now > 0) for (const [at, entry] of spec.cues) if (now >= at) name = entry;
      if (name !== cue) {
        cue = name;
        box.dataset.cue = name;
        root.dataset.sceneCue = name;
        scene.show(name, now);
        box.classList.remove("is-hit");
        void box.offsetWidth;
        box.classList.add("is-hit");
      }
      scene.tick(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onKey = (event) => { if (event.key === "Escape" && !document.querySelector(".ae-pc-modal:not([hidden]), .ae-picker:not([hidden])")) { event.preventDefault(); finish(); } };
    document.addEventListener("keydown", onKey);
    let done = false;
    function finish(resume = true) {
      if (done) return;
      done = true;
      stopScene = null;
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      box.classList.add("is-out");
      const close = () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        scene.unmount?.();
        box.remove();
        delete root.dataset.scene;
        delete root.dataset.sceneCue;
        delete root.dataset.sceneLite;
        mirrorsDue = true;
        scenePlaying = false;
        if (!resume || current !== theme) return;
        // Back to the theme as it is after its intro.
        window.scrollTo({ top: 0, behavior: "instant" });
        startStage(theme);
        if (soundWanted()) void playerFor(theme).start().then((ok) => showSoundState(ok ? "on" : "waiting"));
        else showSoundState("off");
        if (motionOK()) {
          const flash = document.createElement("div");
          flash.className = "ae-flash";
          document.body.appendChild(flash);
          flash.addEventListener("animationend", () => flash.remove());
        }
        footerYear.focus({ preventScroll: true });
      };
      if (resume) setTimeout(close, 500); else close();
    }
    stopScene = finish;
    video.addEventListener("ended", () => finish());
    skip.addEventListener("click", () => finish());
  }
  // The theme's own button at the foot of the page opens its scene.
  cta.addEventListener("click", (event) => { if (event.target.closest(".ae-cta-btn") && current) playScene(current); });

  // ── The members' photo cards ──
  const pcModal = document.getElementById("ae-pc-modal");
  const pcCard = document.getElementById("ae-pc");
  let pcIndex = 0;
  let pcOpener = null;
  function showMember(index) {
    if (!current) return;
    const t = THEMES[current];
    pcIndex = (index + memberOrder.length) % memberOrder.length;
    const key = memberOrder[pcIndex];
    const member = MEMBERS[key];
    pcCard.classList.remove("is-flipped");
    document.getElementById("ae-pc-img").src = photoOf(current, key);
    document.getElementById("ae-pc-img").alt = `${member.name} of aespa`;
    document.getElementById("ae-pc-title").textContent = member.name;
    document.getElementById("ae-pc-hangul").textContent = member.hangul;
    document.getElementById("ae-pc-tag").textContent = t.tag;
    document.getElementById("ae-pc-count").textContent = `0${pcIndex + 1} / 04`;
    const back = document.getElementById("ae-pc-back");
    back.classList.toggle("is-signature", t.back === "signature");
    back.classList.toggle("is-spec", t.back === "spec");
    back.classList.toggle("is-emblem", t.back === "emblem");
    back.innerHTML = t.back === "emblem" ? `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <span class="ae-pc-back-num">0${pcIndex + 1} / 04</span>
      <div class="dr-back-photo" style="background-image: url('${siteUrl(`${t.folder}${key}-back.webp`)}')"></div>
      <div class="dr-back-emblem" role="img" aria-label="${escapeHtml(member.name)}’s emblem" style="--emblem: url('${siteUrl(`${t.folder}${key}-emblem.webp`)}')"></div>
      <div class="dr-back-name"><h3>${escapeHtml(member.name)}</h3><p class="ae-pc-kr">${escapeHtml(member.hangul)}</p></div>
      <div class="ae-pc-foot"><span>Brew Houze × aespa<br />${escapeHtml(t.era)}</span><i></i></div>` : t.back === "spec" ? `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <span class="ae-pc-back-num">0${pcIndex + 1} / 04</span>
      <div class="wl-back-device" aria-hidden="true"></div>
      <h3>${escapeHtml(member.name)}</h3>
      <p class="ae-pc-kr">${escapeHtml(member.hangul)}</p>
      <p class="wl-back-status"><i></i>æ-${escapeHtml(member.name)} · online</p>
      <dl class="wl-spec"><dt>Name</dt><dd>${escapeHtml(member.real)}</dd><dt>Born</dt><dd>${escapeHtml(member.born)}</dd><dt>From</dt><dd>${escapeHtml(member.from)}</dd><dt>Position</dt><dd>${escapeHtml(member.role)}</dd></dl>
      <p class="ae-pc-about">${escapeHtml(member.about)}</p>
      <div class="ae-pc-foot"><span>Brew Houze × aespa<br />${escapeHtml(t.era)}</span><i></i></div>` : t.back === "signature" ? `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <span class="ae-pc-back-num">0${pcIndex + 1} / 04</span>
      <div class="am-back-photo" style="background-image: url('${siteUrl(`${t.folder}${key}-back.webp`)}')"></div>
      <div class="am-back-sign" role="img" aria-label="${escapeHtml(member.name)}’s signature" style="--sign: url('${siteUrl(`${t.folder}${key}-signature.svg`)}')"></div>
      <div class="am-back-name"><h3>${escapeHtml(member.name)}</h3><p class="ae-pc-kr">${escapeHtml(member.hangul)}</p></div>
      <div class="ae-pc-foot"><span>Brew Houze × aespa<br />${escapeHtml(t.era)}</span><i></i></div>` : `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <span class="ae-pc-back-num">0${pcIndex + 1} / 04</span>
      <h3>${escapeHtml(member.name)}</h3>
      <p class="ae-pc-kr">${escapeHtml(member.hangul)}</p>
      ${t.back === "facts" ? `<ul class="ae-pc-fun">${DIRTY_FACTS[key].map(([label, text]) => `<li><b>${escapeHtml(label)}</b><span>${escapeHtml(text)}</span></li>`).join("")}</ul>` : `
      <p class="ae-pc-role">${escapeHtml(member.role)}</p>
      <dl class="ae-pc-facts"><dt>Name</dt><dd>${escapeHtml(member.real)}</dd><dt>Born</dt><dd>${escapeHtml(member.born)}</dd><dt>From</dt><dd>${escapeHtml(member.from)}</dd><dt>Group</dt><dd>aespa · debuted Nov 17, 2020</dd></dl>
      <p class="ae-pc-about">${escapeHtml(member.about)}</p>`}
      <div class="ae-pc-foot"><span>Brew Houze × aespa<br />${escapeHtml(t.era)}</span><i></i></div>`;
    back.style.setProperty("--device", t.back === "spec" ? `url("${siteUrl(`${t.folder}device.webp`)}")` : "none");
    // Replaying the entrance each time a member is shown.
    back.insertAdjacentHTML("beforeend", '<i class="ae-pc-sheen" aria-hidden="true"></i>');
    pcCard.style.animation = "none"; void pcCard.offsetWidth; pcCard.style.animation = "";
  }
  // ── The card leans with the phone ──
  // On phones the open card follows the phone's tilt (the angle it is held at when the card opens
  // counts as level), a few degrees at most, smoothed. The frame around the card leans; the card
  // flips inside it. iPhones ask for permission first, from the tap that opens the card; refused,
  // or without a motion sensor (computers), the card simply stays still.
  const pcStage = pcCard.parentElement;
  const TILT_MAX = 10;
  let tiltAllowed = null; // null: not asked yet (iPhone), true, or false
  let tiltBase = null;
  let tiltTarget = { x: 0, y: 0 };
  let tiltNow = { x: 0, y: 0 };
  let tiltFrame = 0;
  const screenAngle = () => (((screen.orientation?.angle ?? window.orientation ?? 0) % 360) + 360) % 360;
  function onOrientation(event) {
    if (event.beta === null || event.gamma === null) return;
    // Left-right and forward-back tilt as the screen is turned (portrait or landscape).
    const angle = screenAngle();
    const [side, front] = angle === 90 ? [event.beta, -event.gamma] : angle === 270 ? [-event.beta, event.gamma] : angle === 180 ? [-event.gamma, -event.beta] : [event.gamma, event.beta];
    if (!tiltBase) tiltBase = { side, front };
    const clamp = (value) => Math.max(-TILT_MAX, Math.min(TILT_MAX, value));
    tiltTarget = { x: clamp(-(front - tiltBase.front) * 0.5), y: clamp((side - tiltBase.side) * 0.6) };
  }
  function tiltStep() {
    tiltNow = { x: tiltNow.x + (tiltTarget.x - tiltNow.x) * 0.14, y: tiltNow.y + (tiltTarget.y - tiltNow.y) * 0.14 };
    pcStage.style.setProperty("--tilt-x", `${tiltNow.x.toFixed(2)}deg`);
    pcStage.style.setProperty("--tilt-y", `${tiltNow.y.toFixed(2)}deg`);
    tiltFrame = requestAnimationFrame(tiltStep);
  }
  function listenTilt() {
    tiltBase = null;
    tiltTarget = { x: 0, y: 0 };
    window.addEventListener("deviceorientation", onOrientation);
    cancelAnimationFrame(tiltFrame);
    tiltFrame = requestAnimationFrame(tiltStep);
  }
  // Runs inside the tap that opens a card (iPhones only ask from a tap).
  function startTilt() {
    if (!motionOK() || typeof window.DeviceOrientationEvent === "undefined" || tiltAllowed === false) return;
    const ask = window.DeviceOrientationEvent.requestPermission;
    if (typeof ask !== "function" || tiltAllowed) { listenTilt(); return; }
    ask.call(window.DeviceOrientationEvent).then((answer) => {
      tiltAllowed = answer === "granted";
      if (tiltAllowed && !pcModal.hidden) listenTilt();
    }, () => { tiltAllowed = false; });
  }
  function stopTilt() {
    window.removeEventListener("deviceorientation", onOrientation);
    cancelAnimationFrame(tiltFrame);
    tiltNow = { x: 0, y: 0 };
    pcStage.style.setProperty("--tilt-x", "0deg");
    pcStage.style.setProperty("--tilt-y", "0deg");
  }

  function openMember(key, opener) {
    startTilt();
    pcOpener = opener;
    showMember(memberOrder.indexOf(key));
    pcModal.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("ae-pc-close").focus();
  }
  function closeMember() {
    if (pcModal.hidden) return;
    pcModal.hidden = true;
    stopTilt();
    document.body.style.overflow = "";
    pcCard.classList.remove("is-flipped");
    if (pcOpener && pcOpener.isConnected) pcOpener.focus();
  }
  lineup.addEventListener("click", (event) => { const plate = event.target.closest(".ae-member[data-member]"); if (plate) openMember(plate.dataset.member, plate); });
  lineup.addEventListener("keydown", (event) => {
    const plate = event.target.closest(".ae-member[data-member]");
    if (plate && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openMember(plate.dataset.member, plate); }
  });
  pcModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-flip]")) { flipCard(); return; }
    if (event.target === pcModal) closeMember();
  });
  document.getElementById("ae-pc-close").addEventListener("click", closeMember);
  document.getElementById("ae-pc-prev").addEventListener("click", () => showMember(pcIndex - 1));
  document.getElementById("ae-pc-next").addEventListener("click", () => showMember(pcIndex + 1));
  document.addEventListener("keydown", (event) => {
    if (pcModal.hidden) return;
    if (event.key === "Escape") closeMember();
    else if (event.key === "ArrowLeft") showMember(pcIndex - 1);
    else if (event.key === "ArrowRight") showMember(pcIndex + 1);
  });
  // Flipping: the card turns over; the face turned away is hidden halfway through the turn (see
  // secret.css), so it never shows through on phones.
  function flipCard() {
    pcCard.classList.toggle("is-flipped");
  }
  pcModal.addEventListener("dragstart", (event) => event.preventDefault());

  // ── Start ──
  if (store.get(THEME_KEY) === "aespa") store.set(THEME_KEY, "whiplash"); // the old name of Whiplash
  applyTheme(current);
  if (current) {
    // After a reload the browser usually wants a tap before any sound (the button asks for it).
    if (soundWanted()) void playerFor(current).start().then((ok) => showSoundState(ok ? "on" : "waiting"));
    else showSoundState("off");
  } else {
    warm(lastTheme()); // the theme last picked, ready for the tap
  }
  footerYear.addEventListener("click", togglePicker);
  footerYear.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); togglePicker(); } });
})();
