// Brew Houze × aespa: the secret themes of the portal (styles in secret.css, whiplash.css,
// dirtywork.css, armageddon.css, drama.css and richman.css; photos and sound in whiplash/,
// dirty-work/, armageddon/, drama/ and richman/).
//
// The "© Brew Houze" line in the footer opens the theme picker: the café, Whiplash, Dirty Work,
// Armageddon, Drama or Rich Man, straight from any of them. Each
// theme has the four members (plates that open photo cards), an intro that follows its own sound
// clip, and music that loops while the theme is on. index.html sets the theme before the page
// paints (so a reload keeps it without a flash) and provides showToast().
(() => {
  const root = document.documentElement;
  const THEME_KEY = "brew-houze-theme"; // the theme that is on, or "cafe"
  const LAST_KEY = "brew-houze-theme-next"; // the theme last picked (loaded ahead in the café)
  const SOUND_KEY = "brew-houze-aespa-sound"; // "off" when the visitor muted the music
  const ORDER = ["whiplash", "dirtywork", "armageddon", "drama", "richman"]; // the picker's order, after the café
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
  const DW_TAROT = {
    // The Dirty Work card backs: a tarot card each, titled from a line she sings in Dirty Work, with
    // the arcana it borrows (XXI the World, VIII Strength, XIII Death, XV the Devil).
    karina: { numeral: "XXI", title: "The World", line: "World domination, I don’t gotta say it" },
    winter: { numeral: "VIII", title: "The Fierce", line: "Sharp eyes, fierce look" },
    giselle: { numeral: "XIII", title: "The Reaper", line: "Call me the reaper, I’m knock, knock, knocking" },
    ningning: { numeral: "XV", title: "The Baddie", line: "It’s me, it’s me, a little baddie" },
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

  // Whiplash (126 BPM; the drop at 16.41 s is a downbeat). The page stays and the camera works it: the
  // viewfinder over everything (REC, the timecode, the shot), and each kind of shot a piece of the shoot:
  //   title (0)           the white card, CAN'T TOUCH THAT
  //   darkroom (0.7, 44.2) the red studio: the page under red safelight, the MV developing in a print on
  //                       it (a fresh print each bar, white to image), the print floating in its tray
  //   rig (7.7, 22.93)    the robot camera arm: the page itself filmed, panning, tilting and pushing in
  //                       under a moving camera, the MV on the rig's monitor, a tracking cross
  //   crack (14.17)       the glass breaks: the viewfinder glass cracks
  //   white (15.07)       the white studio: overexposed, zebra stripes running over the picture
  //   drop (16.41, 37.36) the shutter: iris blades snap shut and open with a flash, SHOT 01 / 02
  //   giselle (18.23)     the cover shoot: the page a magazine cover, GISELLE across the top, her cover
  //                       lines and a barcode, the cover photo playing her (tracked); on each of her
  //                       hits the shutter fires and the frame drops into the contact strip beside the
  //                       cover (never over her); her plate lifted and playing her
  //   faces (21.37)       the four faces: the autofocus jumping face to face on the beat
  //   sheet (23.73)       the camera crew: the MV in the frame and a contact sheet filling up round it,
  //                       a frame a beat, the best ones circled in red grease pencil
  //   trails (33.55)      the break: a long exposure, the MV leaving light trails behind it
  //   burst (38.07)       burst mode, by the bar: strobe (the frame stepping on the eighths, a flash on
  //                       each) and whip pans (the MV ripping in from the side)
  //   end (47.8)          the lineup: each plate refocused on its own member, and the print of the
  //                       lineup sliding out of the camera and developing in the middle
  const WL_BAR = 240 / 126;
  const WL_BEAT = WL_BAR / 4;
  const WL_DROP = 16.41;
  // The final pose (from 47.8 s): the four stand in a row, mirrored against the plates (left to right
  // Ningning, Winter, Giselle, Karina); each plate frames its own member.
  const WL_POSE = { karina: 0.848, giselle: 0.634, winter: 0.377, ningning: 0.16 };
  // Giselle: where her face is across the frame (measured), and her hits (the shutter fires on each).
  const WL_GISELLE = [[18.23, 0.45], [18.55, 0.45], [18.8, 0.5], [19.3, 0.5], [19.55, 0.53], [19.8, 0.5], [20.05, 0.48], [20.3, 0.47], [20.55, 0.44], [20.8, 0.5], [21.05, 0.5], [21.37, 0.45]];
  const WL_GISELLE_HITS = [18.45, 18.88, 19.29, 19.84, 20.32, 20.85, 21.17];
  function wlGiselleAt(now) {
    for (let i = 0; i < WL_GISELLE.length - 1; i++) {
      const [ta, xa] = WL_GISELLE[i];
      const [tb, xb] = WL_GISELLE[i + 1];
      if (now >= ta && now <= tb) return xa + (xb - xa) * ((now - ta) / (tb - ta || 1));
    }
    return 0.48;
  }
  // The four faces (21.37 s): across the frame (0-1) and down it, left to right; the third is Giselle.
  const WL_FACES = [[0.08, 0.33], [0.3, 0.3], [0.63, 0.33], [0.9, 0.34]];
  const WL_SHEET = 16; // frames on the contact sheet
  const WL_TRAILS = 33.55;
  const whiplashScene = {
    src: "whiplash/scene.mp4",
    className: "wl-scene",
    cues: [[0, "title"], [0.7, "darkroom"], [7.7, "rig"], [14.17, "crack"], [15.07, "white"], [WL_DROP, "drop"], [18.23, "giselle"], [21.37, "faces"], [22.93, "rig"],
      [23.73, "sheet"], [WL_TRAILS, "trails"], [37.36, "drop"], [38.07, "burst"], [44.2, "darkroom"], [45.4, "burst"], [47.8, "end"]],
    mount(box, video) {
      box.innerHTML = `
        <i class="wls-dim"></i>
        <div class="wls-screen"></div>
        <canvas class="wls-strobe" aria-hidden="true"></canvas>
        <canvas class="wls-trail" aria-hidden="true"></canvas>
        <div class="wls-print"><canvas></canvas></div>
        <div class="wls-monitor"><canvas></canvas><small>CAM B · RIG</small></div>
        <i class="wls-cross"></i>
        <i class="wls-zebra"></i>
        <svg class="wls-cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${drCracks()}</svg>
        <div class="wls-sheet">${Array.from({ length: WL_SHEET }, (_, n) => {
          // Laid out round the frame: by turns left and right, two columns a side, four rows; on a phone
          // four across under the frame.
          const side = n % 2;
          const at = n >> 1;
          return `<figure style="--side: ${side}; --col: ${at % 2}; --row: ${at >> 1}; --pc: ${n % 4}; --pr: ${n >> 2}"><canvas></canvas><figcaption><span>${String(24 + n).padStart(2, "0")}</span><span>${n % 3 ? "A" : ""}</span></figcaption></figure>`;
        }).join("")}</div>
        <div class="wls-cover">
          <div class="wls-cover-photo"><canvas></canvas></div>
          <p class="wls-mast" aria-hidden="true">GISELLE</p>
          <p class="wls-lines is-left" aria-hidden="true"><b>The Whiplash issue</b><span>지젤 · Main rapper</span><span>Shot on set, take 05</span></p>
          <p class="wls-lines is-right" aria-hidden="true"><b>aespa</b><span>5th mini</span><span>Vol. 05</span></p>
          <i class="wls-barcode"></i>
        </div>
        <div class="wls-strip"></div>
        <div class="wls-polaroid"><canvas></canvas><p>aespa · Whiplash</p></div>
        <div class="wls-blades">${Array.from({ length: 6 }, (_, n) => `<i style="--k: ${n}"></i>`).join("")}</div>
        <i class="wls-flash"></i>
        <div class="wls-focus"><b>AF · LOCK</b></div>
        <p class="wls-ev" aria-hidden="true">Overexposed +2.0 EV</p>
        <div class="wls-hud"><i class="wls-corner"></i><i class="wls-corner"></i><i class="wls-corner"></i><i class="wls-corner"></i>
          <span class="wls-rec">REC</span><span class="wls-tc">00:00:00:00</span><span class="wls-shot">STANDBY</span></div>`;
      box.querySelector(".wls-screen").append(video);
      const tc = box.querySelector(".wls-tc");
      const shot = box.querySelector(".wls-shot");
      const focus = box.querySelector(".wls-focus");
      const focusLabel = focus.querySelector("b");
      const strobe = box.querySelector(".wls-strobe");
      const trail = box.querySelector(".wls-trail");
      const print = box.querySelector(".wls-print canvas");
      const monitor = box.querySelector(".wls-monitor canvas");
      const cover = box.querySelector(".wls-cover-photo canvas");
      const strip = box.querySelector(".wls-strip");
      const polaroid = box.querySelector(".wls-polaroid canvas");
      const sheet = [...box.querySelectorAll(".wls-sheet figure")];
      // The plates: each plays the MV at the end (and Giselle's, her moment).
      const lineup = document.getElementById("ae-lineup");
      lineup.scrollIntoView({ block: "center" });
      const plates = [...lineup.querySelectorAll(".ae-member")].map((plate) => { const canvas = mirror("wls-plate"); plate.querySelector(".ae-photo")?.after(canvas); return canvas; });
      const gisellePlate = plates.find((canvas) => canvas.closest(".ae-member")?.dataset.member === "giselle");
      const restart = (el, name) => { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); };
      // Where a point of the MV (x, y as fractions) is on the screen (it is shown as cover).
      const onScreenAt = (x, y) => {
        const scale = Math.max(window.innerWidth / (video.videoWidth || 1280), window.innerHeight / (video.videoHeight || 720));
        const w = (video.videoWidth || 1280) * scale;
        const h = (video.videoHeight || 720) * scale;
        return [(window.innerWidth - w) / 2 + x * w, (window.innerHeight - h) / 2 + y * h, w];
      };
      // A frame of a canvas, copied small (for the contact strip and the sheet).
      const thumb = (target, source) => {
        if (!source.width) return;
        target.width = 240;
        target.height = Math.round((240 * source.height) / source.width);
        target.getContext("2d").drawImage(source, 0, 0, target.width, target.height);
      };
      let lastBeat = null;
      let lastBar = null;
      let lastEighth = null;
      let nextHit = 0;
      let sheetFilled = 0;
      let trailing = false;
      let pose = 0;
      return {
        show(cue, now) {
          box.style.setProperty("--bar-lag", `${(-(((now - WL_DROP) % WL_BAR) + WL_BAR) % WL_BAR).toFixed(3)}s`);
          box.style.setProperty("--beat-lag", `${(-(((now - WL_DROP) % WL_BEAT) + WL_BEAT) % WL_BEAT).toFixed(3)}s`);
          if (cue === "drop") shot.textContent = now < 30 ? "SHOT 01" : "SHOT 02";
          if (cue === "giselle") { strip.innerHTML = ""; nextHit = WL_GISELLE_HITS.findIndex((t) => t > now); if (nextHit < 0) nextHit = WL_GISELLE_HITS.length; }
          if (cue === "sheet") { sheetFilled = 0; sheet.forEach((figure) => figure.classList.remove("is-in", "is-circled")); }
          if (cue === "trails") trailing = false;
          if (cue === "end") plates.forEach((canvas) => canvas.classList.add("is-framed"));
          if (cue !== "end") plates.forEach((canvas) => canvas.classList.remove("is-framed"));
        },
        tick(now) {
          const frames = Math.floor(now * 30);
          tc.textContent = `00:00:${String(Math.floor(frames / 30)).padStart(2, "0")}:${String(frames % 30).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          const labels = { title: "STANDBY", darkroom: "DARKROOM", rig: "RIG · CAM B", crack: "LENS", white: "+2.0 EV", giselle: "COVER · GISELLE", faces: "AF · TRACKING", sheet: "CONTACT SHEET", trails: "LONG EXPOSURE", burst: "BURST", end: "PRINT" };
          if (labels[cue] && cue !== "drop" && shot.textContent !== labels[cue]) shot.textContent = labels[cue];
          const beat = Math.floor((now - WL_DROP) / WL_BEAT);
          const bar = Math.floor((now - WL_DROP) / WL_BAR);
          // On the bar: a fresh print in the darkroom; in the burst, strobe and whip by turns.
          if (bar !== lastBar) {
            lastBar = bar;
            if (cue === "darkroom") restart(box, "is-develop");
            box.dataset.burst = bar % 2 ? "whip" : "strobe";
            if (cue === "burst" && bar % 2) restart(box, "is-whip");
          }
          // On the beat: the autofocus to the next face; a frame onto the contact sheet.
          if (beat !== lastBeat) {
            lastBeat = beat;
            if (cue === "faces" && video.videoWidth) {
              const i = ((beat % 4) + 4) % 4;
              const [x, y] = WL_FACES[i];
              const [sx, sy, w] = onScreenAt(x, y);
              const size = w * 0.16;
              focus.style.cssText = `left: ${(sx - size / 2).toFixed(0)}px; top: ${(sy - size / 2).toFixed(0)}px; width: ${size.toFixed(0)}px; height: ${size.toFixed(0)}px`;
              focusLabel.textContent = i === 2 ? "AF · GISELLE" : `AF · 0${i + 1}`;
              restart(focus, "is-locked");
            }
            if (cue === "sheet" && sheetFilled < sheet.length && video.videoWidth) {
              const figure = sheet[sheetFilled];
              const canvas = figure.querySelector("canvas");
              canvas.width = 240;
              canvas.height = 135;
              canvas.getContext("2d").drawImage(video, 0, 0, 240, 135);
              figure.classList.add("is-in");
              if (sheetFilled % 5 === 2) figure.classList.add("is-circled");
              sheetFilled++;
              restart(box, "is-shutter");
            }
          }
          // The burst's strobe: the frame steps on the eighths, a flash on each.
          const eighth = Math.floor((now - WL_DROP) / (WL_BEAT / 2));
          if (cue === "burst" && box.dataset.burst === "strobe" && eighth !== lastEighth && video.videoWidth) {
            lastEighth = eighth;
            drawCover(strobe, video, video.videoWidth, video.videoHeight);
            restart(box, "is-strobe");
          }
          // Giselle: her cover photo and her plate play her; the shutter on her hits, each frame into
          // the strip beside the cover.
          if (cue === "giselle") {
            const x = wlGiselleAt(now);
            drawCrop(cover, video, x, 0, 0.42, 1);
            if (gisellePlate) drawCrop(gisellePlate, video, x, 0, 0.34, 0.95);
            while (nextHit < WL_GISELLE_HITS.length && WL_GISELLE_HITS[nextHit] <= now) {
              if (now - WL_GISELLE_HITS[nextHit] < 0.25) {
                restart(box, "is-shutter");
                const frame = document.createElement("canvas");
                thumb(frame, cover);
                frame.style.setProperty("--n", String(strip.children.length));
                strip.append(frame);
              }
              nextHit++;
            }
          }
          // The darkroom print, the rig's monitor, the long exposure.
          if (cue === "darkroom") drawCrop(print, video, 0.5, 0, 1, 1);
          if (cue === "rig") drawCrop(monitor, video, 0.5, 0, 1, 1);
          if (cue === "trails" && mirrorsDue && video.videoWidth) {
            const ratio = mirrorRatio();
            const w = Math.round(window.innerWidth * ratio * 0.6);
            const h = Math.round(window.innerHeight * ratio * 0.6);
            const ctx = trail.getContext("2d");
            if (trail.width !== w || trail.height !== h || !trailing) { trail.width = w; trail.height = h; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); trailing = true; }
            const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 0.06;
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = "lighten";
            ctx.globalAlpha = 0.5;
            ctx.drawImage(video, (w - video.videoWidth * scale) / 2, (h - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = "source-over";
          }
          // The end: each plate frames its own member; the print of the lineup develops in the middle.
          if (cue === "end") {
            plates.forEach((canvas) => drawCrop(canvas, video, WL_POSE[canvas.closest(".ae-member")?.dataset.member] ?? 0.5, 0.13, 0.225, 0.8));
            if (now < 49.3 || pose === 0) { drawCrop(polaroid, video, 0.5, 0, 1, 1); pose = 1; }
          }
        },
        unmount() {
          plates.forEach((canvas) => canvas.remove());
        },
      };
    },
  };

  // Dirty Work (98 BPM). The page stays; the MV plays over it, through a window. Its bridge (the MV
  // from its start, the same 16 bars as track 2), measured shot by shot:
  //   open / take (0-18.6 s)   the long take, shot like an old hip-hop video: the dance in a wide band
  //                            across the page through a fisheye lens (dwLens), the lens pumping on the
  //                            kick (harder on the bar), the dust of the stage floor kicked up with it;
  //                            on the song's three silent beats the DJ scratches the picture (it is
  //                            pulled back over its last half second and pushed, twice, then lets go);
  //                            in the build (14.72 s) the lens swells and red lasers sweep the band
  //   desert / bite (18.6 s)   the warm desert shot warms the page; gold grillz bite shut over the
  //                            black (19.27 s) and open on the first close-up (19.77 s): "Sharp teeth,
  //                            bite first"; they bite again over the cuts into the glossy lips (31.7
  //                            and 35.27 s)
  //   the close-ups            the window, big, iced out: a diamond-set gold rim glinting with the
  //                            melody, a focus pull on each cut; the wet shots only (rain, Ningning, the
  //                            splash, lying in the water, the hair whip, the strobe, the rain) run the
  //                            extracted water (dirty-work/water.mp4, a hard-light map) down the window
  //                            and the whole screen
  //   ningning (24.33 s)       her nameplate chain: her shot is the gold pendant, swinging down on two
  //                            gold chains, her name in diamond-set blackletter under it, the rest
  //                            dark, the stones flashing on the beat; the splash (26.73 s) drops the
  //                            chain and bursts the window to the whole screen
  //   tear (30.63 s)           the gold-tear eye: gold tears run down the page from the window
  //   whip (34.2 s)            the red hair whip swings the window, red strands lashing across
  //   strobe (36.83 s)         the water strobe flickers the screen       dark (39 s)  the window closes
  // Its chorus (from the drop, 39.21 s) is a dance battle: the black crew (black and red, on the
  // dirt, white light sabers crossing over them) against the white crew (reflective white jackets,
  // in the smoke), the MV cutting between them (DW_CREWS). The stage is a canvas over the whole
  // screen, cut to a shape for each crew:
  //   drop (39.21 s)       two light sabers cross white-hot in an X and slash the page open: the MV
  //                        in a diagonal band, its edges lit like the sabers
  //   black                the slash; light rods sweep across on the beats, the dirt kicks up
  //   white                the page turns to its negative, like the reflective jackets; the MV in a
  //                        big white frame, camera flashes popping round it on the eighths
  //   faces (54.2 s)       the white crew's close-ups in the iced-out window
  //   battle (58.53 s)     the call and response: the screen split by a saber, the black crew's side
  //                        and the white crew's; the side on screen dances, the other holds its last
  //                        move in the dark; each switch flashes, "vs" thuds, the page jolts
  //   echo (68.33 s)       the black crew's squats with their last moves trailing them in red
  //                        afterimages, the page swaying with their hips on every beat
  //   cypher (71.3 s)      the circle in the dark: the MV through a spotlight swinging with the beat,
  //                        the page gone to silhouettes like the crowd watching
  //   strobe2 (75.53 s)    the jackets strobe        lineup (78.93 s)  the four of them across the
  //                        page's four plates, as one wall
  //   title (79.93 s)      the MV's own DIRTY WORK and aespa cards in gold set with stones, on the page
  const DW_BEAT = 60 / 98;
  const DW_DROP = 39.21; // bar 1 of the chorus (the grid of the rest of the MV)
  // The song's bass and its melody (treble), 0-63 a character, 20 a second from the start of the MV.
  const DW_ENV = { low: "uKRIDzylciXMFnmi847uzDCBErpswk9EUZEHDmwBywBxojinouXSw60553lXVCd86a79SZF92033343365b88becbcdafxwDzzAPMylkkd6o-YKxu200cyzzAywxtsqngLYLxrjkzCGHIwyqpolsTRl85344oX_ra6456cSYD800174434555300144423fAzByzAJNzmol85lMYsf81013swwuspqplhieKVPhehhlgb77eouwxzzUSq31320pWZn61000dVYB722343333551232664222dnomhhuROtlqptwzMWBsuxxyAfeddddnCDEEDSUGkcbczAAABuDAAEEzpmnqtjvDszJGnnmipiotwnqrnggrmnhtuxyztsvxutormnnqqROlikhknsrqrb9aghqV-KfbbqvcbjoRYWQLJfbbflpuxqrniz--nmqsxzK--Q8bbdgq_-QqnknlfrDHzACABClfabnjoqpnnhFW_xxtywvtrmusutwuytvxuyytqwyBB_WSvsrsuxBywtqnptwMV-ErywzwJ--PssvyAzTQItwysqtxByrswtxzrppstvvvtronBZUnjlpqpF--uffdjnpyrvpvrsojzGJSXREEFcchjqrvtorvuF-_qoqspnK--Dieefnw--MtqniijAFLBDBCFIfhkjoknprrrrJ-YGzryxaLTRwrvymtiywkjrhplkrnpT-JgynqtsCtjuuCqzApedb7fddaggda9ffafdd789jjfa76geb7ec88da97beb8baa8xNInqpqomEORkuyvuqpuFNUUZMBpoknFWEjfgdgihfhopmqmrINJCBFzDrF--xuyACDDLGxHzBndppjloooroqnomoomnvttrsJVOqrllioAJJvCCyxvnyGENFGIrosrlDKzhjefgeikdoppolnBLQTIKQDBJ--OTNMUVLIMttwDifrnihnpomihfiheiihnqqrrDPCmppqnmOOKszzzwwuzHJR_WJDusqqIVEgbdefgbfgmqnqooDNFEHIEztw--GQPNLSRSKvvzxmjpomlqpoqqmionqpnqrpuvuO-PqursooLSIzAEECvwuTWRUUGFppqqKNBjfecdhdihqnonponjkmkholhmmhoekrqmmjebijfaafjfdaeeahdieacbfbc8aaaANFssqnooKKHtuAAzvsDQRUURFqwrpqMUAiddbbceddkkhiikESOIKIBFEQ--suwDAFJQVpBJBkkookktqofabacfcdemqoomnU-SwvpqpoKNKxAFJBBuDOXQSVKyqnnsELziffcdechgnpmnkhLXPQRTKFCT--GTXV_ZROSnuwxjhnlkisnoqnkhllmnmhlmnmlIOBpklkihSMEpwzDxCxEW_Z-TKzqtotJYygbdba9dadookpmmGUHPPMFEAS--wHLQQWRTSnDEypipolkspoebb9ggdfgnppnnrT-IwuqqnnKRDuBDJDFxzNNUNNJDnqovBQuijeeheeihlnplkiwqvpxuwwtwyxtuuAyBuqqosrpqggihdhjrnihnhilljeigkejotyyBBzzwutwxxAAxyvwzwyzAwg10000000000000000000000100121010000100012312132314122010010100001000000000000000000000000000000000000000000", high: "vxtpAQytKSFtAVpnqwJKAFEptMNquvqxrruiaTHttaqGncIwpnstneEBvrrjlvWvte8uvkdte0gjwxHOAsrule--JErnqogjhiCBqusppkcsidDVn65GvoimkdckrsrunwktPrq-Xwc9Frihtgeowlj7tDwGzp6yQvtgmFFxvu21pvxxyxAxvnGA-LBDHGKJFCzCQBBlxAvcAVLfD-zsyyKQTFslrMEECAADqdBnbZJHGHCuyMBtoDttCqAD83MBwO-MCKLOMMqononwAvstvurqm6ZEyzBEBTNFwyBFJPUrHSGqEgBUIAGGxttvovvnCsqqqtxxrLP-ColkojyBwrbxZKLDHKLqJKlnHQUSCAMWZXTIKKIHHMSLEFqmxMSQWJFxqOQORNRPQ-_KCzFBKWyzwpororslfrqqplfqnmnjg-wigfcjnlhe8pmj8Gsoe5l97GYGAByBsoidacmmdbLxrc8999YTGHGAwsold9rqwkbvICjjAtCMDxrhqurqoqmxutrliBuqrhjGBrlkhqsspndrmgbqmmniob9AOJDyvurnhhmhqramslFElom8HFGFGEGyuyAyvrplhFumhonkOPwxtnlnutqnfmrqsllrpopnf-yqomejqoifdpklatrsl8k97ZQrstpvlgkiefprkdCtkbadbb-wpoqppjheflwnd64AGt8njiBBvpkgisurlhgotqkgkqpkidgIohdebjjgedavGCBIvlabcbkGFBysqpsCCAvtumezNSQKpywFXP_TSHP_S----DBDDJDuqrgc-XxurpsokokcaevHGFEvlgytu-zBECyByMuphpkwuqimiCvjaQMuphgqmFJpwonOmrSDDBvosv-vrswtsnpnzAoijkhdkgqtkaMEohffspxxlqomztkyHADwxtD-yswBGDDyxAIIrojg9jdprf9PDkhb9qktIsvnGFcEsrBwtrsE-EBzBCIECFGuDvvwrmmblpd7YLAxxruxTHk9sBwqsrtnghI-S-CyzzuxrqnkkzutpndmmvxhaPAqqmgqnEMvyurJVzsDyyxsrC_qlptruoojjhrmgfc9rFCta8WHndegtGNpqmrWEbwpArpnmoC-uooppzDDxwuIIIzAjjBCwjltAxnhjoy-MIxzSLkpAEBxsllqzDHIMQSRPPOKGCwurpHywuoh-IvrrmrvromlgtsklixtrtvtM-IxstBNJEIJqzpieeengikbe-MDyxrvrfahjpxunljwslmihL-BuuvwEyspfeojjfcewotqec-HtljtzqDnzspAxwRJKFAAGBS-GEAABvvDvogomlgb9nqvob9_CofdgqwEeBxqHxcRMRGHDBCW_DFHHIHAAzAyxyyxurymlsjm-EupqvAlifcbfnrkmjFoiiljRXAtqqyDGDAyyAqshgfpiknbf_CtpmiujimfcqAvomlConmkE--CxzwwwponJFonplgiuntvkc-GrljizsJAwuuoInbKKDAzyuW-BwADFzxolwDyAEEAmhjwuqlvDztletxJSJytMEcOCHIEAtrwxDIIMLDEDyCDxqga8448a83233332264223331000000000000000000000000000000000000000001000011000001000000000000000000000000000000000000000000000000000000" };
  const DW_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";
  const dwLevel = (band, now) => { const text = DW_ENV[band]; const i = Math.max(0, Math.min(text.length - 1, Math.floor(now * 20))); return DW_CHARS.indexOf(text[i]) / 63; };
  // The chorus's shots by crew (measured): black, white, or close (the white crew's close-ups).
  const DW_CREWS = [[DW_DROP, "black"], [48.43, "white"], [54.2, "close"], [58.53, "black"], [59.93, "white"], [60.5, "black"], [61.13, "white"],
    [62.13, "black"], [63.5, "white"], [68.33, "black"], [71.3, "white"], [73.3, "black"], [74.6, "white"], [75.53, "black"], [78.37, "white"], [78.93, "black"]];
  // The MV's bars: its bar 1 is DW_GRID0 into the video (the bridge, as track 2 of the loop).
  const DW_GRID0 = DW_DROP - 64 * DW_BEAT;
  // The bridge's silent beats (beat 3 of bars 2, 4 and 6: the song drops out; the scratches) and
  // its build.
  const DW_SILENT = [1, 3, 5].map((bar) => DW_GRID0 + (bar * 4 + 2) * DW_BEAT);
  const DW_BUILD = DW_GRID0 + 24 * DW_BEAT;
  // The grillz shut over these (from, to): the black before the first close-up, then the cuts into
  // the glossy lips.
  const DW_BITES = [[19.27, 19.77], [31.58, 31.78], [35.15, 35.37]];
  // The wet shots of the bridge (the water runs down the window and the page in these only).
  const DW_WET_CUES = new Set(["rainbg", "ningning", "splash", "lying", "whip", "strobe", "rain"]);
  // The scratch: the frames of the last half second, kept small.
  const DW_RING = 18;
  // A row of grillz (gold teeth on the gum line), as a mask: the top row; the bottom one is the same
  // turned over, half a tooth along so they lock.
  const dwTeeth = (offset) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" preserveAspectRatio="none"><rect width="800" height="70"/>${Array.from({ length: 9 }, (_, i) => {
    const x = i * 100 - 50 + offset;
    const fang = i === 2 || i === 6;
    return `<path d="M${x + 6} 50 H${x + 94} V${fang ? 150 : 128} Q${x + 50} ${fang ? 200 : 168} ${x + 6} ${fang ? 150 : 128} Z"/>`;
  }).join("")}</svg>`);
  // The lens of the long take: the MV through a fisheye, the way the old hip-hop videos were shot
  // (WebGL: the middle swollen, the edges bent away into a dark rim, the colours parting at the
  // edge). draw() takes the video or a canvas; null where WebGL is missing (the plain mirror then).
  function dwLens(canvas) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return null;
    const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); return s; };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, "attribute vec2 a; varying vec2 v; void main() { v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }"));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 v; uniform sampler2D t; uniform vec2 fit; uniform float aspect; uniform float bulge; uniform float split;
      vec3 tap(vec2 p) { vec2 q = p * fit; if (abs(q.x) > 1.0 || abs(q.y) > 1.0) return vec3(0.0); return texture2D(t, q * 0.5 + 0.5).rgb; }
      void main() {
        vec2 p = v * 2.0 - 1.0;
        float r = length(vec2(p.x * aspect, p.y)) / length(vec2(aspect, 1.0));
        vec2 s = p * (1.0 + bulge * (r * r - 0.45));
        vec3 c = vec3(tap(s * (1.0 + split)).r, tap(s).g, tap(s * (1.0 - split)).b);
        gl_FragColor = vec4(c * smoothstep(1.1, 0.45, r * (1.0 + bulge * 0.35)), 1.0);
      }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const u = Object.fromEntries(["fit", "aspect", "bulge", "split"].map((name) => [name, gl.getUniformLocation(program, name)]));
    return {
      // source: the video or a canvas, width × height its size; bulge 0-1; split: how far the
      // colours part at the edge.
      draw(source, width, height, bulge, split) {
        const box = canvas.getBoundingClientRect();
        if (!box.width || !box.height || !width || !height) return;
        const ratio = mirrorRatio();
        const w = Math.round(box.width * ratio);
        const h = Math.round(box.height * ratio);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        const aspect = box.width / box.height;
        const media = width / height;
        // As cover: the part of the frame that shows.
        gl.uniform2f(u.fit, aspect > media ? 1 : aspect / media, aspect > media ? media / aspect : 1);
        gl.uniform1f(u.aspect, aspect);
        gl.uniform1f(u.bulge, bulge);
        gl.uniform1f(u.split, split);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      lose() { gl.getExtension("WEBGL_lose_context")?.loseContext(); },
    };
  }
  const dirtyWorkScene = {
    src: "dirty-work/scene.mp4",
    className: "dw-scene",
    // The bridge, shot by shot (measured on the MV), then the chorus by its crews (DW_CREWS).
    cues: [[0, "open"], [0.63, "take"], [18.6, "desert"], [19.27, "bite"], [19.77, "close"], [21.33, "rainbg"], [22.03, "close"],
      [24.33, "ningning"], [26.73, "splash"], [27.87, "close"], [29.23, "lying"], [30.63, "tear"], [31.7, "close"], [34.2, "whip"], [35.27, "close"],
      [36.83, "strobe"], [37.6, "rain"], [39.0, "dark"],
      [DW_DROP, "drop"], [39.9, "black"], [48.43, "white"], [54.2, "faces"], [58.53, "battle"], [63.5, "white"], [68.33, "echo"], [71.3, "cypher"],
      [73.3, "black"], [74.6, "white"], [75.53, "strobe2"], [76.3, "black"], [78.37, "white"], [78.93, "lineup"], [79.93, "title"], [82.3, "title2"]],
    mount(box, video) {
      const water = (name) => `<video class="${name}" muted playsinline loop preload="auto" src="dirty-work/water.mp4" aria-hidden="true"></video>`;
      box.innerHTML = `
        <div class="dws-screen"></div>
        <div class="dws-tears">${"<i></i>".repeat(6)}</div>
        <div class="dws-necklace"><i class="dws-chain is-l"></i><i class="dws-chain is-r"></i><p class="dws-name" aria-hidden="true">Ningning <span>닝닝</span></p></div>
        <div class="dws-pane"><canvas class="dws-pane-mv" aria-hidden="true"></canvas><canvas class="dws-lens" aria-hidden="true"></canvas>${water("dws-water")}<i class="dws-pane-rim"></i></div>
        <canvas class="dws-stage" aria-hidden="true"></canvas>
        <canvas class="dws-side is-black" aria-hidden="true"></canvas>
        <canvas class="dws-side is-white" aria-hidden="true"></canvas>
        <i class="dws-frame"></i>
        <svg class="dws-cuts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line class="is-top" x1="0" y1="40" x2="100" y2="22" pathLength="100"/><line class="is-bottom" x1="0" y1="82" x2="100" y2="64" pathLength="100"/><line class="is-vs" x1="54" y1="5" x2="47" y2="95" pathLength="100"/></svg>
        <div class="dws-x"><i></i><i></i></div>
        <b class="dws-vs" aria-hidden="true">vs</b>
        <i class="dws-spot"></i>
        <div class="dws-lasers"><i></i><i></i><i></i></div>
        <div class="dws-rods"><i></i><i></i><i></i></div>
        <div class="dws-pops">${"<i></i>".repeat(8)}</div>
        <div class="dws-dust">${Array.from({ length: 28 }, (_, n) => `<i style="--x: ${(n * 37) % 100}; --s: ${(0.5 + ((n * 13) % 10) / 10).toFixed(1)}; --d: ${(n * 7) % 10}"></i>`).join("")}</div>
        <div class="dws-whip"><i></i><i></i><i></i><i></i></div>
        <div class="dws-sparks">${"<i>✦</i>".repeat(12)}</div>
        <i class="dws-jaw is-top" style='-webkit-mask-image: ${dwTeeth(0)}; mask-image: ${dwTeeth(0)}'></i>
        <i class="dws-jaw is-bottom" style='-webkit-mask-image: ${dwTeeth(50)}; mask-image: ${dwTeeth(50)}'></i>
        <i class="dws-flash"></i>
        <p class="dws-tag"><b>⚠ Dirty Work</b> <span class="dws-time">00:00</span></p>`;
      box.querySelector(".dws-screen").append(video);
      const time = box.querySelector(".dws-time");
      const pane = box.querySelector(".dws-pane-mv");
      const stage = box.querySelector(".dws-stage");
      const sides = { black: box.querySelector(".dws-side.is-black"), white: box.querySelector(".dws-side.is-white") };
      // The fisheye of the long take (the plain mirror where WebGL is missing).
      const lens = dwLens(box.querySelector(".dws-lens"));
      box.classList.toggle("has-lens", Boolean(lens));
      // The last frames, kept small: for the scratch (about half a second, every other frame) and
      // the afterimages of the echo.
      const ring = Array.from({ length: DW_RING }, () => document.createElement("canvas"));
      let head = -1;
      let kept = 0;
      let keepTurn = false;
      const keep = () => {
        head = (head + 1) % DW_RING;
        const canvas = ring[head];
        if (canvas.width !== 480) { canvas.width = 480; canvas.height = Math.round(480 * video.videoHeight / video.videoWidth); }
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        kept = Math.min(DW_RING, kept + 1);
      };
      // The echo: the MV over the whole stage with its last moves trailing it in red (the kept
      // frames 3, 6 and 9 back, lightened over it, so only what moved shows).
      const echo = () => {
        if (!mirrorsDue || !video.videoWidth) return;
        drawMirror(stage, video, viewportWall());
        keepTurn = !keepTurn;
        if (keepTurn || SCENE_LITE) keep();
        if (kept < 10 || !stage.width) return;
        const ctx = stage.getContext("2d");
        const frame = ring[head];
        const scale = Math.max(stage.width / frame.width, stage.height / frame.height);
        const w = frame.width * scale;
        const h = frame.height * scale;
        ctx.save();
        ctx.globalCompositeOperation = "lighten";
        ctx.filter = "sepia(1) saturate(6) hue-rotate(-38deg) brightness(1.15)";
        [[9, 0.28], [6, 0.42], [3, 0.6]].forEach(([back, alpha]) => {
          ctx.globalAlpha = alpha;
          ctx.drawImage(ring[(head - back + DW_RING) % DW_RING], (stage.width - w) / 2, (stage.height - h) / 2, w, h);
        });
        ctx.restore();
      };
      // The water over the whole screen is on the page itself (outside the scene), so its hard light
      // blends with the page.
      box.insertAdjacentHTML("beforeend", water("dws-wetpage"));
      const wetpage = box.lastElementChild;
      document.body.append(wetpage);
      const waters = [box.querySelector(".dws-water"), wetpage];
      const dust = box.querySelector(".dws-dust");
      // The page from the top (the window plays over the heading).
      window.scrollTo({ top: 0, behavior: "instant" });
      const hero = document.querySelector(".hero");
      const lineup = document.getElementById("ae-lineup");
      const plates = [...lineup.querySelectorAll(".ae-member")].map((plate) => { const canvas = mirror("dws-plate"); plate.querySelector(".ae-photo")?.after(canvas); return canvas; });
      // The title cards in gold: the MV multiplied over polished gold set with stones (white letters
      // turn gold, the black stays black), screened onto the page (outside the scene, so the black
      // drops out over the page).
      const gold = document.createElement("div");
      gold.className = "dws-gold";
      gold.setAttribute("aria-hidden", "true");
      gold.innerHTML = `<i class="dws-gold-metal">${"<b></b>".repeat(10)}</i>`;
      const goldMv = mirror("dws-gold-mv");
      gold.append(goldMv);
      document.body.append(gold);
      const restart = (el, name) => { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); };
      let crew = "";
      let lastLevels = "";
      let lastBeat = -1;
      let scratching = -1; // the silent beat being scratched (-1: none)
      let bitten = false;
      let wet = false;
      let hipSide = 1;
      let sideTurn = 0;
      return {
        show(cue) {
          box.style.setProperty("--beat-lag", `${(-((((video.currentTime - DW_DROP) % DW_BEAT) + DW_BEAT) % DW_BEAT)).toFixed(3)}s`);
          // The water runs only on the wet shots (and only plays then).
          wet = DW_WET_CUES.has(cue);
          box.classList.toggle("is-wet", wet);
          root.classList.toggle("is-dw-wet", wet);
          waters.forEach((el) => { if (wet) { if (el.paused) el.play().catch(() => undefined); } else el.pause(); });
          // The echo starts its trails afresh.
          if (cue === "echo") kept = 0;
          if (cue !== "echo") root.classList.remove("is-dw-hip-l", "is-dw-hip-r");
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
          // The long take: the silent beats are scratched; the dust kicks up on the beats (harder
          // on the bar), more in the build.
          const silent = cue === "take" ? DW_SILENT.findIndex((at) => now >= at && now < at + DW_BEAT) : -1;
          if (silent !== scratching) {
            scratching = silent;
            box.classList.toggle("is-scratch", silent >= 0);
          }
          box.classList.toggle("is-build", cue === "take" && now >= DW_BUILD);
          // The grillz, shut over the black and the cuts into the lips.
          const bite = DW_BITES.some(([from, to]) => now >= from && now < to);
          if (bite !== bitten) { bitten = bite; box.classList.toggle("is-bitten", bite); }
          // The chorus's crew on screen now (the battle's sides follow it; each switch is a cut).
          let shot = "";
          for (const [at, name] of DW_CREWS) if (now >= at) shot = name;
          if (shot !== crew) {
            crew = shot;
            box.dataset.crew = shot;
            if (cue === "battle") { restart(box, "is-cut"); restart(root, "is-dw-jolt"); }
          }
          const into = (now - DW_GRID0) / DW_BEAT;
          const beat = Math.floor(into);
          if (beat !== lastBeat) {
            lastBeat = beat;
            const dirt = ["drop", "black", "strobe2"].includes(cue);
            if ((cue === "take" && silent < 0) || (dirt && beat % 2 === 0)) {
              dust.classList.toggle("is-big", beat % 4 === 0 || now >= DW_BUILD);
              restart(dust, "is-kick");
            }
            if (cue === "ningning") restart(box, "is-ning-hit");
            // The battle hits on the bar; the echo sways with their hips on every beat.
            if (cue === "battle" && beat % 4 === 0) restart(root, "is-dw-jolt");
            if (cue === "echo") { hipSide = -hipSide; root.classList.remove("is-dw-hip-l", "is-dw-hip-r"); void root.offsetWidth; root.classList.add(hipSide < 0 ? "is-dw-hip-l" : "is-dw-hip-r"); }
          }
          // The cypher's spotlight swings with the beat.
          if (cue === "cypher") box.style.setProperty("--spot-x", `${(50 + Math.sin(into * Math.PI / 2) * 9).toFixed(2)}%`);
          // The window: the long take through the lens (scratched on the silent beats), Ningning
          // cropped into her pendant, the rest as it is.
          const bridge = now < DW_DROP;
          const lensed = lens && ["open", "take", "desert"].includes(cue);
          if (lensed && mirrorsDue && video.videoWidth) {
            const phase = into - beat;
            const kick = cue === "desert" ? 0 : Math.exp(-phase * 6) * (beat % 4 === 0 ? 1 : 0.6);
            const build = now >= DW_BUILD ? Math.min(1, (now - DW_BUILD) / (8 * DW_BEAT)) : 0;
            let source = video;
            let bulge = 0.3 + build * 0.35 + kick * 0.22;
            let split = 0.003 + kick * 0.012 + build * 0.006;
            if (silent >= 0 && kept > 1) {
              // Pulled back over the kept frames and pushed, twice in the beat (0 back: now).
              const s = (now - DW_SILENT[silent]) / DW_BEAT;
              const back = Math.round((kept - 1) * (0.5 - 0.5 * Math.cos(s * Math.PI * 4)));
              source = ring[(head - back + DW_RING) % DW_RING];
              const pull = Math.sin(s * Math.PI * 4);
              box.style.setProperty("--scratch", pull.toFixed(3));
              bulge = 0.5 + Math.abs(pull) * 0.25;
              split = 0.006 + Math.abs(pull) * 0.03;
            } else if (cue === "take") {
              // Every other frame into the scratch's memory.
              keepTurn = !keepTurn;
              if (keepTurn) keep();
            }
            lens.draw(source, source.videoWidth || source.width, source.videoHeight || source.height, bulge, split);
          } else if (bridge) {
            if (cue === "ningning") drawCrop(pane, video, 0.5, 0, 0.62, 1);
            else drawMirror(pane, video);
          }
          // The chorus: the stage (its shape follows the crew, in dirtywork.css), the echo, the
          // battle's two sides, the plates as one wall, the title cards in gold.
          if (bridge) return;
          if (cue === "echo") echo();
          else if (cue === "battle") {
            if (sides[crew]) drawMirror(sides[crew], video, viewportWall());
          } else if (cue === "lineup") {
            const photos = plates.filter((canvas) => canvas.isConnected);
            if (photos.length) {
              const boxes = photos.map((canvas) => canvas.getBoundingClientRect());
              const wall = { left: Math.min(...boxes.map((b) => b.left)), top: Math.min(...boxes.map((b) => b.top)), width: 0, height: 0 };
              wall.width = Math.max(...boxes.map((b) => b.right)) - wall.left;
              wall.height = Math.max(...boxes.map((b) => b.bottom)) - wall.top;
              photos.forEach((canvas) => drawMirror(canvas, video, wall));
            }
          } else if (cue.startsWith("title")) {
            // The whole card, fitted to the screen (on a phone too), on black (black drops out).
            if (mirrorsDue && goldMv.width) { const ctx = goldMv.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, goldMv.width, goldMv.height); }
            const width = Math.min(window.innerWidth, window.innerHeight * 16 / 9);
            drawMirror(goldMv, video, { left: (window.innerWidth - width) / 2, top: (window.innerHeight - width * 9 / 16) / 2, width, height: width * 9 / 16 });
          }
          else {
            drawMirror(stage, video, viewportWall());
            // Each crew's side of the battle keeps its latest frame, ready for it.
            if (mirrorsDue && sides[crew] && ++sideTurn % 4 === 0) drawMirror(sides[crew], video, viewportWall());
          }
        },
        unmount() {
          waters.forEach((el) => { el.pause(); el.removeAttribute("src"); el.load(); });
          lens?.lose();
          [...plates, gold, wetpage].forEach((el) => el.remove());
          root.classList.remove("is-dw-jolt", "is-dw-hip-l", "is-dw-hip-r", "is-dw-wet");
          for (const el of [hero, lineup]) { el.style.removeProperty("--low"); el.style.removeProperty("--high"); }
        },
      };
    },
  };

  // Armageddon (92 BPM; its bars from 1.92 s). Its bridge (to the drop at 35.84 s), shot by shot, in
  // a few motifs that come back with their shots:
  //   halo (0)            the MV in a ring of neon light on the dark page, like the ring she dances in
  //   puddle (1.17)       the reflection in the mud: ripples spreading over the page
  //   frost (close-ups)   the MV in a tall pane of frosted glass, the frost thawing from the middle and
  //                       breathing on the kick
  //   night (the overpass) the MV's light on the page (the light key), the passing lights streaking
  //   wall (the white wall) the page goes pale as the wall and the MV's shadows fall on it (the shadow
  //                       key): the members and the creature's shadow, cast on the page
  //   storm (the waste)   fog banks rolling over the page, the MV in a clearing
  //   vortex (15)         the debris tornado: the page swirls into it, debris spiralling in
  //   sink (21.97)        the sinkhole: the page sinks away into a hole, the MV in it
  //   eye (22.63)         the red eye opens on the page
  //   dark (23.1)         the breakdown: a heartbeat in the dark, INCOMING DANGER
  //   karina (25.27)      Karina's moment (to 29.73 s): her portrait in an ice frame plays her (tracked
  //                       through her five shots), KARINA lands in ice chrome with 카리나, her signature
  //                       writes itself across the page; each stomp sends an ice shockwave out from her
  //                       card; her plate lifts and plays her too
  //   stomp (29.73)       the stomps: the MV in a wide band, the page taking on each shot's world (the
  //                       pale beach, the subway, the pink room, the negative), an ice shockwave and a
  //                       jolt on every stomp
  //   ice (33.3)          ice crystals grow over the page from her frozen face
  //   metal (34.43)       liquid chrome drips down the page; it holds in the silence before the drop
  // Its chorus (one groove, the kick on 1 and the and of 2, in three 4-bar phrases from 35.84, 46.27 and
  // 56.7 s, then the last hit at 67.14 s), the bridge's motifs coming back with their shots and its own:
  //   tide (35.84)        the drop: the line before the giant wave; a crest of foam breaks across the
  //                       page, spray flying, an ice shockwave and the page knocked back
  //   mirror (the beach)  the MV over the top of the page and its reflection rippling on the wet sand
  //                       below, the page showing through it; the ripple quickens on the kick
  //   wall, frost, storm, halo   as in the bridge (the white wall, the close-ups, the sandstorm, the
  //                       purple dancer)
  //   liquid (46.5)       the liquid glass bodies (and the splash): the MV wobbling like water
  //   scan (49.2)         the masks: a face scan, a wireframe mesh over her face, a line sweeping down
  //                       and readouts locking on
  //   orb (52.5)          the fisheye spin: the MV in a glass sphere, turning
  //   four (53.33)        the four faces in a circle: the MV in a wheel turning a quarter, the four
  //                       plates lit one by one on the beat
  //   sun (54.87)         the orange disc: a burning corona round the MV, the ice page thawing warm
  //   holo (the overpass) the MV a hologram panel floating over the page in a cone of light, turning to
  //                       a new angle each bar, flickering on the kick
  //   logo (67.1)         the line raising their arms: the MV through the ice ARMAGEDDON logo; on the
  //                       last hit it freezes white, "Incoming danger." under it
  const AM_BEAT = 60 / 92;
  const AM_BAR1 = 1.922; // a downbeat (the grid of the whole MV)
  // The chorus: from the drop, the kick on 1 and the and of 2; the last hit; the beats the plates light on.
  const AM_DROP = 35.84;
  const AM_LAST = 67.6;
  // The bridge's stomps (bars 10-12: beat 1, its and, and the and of 3), the silence before the drop,
  // and each shot's world through them.
  const AM_STOMPS = [25.4, 28.01, 30.62].flatMap((bar) => [bar, bar + 0.326, bar + 1.63]).concat([29.31]).sort((a, b) => a - b);
  const AM_HOLD = 35.18;
  // Karina's moment: where her face is across the frame (0-1), measured, through the pale close-up,
  // the subway, her subway solo, the beach line, the subway again and the pink room. Her card freezes
  // on her stare into the camera (29.05 s), holding it through the cut to Winter (29.33 s).
  const AM_KARINA = [[25.27, 0.52], [25.6, 0.5], [25.63, 0.46], [26.0, 0.48], [26.27, 0.48], [26.5, 0.52], [26.83, 0.55], [26.84, 0.42], [27.5, 0.4], [27.77, 0.4],
    [27.78, 0.5], [28.25, 0.45], [28.6, 0.45], [28.61, 0.42], [29.0, 0.38], [29.05, 0.39]];
  const AM_KARINA_OFF = 29.05;
  function amKarinaAt(now) {
    for (let i = 0; i < AM_KARINA.length - 1; i++) {
      const [ta, xa] = AM_KARINA[i];
      const [tb, xb] = AM_KARINA[i + 1];
      if (now >= ta && now <= tb) return xa + (xb - xa) * ((now - ta) / (tb - ta || 1));
    }
    return 0.4;
  }
  const AM_WORLDS = [[25.27, "pale"], [25.63, "subway"], [26.83, "pale"], [27.77, "subway"], [28.6, "pink"], [29.73, "pale"], [30.6, "negative"], [30.73, "pale"], [32.23, "subway"], [32.57, "pink"], [33.0, "subway"]];
  // The melt: a sheet of liquid chrome hanging from the top of the screen, its edge sagging in smooth,
  // uneven droops (each a soft bell, wide or narrow, shallow or deep), lit like polished metal.
  function amMelt() {
    let state = 71;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const sags = Array.from({ length: 24 }, () => { const deep = 5 + rand() ** 1.5 * 70; return { at: rand() * 100, wide: 1.2 + deep * 0.07 + rand() * 2.2, deep }; });
    let edge = "";
    for (let x = 0; x <= 100; x += 0.5) {
      let y = 10 + Math.sin(x * 0.21) * 1.6 + Math.sin(x * 0.07 + 1.3) * 2.2;
      // (Where droops overlap the deeper one wins, so each keeps its own shape.)
      y += Math.max(0, ...sags.map(({ at, wide, deep }) => deep * Math.exp(-(((x - at) / wide) ** 2))));
      edge += ` L${x} ${Math.min(97, y).toFixed(2)}`;
    }
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>
      <linearGradient id="am-chrome" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0" stop-color="#5B6A6F"/><stop offset="0.18" stop-color="#EAF8F9"/><stop offset="0.32" stop-color="#8FA3AD"/><stop offset="0.5" stop-color="#FFFFFF"/><stop offset="0.66" stop-color="#6E8085"/><stop offset="0.82" stop-color="#D7E8EA"/><stop offset="1" stop-color="#55666B"/></linearGradient>
      <linearGradient id="am-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"/><stop offset="0.5" stop-color="#000000" stop-opacity="0.18"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient></defs>
      <path class="is-sheet" d="M0 0 L0 10${edge} L100 0 Z" fill="url(#am-chrome)"/><path d="M0 0 L0 10${edge} L100 0 Z" fill="url(#am-shade)"/>
      <path class="is-rim" d="M0 10${edge}" fill="none" stroke="#FFFFFF" stroke-width="0.6" vector-effect="non-scaling-stroke"/></svg>`;
  }
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
  // The face scan: a wireframe mesh (points jittered on a grid, joined into triangles) over a face.
  function amMesh() {
    let state = 89;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const cols = 9;
    const rows = 11;
    const pts = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const u = x / (cols - 1) - 0.5;
      const v = y / (rows - 1);
      // An oval face: narrower at the chin and the crown.
      const narrow = Math.sin(Math.PI * (0.15 + v * 0.75));
      pts.push([50 + u * 70 * narrow + (rand() - 0.5) * 3, 6 + v * 88 + (rand() - 0.5) * 3]);
    }
    let lines = "";
    for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
      const a = pts[y * cols + x];
      const b = pts[y * cols + x + 1];
      const c = pts[(y + 1) * cols + x];
      const d = pts[(y + 1) * cols + x + 1];
      lines += `M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)} L${d[0].toFixed(1)} ${d[1].toFixed(1)} Z M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${c[0].toFixed(1)} ${c[1].toFixed(1)} L${d[0].toFixed(1)} ${d[1].toFixed(1)} `;
    }
    const dots = pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.7"/>`).join("");
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${lines}"/>${dots}</svg>`;
  }
  const armageddonScene = {
    src: "armageddon/scene.mp4",
    className: "am-scene",
    cues: [[0, "halo"], [1.17, "puddle"], [1.73, "frost"], [2.87, "night"], [4.1, "wall"], [5.23, "frost"], [6.43, "night"], [7.1, "frost"], [9.57, "wall"], [12.83, "storm"], [13.9, "frost"],
      [15.0, "vortex"], [15.83, "storm"], [16.97, "wall"], [18.53, "storm"], [20.67, "frost"], [21.97, "sink"], [22.63, "eye"], [23.1, "dark"], [25.0, "white"], [25.27, "karina"], [29.73, "stomp"], [33.3, "ice"], [34.43, "metal"],
      [AM_DROP, "tide"], [38.47, "mirror"], [41.07, "wall"], [42.23, "mirror"], [43.4, "wall"], [44.07, "frost"], [45.27, "storm"], [46.5, "liquid"], [48.7, "frost"],
      [49.2, "scan"], [50.7, "halo"], [51.3, "mirror"], [52.5, "orb"], [53.33, "four"], [54.03, "frost"], [54.37, "liquid"], [54.87, "sun"], [56.63, "holo"],
      [61.8, "mirror"], [62.6, "holo"], [64.6, "mirror"], [66.57, "frost"], [67.1, "logo"]],
    mount(box, video) {
      box.innerHTML = `
        <i class="ams-dim"></i>
        <div class="ams-fog is-back"><i></i><i></i><i></i></div>
        <div class="ams-screen"></div>
        <canvas class="ams-key" aria-hidden="true"></canvas>
        <i class="ams-halo"></i>
        <div class="ams-ripples"><i></i><i></i><i></i><i></i></div>
        <div class="ams-pane"><canvas></canvas><i class="ams-frost"></i></div>
        <div class="ams-streaks">${Array.from({ length: 7 }, (_, n) => `<i style="--y: ${(12 + n * 13) % 100}; --d: ${(n * 0.13).toFixed(2)}"></i>`).join("")}</div>
        <div class="ams-fog"><i></i><i></i><i></i></div>
        <div class="ams-debris">${Array.from({ length: 20 }, (_, n) => `<i style="--a: ${n * 41}deg; --r: ${30 + ((n * 17) % 40)}; --s: ${0.5 + ((n * 7) % 10) / 10}; --d: ${((n * 0.07) % 0.6).toFixed(2)}"></i>`).join("")}</div>
        <svg class="ams-eye" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true"><path d="M2 25 Q50 -12 98 25 Q50 62 2 25 Z"/></svg>
        <i class="ams-pulse"></i>
        <i class="ams-shock"></i>
        <div class="ams-drips">${amMelt()}</div>
        <p class="ams-warn" aria-hidden="true"><span>Incoming</span> <b>danger</b></p>
        <div class="ams-kcard"><canvas></canvas><i class="ams-kframe"></i><small>CAM 01 · <span class="ams-ktime">25:27</span></small></div>
        <div class="ams-kname" aria-hidden="true"><small>Target 01 · Leader</small><b>${[..."KARINA"].map((ch, i) => `<span style="--i: ${i}">${ch}</span>`).join("")}</b><span class="ams-khangul">카리나</span></div>
        <div class="ams-ksign" aria-hidden="true"></div>
        <div class="ams-crest"><i></i>${Array.from({ length: 16 }, (_, n) => `<b style="--y: ${(n * 37) % 100}; --d: ${((n * 0.05) % 0.4).toFixed(2)}; --s: ${(0.6 + ((n * 7) % 10) / 12).toFixed(2)}"></b>`).join("")}</div>
        <canvas class="ams-reflect" aria-hidden="true"></canvas>
        <i class="ams-horizon"></i>
        <svg class="ams-filter" aria-hidden="true"><filter id="am-liquid"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="3"><animate attributeName="baseFrequency" dur="3s" values="0.008 0.02;0.012 0.028;0.008 0.02" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="34"/></filter></svg>
        <div class="ams-face">${amMesh()}<i class="ams-sweep"></i><p><span>Subject</span> <b>aespa</b></p><p class="is-match"><span>Match</span> <b class="ams-match">00%</b></p></div>
        <i class="ams-orb"></i>
        <i class="ams-wheel"></i>
        <i class="ams-corona"></i>
        <i class="ams-cone"></i>
        <div class="ams-logo"><p>Incoming <b>danger.</b></p></div>
        <i class="ams-flash"></i>
        <p class="ams-tag"><i></i> SIGNAL · <span class="ams-time">00:00</span></p>`;
      box.querySelector(".ams-screen").append(video);
      box.style.setProperty("--crystal", crystalMask());
      const time = box.querySelector(".ams-time");
      // The keys (the plain MV where WebGL is missing): light at night, shadow on the white wall.
      const key = drKey(box.querySelector(".ams-key"));
      box.classList.toggle("has-key", Boolean(key));
      const pane = box.querySelector(".ams-pane canvas");
      // Karina's card, its clock, and her signature (inlined, so it can write itself stroke by stroke).
      const kcard = box.querySelector(".ams-kcard canvas");
      const ktime = box.querySelector(".ams-ktime");
      const ksign = box.querySelector(".ams-ksign");
      fetch(siteUrl("armageddon/karina-signature.svg")).then((r) => (r.ok ? r.text() : "")).then((svg) => {
        if (!svg || !ksign.isConnected) return;
        ksign.innerHTML = svg;
        ksign.querySelectorAll("path").forEach((path) => path.setAttribute("pathLength", "1"));
      }).catch(() => undefined);
      const karinaPlate = document.querySelector('#ae-lineup .ae-member[data-member="karina"]');
      const karinaFeed = karinaPlate ? mirror("ams-kplate") : null;
      if (karinaFeed) karinaPlate.querySelector(".ae-photo")?.after(karinaFeed);
      // The chorus's parts: the reflection, the match readout, the four plates.
      const reflect = box.querySelector(".ams-reflect");
      const match = box.querySelector(".ams-match");
      const lineup = document.getElementById("ae-lineup");
      lineup.scrollIntoView({ block: "center" });
      const fourPlates = [...lineup.querySelectorAll(".ae-member")];
      let lastBeat = null;
      let lastKick = null;
      let nextStomp = 0;
      let world = "";
      const restart = (el, name) => { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); };
      const jolt = () => restart(root, "is-am-jolt");
      return {
        show(cue, now) {
          box.style.setProperty("--beat-lag", `${(-((((now - AM_BAR1) % AM_BEAT) + AM_BEAT) % AM_BEAT)).toFixed(3)}s`);
          box.style.setProperty("--bar-lag", `${(-((((now - AM_BAR1) % (AM_BEAT * 4)) + AM_BEAT * 4) % (AM_BEAT * 4))).toFixed(3)}s`);
          if (cue === "tide") jolt();
          if (cue !== "four") fourPlates.forEach((plate) => plate.classList.remove("is-am-lit"));
        },
        tick(now) {
          time.textContent = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          const bar = Math.floor((now - AM_BAR1) / (AM_BEAT * 4));
          // The hologram turns to a new angle each bar.
          const side = String(((bar % 3) + 3) % 3);
          if (box.dataset.side !== side) box.dataset.side = side;
          // On the beat: the frost breathes on the kick, the heart beats in the dark.
          const beat = Math.floor((now - AM_BAR1) / AM_BEAT);
          if (beat !== lastBeat) {
            lastBeat = beat;
            if (cue === "frost" && beat % 2 === 0) restart(box, "is-breath");
            if (cue === "dark") restart(box, "is-beat");
            // The four faces: the plates lit one by one, a beat each.
            if (cue === "four") fourPlates.forEach((plate, i) => plate.classList.toggle("is-am-lit", i === ((beat % 4) + 4) % 4));
          }
          // The chorus's kick (1 and the and of 2): the reflection ripples, the hologram flickers.
          if (now >= AM_DROP && now < AM_LAST) {
            const eighth = Math.floor((now - AM_BAR1) / (AM_BEAT / 2));
            const inBar = ((eighth % 8) + 8) % 8;
            if (eighth !== lastKick) { lastKick = eighth; if (inBar === 0 || inBar === 3) restart(box, "is-kick"); }
          }
          box.classList.toggle("is-last", cue === "logo" && now >= AM_LAST);
          // The stomps: an ice shockwave and a jolt on each (only when reached in play).
          if (nextStomp > 0 && now < AM_STOMPS[nextStomp - 1] - 0.5) nextStomp = Math.max(0, AM_STOMPS.findIndex((t) => t > now));
          while (nextStomp < AM_STOMPS.length && AM_STOMPS[nextStomp] <= now) { if ((cue === "stomp" || cue === "karina") && now - AM_STOMPS[nextStomp] < 0.2) { restart(box, "is-stomp"); jolt(); } nextStomp++; }
          // Each shot's world in the stomps (Karina's moment too).
          let place = "";
          if (cue === "stomp" || cue === "karina") for (const [at, name] of AM_WORLDS) if (now >= at) place = name;
          // Karina: her card and her plate play her, following her face (held once the shot leaves her).
          if (cue === "karina" && now < AM_KARINA_OFF) {
            const x = amKarinaAt(now);
            drawCrop(kcard, video, x, 0, 0.42, 1);
            if (karinaFeed) drawCrop(karinaFeed, video, x, 0, 0.3, 1);
            const frames = Math.floor((now % 1) * 30);
            ktime.textContent = `${String(Math.floor(now)).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
          }
          // The freeze on her stare: a flash, and the card says so.
          const held = cue === "karina" && now >= AM_KARINA_OFF;
          if (held !== box.classList.contains("is-held")) { box.classList.toggle("is-held", held); if (held) ktime.textContent = "HOLD"; }
          if (place !== world) { world = place; if (place) root.dataset.amWorld = place; else delete root.dataset.amWorld; }
          box.classList.toggle("is-hold", cue === "metal" && now >= AM_HOLD);
          if ((cue === "night" || cue === "wall") && key && mirrorsDue) key.draw(video, cue === "night" ? 1 : 2);
          if (cue === "frost") drawCrop(pane, video, 0.5, 0, 0.5, 1);
          // The reflection: the lower part of the picture above (it fills the top 62% of the screen),
          // drawn below it and turned over (in drama css: scaleY(-1)).
          if (cue === "mirror") drawMirror(reflect, video, { left: 0, top: window.innerHeight * 0.38, width: window.innerWidth, height: window.innerHeight * 0.62 });
          // The scan locks on: the match counting up to 98%.
          if (cue === "scan") match.textContent = `${String(Math.min(98, Math.floor(((now - 49.2) / 1.2) * 98))).padStart(2, "0")}%`;
        },
        unmount() {
          fourPlates.forEach((plate) => plate.classList.remove("is-am-lit"));
          key?.lose();
          karinaFeed?.remove();
          root.classList.remove("is-am-jolt");
          delete root.dataset.amWorld;
        },
      };
    },
  };

  // Drama (131 BPM; its bars from 1.05 s; the MV is widescreen, 2.35:1). "Scene Ver.": the page is
  // the set, the MV is shot on it. Its bridge (to the chorus at 32.19 s), measured shot by shot:
  //   lights (0)          headlights through the rain: the MV screened onto the dark page, so only its
  //                       light falls on the page, rain streaking down it
  //   flare (0.9)         the headlights flare out: an anamorphic streak, the page blown white
  //   title (1.13)        the film opens: letterbox bars close in over the page, the MV glowing into it
  //   ruins (3.17, 7.2)   the dance in the ruins: the MV in a widescreen frame on the page, stage light
  //                       beams sweeping across it, flaring on the clap (beat 3)
  //   ring (5.17, 9.2)    the red stage: the MV through a red disc laid on the page; the overhead shot
  //                       (9.2 s) turns it slowly
  //   burn (11.57)        the film catches fire: burn holes open through the page onto the MV, their
  //                       edges glowing, the page scorched; burnout (14.55) it burns away to black
  //   reel (15.2)         the riser: the MV runs down the page as a strip of film, faster and faster
  //   drive (17.54)       the strip snaps open into the frame; the page kicks on beats 1 and 3
  //   bokeh (19.1)        Winter in the firelight: bokeh drifting over the page, the frame pulling focus
  //   highbeam (22.53)    the headlights behind her: screened onto the page again, their streaks across it
  //   crash (23.43)       the windscreen cracks over the page, more on each hit (24.5 / 24.67 / 24.83 s);
  //                       shatter (25) it bursts, the shards falling away over the red dust
  //   red (26.2)          the red studio is the page: the MV's red keyed out (drKey), so she stands on the
  //                       page, gone red; the ruins cut in between (cut), a red flash on each
  //   leader (30.82)      the hush: a film countdown leader, the MV in its circle, 3, 2
  //   cage (31.57)        the DRAMA cage: the logo stamps red over the page on the pickup (31.73 s)
  // Its chorus (the dance in 2-bar phrases; the kick stops on beat 4 of every other bar, and for two
  // beats every 4 bars), shot by shot:
  //   impact (32.19)      the chorus hits: white then red, the MV slams in, a shockwave, the page jolts
  //   dance (the ruins)   a triptych of tall panels on the page, by the bar: in canon (each panel a few
  //                       frames behind the last, the choreography echoing across), then the whole
  //                       frame split across the three; each panel kicks on its beat
  //   night (the lot)     the MV's light on the page again, a headlight sweeping round it like the car
  //                       doing circles
  //   iris (close-ups)    a film iris closes in on her face, ringed red, the page dark round it
  //   wall (36.8, 43.5)   the DRAMA wall: its red keyed out, so the page is the wall, the black strokes
  //                       of the logo and the dancers over it
  //   mirror (46.4)       the page is a broken mirror: shards each reflecting the MV at its own angle
  //   winter (47.73)      Starring Winter: the page goes dark, a poster frame plays her (tracked across
  //                       the frame), WINTER lands letter by letter in red with 윈터 and her star,
  //                       flashes popping on the beat; her plate lifts and plays her too; a new take
  //                       when the shot changes (49.2)
  //   spot (the solo)     a spotlight cone from above, the MV only in its light
  //   turn (the circle)   the MV on a red turntable, a quarter turn a beat (slow in the outro)
  //   the stops           on each stop the frame freezes in red with DRAMA stamped on it
  //   outro (61.5)        end credits roll up the side
  //   end (67.97)         the DRAMA wall keyed onto the page, each member framed in her own plate
  //                       through the camera's pull-back; FIN when the music stops
  const DR_BEAT = 60 / 131;
  const DR_BAR1 = 1.046; // a downbeat (the impact at 32.19 s is one)
  // The bridge's moments: the drive (its accents on beats 1 and 3), the crash's hits, the countdown
  // and the pickup the logo stamps on.
  const DR_DRIVE = 17.54;
  const DR_CRACKS = [23.43, 24.5, 24.67, 24.83];
  const DR_LEADER = 30.82;
  const DR_PICKUP = 31.73;
  // The ending: left to right on the billboard stage Ningning, Winter, Karina, Giselle; the camera
  // pulls back, so each is tracked: [time, x of each (0-1), top, height, max width] (fractions).
  const DR_END = { ningning: 0, winter: 1, karina: 2, giselle: 3 };
  // Winter's moment: where she is across the frame (0-1), measured; the lot (47.73 s), then the
  // ruins (49.2 s), where she dances in the middle.
  const DR_WINTER = [[47.73, 0.47], [48.05, 0.48], [48.3, 0.48], [48.55, 0.5], [48.8, 0.46], [49.05, 0.44], [49.19, 0.44], [49.2, 0.53], [49.55, 0.55],
    [49.8, 0.58], [50.05, 0.52], [50.3, 0.5], [50.55, 0.47], [50.8, 0.53], [51.05, 0.52], [51.3, 0.48], [51.55, 0.5], [51.8, 0.5]];
  const DR_WINTER_TAKE = 49.2;
  function drWinterAt(now) {
    for (let i = 0; i < DR_WINTER.length - 1; i++) {
      const [ta, xa] = DR_WINTER[i];
      const [tb, xb] = DR_WINTER[i + 1];
      if (now >= ta && now <= tb) return xa + (xb - xa) * ((now - ta) / (tb - ta || 1));
    }
    return 0.5;
  }
  // The chorus's stops: beat 4 of every other bar (two beats long every 4 bars).
  const DR_STOPS = [[35.39, 1], [39.06, 2], [42.72, 1], [46.39, 2], [50.05, 1], [53.71, 2], [57.38, 1], [61.04, 1]];
  const DR_OUTRO = 61.5;
  const DR_FIN = 69.4;
  const DR_CREDITS = ["aespa", "Drama", "", "Karina", "Giselle", "Winter", "Ningning", "", "Scene Ver.", "", "Brew Houze × aespa", "café management system"];
  const DR_END_KEYS = [[67.97, [0.303, 0.431, 0.566, 0.719], 0.5, 0.34, 0.125], [69.4, [0.344, 0.459, 0.581, 0.694], 0.515, 0.22, 0.108], [71.5, [0.347, 0.459, 0.569, 0.681], 0.52, 0.2, 0.104]];
  function drEndFrame(now, slot) {
    const keys = DR_END_KEYS;
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (now >= keys[i][0] && now <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; }
    const k = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (now - a[0]) / (b[0] - a[0])));
    const mix = (x, y) => x + (y - x) * k;
    return [mix(a[1][slot], b[1][slot]), mix(a[2], b[2]), mix(a[4], b[4]), mix(a[3], b[3])];
  }
  // The windscreen's cracks: from the point the crash hits, jagged lines out to the edges and rings
  // round it, in four groups (one more on each hit).
  function drCracks() {
    let state = 31;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const [cx, cy] = [46, 44];
    const groups = [[], [], [], []];
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + rand() * 0.25;
      let x = cx;
      let y = cy;
      let d = `M${x} ${y}`;
      const reach = 70 + rand() * 40;
      for (let r = 0; r < reach; ) {
        r += 4 + rand() * 9;
        const bend = angle + (rand() - 0.5) * 0.5;
        x = cx + Math.cos(bend) * r * 1.4;
        y = cy + Math.sin(bend) * r;
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      groups[i % 3].push(`<path d='${d}' pathLength='100'/>`);
    }
    for (let ring = 1; ring <= 3; ring++) {
      const r = ring * 9 + rand() * 3;
      let d = "";
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const wob = r * (0.85 + rand() * 0.3);
        d += `${i ? " L" : "M"}${(cx + Math.cos(a) * wob * 1.4).toFixed(1)} ${(cy + Math.sin(a) * wob).toFixed(1)}`;
      }
      groups[ring === 1 ? 1 : 3].push(`<path d='${d}' pathLength='100'/>`);
    }
    return groups.map((paths, n) => `<g class="is-c${n + 1}">${paths.join("")}</g>`).join("");
  }
  // The windscreen's shards: a jittered grid, each cell cut in two along a random diagonal, flying
  // out from where it broke (the further, the later). Each is a clip-path over the whole screen.
  function drShards() {
    let state = 47;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const [cols, rows] = [7, 5];
    const pts = [];
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
      const edgeX = x === 0 || x === cols;
      const edgeY = y === 0 || y === rows;
      pts.push([(x / cols) * 100 + (edgeX ? 0 : (rand() - 0.5) * 9), (y / rows) * 100 + (edgeY ? 0 : (rand() - 0.5) * 12)]);
    }
    const at = (x, y) => pts[y * (cols + 1) + x];
    const shards = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const [a, b, c, d] = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)];
      const halves = rand() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const tri of halves) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const far = Math.hypot(cx - 46, cy - 44);
        shards.push({ polygon: `polygon(${tri.map(([px, py]) => `${px.toFixed(1)}% ${py.toFixed(1)}%`).join(", ")})`, dx: (cx - 46) * 0.9, dy: (cy - 44) * 0.9, rot: Math.round((rand() - 0.5) * 120), delay: Math.round(far * 3) });
      }
    }
    return shards;
  }
  // The broken mirror: wedges out from where it broke (x, y as fractions of the screen), each reflecting
  // the MV a little off (shifted, turned, scaled), as broken mirrors do.
  function drMirrorPieces() {
    let state = 59;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const [cx, cy] = [0.48, 0.44];
    const edge = (angle) => {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const t = Math.min(dx > 0 ? (1 - cx) / dx : dx < 0 ? -cx / dx : Infinity, dy > 0 ? (1 - cy) / dy : dy < 0 ? -cy / dy : Infinity);
      return [cx + dx * t, cy + dy * t];
    };
    const count = 9;
    const angles = Array.from({ length: count }, (_, i) => ((i + 0.2 + rand() * 0.6) / count) * Math.PI * 2);
    const corners = [[1, 1, Math.atan2(1 - cy, 1 - cx)], [0, 1, Math.atan2(1 - cy, -cx)], [0, 0, Math.atan2(-cy, -cx) + Math.PI * 2], [1, 0, Math.atan2(-cy, 1 - cx) + Math.PI * 2]];
    return angles.map((from, i) => {
      const to = i + 1 < count ? angles[i + 1] : angles[0] + Math.PI * 2;
      const points = [[cx, cy], edge(from)];
      for (const [x, y, a] of corners) for (const turn of [a, a + Math.PI * 2]) if (turn > from && turn < to) points.push([x, y]);
      points.push(edge(to));
      return { points, dx: (rand() - 0.5) * 0.06, dy: (rand() - 0.5) * 0.06, rot: (rand() - 0.5) * 0.12, scale: 1 + rand() * 0.12, spin: (rand() - 0.5) * 0.25 };
    });
  }
  // A picture drawn into a canvas framed on one spot of it (as drawCrop, for any picture).
  function drawCropOf(canvas, source, width, height, x, top, maxWidth, maxHeight) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height || !width) return;
    const aspect = box.width / box.height;
    let h = maxHeight * height;
    let w = h * aspect;
    if (w > maxWidth * width) { w = maxWidth * width; h = w / aspect; }
    const ratio = mirrorRatio();
    const cw = Math.round(box.width * ratio);
    const ch = Math.round(box.height * ratio);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    canvas.getContext("2d").drawImage(source, Math.min(width - w, Math.max(0, x * width - w / 2)), top * height, w, h, 0, 0, cw, ch);
  }
  // The keys (WebGL): the MV over the screen as cover with part of it made see-through, so the page
  // shows there. Mode 0 (the red studio): its pure red backdrop goes, so she stands on the page. Mode
  // 1 (the night shots): its dark goes and only its light stays, falling on the page like the
  // headlights. Mode 2 (Armageddon's white wall): the light goes and its dark stays, cast on the page
  // as a shadow. null where WebGL is missing (the plain MV then).
  function drKey(canvas) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return null;
    const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); return s; };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, "attribute vec2 a; varying vec2 v; void main() { v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }"));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 v; uniform sampler2D t; uniform vec2 fit; uniform float mode;
      void main() {
        vec2 q = (v * 2.0 - 1.0) * fit * 0.5 + 0.5;
        vec3 c = texture2D(t, q).rgb;
        if (mode > 1.5) {
          float shade = 1.0 - smoothstep(0.12, 0.62, dot(c, vec3(0.299, 0.587, 0.114)));
          gl_FragColor = vec4(c * 0.25 * shade, shade * 0.92);
          return;
        }
        if (mode > 0.5) {
          vec3 lit = min(c * 1.35, vec3(1.0));
          float a = smoothstep(0.04, 0.75, max(lit.r, max(lit.g, lit.b)));
          gl_FragColor = vec4(lit * a, a);
          return;
        }
        float red = c.r - max(c.g, c.b);
        float key = smoothstep(0.22, 0.38, red) * smoothstep(0.08, 0.02, max(c.g, c.b));
        float a = 1.0 - key;
        gl_FragColor = vec4(c * a, a);
      }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const fit = gl.getUniformLocation(program, "fit");
    const mode = gl.getUniformLocation(program, "mode");
    return {
      draw(video, light) {
        const box = canvas.getBoundingClientRect();
        if (!box.width || !box.height || !video.videoWidth) return;
        const ratio = mirrorRatio();
        const w = Math.round(box.width * ratio);
        const h = Math.round(box.height * ratio);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        const aspect = box.width / box.height;
        const media = video.videoWidth / video.videoHeight;
        gl.uniform2f(fit, aspect > media ? 1 : aspect / media, aspect > media ? media / aspect : 1);
        gl.uniform1f(mode, typeof light === "number" ? light : light ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      lose() { gl.getExtension("WEBGL_lose_context")?.loseContext(); },
    };
  }
  // The shots whose light falls on the page (the light key).
  const DR_LIGHT = new Set(["lights", "flare", "title", "highbeam", "night"]);
  // The shots where the red is keyed out (the studio, the DRAMA wall).
  const DR_RED = new Set(["red", "wall", "end"]);
  // A picture drawn over a whole canvas as cover.
  function drawCover(canvas, source, width, height) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height || !width || !height) return;
    const ratio = mirrorRatio();
    const w = Math.round(box.width * ratio);
    const h = Math.round(box.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const scale = Math.max(w / width, h / height);
    canvas.getContext("2d").drawImage(source, (w - width * scale) / 2, (h - height * scale) / 2, width * scale, height * scale);
  }
  const DR_STRIP = 7; // frames on the film strip
  const DR_KEEP = 20; // frames kept for it (the strip shows them three apart)
  const dramaScene = {
    src: "drama/scene.mp4",
    className: "dr-scene",
    cues: [[0, "lights"], [0.9, "flare"], [1.13, "title"], [3.17, "ruins"], [5.17, "ring"], [7.2, "ruins"], [9.2, "ring"], [11.57, "burn"], [14.55, "burnout"],
      [15.2, "reel"], [DR_DRIVE, "drive"], [19.1, "bokeh"], [22.53, "highbeam"], [23.43, "crash"], [25.0, "shatter"], [26.2, "red"], [27.93, "cut"], [28.3, "red"],
      [28.83, "cut"], [29.2, "red"], [30.13, "cut"], [DR_LEADER, "leader"], [31.57, "cage"],
      [32.19, "impact"], [32.37, "dance"], [35.07, "night"], [36.8, "wall"], [37.6, "iris"], [38.47, "dance"], [43.5, "wall"], [46.33, "white"], [46.4, "mirror"], [47.73, "winter"],
      [51.8, "white"], [51.87, "spot"], [52.75, "white"], [52.8, "iris"], [53.27, "spot"], [53.87, "dance"], [55.43, "turn"], [57.97, "night"], [58.9, "dance"],
      [60.83, "night"], [61.03, "iris"], [62.0, "night"], [62.97, "turn"], [64.83, "iris"], [65.6, "dance"], [67.97, "end"]],
    mount(box, video) {
      const shards = drShards();
      const pieces = drMirrorPieces();
      box.innerHTML = `
        <i class="drs-dim"></i>
        <div class="drs-screen"></div>
        <i class="drs-disc"></i>
        <canvas class="drs-key" aria-hidden="true"></canvas>
        <i class="drs-scorch"></i>
        <div class="drs-strip"><div class="drs-roll">${"<canvas></canvas>".repeat(DR_STRIP)}</div></div>
        <div class="drs-panels">${"<canvas></canvas>".repeat(3)}</div>
        <canvas class="drs-glass" aria-hidden="true"></canvas>
        <i class="drs-iris"></i>
        <i class="drs-sweeplight"></i>
        <div class="drs-freeze"><canvas></canvas><b>Drama</b></div>
        <div class="drs-poster"><canvas></canvas><i class="drs-poster-rim"></i><small>Take <span class="drs-poster-take">01</span></small></div>
        <div class="drs-billing" aria-hidden="true"><small>Starring</small><b>${[..."WINTER"].map((c, i) => `<span style="--i: ${i}">${c}</span>`).join("")}</b><span class="drs-hangul">윈터</span></div>
        <i class="drs-star"></i>
        <div class="drs-pops">${"<i></i>".repeat(6)}</div>
        <div class="drs-credits" aria-hidden="true"><div>${DR_CREDITS.map((line) => `<p>${line || "&nbsp;"}</p>`).join("")}</div></div>
        <b class="drs-fin" aria-hidden="true">Fin.</b>
        <div class="drs-rain"><i></i><i></i></div>
        <div class="drs-beams"><i></i><i></i><i></i></div>
        <div class="drs-bokeh">${Array.from({ length: 16 }, (_, n) => `<i style="--x: ${(n * 41) % 100}; --y: ${(n * 23 + 11) % 100}; --s: ${(0.5 + ((n * 7) % 10) / 10).toFixed(1)}; --d: ${(n * 3) % 10}"></i>`).join("")}</div>
        <div class="drs-embers">${"<i></i>".repeat(14)}</div>
        <svg class="drs-cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${drCracks()}</svg>
        <div class="drs-shards">${shards.map(({ polygon, dx, dy, rot, delay }) => `<i style="clip-path: ${polygon}; --dx: ${dx.toFixed(1)}vw; --dy: ${dy.toFixed(1)}vh; --rot: ${rot}deg; --delay: ${delay}ms"></i>`).join("")}</div>
        <div class="drs-leader"><i class="drs-sweep"></i><b class="drs-count">3</b></div>
        <i class="drs-stamp"></i>
        <i class="drs-bars"></i>
        <i class="drs-crack"></i><i class="drs-wave"></i>
        <i class="drs-streak"></i>
        <i class="drs-flash"></i>
        <p class="drs-slate">Scene 01</p>
        <p class="drs-take"><i></i> aespa ‘Drama’ · Take 01 · <span class="drs-time">00:00</span></p>`;
      box.querySelector(".drs-screen").append(video);
      const time = box.querySelector(".drs-time");
      const slate = box.querySelector(".drs-slate");
      const count = box.querySelector(".drs-count");
      box.querySelector(".drs-star").style.setProperty("--emblem", `url("${siteUrl("drama/winter-emblem.webp")}")`);
      // The keys (the plain MV where WebGL is missing).
      const key = drKey(box.querySelector(".drs-key"));
      box.classList.toggle("has-key", Boolean(key));
      // The film strip: the last frames, kept small, run down the page a few apart.
      const strip = [...box.querySelectorAll(".drs-roll canvas")];
      const roll = box.querySelector(".drs-roll");
      const kept = Array.from({ length: DR_KEEP }, () => document.createElement("canvas"));
      let head = -1;
      let keptCount = 0;
      const keep = () => {
        head = (head + 1) % DR_KEEP;
        const canvas = kept[head];
        if (canvas.width !== 640) { canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / video.videoWidth); }
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        keptCount = Math.min(DR_KEEP, keptCount + 1);
      };
      // The frame the windscreen breaks on, as one picture the shards share.
      const shardBox = box.querySelector(".drs-shards");
      const shot = document.createElement("canvas");
      // The chorus's parts: the triptych, the broken mirror, the freeze, Winter's poster and flashes.
      const panels = [...box.querySelectorAll(".drs-panels canvas")];
      const glass = box.querySelector(".drs-glass");
      const freeze = box.querySelector(".drs-freeze canvas");
      const freezeWord = box.querySelector(".drs-freeze b");
      const poster = box.querySelector(".drs-poster canvas");
      const posterTake = box.querySelector(".drs-poster-take");
      const pops = [...box.querySelectorAll(".drs-pops i")];
      // The broken mirror, drawn piece by piece into one canvas.
      const drawGlass = (now) => {
        const box2 = glass.getBoundingClientRect();
        const ratio = mirrorRatio();
        const w = Math.round(box2.width * ratio);
        const h = Math.round(box2.height * ratio);
        if (!w || !h || !video.videoWidth) return;
        if (glass.width !== w || glass.height !== h) { glass.width = w; glass.height = h; }
        const ctx = glass.getContext("2d");
        const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
        const vw = video.videoWidth * scale;
        const vh = video.videoHeight * scale;
        const t = Math.max(0, now - 46.4);
        ctx.clearRect(0, 0, w, h);
        for (const piece of pieces) {
          const [cx, cy] = [piece.points.reduce((a, p) => a + p[0], 0) / piece.points.length * w, piece.points.reduce((a, p) => a + p[1], 0) / piece.points.length * h];
          ctx.save();
          ctx.beginPath();
          piece.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
          ctx.closePath();
          ctx.clip();
          ctx.translate(cx + piece.dx * w, cy + piece.dy * h);
          ctx.rotate(piece.rot + piece.spin * t);
          ctx.scale(piece.scale, piece.scale);
          ctx.drawImage(video, -cx - (vw - w) / 2, -cy - (vh - h) / 2, vw, vh);
          ctx.restore();
        }
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = Math.max(1.5, 2 * ratio);
        ctx.shadowColor = "rgba(255, 90, 92, 0.9)";
        ctx.shadowBlur = 10 * ratio;
        for (const piece of pieces) {
          ctx.beginPath();
          piece.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      };
      // The page's parts: the plates (Winter's, and every member's in the ending).
      const lineup = document.getElementById("ae-lineup");
      lineup.scrollIntoView({ block: "center" });
      const plates = [...lineup.querySelectorAll(".ae-member")].map((plate) => { const canvas = mirror("drs-plate"); plate.querySelector(".ae-photo")?.after(canvas); return canvas; });
      const restart = (el, name) => { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); };
      let take = 8;
      let lastBeat = null;
      let stopAt = null;
      let winterTake = 0;
      let pop = 0;
      let cracks = -1;
      let stamped = false;
      const slates = { lights: "Scene 01 · Night", title: "Scene 01", ruins: "Scene 02", ring: "Scene 02 · Stage", burn: "Scene 03 · Fire", reel: "Scene 04", drive: "Scene 04", bokeh: "Scene 05 · Winter", crash: "Scene 06 · Crash", red: "Scene 07 · Red", leader: "Scene 08", cage: "I’m the Drama",
        impact: "I’m the Drama", night: "Scene 10 · Night", iris: "Close-up", wall: "Scene 11 · Drama", mirror: "Scene 12 · Mirror", winter: "Starring · Winter 윈터", spot: "Scene 13 · Solo",
        turn: "Scene 14 · Turn", end: "Fin · aespa ‘Drama’" };
      return {
        show(cue, now) {
          box.style.setProperty("--beat-lag", `${(-((((now - DR_BAR1) % DR_BEAT) + DR_BEAT) % DR_BEAT)).toFixed(3)}s`);
          box.style.setProperty("--bar-lag", `${(-((((now - DR_BAR1) % (DR_BEAT * 4)) + DR_BEAT * 4) % (DR_BEAT * 4))).toFixed(3)}s`);
          if (slates[cue]) slate.textContent = slates[cue];
          if (cue === "dance") slate.textContent = `Scene 09 · Take ${String(++take).padStart(2, "0")}`;
          if (cue === "winter") { winterTake = 0; posterTake.textContent = "01"; }
          else box.classList.remove("is-take");
          // The windscreen bursts: the frame it broke on, in every shard.
          if (cue === "shatter" && video.videoWidth) {
            shot.width = Math.min(1280, window.innerWidth);
            shot.height = Math.round(shot.width * window.innerHeight / window.innerWidth);
            const scale = Math.max(shot.width / video.videoWidth, shot.height / video.videoHeight);
            shot.getContext("2d").drawImage(video, (shot.width - video.videoWidth * scale) / 2, (shot.height - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
            shardBox.style.setProperty("--shot", `url(${shot.toDataURL("image/jpeg", 0.82)})`);
          }
          if (cue === "reel") keptCount = 0;
          if (cue === "leader") count.textContent = "3";
          if (cue !== "cage") { stamped = false; box.classList.remove("is-stamp"); }
          if (!["crash", "shatter"].includes(cue)) { cracks = -1; box.dataset.cracks = "0"; }
        },
        tick(now) {
          time.textContent = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          const bar = Math.floor((now - DR_BAR1) / (DR_BEAT * 4));
          // The triptych, by the bar: in canon on the bars with the full kick, split on the others.
          const mode = cue === "dance" ? (bar % 2 === 1 ? "canon" : "split") : "";
          if (box.dataset.panels !== mode) box.dataset.panels = mode;
          // On the beat: the drive kicks the page on 1 and 3, the frame pulls focus with it in the
          // firelight; the clap (beat 3) flares the beams in the ruins.
          const beat = Math.floor((now - DR_BAR1) / DR_BEAT);
          if (beat !== lastBeat) {
            lastBeat = beat;
            const inBar = ((beat % 4) + 4) % 4;
            if ((cue === "drive" || cue === "bokeh" || cue === "highbeam") && inBar % 2 === 0) restart(root, "is-dr-kick");
            if (cue === "bokeh" && inBar % 2 === 0) restart(box, "is-pull");
            if ((cue === "ruins" || cue === "ring") && inBar === 2) restart(box, "is-clap");
            // The chorus: the triptych's panels kick in turn, the page on the bar; Winter's flashes.
            if (cue === "dance") { restart(box, "is-beat"); if (inBar === 0) restart(root, "is-dr-kick"); }
            if ((cue === "turn" || cue === "wall") && inBar === 0 && now < DR_OUTRO) restart(root, "is-dr-kick");
            if (cue === "winter") {
              const el = pops[pop++ % pops.length];
              const side = pop % 2 ? 0.08 : 0.55;
              el.style.cssText = `left: ${((side + Math.random() * 0.35) * 100).toFixed(1)}%; top: ${(10 + Math.random() * 70).toFixed(1)}%`;
              restart(el, "is-on");
            }
          }
          // The stops: the frame freezes in red with DRAMA on it (Winter's poster freezes by itself).
          const stop = DR_STOPS.find(([at, beats]) => now >= at && now < at + beats * DR_BEAT);
          if ((stop?.[0] ?? null) !== stopAt) {
            stopAt = stop?.[0] ?? null;
            const frozen = stopAt !== null && !["white", "end", "iris", "mirror"].includes(cue);
            if (frozen && cue !== "winter" && video.videoWidth) { drawCover(freeze, video, video.videoWidth, video.videoHeight); freezeWord.textContent = stop[1] === 2 ? "I’m the Drama" : "Drama"; }
            box.classList.toggle("is-stop", frozen);
            if (frozen) restart(root, "is-dr-kick");
          }
          box.classList.toggle("is-outro", now >= DR_OUTRO && now < 67.97);
          box.classList.toggle("is-fin", now >= DR_FIN);
          // The burn: three holes eating through the page from where the film caught.
          if (cue === "burn") {
            const p = (now - 11.57) / 3;
            [[0, 1.2], [0.18, 1], [0.4, 0.9]].forEach(([late, speed], i) => box.style.setProperty(`--b${i + 1}`, `${Math.max(0, (p - late) * speed * 90).toFixed(1)}vmax`));
          }
          // The crash: a new group of cracks on each hit.
          if (cue === "crash") {
            const n = DR_CRACKS.filter((at) => now >= at).length;
            if (n !== cracks) { cracks = n; box.dataset.cracks = String(n); restart(box, "is-crack"); if (n > 1) restart(root, "is-dr-kick"); }
          }
          // The countdown, a number a beat; the logo stamps on the pickup.
          if (cue === "leader") count.textContent = String(Math.max(1, 3 - Math.floor((now - DR_LEADER) / DR_BEAT)));
          if (cue === "cage" && now >= DR_PICKUP && !stamped) { stamped = true; box.classList.add("is-stamp"); restart(root, "is-dr-kick"); }
          // The film strip: frames kept, the strip running faster and faster with the riser.
          if (cue === "reel" && mirrorsDue && video.videoWidth) {
            keep();
            const t = now - 15.2;
            const pos = t * 0.8 + t * t * 0.9; // frames run past
            const phase = pos - Math.floor(pos);
            roll.style.setProperty("--phase", phase.toFixed(3));
            strip.forEach((canvas, j) => {
              const back = Math.min(keptCount - 1, j * 3);
              if (back >= 0) drawCover(canvas, kept[(head - back + DR_KEEP) % DR_KEEP], kept[0].width, kept[0].height);
            });
          }
          if ((DR_RED.has(cue) || DR_LIGHT.has(cue)) && key && mirrorsDue) key.draw(video, !DR_RED.has(cue));
          box.classList.toggle("is-overhead", cue === "ring" && now >= 9.2);
          // The triptych: in canon (live, then the kept frames 5 and 10 back), or the frame split in three.
          if (cue === "dance" && mirrorsDue && video.videoWidth) {
            keep();
            if (mode === "canon") panels.forEach((canvas, i) => {
              const back = Math.min(keptCount - 1, i * 5);
              if (i === 0 || back < 1) drawCrop(canvas, video, 0.5, 0, 0.4, 1);
              else drawCropOf(canvas, kept[(head - back + DR_KEEP) % DR_KEEP], kept[0].width, kept[0].height, 0.5, 0, 0.4, 1);
            });
            else panels.forEach((canvas, i) => drawCrop(canvas, video, (i * 2 + 1) / 6, 0, 1 / 3, 1));
          }
          if (cue === "mirror" && mirrorsDue) drawGlass(now);
          // Winter: her poster and her plate play her, following her across the frame (her poster
          // holds still on the stop); a new take when the shot changes.
          if (cue === "winter") {
            const x = drWinterAt(now);
            if (mirrorsDue && !box.classList.contains("is-stop")) drawCrop(poster, video, x, 0, 0.36, 1);
            const plate = plates.find((canvas) => canvas.closest(".ae-member")?.dataset.member === "winter");
            if (plate) drawCrop(plate, video, x, 0, 0.3, 1);
            if (now >= DR_WINTER_TAKE && winterTake === 0) { winterTake = 1; posterTake.textContent = "02"; restart(box, "is-take"); }
          }
          if (cue === "end") plates.forEach((canvas) => {
            const slot = DR_END[canvas.closest(".ae-member")?.dataset.member];
            if (slot === undefined) return;
            const [x, top, width, height] = drEndFrame(now, slot);
            drawCrop(canvas, video, x, top, width, height);
          });
        },
        unmount() {
          key?.lose();
          plates.forEach((canvas) => canvas.remove());
          root.classList.remove("is-dr-kick");
        },
      };
    },
  };

  // Dirty Work (one bar at 98 BPM; the music starts DW_START into the file, and the cues are on the
  // file's clock, so each is the hit's time in the bar plus 25 ms). Bone white, blood red and gold,
  // the look of the MV: the downbeat slams DIRTY in bone white with the dust of the stage floor
  // bursting up, its flam (80 / 155 ms) slams WORK and flips the frame white like the concept
  // studio; the first triple (620 / 700 / 775 ms) bites: three grillz close-ups in red, "Sharp
  // teeth, bite first"; the second triple and the next hit (925 / 1000 / 1075 / 1185 ms) are the
  // four members, each with her gold blackletter initial; the hit at 1240 ms flashes the studio
  // white with the silhouette and her two dogs, 1475 ms crosses the red lasers through the dust,
  // 1855 ms opens the gold-tear eye, and 2080 ms lands the aespa blackletter over the gold DIRTY
  // WORK, the dust rising into track 1. The shots are stills from the MV and the concept clips.
  // DW_BEAT (60 / 98) is set with the MV scene above.
  const DW_START = 1105 / 44100;

  // The bridge (track 2, 16 bars) deals the members' concept clips (dirty-work/clips/, silent) onto
  // the page as framed cards, the page darkening behind them as it builds. Its sections
  // (dirtywork.stage.sections) and, in its bars:
  //   grind  (bars 1-6)   a new card slams onto the page every bar (the page shakes), three at most;
  //                       on the silent beats (freeze) a shutter flash, every clip stops in black and
  //                       white and the lyric stamps in red ("Hold tight", "Get tough", "Hold tight")
  //   build  (bars 7-8)   the four members deal out in a fan along the bottom, one a beat, a red glow
  //                       rising behind them; bar 8 flickers with the lasers sweeping on the beat
  //   drive  (bars 9-15)  the lineup: four tall cards, each member's next clip shuttering in every
  //                       bar, the red spotlight jumping from member to member on the beat (on the
  //                       eighths in bars 11-12)
  //   fill   (bar 16)     the cards fall off one a beat, red flashes; Ningning, the last one, steps
  //                       into the middle in gold; slam (its last beat): the gold logo stamps down and
  //                       she goes down under it
  const DW_CLIPS = { karina: [1, 2, 3, 4], giselle: [3, 2, 1], winter: [2, 1, 4, 3], ningning: [1, 2, 4] };
  const DW_GRIND = ["karina-2", "giselle-3", "winter-1", "ningning-2", "karina-4", "giselle-2"];
  const DW_FAN = ["karina-3", "giselle-1", "winter-3", "ningning-4"];
  const DW_HOLD = ["Hold tight", "Get tough", "Hold tight"];
  const dirtyWorkClips = (() => {
    let cards = new Map(); // clip name → its figure
    let box = null;
    let hold = null;
    let lasers = null;
    const show = (wanted, frozen) => {
      cards.forEach((card, name) => {
        const want = wanted.get(name);
        const video = card.querySelector("video");
        if (want) {
          const classes = `dwx-card is-on ${want}`;
          if (card.className !== classes) card.className = classes;
          if (frozen) video.pause();
          else if (video.paused) video.play().catch(() => undefined);
        } else if (card.classList.contains("is-on")) {
          // It fades where it is (a fallen card stays fallen).
          card.className = `dwx-card ${[...card.classList].filter((c) => /^(is-[abc]\d|is-drop|is-last)$/.test(c)).join(" ")}`;
          video.pause();
        }
      });
      box?.classList.toggle("is-frozen", frozen);
    };
    return {
      mount(fx) {
        box = fx.querySelector(".dwx-cards");
        hold = fx.querySelector(".dwx-hold");
        lasers = fx.querySelector(".dwx-lasers");
        cards = new Map();
        Object.entries(DW_CLIPS).forEach(([key, numbers]) => numbers.forEach((n) => {
          const card = document.createElement("figure");
          card.className = "dwx-card";
          card.innerHTML = `<video muted playsinline loop preload="auto" src="dirty-work/clips/${key}-${n}.mp4"></video><figcaption>${MEMBERS[key].name}</figcaption>`;
          box.append(card);
          cards.set(`${key}-${n}`, card);
        }));
      },
      tick(at, name) {
        const t = at - 32 * DW_BEAT; // seconds into the bridge
        const wanted = new Map();
        let bar = -1;
        let hit = false;
        if (at >= 0 && name !== "calm" && t >= 0) {
          bar = Math.floor(t / (DW_BEAT * 4));
          const beat = Math.floor(t / DW_BEAT) % 4;
          const inBar = t - bar * DW_BEAT * 4;
          if (bar < 6) {
            for (let k = Math.max(0, bar - 2); k <= bar; k++) wanted.set(DW_GRIND[k], `is-a${k % 3}${k === bar ? " is-fresh" : ""}`);
            hit = inBar < 0.2;
          } else if (bar < 8) {
            DW_FAN.forEach((clip, i) => { if (bar === 7 || i <= beat) wanted.set(clip, `is-b${i}${bar === 7 ? " is-flicker" : ""}`); });
          } else {
            // The light: on the beat, or on the eighths in the busiest bars (11 and 12).
            const lead = bar === 10 || bar === 11 ? Math.floor(t / (DW_BEAT / 2)) % 4 : Math.floor(t / DW_BEAT) % 4;
            // Each bar's new clips shutter in on its first eighth.
            const swap = bar < 15 && inBar < DW_BEAT / 2;
            memberOrder.forEach((key, i) => {
              const list = DW_CLIPS[key];
              const clip = `${key}-${list[(Math.min(bar, 14) - 8) % list.length]}`;
              let state = "";
              // The fill: one a beat off the bottom; the last one (Ningning) steps into the middle
              // when she is left alone, and falls on the slam.
              if (bar >= 15) state = `${i === 3 && beat >= 2 ? " is-last" : ""}${i <= beat ? " is-drop" : ""}`;
              else if (i === lead) state = " is-lead";
              wanted.set(clip, `is-c${i}${state}${swap ? " is-swap" : ""}`);
            });
          }
        }
        show(wanted, name === "freeze");
        if (hold) {
          if (name === "freeze" && !hold.classList.contains("is-on")) hold.textContent = DW_HOLD[Math.max(0, Math.floor(bar / 2))] ?? DW_HOLD[0];
          hold.classList.toggle("is-on", name === "freeze");
        }
        lasers?.classList.toggle("is-on", bar === 7);
        document.documentElement.classList.toggle("dwx-hit", hit);
      },
      unmount() {
        cards.forEach((card) => card.querySelector("video").pause());
        document.documentElement.classList.remove("dwx-hit");
        cards = new Map();
        box = null;
        hold = null;
        lasers = null;
      },
    };
  })();
  const DW_INTRO_SHOTS = ["bite-1", "bite-2", "bite-3", "karina", "giselle", "winter", "ningning", "dogs", "eye", "aespa"];
  const dirtyWorkIntro = {
    end: 2475,
    cues: [
      [25, "dirty"], [105, "work"], [180, "studio"], [340, "labels"],
      [645, "bite", 0], [725, "bite", 1], [800, "bite", 2],
      [950, "member", 0], [1025, "member", 1], [1100, "member", 2], [1210, "member", 3],
      [1265, "dogs"], [1500, "laser"], [1880, "eye"], [2105, "final"],
    ],
    hits: new Set(["dirty", "work", "studio", "bite", "member", "dogs", "laser", "eye", "final"]),
    bites: ["Sharp", "teeth,", "bite first"],
    mount(box) {
      const shot = (name) => `<img class="dw-shot is-${name.replace(/-\d$/, "")}" data-shot="${name}" src="dirty-work/intro/${name}.webp" alt="" draggable="false" />`;
      box.innerHTML = `
        <div class="dw-dust">${Array.from({ length: 34 }, (_, n) => `<i style="--n: ${n}; --x: ${(n * 37) % 100}; --s: ${0.4 + ((n * 13) % 10) / 10}; --d: ${(n * 7) % 10}"></i>`).join("")}</div>
        <div class="dw-shots">${DW_INTRO_SHOTS.filter((name) => name !== "aespa").map(shot).join("")}</div>
        <div class="dw-lasers"><i></i><i></i><i></i></div>
        <span class="dw-label is-left">aespa ‘Dirty Work’</span><span class="dw-label is-right">Dirty Worker Ver.</span>
        <div class="dw-stack" role="img" aria-label="Dirty Work"><i class="dw-word is-dirty"></i><i class="dw-word is-work"></i></div>
        <b class="dw-caption"></b><i class="dw-initial"></i><span class="dw-name"></span>
        <div class="dw-final"><img class="dw-final-aespa" src="dirty-work/intro/aespa.webp" alt="" draggable="false" /><img class="dw-final-logo" src="dirty-work/logo-gold.webp" alt="" draggable="false" /><small>Brew Houze × aespa</small></div>
        <i class="dw-frame"></i>`;
      const shots = Object.fromEntries([...box.querySelectorAll(".dw-shot")].map((img) => [img.dataset.shot, img]));
      const caption = box.querySelector(".dw-caption");
      const initial = box.querySelector(".dw-initial");
      const name = box.querySelector(".dw-name");
      return (step) => {
        const [, scene, value] = this.cues[step];
        const key = scene === "member" ? memberOrder[value] : null;
        const current = scene === "bite" ? shots[`bite-${value + 1}`] : key ? shots[key] : ["dogs", "eye"].includes(scene) ? shots[scene] : null;
        // A shot not loaded yet is skipped (the dark frame shows instead), never a broken image.
        const ready = !current || (current.complete && current.naturalWidth > 0);
        Object.values(shots).forEach((img) => img.classList.toggle("is-current", img === current && ready));
        caption.textContent = scene === "bite" ? this.bites[value] : scene === "laser" ? "That’s dirty work" : "";
        initial.textContent = key ? MEMBERS[key].name[0] : "";
        name.textContent = key ? MEMBERS[key].name : "";
        const classes = ["dw-intro", `is-${ready ? scene : "labels"}`];
        // The labels stay once shown, and the dust keeps rising after the slam.
        if (step >= 3) classes.push("has-labels");
        if (scene === "final") classes.push("is-rise");
        box.className = classes.join(" ");
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

  // ── Drama's bridge: the page is the film ──
  //   project  (bars 1-7)   the page dims like a cinema and is projected: a beam from the top with
  //                         dust in it, a member's footage cast over the page as light (the next
  //                         member on each bar's clap), sprocket holes running down both edges, the
  //                         page weaving and flickering in the gate
  //   burn     (bar 8)      the film burns in from the edges, the flicker racing
  //   rack     (bars 9-13)  a camera viewfinder over the page; on each accent (beats 1 and 3) it
  //                         pulls focus to a part of the page (a heading, a card, a member), the rest
  //                         going soft
  //   cut                   "CUT!": the clapperboard slams down
  //   neg1-3                each stab freezes the page as a red film negative, a member burned in
  //   curtain / leader      red curtains sweep shut; a film-leader countdown runs on them: 3, 2, 1
  //   premiere(2)           the curtains open on the DRAMA logo, the members projected behind it in
  //                         red, the next one each beat; the second hit flashes white
  const DR_FILMS = ["karina", "giselle", "winter", "ningning"];
  const DR_TRACK2 = 29.304;
  const DR_FOCUS = ".hero h1, .hero .lead, .ae-member, .status-strip, .section-head, .card, .guide-item, .tips";
  const dramaStage = (() => {
    const root = document.documentElement;
    let films = [], focusBox = null, count = null, tcode = null, focused = null, accent = -1;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 16 && r.bottom > 60 && r.top < innerHeight - 60; };
    const focus = (el) => {
      if (el !== focused) { focused?.classList.remove("drx-focus"); focused = el; el?.classList.add("drx-focus"); }
      if (!el || !focusBox) return;
      const r = el.getBoundingClientRect();
      focusBox.style.cssText = `left: ${r.left - 10}px; top: ${r.top - 10}px; width: ${r.width + 20}px; height: ${r.height + 20}px;`;
    };
    return {
      mount(fx) {
        films = [...fx.querySelectorAll(".drx-proj video")];
        focusBox = fx.querySelector(".drx-af");
        count = fx.querySelector(".drx-leader b");
        tcode = fx.querySelector(".drx-tcode");
      },
      tick(at, name) {
        const t = at - DR_TRACK2; // seconds into the bridge
        // The projection: a member a bar (switched on the clap), then one a beat in the premiere.
        let film = -1;
        if (name === "project") film = Math.floor(Math.max(0, t + 2 * DR_BEAT) / (4 * DR_BEAT)) % 4;
        else if (name === "premiere" || name === "premiere2") film = Math.floor(Math.max(0, t - 29.313) / DR_BEAT) % 4;
        films.forEach((video, i) => {
          const on = i === film;
          if (video.classList.contains("is-on") !== on) video.classList.toggle("is-on", on);
          if (on && video.paused) video.play().catch(() => undefined);
          else if (!on && !video.paused) video.pause();
        });
        // The focus pull: a new part of the page on each accent, followed as the page scrolls.
        if (name === "rack") {
          const n = Math.floor(Math.max(0, t - 14.656) / (2 * DR_BEAT));
          if (n !== accent || !focused) {
            accent = n;
            const options = [...document.querySelectorAll(DR_FOCUS)].filter(visible);
            focus(options.length ? options[(n * 3 + 1) % options.length] : null);
          } else focus(focused);
          root.classList.add("drx-rack");
        } else if (root.classList.contains("drx-rack")) { root.classList.remove("drx-rack"); focus(null); accent = -1; }
        if (tcode && t >= 0) { const f = Math.floor(t * 24); tcode.textContent = `00:00:${String(Math.floor(f / 24)).padStart(2, "0")}:${String(f % 24).padStart(2, "0")}`; }
        // The leader counts down a beat at a time: 3 and 2 in the hush, 1 on the pickup.
        if (count) { const n = name === "curtain" ? (t < 27.939 + DR_BEAT ? "3" : "2") : name === "leader" ? "1" : ""; if (count.textContent !== n) count.textContent = n; }
      },
      unmount() {
        films.forEach((video) => video.pause());
        root.classList.remove("drx-rack");
        focus(null);
        films = []; focusBox = null; count = null; tcode = null; accent = -1;
      },
    };
  })();

  // Drama: "Scene ver.", cut like a film from the members' own clips (drama/intro-wide.mp4 and
  // intro-tall.mp4, built frame-exact to the intro music) with the page's titles over it. The first
  // boom (0.07 s) slams the clapperboard shut over Karina's burning "I'M THE DRAMA" billboard; the
  // second (0.98 s) splits the frame into three scenes; the hush (1.62 s) letterboxes Karina through
  // the car window while the subtitle types; the bass hits (2.82 / 3.11 / 3.38 / 3.61 s) cut to the
  // four members, each stamped with her name, scene number and emblem; the chop (3.73 s) floods the
  // flickering montage red with the DRAMA logo in black, the loudest hit (4.19 s) inverts it, and
  // 4.36 s floods red again, straight into track 1. A timecode runs in the corner all along.
  const DR_SPLIT = ["Giselle", "Winter", "Ningning"]; // the triptych, in the site's member order (scenes 02 to 04)
  const dramaIntro = {
    end: 4630,
    video: { wide: "intro-wide.mp4", tall: "intro-tall.mp4" },
    cues: [
      [0, "dark"], [70, "slate"], [980, "split"], [1620, "hush"],
      [2820, "member", 0], [3110, "member", 1], [3380, "member", 2], [3610, "member", 3],
      [3730, "flood"], [3870, "flood"], [4190, "invert"], [4360, "flood"],
    ],
    hits: new Set(["slate", "split", "member", "flood", "invert"]),
    mount(box, photos, flashes, video) {
      box.innerHTML = `
        <div class="dr-film"></div><i class="dr-red"></i>
        <div class="dr-slate"><div class="dr-slate-stick"><i></i></div><div class="dr-slate-board">
          <p class="dr-slate-title">DRAMA</p>
          <dl><dt>Roll</dt><dd>A</dd><dt>Scene</dt><dd>00</dd><dt>Take</dt><dd>01</dd></dl>
          <p class="dr-slate-foot">aespa · Scene Ver. · Dir. Brew Houze</p></div></div>
        <div class="dr-split">${DR_SPLIT.map((name, n) => `<p><b>Scene 0${n + 2}</b>${name}</p>`).join("")}</div>
        <div class="dr-bars"><i></i><i></i></div>
        <p class="dr-sub"><span>I’m the drama.</span></p>
        <p class="dr-kicker"></p><span class="dr-who"></span><i class="dr-emblem"></i>
        <p class="dr-caption is-left">aespa · The 4th Mini Album</p><p class="dr-caption is-right">Scene Ver.</p>
        <p class="dr-tc"><i></i><span>00:00:00:00</span></p>
        <div class="dr-logo"></div><i class="dr-flash"></i><div class="dr-grain"></div>`;
      if (video) { video.className = "dr-video"; box.querySelector(".dr-film").append(video); }
      const emblem = box.querySelector(".dr-emblem");
      const who = box.querySelector(".dr-who");
      const kicker = box.querySelector(".dr-kicker");
      const tc = box.querySelector(".dr-tc span");
      const show = (step) => {
        const [, scene, value] = this.cues[step];
        if (scene === "member") {
          const key = memberOrder[value];
          emblem.style.setProperty("--emblem", `url("${siteUrl(`drama/${key}-emblem.webp`)}")`);
          who.textContent = MEMBERS[key].name;
          kicker.textContent = `Scene 0${value + 1} · Take 01`;
        }
        box.className = `dr-intro is-${scene}${scene === "member" ? ` is-m${value}` : ""}${video?.readyState >= 2 ? " has-film" : ""}`;
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
      // Every frame: the film follows the music (started on the first frame, nudged back when it
      // drifts), and the timecode counts film frames.
      show.tick = (now) => {
        if (video) {
          if (video.paused && !video.ended) void video.play().catch(() => undefined);
          if (video.readyState >= 2) { box.classList.add("has-film"); if (Math.abs(video.currentTime * 1000 - now) > 90) video.currentTime = now / 1000; }
        }
        const f = Math.max(0, Math.floor(now / (1000 / 24)));
        tc.textContent = `00:00:${String(Math.floor(f / 24)).padStart(2, "0")}:${String(f % 24).padStart(2, "0")}`;
      };
      return show;
    },
  };

  // Rich Man: electricity. The clip hums (0-7.7 s), swelling from 4.5 s, cuts to silence (7.75 s) and
  // strikes twice (8.33 / 8.74 s) straight into track 1. In the hum the aespa guitar pick drops in on
  // the first stab (0.15 s) and the four group photos are slapped up around it like posters, a beat
  // apart (1.13 / 2.22 / 3.31 / 4.41 s), lightning stickers on them; from 5 s the air crackles, the
  // hits (5.96 / 6.22 / 6.40 s) strike lightning across the screen and the chrome RICH MAN logo
  // surges up, everything shaking; the silence blacks out to a single spark; the first strike floods
  // the screen in the Energy purple with the logo in neon (I AM ENOUGH AS I AM. I AM A RICH MAN.),
  // the second flips it to the Burst orange with the logo in black.
  const richmanIntro = {
    end: 8870,
    cues: [
      [0, "hum"], [150, "pick"],
      [1130, "poster", 0], [2220, "poster", 1], [3310, "poster", 2], [4410, "poster", 3],
      [5000, "charge"], [5960, "zap", 0], [6220, "zap", 1], [6400, "zap", 2], [6620, "surge"],
      [7750, "blackout"], [8330, "energy"], [8740, "burst"],
    ],
    hits: new Set(["pick", "poster", "zap", "energy", "burst"]),
    mount(box, photos, flashes) {
      box.innerHTML = `
        <i class="rm-hum"></i>
        <p class="rm-label is-left">aespa · The 6th Mini Album</p><p class="rm-label is-right">Rich Man</p>
        <div class="rm-posters"></div>
        <i class="rm-pick"></i>
        <div class="rm-sparks">${"<i></i>".repeat(10)}</div>
        <div class="rm-zaps"><i></i><i></i><i></i></div>
        <i class="rm-chrome"></i>
        <i class="rm-spark"></i>
        <div class="rm-final"><i class="rm-final-bolt"></i><i class="rm-final-logo"></i><p><b>I am enough as I am.</b> <span>I am a Rich Man.</span></p></div>
        <i class="rm-flash"></i>`;
      // The posters: the group photos, each with a lightning sticker, tilted.
      const posters = box.querySelector(".rm-posters");
      flashes.forEach((img, index) => {
        const poster = document.createElement("figure");
        poster.className = `rm-poster is-${index + 1}`;
        poster.append(img);
        poster.insertAdjacentHTML("beforeend", `<i class="rm-sticker is-${(index % 2) + 3}"></i>`);
        posters.append(poster);
      });
      const all = [...posters.children];
      return (step) => {
        const [, scene, value] = this.cues[step];
        // Posters stay up once slapped (until the blackout).
        if (scene === "poster") all.forEach((poster, index) => poster.classList.toggle("is-up", index <= value));
        const classes = ["rm-intro", `is-${scene}`];
        if (scene === "zap") classes.push(`is-zap-${value}`);
        if (["poster", "charge", "zap", "surge"].includes(scene)) classes.push("is-posters");
        if (["charge", "zap", "surge"].includes(scene)) classes.push("is-charged");
        box.className = classes.join(" ");
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
    },
  };

  // Rich Man (110 BPM): a rock show. The MV is the show, the page is the stage:
  //   open (0-2 s)        the MV strikes in full screen, lightning and a white flash
  //   the members         from Karina's part on, the MV goes up on a stadium screen at the top and
  //   (2-36 s)            the four plates are the stage below it; in each member's part (Karina 2-10,
  //                       Giselle 11-18, Winter 19-28, Ningning 28-36) her plate lifts in her colour
  //                       and plays her, lightning crackling round it on the bars, her name under the
  //                       screen. Her plate plays the member cut (richman/members.mp4, silent, on the
  //                       MV's own clock): only her shots, cropped to her, so when the MV cuts away
  //                       she stays on her card until her part is done; then her card flips back to
  //                       her photo. Ningning's part starts right after Winter's: until she comes on
  //                       (31 s) her card plays her later shots (from 32 s of the member cut), then
  //                       it follows the MV again
  //   chase (36 s)        the screen bursts back to full: speed lines, a rev meter filling on the
  //                       beats and the speed racing up to 480 km/h
  //   face (39.47 s)      Karina, the MV seen through the aespa guitar pick, rimmed in neon, the
  //                       Energy purple and its logos behind, the pick swaying on the beat
  //   flip / hit / wreck  pop art: the car flies (WHOA!) on comic lightning, the hits (KA- BOOM!)
  //   (41-42.45 s)        burst in comic stars on halftone dots, white flash, the logo
  //   sky / locker        the poster wall: the MV breaks into four sticker-framed shots slapped onto
  //   (43.03-46 s)        the wall on the beats (LIVE, SOLD OUT, ENCORE, RICH MAN TOUR), the purple
  //                       logo behind them
  //   visor (46.03 s)     a neon HUD in the helmet's visor        static (47.23 s)  the chrome logo
  //                       glitches in slices over the jumping picture
  //   confetti (47.67 s)  confetti, and the members' photo cards rain down, flipping front to back
  //   fireworks (48.95 s) flames on the bars; Ningning (50.13 s): her card flies in and flips to its
  //                       back with a lightning strike, her sticker under it
  //   flag (51.33 s)      stage lights sweep over the crowd, the screen headbangs, lightning on 1 and 3
  //   board / blast       the chrome logo rises over the scoreboard (52.8 s) and blows apart with it
  //   (52.8 / 53.4 s)     (BOOM!): an orange flash, flames, a quake
  //   checker / end       checkered tape, then the RICH MAN logo slams in over the final pose
  const RM_BEAT = 60 / 110;
  const RM_BAR1 = 1.601; // a downbeat
  const RM_PARTS = { karina: [2, 10], giselle: [11, 18], winter: [19, 28], ningning: [28, 36] };
  // When each member's own footage starts in her part (Ningning's first shot comes 3 s in), and what
  // her card plays before it: [from, until, the member cut's time to play from].
  const RM_LIVE = { ningning: 31 };
  const RM_FILL = { ningning: [28, 31, 32] };
  const richmanScene = {
    src: "richman/scene.mp4",
    className: "rm-scene",
    cues: [[0, "open"], [2, "karina"], [10, "between"], [11, "giselle"], [18, "between"], [19, "winter"], [28, "ningning"],
      [36, "chase"], [39.47, "face"], [41.0, "flip"], [42.1, "hit"], [42.45, "wreck"], [43.03, "sky"], [43.93, "locker"], [46.03, "visor"],
      [47.23, "static"], [47.67, "confetti"], [48.95, "fireworks"], [50.13, "ningning2"], [51.33, "flag"], [52.8, "board"], [53.4, "blast"], [54.47, "checker"], [54.9, "end"]],
    mount(box, video) {
      box.innerHTML = `
        <div class="rms-screen"><b class="rms-live"><i></i> Live</b></div>
        <p class="rms-bar" aria-hidden="true"><small>Now on stage</small> <b class="rms-name"></b> <span class="rms-hangul"></span></p>
        <i class="rms-wallbg"></i>
        <div class="rms-wall">${["Live", "Sold out", "Encore", "Rich Man Tour"].map((caption, n) => `<figure class="rms-poster is-${n + 1}"><b>${caption}</b></figure>`).join("")}</div>
        <i class="rms-pickglow"></i>
        <i class="rms-speed"></i>
        <div class="rms-rev"><div>${Array.from({ length: 16 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</div><b><span class="rms-kmh">0</span> km/h</b></div>
        <i class="rms-dots"></i>
        <div class="rms-pow"><i></i><b></b></div>
        <i class="rms-comic"></i>
        <div class="rms-glitch"><i></i><i></i><i></i></div>
        <div class="rms-rain">${["karina", "winter", "giselle", "ningning", "giselle", "karina", "ningning", "winter"].map((key, n) => `<div class="rms-card" style="--n: ${n}"><i style="background-image: url('richman/${key}.webp')"></i><i class="is-back" style="background-image: url('richman/${key}-back.webp')"></i></div>`).join("")}</div>
        <div class="rms-card rms-ncard"><i style="background-image: url('richman/ningning.webp')"></i><i class="is-back" style="background-image: url('richman/ningning-back.webp')"></i></div>
        <div class="rms-beams"><i></i><i></i><i></i><i></i></div>
        <i class="rms-chrome"></i>
        <i class="rms-letterbox"></i>
        <div class="rms-hud"><i></i><b>Rich Man · 480 km/h</b></div>
        <i class="rms-scan"></i>
        <div class="rms-confetti">${Array.from({ length: 26 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</div>
        <div class="rms-flames">${"<i></i>".repeat(9)}</div>
        <i class="rms-bolt"></i><i class="rms-bolt is-b"></i>
        <i class="rms-checker"></i><i class="rms-checker is-b"></i>
        <b class="rms-sticker" aria-hidden="true">Ningning <span>닝닝</span></b>
        <i class="rms-logo"></i>
        <p class="rms-tagline" aria-hidden="true"><b>I am enough as I am.</b> <span>I am a Rich Man.</span></p>
        <i class="rms-flash"></i>
        <p class="rms-badge"><i></i> aespa ‘Rich Man’ · <span class="rms-time">00:00</span></p>`;
      box.querySelector(".rms-screen").prepend(video);
      const time = box.querySelector(".rms-time");
      const name = box.querySelector(".rms-name");
      const hangul = box.querySelector(".rms-hangul");
      const kmh = box.querySelector(".rms-kmh");
      // The poster wall: four shots of the MV (mirrors), three tall ones across the frame, one wide.
      const posters = [...box.querySelectorAll(".rms-poster")].map((figure, n) => {
        const canvas = mirror("rms-shot");
        figure.prepend(canvas);
        return { canvas, crop: [[0.27, 0.04, 0.34, 0.92], [0.5, 0.04, 0.34, 0.92], [0.73, 0.04, 0.34, 0.92], [0.5, 0, 1, 1]][n] };
      });
      // The member cut, silent, kept on the MV's clock.
      const cut = document.createElement("video");
      cut.src = "richman/members.mp4";
      cut.muted = true;
      cut.preload = "auto";
      cut.playsInline = true;
      cut.setAttribute("playsinline", "");
      void cut.play().catch(() => undefined);
      // A second copy for the fill before a member comes on (her later shots, on their own clock).
      const fill = document.createElement("video");
      fill.src = "richman/members.mp4";
      fill.muted = true;
      fill.preload = "auto";
      fill.playsInline = true;
      fill.setAttribute("playsinline", "");
      // The stage: the plates, each with a mirror for her part and lightning round it.
      const lineup = document.getElementById("ae-lineup");
      const plates = [...lineup.querySelectorAll(".ae-member")].map((plate) => {
        const canvas = mirror("rms-plate");
        plate.querySelector(".ae-photo")?.after(canvas);
        const zap = document.createElement("i");
        zap.className = "rms-zap";
        zap.setAttribute("aria-hidden", "true");
        plate.append(zap);
        return { plate, canvas, zap, key: plate.dataset.member };
      });
      // The screen's size: as big as fits above the plates (the plates below it, in view).
      const fit = () => {
        const phone = window.innerWidth < 640;
        const room = window.innerHeight - lineup.getBoundingClientRect().height - 120;
        const width = Math.max(170, Math.min(window.innerWidth * (phone ? 0.8 : 0.5), 600, (room - 44) * 16 / 9));
        box.style.setProperty("--jw", `${Math.round(width)}px`);
        return 12 + width * 9 / 16 + 44;
      };
      const onStage = () => {
        const below = fit();
        window.scrollTo({ top: Math.max(0, window.scrollY + lineup.getBoundingClientRect().top - below - 8), behavior: "smooth" });
      };
      fit();
      window.addEventListener("resize", fit);
      return {
        show(cue, now) {
          box.style.setProperty("--beat-lag", `${(-((((now - RM_BAR1) % RM_BEAT) + RM_BEAT) % RM_BEAT)).toFixed(3)}s`);
          box.style.setProperty("--bar-lag", `${(-((((now - RM_BAR1) % (RM_BEAT * 4)) + RM_BEAT * 4) % (RM_BEAT * 4))).toFixed(3)}s`);
          // (The plates' lightning is in the page, outside the scene: its bar lag is set on the page.)
          root.style.setProperty("--rms-bar-lag", box.style.getPropertyValue("--bar-lag"));
          const member = RM_PARTS[cue] ? MEMBERS[cue] : null;
          box.dataset.mode = now >= 2 && now < 36 ? "stage" : cue === "sky" || cue === "locker" ? "wall" : "full";
          // Each part starts with the stage in view, below the screen.
          if (RM_PARTS[cue]) onStage();
          name.textContent = member ? member.name : "aespa";
          hangul.textContent = member ? member.hangul : "에스파";
          box.dataset.member = member ? cue : "";
        },
        tick(now) {
          time.textContent = `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(Math.floor(now % 60)).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          // The chase: the speed racing up to 480 km/h.
          if (cue === "chase") kmh.textContent = String(Math.round(Math.min(1, Math.max(0, (now - 36) / 3.3)) ** 0.7 * 480));
          if (box.dataset.mode === "wall") posters.forEach(({ canvas, crop }) => drawCrop(canvas, video, ...crop));
          if (now < 36.2) {
            if (cut.readyState >= 1 && Math.abs(cut.currentTime - now) > 0.15) cut.currentTime = now;
            if (cut.paused && !video.paused) void cut.play().catch(() => undefined);
          } else if (!cut.paused) cut.pause();
          // Her plate plays her through her part (from her first shot); after it, her photo card again.
          let filling = false;
          plates.forEach(({ plate, canvas, key }) => {
            const part = RM_PARTS[key];
            if (!part) return;
            const live = Math.max(part[0], RM_LIVE[key] ?? 0);
            const early = RM_FILL[key];
            if (early && now >= early[0] && now < early[1]) {
              // Before she comes on: her later shots, played straight away.
              filling = true;
              const at = early[2] + (now - early[0]);
              if (fill.readyState >= 1 && Math.abs(fill.currentTime - at) > 0.25) fill.currentTime = at;
              if (fill.paused && !video.paused) void fill.play().catch(() => undefined);
              if (fill.readyState >= 2) { drawMirror(canvas, fill); plate.classList.add("rms-on"); }
              plate.classList.remove("rms-done");
            } else if (now >= live && now < part[1]) {
              if (cut.readyState >= 2) { drawMirror(canvas, cut); plate.classList.add("rms-on"); }
              plate.classList.remove("rms-done");
            } else if (now >= part[1]) {
              if (!plate.classList.contains("rms-done")) { plate.classList.remove("rms-on"); plate.classList.add("rms-done"); }
            } else plate.classList.remove("rms-on", "rms-done");
          });
          if (!filling && !fill.paused) fill.pause();
        },
        unmount() {
          window.removeEventListener("resize", fit);
          root.style.removeProperty("--rms-bar-lag");
          [cut, fill].forEach((clip) => { clip.pause(); clip.removeAttribute("src"); clip.load(); });
          plates.forEach(({ plate, canvas, zap }) => { canvas.remove(); zap.remove(); plate.classList.remove("rms-on", "rms-done"); });
        },
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
      era: "Dirty Work", folder: "dirty-work/", tag: "Dirty Work", back: "tarot",
      title: "Brew Houze × aespa · Dirty Work", toast: "Brew Houze × aespa · Dirty Work",
      sub: "Dirty Work · System portal", h1: "Every Brew Houze app. We do the dirty work.", footer: "Brew Houze × aespa · Dirty Work · café management system",
      // The intro (one bar at 98 BPM) runs straight into track 1 (the chorus, 8 bars); tracks 1 and 2
      // (the bridge, 16 bars) then take turns with no gap. The three files were cut on the bar lines,
      // so each is played from the sample its music starts on (after the encoder's 1105-sample delay)
      // for exactly its bars. The bridge (seconds into track 2): the grind
      // (a full bar, then sparse bars whose beat 3 drops out: the freezes at 3.67 / 8.57 /
      // 13.47 s), the build (14.69 s), the drive (19.59 s), and the drum fill (36.73 s) with a slam
      // on its last beat (38.57 s). Its effects are its own (fx, styled in dirtywork.css).
      introClip: "dirty-work/intro.mp3", introStart: DW_START, introLength: 4 * DW_BEAT,
      loops: [{ src: "dirty-work/track-1.mp3", start: DW_START, length: 32 * DW_BEAT }, { src: "dirty-work/track-2.mp3", start: DW_START, length: 64 * DW_BEAT }],
      joined: true, intro: dirtyWorkIntro, introClass: "dw-intro",
      stage: {
        beat: DW_BEAT, parts: [32 * DW_BEAT, 64 * DW_BEAT], grid: 32 * DW_BEAT,
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
        fx: `<i class="dwx-veil"></i><i class="dwx-rise"></i><i class="dwx-gold"></i><div class="dwx-sparks">${"<i>✦</i>".repeat(12)}</div><div class="dwx-lasers"><i></i><i></i><i></i></div><i class="dwx-flash"></i><div class="dwx-cards"></div><b class="dwx-hold">Hold tight</b><i class="dwx-shutter"></i><i class="dwx-slam"></i>`,
        ...dirtyWorkClips,
        sections: [[0, "calm"], ...[[0, "grind"], [3.674, "freeze"], [4.286, "grind"], [8.571, "freeze"], [9.184, "grind"], [13.469, "freeze"], [14.082, "grind"], [14.694, "build"], [19.592, "drive"], [36.735, "fill"], [38.571, "slam"]].map(([at, name]) => [32 * DW_BEAT + at, name])],
      },
      extras: ["logo-gold.webp", "logo-gold-cut.webp", "logo-white.webp", ...DW_INTRO_SHOTS.map((name) => `intro/${name}.webp`)],
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
      // chorus with its second hit (29.31 / 30.23 s). Its effects (the page is the film; see
      // dramaStage and drama.css) are its own.
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
        fx: `<i class="drx-dim"></i><div class="drx-proj">${DR_FILMS.map((key) => `<video muted playsinline loop preload="auto" src="drama/stage/${key}.mp4"></video>`).join("")}</div>`
          + `<i class="drx-beam"></i><i class="drx-dust"></i>`
          + `<div class="drx-sprockets is-l"><span>${"BREW HOUZE × AESPA · DRAMA · SCENE VER. · ".repeat(4)}</span></div><div class="drx-sprockets is-r"><span>${"4TH MINI ALBUM · TAKE 01 · ROLL A · ".repeat(4)}</span></div>`
          + `<i class="drx-burn"></i>`
          + `<div class="drx-vf"><i class="drx-thirds"></i><i class="drx-af"></i><p class="drx-rec"><i></i>REC</p><p class="drx-tcode">00:00:00:00</p><p class="drx-lens">35mm · f/1.4 · ISO 800</p></div>`
          + `<div class="drx-cut"><div class="drx-cut-stick"></div><div class="drx-cut-board"><b>CUT!</b><span>Scene 04 · Take 01 · Drama</span></div></div>`
          + `<div class="drx-neg">${[1, 2, 3].map((n) => `<i style="background-image: url('drama/stage/still-${n}.webp')"></i>`).join("")}<b class="drx-neg-label"></b></div>`
          + `<svg class="drx-defs" width="0" height="0" aria-hidden="true"><filter id="drx-redneg" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-0.3030 -1.0192 -0.1029 0 1.1425  -0.0638 -0.2146 -0.0217 0 0.2300  -0.0542 -0.1824 -0.0184 0 0.2055  0 0 0 1 0"/></filter></svg>`
          + `<i class="drx-curtain is-l"></i><i class="drx-curtain is-r"></i><div class="drx-leader"><i></i><b></b></div>`
          + `<i class="drx-logo"></i><i class="drx-flash"></i>`,
        sections: [[0, "calm"], ...[[0, "project"], [12.824, "burn"], [14.656, "rack"], [24.733, "cut"], [25.649, "neg1"], [26.565, "neg2"], [27.481, "neg3"], [27.939, "curtain"], [28.855, "leader"], [29.313, "premiere"], [30.229, "premiere2"]].map(([at, name]) => [29.304 + at, name])],
        ...dramaStage,
      },
      extras: ["logo.webp", ...["karina", "giselle", "winter", "ningning"].flatMap((key) => [`${key}-emblem.webp`, `${key}-back.webp`])],
      scene: dramaScene,
    },
    // Rich Man: the intro runs straight into track 1 (the chorus, 8 bars at 110 BPM); tracks 1 and 2
    // (verse 3 and the interlude, 9 bars) then take turns with no gap, each played for exactly its
    // bars. The photo cards are the album's own, front and back, and every flip strikes lightning
    // with thunder. The bridge (seconds into track 2): the stop-start riff (the chord chugging, cut
    // dead on beat 4 at 1.64 / 3.82 s, a stab at 3.55 s and the pickup at 4.09 s), the drive (bars
    // 3-7, 4.36 s), the stop (15.27 s) and the drum fill (15.82 s), the crash (17.45 s) into the held
    // "I am a rich man" (17.73 s), and its last beat (19.09 s). Its effects are its own (fx, styled
    // in richman.css): a rock show.
    richman: {
      era: "Rich Man", folder: "richman/", tag: "RICH MAN", back: "image",
      title: "Brew Houze × aespa · Rich Man", toast: "Brew Houze × aespa · RICH MAN ⚡",
      sub: "Rich Man · System portal", h1: "Every Brew Houze app. I am a Rich Man.", footer: "Brew Houze × aespa · Rich Man · café management system",
      introClip: "richman/intro.mp3", loops: [{ src: "richman/track-1.mp3", length: 17.4545 }, { src: "richman/track-2.mp3", length: 19.6364 }], joined: true, intro: richmanIntro, introClass: "rm-intro",
      stage: {
        beat: 60 / 110, parts: [17.4545, 19.6364], grid: 17.4545,
        lyrics: [
        "I am a rich man",
        "I'ma carry myself",
        "Twenty four, 모두가 same shade",
        "You already know what the tag say",
        "Make it better on my own, my tag",
        "I won't double back, 흉내 안 내",
        "If you blame it, cameo",
        "I carry the load, run the show",
        "I'm like a diamond ring",
        "Already got my thing",
        "Cannot put a price on it",
        "This is the real deal, yeah",
        "I'm my own biggest fan",
        "I'm high in demand",
        "I am what I am",
        "That's me, 나는 reckless",
        "Don't care about what they say",
        "I'm that one, 난 나로 가득해 by myself",
      ],
        fx: `<i class="rmx-dark"></i><div class="rmx-beams"><i></i><i></i><i></i><i></i></div><i class="rmx-strobe"></i><div class="rmx-flames">${"<i></i>".repeat(9)}</div><div class="rmx-amps"><i></i><i></i></div><i class="rmx-bolt"></i><i class="rmx-bolt is-b"></i><div class="rmx-strings">${"<i></i>".repeat(6)}</div><i class="rmx-pick"></i><i class="rmx-logo"></i><b class="rmx-live">Live · Rich Man</b><i class="rmx-flash"></i>`,
        sections: [[0, "calm"], ...[[0, "riff"], [1.636, "mute"], [2.182, "riff"], [3.545, "stab"], [3.818, "mute"], [4.091, "pickup"], [4.364, "mosh"], [15.273, "stop"], [15.818, "fill"], [17.455, "crash"], [17.727, "ring"], [19.091, "rush"]].map(([at, name]) => [17.4545 + at, name])],
      },
      scene: richmanScene,
      extras: ["logo-black.webp", "logo-chrome.webp", "logo-purple.webp", "logo-glow.webp", "pick.webp", "bolt-1.webp", "bolt-2.webp", "bolt-3.webp", "bolt-4.webp", ...["karina", "giselle", "winter", "ningning"].map((key) => `${key}-back.webp`)],
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
    richman: { kicker: "● Live · Rich Man", label: "Plug in. Play it loud." },
  };
  // In the page, after Quick tips (not floating over it): it takes its place at the end of the
  // page and lights up there during the bridge.
  const cta = document.createElement("div");
  cta.className = "ae-cta";
  cta.id = "ae-cta";
  (document.querySelector("main") ?? document.body).append(cta);
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
  // A stage may also run code: mount(fx) once its markup is in, tick(seconds into the loop, or -1
  // in the intro; the section) every frame, unmount() when the theme changes.
  let mountedStage = null;
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
      if (at < 0) { setStage("calm"); restoreLyrics(); stage.tick?.(-1, "calm"); }
      else {
        let section = stage.sections[0];
        for (const entry of stage.sections) if (at >= entry[0]) section = entry;
        const [begins, name] = section;
        // The beat animations start in step with the bridge's bars (grid: where its bar 1 starts).
        const bar = stage.beat * 4;
        const grid = stage.grid ?? stage.sections[1]?.[0] ?? 0;
        setStage(name, begins === 0 && name === "calm" ? 0 : ((at - grid) % bar + bar) % bar);
        stage.tick?.(at, name);
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
    if (!stage) { mountedStage?.unmount?.(); mountedStage = null; delete root.dataset.stage; return; }
    root.style.setProperty("--stage-beat", `${Math.round(stage.beat * 1000)}ms`);
    root.style.setProperty("--stage-bar", `${Math.round(stage.beat * 4000)}ms`);
    // The theme's own effects.
    mountedStage?.unmount?.();
    stageFx.innerHTML = stage.fx;
    mountedStage = stage;
    stage.mount?.(stageFx);
    stageClock = performance.now();
    setStage("calm");
    if (motionOK()) stageFrame = requestAnimationFrame(stageTick);
  }
  function stopStage() {
    cancelAnimationFrame(stageFrame);
    mountedStage?.unmount?.();
    mountedStage = null;
    stageName = "";
    restoreLyrics();
    delete root.dataset.stage;
  }

  function applyTheme(theme) {
    current = theme;
    calmStorm();
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
    // silence at the end included (a part that ends on a rest). start (seconds into the file): where
    // the music begins, when it is known exactly (the MP3 encoder's delay), instead of looking for
    // the first sound (which the encoder smears a few milliseconds early).
    const trim = (buffer, length, start) => {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const loud = (i) => channels.some((data) => Math.abs(data[i]) > 1e-4);
      let first = 0;
      while (first < buffer.length && !loud(first)) first++;
      let last = buffer.length - 1;
      while (last > first && !loud(last)) last--;
      const offset = start ?? first / buffer.sampleRate;
      return { buffer, offset, duration: length ? Math.min(length, buffer.duration - offset) : (last + 1 - first) / buffer.sampleRate };
    };
    const load = () => {
      if (!loading) {
        const decode = async (entry) => {
          const { src, length, start } = typeof entry === "string" ? { src: entry } : entry;
          const response = await fetch(src);
          if (!response.ok) throw new Error(`Could not load ${src}`);
          return trim(await context().decodeAudioData(await response.arrayBuffer()), length, start);
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
  const playerFor = (theme) => (players[theme] ??= stitchedLoop(THEMES[theme].loops, THEMES[theme].joined ? { src: THEMES[theme].introClip, length: THEMES[theme].introLength, start: THEMES[theme].introStart } : null));
  const clips = {};
  const clipFor = (theme) => { if (!clips[theme]) { clips[theme] = new Audio(THEMES[theme].introClip); clips[theme].preload = "auto"; } return clips[theme]; };
  // The next theme's intro sound, photos and extra images, loaded before the click so the intro
  // never skips a member.
  const warmed = {};
  // An intro's film (a theme whose intro has one): the wide or the tall cut for this screen, loaded
  // ahead (see warm) and reused, muted and inline so it can play without a tap of its own.
  const introVideos = {};
  function introVideo(theme) {
    const spec = THEMES[theme].intro?.video;
    if (!spec) return null;
    const src = siteUrl(`${THEMES[theme].folder}${matchMedia("(orientation: portrait)").matches ? spec.tall : spec.wide}`);
    let video = introVideos[theme];
    if (!video || video.dataset.src !== src) {
      video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.preload = "auto";
      video.setAttribute("muted", ""); video.setAttribute("playsinline", ""); video.setAttribute("aria-hidden", "true");
      video.dataset.src = src; video.src = src; video.load();
      introVideos[theme] = video;
    }
    return video;
  }
  function warm(theme) {
    introVideo(theme);
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
      const film = introVideo(theme);
      const show = spec.mount(box, photos, flashesOf(theme).map(image), film);
      document.body.appendChild(box);
      show(0);
      let shown = 0;
      let clock = null;
      const frame = () => {
        const now = clock();
        let step = 0;
        spec.cues.forEach(([at], i) => { if (now >= at) step = i; });
        if (step !== shown) { shown = step; show(step); }
        show.tick?.(now);
        if (now >= spec.end) {
          box.classList.add("is-out");
          setTimeout(() => { box.remove(); if (film) { film.pause(); film.currentTime = 0; } }, 260);
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
    richman: { logo: "richman/logo-black.webp", tint: "#D9FF2E", mask: true },
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
  // ── The Dirty Work tarot back ──
  // A gold tarot card: double rules with corner medallions (the top-left one is the flip mark), the
  // arcana numeral, her back photo in an arched window with red lasers and rising dust, the title in
  // blackletter, her name, the lyric, and a gold grill as the seal. Drawn in the card's own
  // proportions (550 × 850), so the frame never stretches. Styled in dirtywork.css.
  function dirtyTarotBack(member, key, t) {
    const card = DW_TAROT[key];
    const corners = [[46, 46], [504, 46], [46, 804], [504, 804]];
    const teeth = [0, 1, 2, 3, 4, 5].map((i) => {
      const x = 14 + i * 12, fang = i === 1 || i === 4;
      return `<path d="M${x} 14 h10 v${fang ? 14 : 9} q-5 ${fang ? 8 : 5} -10 0 z" />`;
    }).join("");
    return `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <svg class="dw-tarot-frame" viewBox="0 0 550 850" aria-hidden="true">
        <defs><linearGradient id="dw-gold-${key}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8C6420" /><stop offset="0.3" stop-color="#F6DE8D" /><stop offset="0.5" stop-color="#B8862B" /><stop offset="0.7" stop-color="#FFF4C4" /><stop offset="1" stop-color="#9A6E22" /></linearGradient></defs>
        <g fill="none" stroke="url(#dw-gold-${key})">
          <rect class="dw-rule" x="18" y="18" width="514" height="814" rx="10" stroke-width="2.2" pathLength="1" />
          <rect class="dw-rule" x="30" y="30" width="490" height="790" rx="5" stroke-width="0.9" pathLength="1" />
          ${corners.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="17" stroke-width="1.4" /><circle cx="${x}" cy="${y}" r="21" stroke-width="0.6" />`).join("")}
          <path d="M235 30 l40 -0 M275 22 l0 16 M255 30 l20 -9 l20 9 l-20 9 z" stroke-width="1" />
          <path d="M235 820 l80 0 M275 812 l0 16" stroke-width="0.8" />
          <path d="M30 425 l-12 0 M532 425 l-12 0" stroke-width="1" />
          <path d="M24 425 l6 -8 l6 8 l-6 8 z M514 425 l6 -8 l6 8 l-6 8 z" stroke-width="1" fill="url(#dw-gold-${key})" />
        </g>
        ${corners.slice(1).map(([x, y]) => `<text x="${x}" y="${y + 6}" text-anchor="middle" class="dw-corner-star">✦</text>`).join("")}
      </svg>
      <p class="dw-tarot-num">${card.numeral}</p>
      <div class="dw-tarot-window">
        <div class="dw-tarot-photo" role="img" aria-label="${escapeHtml(member.name)}" style="background-image: url('${siteUrl(`${t.folder}${key}-back.webp`)}')"></div>
        <i class="dw-tarot-lasers" aria-hidden="true"></i>
        <i class="dw-tarot-dust" aria-hidden="true"></i>
      </div>
      <h3 class="dw-tarot-title">${escapeHtml(card.title)}</h3>
      <p class="dw-tarot-name">${escapeHtml(member.name)} <span>${escapeHtml(member.hangul)}</span></p>
      <p class="dw-tarot-line">“${escapeHtml(card.line)}”</p>
      <div class="dw-tarot-seal" aria-hidden="true">
        <svg viewBox="0 0 100 44"><path class="dw-grill-band" d="M6 16 Q50 2 94 16 L94 20 Q50 8 6 20 Z" />${teeth}</svg>
        <span>Brew Houze × aespa · ${escapeHtml(t.era)}</span>
      </div>`;
  }

  function showMember(index) {
    if (!current) return;
    calmStorm();
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
    back.classList.toggle("is-image", t.back === "image");
    back.classList.toggle("is-tarot", t.back === "tarot");
    back.innerHTML = t.back === "tarot" ? dirtyTarotBack(member, key, t) : t.back === "image" ? `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <div class="rm-back-photo" role="img" aria-label="${escapeHtml(member.name)}, the back of her card" style="background-image: url('${siteUrl(`${t.folder}${key}-back.webp`)}')"></div>` : t.back === "emblem" ? `
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
      <p class="ae-pc-role">${escapeHtml(member.role)}</p>
      <dl class="ae-pc-facts"><dt>Name</dt><dd>${escapeHtml(member.real)}</dd><dt>Born</dt><dd>${escapeHtml(member.born)}</dd><dt>From</dt><dd>${escapeHtml(member.from)}</dd><dt>Group</dt><dd>aespa · debuted Nov 17, 2020</dd></dl>
      <p class="ae-pc-about">${escapeHtml(member.about)}</p>
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
    calmStorm();
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
    if (current === "richman") { strike(); thunder(); }
  }
  // Rich Man: lightning over the card as it turns (the bolts in the album's colours), the card jolting.
  // Both belong to that one flip: calmStorm() clears them when the card changes, the card closes or
  // the theme changes, and the jolt's class goes as soon as it has played (a class left behind would
  // replay the jolt each time the card opens, in any theme).
  let stormTimer = 0;
  function calmStorm() {
    clearTimeout(stormTimer);
    pcModal.querySelector(".rm-storm")?.remove();
    pcModal.querySelector(".ae-pc-stage")?.classList.remove("is-struck");
  }
  function strike() {
    calmStorm();
    if (!motionOK()) return;
    const storm = document.createElement("div");
    storm.className = "rm-storm";
    storm.setAttribute("aria-hidden", "true");
    storm.innerHTML = `<i class="rm-storm-flash"></i>${[2, 1, 4, 3, 2, 1].map((n, i) => `<i class="rm-bolt is-${n} is-s${i}"></i>`).join("")}`;
    pcModal.append(storm);
    stormTimer = setTimeout(() => storm.remove(), 1700);
    const stage = pcModal.querySelector(".ae-pc-stage");
    void stage.offsetWidth;
    stage.classList.add("is-struck");
    stage.addEventListener("animationend", () => stage.classList.remove("is-struck"), { once: true });
  }
  // And its thunder: a crack, then the rumble rolling off (made here, no sound file), when the
  // visitor has the sound on.
  let thunderCtx = null;
  function thunder() {
    if (!soundWanted()) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    thunderCtx ??= new AudioContextClass();
    const ctx = thunderCtx;
    void ctx.resume();
    const now = ctx.currentTime;
    const noise = (seconds, brown) => {
      const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) { const white = Math.random() * 2 - 1; last = brown ? (last + 0.02 * white) / 1.02 : white; data[i] = brown ? last * 3.5 : white; }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      return source;
    };
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(ctx.destination);
    // The crack.
    const crack = noise(0.4, false);
    const high = ctx.createBiquadFilter(); high.type = "highpass"; high.frequency.value = 900;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.7, now + 0.01);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    crack.connect(high).connect(crackGain).connect(out);
    crack.start(now);
    // The rumble, in two rolls.
    const rumble = noise(3.2, true);
    const low = ctx.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 320;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, now);
    rumbleGain.gain.exponentialRampToValueAtTime(1, now + 0.08);
    rumbleGain.gain.exponentialRampToValueAtTime(0.35, now + 0.7);
    rumbleGain.gain.exponentialRampToValueAtTime(0.8, now + 1.0);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.1);
    rumble.connect(low).connect(rumbleGain).connect(out);
    rumble.start(now);
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
