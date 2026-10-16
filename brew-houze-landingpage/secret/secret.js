// Brew Houze × aespa: the secret themes of the portal (styles in secret.css, whiplash.css,
// dirtywork.css, armageddon.css, drama.css, richman.css and kissntell.css; photos and sound in
// whiplash/, dirty-work/, armageddon/, drama/, richman/ and kiss-n-tell/).
//
// The "© Brew Houze" line in the footer opens the theme picker: the café, Whiplash, Dirty Work,
// Armageddon, Drama, Rich Man or Kiss N Tell, straight from any of them. Each
// theme has the four members (plates that open photo cards), an intro that follows its own sound
// clip, and music that loops while the theme is on. index.html sets the theme before the page
// paints (so a reload keeps it without a flash) and provides showToast().
(() => {
  const root = document.documentElement;
  const THEME_KEY = "brew-houze-theme"; // the theme that is on, or "cafe"
  const LAST_KEY = "brew-houze-theme-next"; // the theme last picked (loaded ahead in the café)
  const SOUND_KEY = "brew-houze-aespa-sound"; // "off" when the visitor muted the music
  const ORDER = ["whiplash", "dirtywork", "armageddon", "drama", "richman", "kissntell"]; // the picker's order, after the café
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked: lasts until reload */ } },
  };
  // Ditto is unlocked once per device: after all six aespa themes have been on here, a last quick
  // tip shows in the café look (see "Ditto: the secret within the secrets" at the end).
  const VISITED_KEY = "brew-houze-aespa-visited"; // the aespa themes this device has seen, as JSON
  const DITTO_KEY = "brew-houze-ditto-unlocked";
  const visited = () => { try { const list = JSON.parse(store.get(VISITED_KEY) ?? "[]"); return Array.isArray(list) ? list : []; } catch { return []; } };
  let onThemeApplied = null; // set by the Ditto unlock once it is ready
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
  // NewJeans, for Ditto (the one theme that is not aespa's): the five of them as they were in Ditto's
  // era (December 2022). No positions (the group never named any): the year and city each was born
  // in, and the line she sings in Ditto (the back of her card).
  const NJ_MEMBERS = {
    minji: { name: "Minji", hangul: "민지", short: "2004 · Chuncheon", real: "Kim Min-ji (김민지)", born: "May 7, 2004", from: "Chuncheon, South Korea", line: "Walk in this 미로, 다 아는 건 아니어도" },
    hanni: { name: "Hanni", hangul: "하니", short: "2004 · Melbourne", real: "Pham Ngoc Han (Hanni Pham)", born: "October 6, 2004", from: "Melbourne, Australia", line: "Stay in the middle, like you a little" },
    danielle: { name: "Danielle", hangul: "다니엘", short: "2005 · Newcastle", real: "Danielle June Marsh (모지혜)", born: "April 11, 2005", from: "Newcastle, Australia", line: "Not just anybody… 기다렸지 all this time" },
    haerin: { name: "Haerin", hangul: "해린", short: "2006 · Seoul", real: "Kang Hae-rin (강해린)", born: "May 15, 2006", from: "Seoul, South Korea", line: "훌쩍 커버렸어, 함께한 기억처럼" },
    hyein: { name: "Hyein", hangul: "혜인", short: "2008 · Incheon", real: "Lee Hye-in (이혜인)", born: "April 21, 2008", from: "Incheon, South Korea", line: "I got no time to lose, 내 길었던 하루" },
  };
  // A theme's group (THEMES[x].group, aespa when unset): its name and members, in their order.
  const GROUPS = {
    aespa: { name: "aespa", members: MEMBERS, order: memberOrder },
    newjeans: { name: "NewJeans", members: NJ_MEMBERS, order: Object.keys(NJ_MEMBERS) },
  };
  const groupOf = (theme) => GROUPS[THEMES[theme]?.group ?? "aespa"];
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
  //   script   (bars 9-13)  the screenplay: a script page drops over the dimmed cinema and types
  //                         itself a line a beat (a scene for the four, the song's lines as their
  //                         dialogue); on each accent (beats 1 and 3) it is revised, the paper turning
  //                         the next colour of the industry's revision order (white, blue, pink,
  //                         yellow, green, goldenrod, buff, salmon, cherry, then double white…), the
  //                         director's red pen marking the newest line and an asterisk in the margin
  //   cut                   "CUT!": the clapperboard slams down
  //   neg1-3                each stab freezes the page as a red film negative, a member burned in
  //   curtain / leader      red curtains sweep shut; a film-leader countdown runs on them: 3, 2, 1
  //   premiere(2)           the curtains open on the DRAMA logo, the members projected behind it in
  //                         red, the next one each beat; the second hit flashes white
  const DR_FILMS = ["karina", "giselle", "winter", "ningning"];
  const DR_TRACK2 = 29.304;
  // The screenplay of the script section: [kind, text]. The dialogue is the song's own lines.
  const DR_SCRIPT = [
    ["fade", "FADE IN:"], ["slug", "INT. BREW HOUZE CAFÉ — NIGHT"], ["action", "Neon flickers. Four shadows at the counter. The music drops."],
    ["char", "KARINA"], ["dial", "Ziggy-ziggy-zag, I'm new."], ["char", "GISELLE"], ["paren", "(grinning)"], ["dial", "One, two, three, 깜짝 놀랄 다음 scene"],
    ["char", "NINGNING"], ["dial", "You and I, 함께 써 내려가는 story"], ["char", "WINTER"], ["dial", "You know I'm savage, 거침없는 baddest"],
    ["slug", "EXT. THE CITY — CONTINUOUS"], ["action", "Red light floods the street. Every head turns."], ["char", "ALL FOUR"],
    ["dial", "I bring, I bring all the drama-ma-ma-ma."], ["trans", "CUT TO:"],
  ];
  // The revision colours, in the order studios print them.
  const DR_REVISIONS = [["White", "#F7F5EF"], ["Blue", "#CFE0FA"], ["Pink", "#F9D2DF"], ["Yellow", "#F8EDA0"], ["Green", "#CDEBC4"], ["Goldenrod", "#EECB6A"], ["Buff", "#EFDDBC"], ["Salmon", "#F8C0A6"], ["Cherry", "#EE6E80"]];
  const DR_MARKS = ["is-circle", "is-wavy", "is-strike"];
  const DR_NOTES = { 2: "more drama!", 5: "louder ♡", 8: "keep!!" };
  const DR_SCRIPT_AT = 14.656;
  const dramaStage = (() => {
    let films = [], count = null, sheet = null, lines = [], linesBox = null, revName = null, note = null, beat = -1, rev = -1;
    const today = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "2-digit", day: "2-digit", year: "2-digit" });
    const resetScript = () => {
      if (!sheet) return;
      lines.forEach((line) => line.classList.remove("is-shown", "is-typing", "is-rev", ...DR_MARKS));
      sheet.classList.remove("is-flip", "is-on");
      note?.classList.remove("is-on");
      if (linesBox) linesBox.style.transform = "";
      beat = -1; rev = -1;
    };
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    return {
      mount(fx) {
        films = [...fx.querySelectorAll(".drx-proj video")];
        count = fx.querySelector(".drx-leader b");
        sheet = fx.querySelector(".drx-sheet");
        linesBox = fx.querySelector(".drx-lines");
        linesBox.innerHTML = DR_SCRIPT.map(([kind, text]) => `<p class="drx-l is-${kind}"><span>${escapeHtml(text)}</span></p>`).join("");
        lines = [...linesBox.children];
        revName = fx.querySelector(".drx-rev");
        note = fx.querySelector(".drx-note");
        linesBox.append(note); // scrolls with the lines, beside the line it is about
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
        // The screenplay: a line a beat; a revision on each accent.
        if (name === "script" && sheet) {
          const b = Math.max(0, Math.floor((t - DR_SCRIPT_AT) / DR_BEAT));
          if (b !== beat) {
            beat = b;
            sheet.classList.add("is-on");
            const shown = Math.min(lines.length, b + 1);
            lines.forEach((line, i) => { line.classList.toggle("is-shown", i < shown); line.classList.toggle("is-typing", i === shown - 1 && b < lines.length); });
            const latest = lines[shown - 1];
            if (latest) restart(latest, "is-typing");
            // Keep the newest line on the page: the script scrolls up under it.
            const over = latest ? latest.offsetTop + latest.offsetHeight - linesBox.parentElement.clientHeight * 0.72 : 0;
            linesBox.style.transform = over > 0 ? `translateY(${-over}px)` : "";
            const r = Math.floor(b / 2);
            if (b % 2 === 0 && r !== rev) {
              rev = r;
              const [color, hex] = DR_REVISIONS[r % DR_REVISIONS.length];
              sheet.style.setProperty("--paper", hex);
              revName.textContent = `${r >= DR_REVISIONS.length ? "Double " : ""}${color} revision · ${today}`;
              restart(sheet, "is-flip");
              // The red pen on the newest line that has words to mark.
              const target = [...lines].slice(0, shown).reverse().find((line) => /is-(dial|action|paren)/.test(line.className));
              if (target && r > 0) {
                // A circle round a short line; a long one (it may wrap) underlined, or struck if it is action.
                const mark = target.textContent.length <= 22 ? "is-circle" : target.classList.contains("is-dial") ? "is-wavy" : r % 2 ? "is-strike" : "is-wavy";
                target.classList.remove(...DR_MARKS); target.classList.add(mark, "is-rev");
              }
              if (DR_NOTES[r] && target) { note.textContent = DR_NOTES[r]; note.style.top = `${target.offsetTop}px`; restart(note, "is-on"); }
            }
          }
        } else if (beat !== -1) resetScript();
        // The leader counts down a beat at a time: 3 and 2 in the hush, 1 on the pickup.
        if (count) { const n = name === "curtain" ? (t < 27.939 + DR_BEAT ? "3" : "2") : name === "leader" ? "1" : ""; if (count.textContent !== n) count.textContent = n; }
      },
      unmount() {
        films.forEach((video) => video.pause());
        resetScript();
        films = []; count = null; sheet = null; lines = []; linesBox = null; revName = null; note = null;
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

  // KISS N TELL (126 BPM): the intro is the last 5 bars of the bridge (track 2's own ending), cut on
  // the bars so it runs straight into the chorus. Its files keep the MP3 encoder's delay at the head
  // (1105 samples), so each is played from there for exactly its bars. Track 2 was cut 482 samples
  // (11 ms) after its bar line, so track 1 runs those 11 ms past its 8 bars into it, and track 2 is
  // that much short of 12: the loop is exactly 20 bars. (Measured against the MV's own soundtrack.)
  const KT_START = 1105 / 44100;
  const KT_BEAT = 60 / 126;
  const KT_SEAM = 482 / 44100;
  // The four photobooth sheets' doodles (drawn on in the intro), in member order.
  const KT_DOODLES = ["doodle-hearts", "doodle-bows", "doodle-sparkle", "hearts"];
  // The line each member signs on the back of her card.
  const KT_NOTES = { karina: "kiss n tell? never.", giselle: "shh… just between us", winter: "our little secret ♡", ningning: "sealed with a kiss" };
  // The flip phone's screen in phone.webp (978 × 1100): its four corners (top-left, top-right,
  // bottom-right, bottom-left as the screen reads), found from the image, as fractions of it.
  const KT_SCREEN = [[692.8, 60.1], [920.7, 182.4], [684.6, 539.9], [459.8, 408.7]].map(([x, y]) => [x / 978, y / 1100]);
  // A CSS transform that lays a w × h box exactly onto four corners (a perspective warp).
  function ktWarp(w, h, quad) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dy1 * dx2;
    const g = (dx3 * dy2 - dy3 * dx2) / den, k = (dx1 * dy3 - dy1 * dx3) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
    return `matrix3d(${[a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1].map((n) => +n.toFixed(6)).join(",")})`;
  }
  // The intro: a Y2K flip phone and its secrets. Bar 1 has six syncopated accents (25 / 382 / 739 /
  // 1096 / 1454 / 1692 ms, 3+3+3+3+2 sixteenths apart): the phone buzzes on each, glowing "1 new
  // message", and a lipstick kiss stamps round it; on the sixth the view dives into its screen. The
  // drums drop out for bars 2-3: the screen is a pink pixel LCD receiving a picture message from each
  // member, two beats apart (1930 / 2882 / 3835 / 4787 ms), her photo loading pixel by pixel. Bar 4's
  // soft accents: the four photobooth sheets print out (5739 ms) and get doodled on (6691 ms), the
  // teddy peeking in and the ribbon dropping on top. Bar 5 is the riser into the chorus (7644 ms):
  // the sheets float away, the sky goes night and fills with glitter, the chrome logo rising out of it,
  // glinting on beats 2 and 3 (8120 / 8596 ms); on beat 4 (9073 ms) the sky turns bubblegum, the logo
  // glows like the album's, and a kiss seals it as track 1 comes in.
  const kissIntro = {
    end: 9549,
    cues: [
      [25, "buzz", 0], [382, "buzz", 1], [739, "buzz", 2], [1096, "buzz", 3], [1454, "buzz", 4], [1692, "dive", 5],
      [1930, "mms", 0], [2882, "mms", 1], [3835, "mms", 2], [4787, "mms", 3],
      [5739, "booth"], [6691, "doodle"], [7644, "rise"], [8120, "glint", 1], [8596, "glint", 2], [9073, "seal"],
    ],
    hits: new Set(["buzz", "dive", "mms", "booth", "doodle", "glint", "seal"]),
    mount(box, photos) {
      const clock = new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false });
      box.innerHTML = `
        <i class="kt-sky"></i>
        <div class="kt-glitter">${Array.from({ length: 34 }, (_, n) => `<i style="--x: ${(n * 37 + 11) % 100}; --y: ${(n * 61 + 7) % 100}; --s: ${((n * 13) % 10) / 10}; --d: ${(n * 7) % 10}"></i>`).join("")}</div>
        <i class="kt-lace is-top"></i><i class="kt-lace is-bottom"></i>
        <p class="kt-label is-left">aespa · The 1st Japan Mini Album</p><p class="kt-label is-right">『KISS N TELL』</p>
        <div class="kt-phone"><img src="kiss-n-tell/phone.webp" alt="" draggable="false" /><p class="kt-ping"><span><b>💌</b>1 new<br />message</span></p></div>
        <div class="kt-kisses">${[0, 1, 2, 3, 4, 5].map((n) => `<i class="kt-kiss is-k${n}"></i>`).join("")}</div>
        <div class="kt-lcd"><div class="kt-lcd-screen">
          <p class="kt-lcd-bar"><span>▮▮▮▯</span><span>${clock}</span><span>♡ 100</span></p>
          <p class="kt-lcd-from">MMS from <b></b></p>
          <canvas width="360" height="640"></canvas>
          <p class="kt-lcd-load"><i></i><span>receiving…</span></p>
          <p class="kt-lcd-foot">♡ kiss n tell ♡ 0/4</p></div></div>
        <div class="kt-booth"><div class="kt-sheets">${memberOrder.map((key, index) => `<figure class="kt-sheet"><img src="kiss-n-tell/${key}-booth.webp" alt="" draggable="false" /><i class="kt-doodle" style="--art: url('${siteUrl(`kiss-n-tell/${KT_DOODLES[index]}.webp`)}')"></i></figure>`).join("")}</div></div>
        <i class="kt-teddy"></i><i class="kt-ribbon"></i>
        <div class="kt-logo"><i></i></div><i class="kt-star is-a"></i><i class="kt-star is-b"></i>
        <div class="kt-seal"><div class="kt-seal-logo"><i></i><i class="kt-seal-kiss"></i></div><p>aespa · The 1st Japan Mini Album</p><small>Brew Houze × aespa</small></div>
        <i class="kt-pop"></i>`;
      const kisses = [...box.querySelectorAll(".kt-kiss")];
      // The message is warped onto the phone's screen once the phone is on the page (its size is
      // known then), inset a little so the screen's rounded rim frames it.
      const phone = box.querySelector(".kt-phone");
      const ping = box.querySelector(".kt-ping");
      let fitted = false;
      const fitPing = () => {
        if (fitted || !phone.clientWidth) return;
        fitted = true;
        const w = phone.clientWidth, h = phone.clientHeight;
        const cx = KT_SCREEN.reduce((sum, [x]) => sum + x, 0) / 4, cy = KT_SCREEN.reduce((sum, [, y]) => sum + y, 0) / 4;
        const quad = KT_SCREEN.map(([x, y]) => [(cx + (x - cx) * 0.9) * w, (cy + (y - cy) * 0.9) * h]);
        ping.style.transform = ktWarp(ping.offsetWidth, ping.offsetHeight, quad);
      };
      const from = box.querySelector(".kt-lcd-from b");
      const foot = box.querySelector(".kt-lcd-foot");
      const load = box.querySelector(".kt-lcd-load");
      const loadText = load.querySelector("span");
      const canvas = box.querySelector(".kt-lcd canvas");
      const screen = canvas.getContext("2d");
      const small = document.createElement("canvas");
      const smallCtx = small.getContext("2d");
      // The picture message on the screen: her photo drawn at a few pixels across, then more, every
      // 90 ms (like a slow download), sharp after 540 ms.
      const LEVELS = [6, 9, 14, 22, 36, 60];
      let mms = null; // { at (ms into the clip), photo, level drawn }
      const draw = (photo, width) => {
        if (!photo.complete || !photo.naturalWidth) return;
        const sw = photo.naturalWidth, sh = photo.naturalHeight, ratio = canvas.width / canvas.height;
        const cw = Math.min(sw, sh * ratio), ch = cw / ratio;
        const sx = (sw - cw) / 2, sy = Math.max(0, (sh - ch) * 0.25);
        if (width) {
          small.width = width; small.height = Math.round(width / ratio);
          smallCtx.imageSmoothingEnabled = true;
          smallCtx.drawImage(photo, sx, sy, cw, ch, 0, 0, small.width, small.height);
          screen.imageSmoothingEnabled = false;
          screen.drawImage(small, 0, 0, canvas.width, canvas.height);
        } else {
          screen.imageSmoothingEnabled = true;
          screen.drawImage(photo, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
        }
      };
      const show = (step) => {
        fitPing();
        const [at, scene, value] = this.cues[step];
        if (scene === "buzz" || scene === "dive") kisses.forEach((kiss, index) => kiss.classList.toggle("is-on", index <= value));
        if (scene === "mms") {
          const key = memberOrder[value];
          from.textContent = MEMBERS[key].name;
          foot.textContent = `♡ kiss n tell ♡ ${value + 1}/4`;
          mms = { at, photo: photos[value], level: -1 };
          screen.fillStyle = "#FFD9EE"; screen.fillRect(0, 0, canvas.width, canvas.height);
        } else mms = null;
        const classes = ["kt-intro", `is-${scene}`];
        if (scene === "glint") classes.push(`is-g${value}`);
        box.className = classes.join(" ");
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
      show.tick = (now) => {
        if (!mms) return;
        const level = Math.min(LEVELS.length, Math.floor(Math.max(0, now - mms.at) / 90));
        if (level !== mms.level) { mms.level = level; draw(mms.photo, LEVELS[level] ?? 0); }
        const percent = Math.min(100, Math.round(Math.max(0, now - mms.at) / 5.4));
        load.style.setProperty("--load", `${percent}%`);
        loadText.textContent = percent < 100 ? `receiving… ${percent}%` : "received ♡";
      };
      return show;
    },
  };

  // KISS N TELL (126 BPM; the bridge's bar 1 at 1.407 s of the clip, 1.905 s a bar): the MV is a night
  // at an amusement park, so the scene is KISS N TELL Park, built over the page ride by ride. A marquee
  // sign announces each ride; string lights hang over the night rides.
  //   gate (0)            the park's arch lights up, gates closed, an ADMIT ONE ticket held up; on the
  //                       bridge's bar 1 the stub tears off and the gates swing open
  //   coaster (1.41)      the MV in a heart up top; under it a roller-coaster track (hills, a lift hill
  //                       and a loop, drawn to fit the screen) and a train of four cars, a member's face
  //                       in each, running the whole track every two bars; the page rocks in its seat
  //   balloons (7.12)     the studio shots: clouds drift, heart balloons float up on every half bar,
  //                       each playing the MV in its heart
  //   climb (12.84)       the lift hill: the train clanks up it a step a beat, the page with it
  //   loop (14.74)        bar 8: down the drop and round the loop, the heart turning a full circle
  //   wheel (16.65)       the break, lights out: a Ferris wheel turning slowly, the MV in its eight
  //                       cabins (each a different part of the picture), bulbs twinkling round the rim;
  //                       flash (20.45, 21.41) bar 11's two accents light every bulb
  //   spin (22.36)        the riser: the wheel whirls, the bulbs chasing
  //   fireworks (24.26)   the chorus: the MV full screen, a rocket rising to burst on every beat
  //                       (hearts, rings, stars, in turn), the park's neon sign buzzing on
  //   kisscam (35.53)     the close-ups on the big screen: KISS CAM, a heart popping round her on each
  //                       new shot (39.30, 41.77, 43.53), pixel hearts rising, the song on the ticker
  //   glow (47.30)        the crowd from above: heart lightsticks waving, phone lights twinkling
  //   claw (55.73)        the prize booth: the MV in a claw machine, the claw sliding with the joystick;
  //                       grab (58.55) the button pressed, the claw drops, catches the teddy, YOU WON
  //   carousel (60.13)    the MV in the round under a turning striped canopy, its fringe of bulbs
  //                       chasing, the members' cards riding round it on poles, bobbing
  //   finale (62.47)      the fireworks again: a rocket on every beat and a big one on every bar
  //   photo (70.20)       the ride photo prints out of the booth, date-stamped, sealed with a kiss
  const KT_BAR1 = 1.407;
  const KT_BAR = 4 * KT_BEAT;
  const KT_FIREWORK_CUES = new Set(["fireworks", "finale"]);
  const KT_RIDES = { gate: "Night Pass", coaster: "Love Coaster", balloons: "Heart Balloons", climb: "Love Coaster", loop: "Love Coaster", wheel: "Ferris Wheel", flash: "Ferris Wheel", spin: "Ferris Wheel",
    fireworks: "Fireworks Show", kisscam: "Kiss Cam", kisscam2: "Kiss Cam", kisscam3: "Kiss Cam", kisscam4: "Kiss Cam", dark: "Light Parade", glow: "Light Parade", claw: "Prize Zone", grab: "Prize Zone", carousel: "Carousel", finale: "Grand Finale", photo: "Ride Photo" };
  const KT_NIGHT = new Set(["wheel", "flash", "spin", "kisscam", "kisscam2", "kisscam3", "kisscam4", "claw", "grab", "carousel"]);
  // Where each cabin of the wheel and each balloon looks in the picture (x, top, width, height of it).
  const KT_CABINS = [[0.5, 0, 0.4, 1], [0.2, 0, 0.36, 0.9], [0.8, 0, 0.36, 0.9], [0.35, 0.1, 0.3, 0.8], [0.65, 0.1, 0.3, 0.8], [0.5, 0.2, 0.6, 0.8], [0.12, 0.05, 0.24, 0.9], [0.88, 0.05, 0.24, 0.9]];
  const KT_TICKER = "Come on, just say it · 秘密の girls talk · 甘く bitter, 時々spicy · Everything 打ち明けてよ hush, hush · We can't stop, ねえ ほら kiss and tell · ";
  // The coaster's track for a w × h screen: a little hill, a dip, the lift hill, the drop, a loop, and
  // off to the right. Its lift-hill top is returned as a fraction of the way along it.
  function ktTrack(w, h) {
    // On a tall screen the hills are flattened toward the bottom, so the loop stays round.
    const X = (f) => (f * w).toFixed(1), Y = (f) => (h > w ? h * (0.66 + (f - 0.5) * 0.48) : f * h).toFixed(1);
    return `M ${X(-0.12)} ${Y(0.84)} C ${X(0.02)} ${Y(0.84)} ${X(0.06)} ${Y(0.68)} ${X(0.14)} ${Y(0.68)} C ${X(0.22)} ${Y(0.68)} ${X(0.24)} ${Y(0.9)} ${X(0.33)} ${Y(0.9)}`
      + ` C ${X(0.42)} ${Y(0.9)} ${X(0.44)} ${Y(0.5)} ${X(0.52)} ${Y(0.5)} C ${X(0.6)} ${Y(0.5)} ${X(0.6)} ${Y(0.92)} ${X(0.7)} ${Y(0.92)}`
      + ` C ${X(0.86)} ${Y(0.92)} ${X(0.9)} ${Y(0.6)} ${X(0.8)} ${Y(0.6)} C ${X(0.7)} ${Y(0.6)} ${X(0.72)} ${Y(0.9)} ${X(0.86)} ${Y(0.9)} L ${X(1.15)} ${Y(0.9)}`;
  }
  const kissScene = {
    src: "kiss-n-tell/scene.mp4",
    className: "kt-scene",
    cues: [[0, "gate"], [1.407, "coaster"], [7.121, "balloons"], [12.835, "climb"], [14.740, "loop"],
      [16.645, "wheel"], [20.454, "flash"], [20.930, "wheel"], [21.406, "flash"], [21.882, "wheel"], [22.359, "spin"],
      [24.264, "fireworks"], [35.53, "kisscam"], [39.30, "kisscam2"], [41.77, "kisscam3"], [43.53, "kisscam4"], [46.63, "dark"], [47.30, "glow"],
      [55.73, "claw"], [58.55, "grab"], [60.13, "carousel"], [62.47, "finale"], [70.20, "photo"]],
    mount(box, video) {
      const colors = { karina: "#9FD3FF", giselle: "#FF8CC6", winter: "#CBB8FF", ningning: "#FFB37A" };
      const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).replace(/-/g, " ").replace(/^20/, "'");
      box.innerHTML = `
        <i class="kts-sky"></i>
        <div class="kts-clouds"><i></i><i></i><i></i><i></i></div>
        <div class="kts-garland">${Array.from({ length: 2 }, (_, g) => `<div class="kts-swag is-${g}">${Array.from({ length: 13 }, (_, n) => `<i style="--t: ${n / 12}; --n: ${n + g * 13}"></i>`).join("")}</div>`).join("")}</div>
        <div class="kts-gate"><div class="kts-arch"><b>Kiss N Tell Park</b>${Array.from({ length: 15 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</div><i class="kts-door is-l"></i><i class="kts-door is-r"></i></div>
        <svg class="kts-coaster" aria-hidden="true"><g class="kts-legs"></g><path class="kts-rail-glow" /><path class="kts-rail" /><path class="kts-ties" /></svg>
        <div class="kts-train">${memberOrder.map((key, n) => `<div class="kts-car" style="--k: ${n}; --c: ${colors[key]}"><img src="kiss-n-tell/${key}.webp" alt="" draggable="false" /><i></i></div>`).join("")}</div>
        <div class="kts-wheel"><i class="kts-leg is-l"></i><i class="kts-leg is-r"></i><i class="kts-base"></i><div class="kts-whirl"><div class="kts-rim">
          ${Array.from({ length: 8 }, (_, n) => `<i class="kts-spoke" style="--a: ${n * 22.5}deg"></i>`).join("")}
          <i class="kts-ring"></i><i class="kts-ring is-inner"></i>
          ${Array.from({ length: 32 }, (_, n) => `<i class="kts-bulb" style="--a: ${n * 11.25}deg; --n: ${n}"></i>`).join("")}
          ${KT_CABINS.map((_, n) => `<div class="kts-cabin" style="--a: ${n * 45}deg; --c: ${Object.values(colors)[n % 4]}"><div><i class="kts-hanger"></i><b></b></div></div>`).join("")}
          <i class="kts-hub"></i></div></div></div>
        <div class="kts-balloons">${Array.from({ length: 6 }, (_, n) => `<div class="kts-balloon" style="--x: ${[18, 70, 40, 84, 28, 58][n]}%; --c: ${Object.values(colors)[n % 4]}"><div></div><i></i></div>`).join("")}</div>
        <div class="kts-cabinet"><b class="kts-marquee">♡ Prize Zone ♡</b><i class="kts-glass"></i><div class="kts-plush"><i class="kts-heart-plush"></i><i class="kts-teddy"></i><i class="kts-heart-plush is-b"></i></div>
          <div class="kts-claw"><i class="kts-rod"></i><i class="kts-prong is-l"></i><i class="kts-prong is-r"></i></div><b class="kts-won">You won ♡</b>
          <div class="kts-panel"><i class="kts-stick"></i><i class="kts-button"></i><b>Insert ♡ coin</b></div></div>
        <div class="kts-canopy"><i class="kts-fringe">${Array.from({ length: 18 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</i></div>
        <div class="kts-ride">${memberOrder.map((key, n) => `<div class="kts-horse" style="--a: ${n * 90}deg; --c: ${colors[key]}"><div><i class="kts-pole"></i><img src="kiss-n-tell/${key}.webp" alt="" draggable="false" /><b>${escapeHtml(MEMBERS[key].name)}</b></div></div>`).join("")}</div>
        <div class="kts-printer"><b>♡ Printing your ride photo</b><i></i></div>
        <div class="kts-screen"><b class="kts-date">${escapeHtml(stamp)}</b></div>
        <i class="kts-reflect"></i>
        <div class="kts-cam"><b class="kts-camlabel"><i></i>Kiss Cam<i></i></b><div class="kts-ticker"><span>${escapeHtml(KT_TICKER.repeat(3))}</span></div>
          <div class="kts-pixels">${Array.from({ length: 10 }, (_, n) => `<i style="--n: ${n}; --x: ${(n * 37) % 100}"></i>`).join("")}</div></div>
        <i class="kts-heartcam"></i>
        <canvas class="kts-sparks"></canvas>
        <p class="kts-neon"><b>Kiss N Tell</b> <span>Park</span><small>♡ open late ♡</small></p>
        <div class="kts-phones">${Array.from({ length: 40 }, (_, n) => `<i style="--x: ${(n * 53 + 7) % 100}; --y: ${(n * 29) % 30}; --n: ${n}"></i>`).join("")}</div>
        <div class="kts-sticks">${Array.from({ length: 12 }, (_, n) => `<i style="--n: ${n}; --c: ${Object.values(colors)[n % 4]}"></i>`).join("")}</div>
        <div class="kts-ticket"><div class="kts-ticket-main"><small>Brew Houze × aespa</small><b>Admit one</b><span>Kiss N Tell Park · Night pass</span></div><div class="kts-ticket-stub"><b>No. 0001</b><span>♡</span></div></div>
        <div class="kts-sign"><i class="kts-sign-bulbs"></i><small>Now riding</small><b></b></div>
        <p class="kts-caption">Your ride photo <span>♡ Kiss N Tell Park ♡</span></p>
        <i class="kts-seal"></i>
        <i class="kts-flash"></i>
        <p class="kts-badge">aespa ‘KISS N TELL’ · <span class="kts-time">00:00</span></p>`;
      box.querySelector(".kts-screen").prepend(video);
      const time = box.querySelector(".kts-time");
      const signName = box.querySelector(".kts-sign b");
      const sign = box.querySelector(".kts-sign");
      // The coaster: its track drawn for this screen (rails, ties, legs to the ground), the train on it.
      const svg = box.querySelector(".kts-coaster");
      const train = box.querySelector(".kts-train");
      const layTrack = () => {
        const w = window.innerWidth, h = window.innerHeight;
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        const d = ktTrack(w, h);
        svg.querySelectorAll("path").forEach((path) => path.setAttribute("d", d));
        const rail = svg.querySelector(".kts-rail");
        const length = rail.getTotalLength();
        let top = 0, topY = Infinity, legs = "";
        for (let s = 0; s <= length; s += length / 70) {
          const p = rail.getPointAtLength(s);
          if (p.x > w * 0.35 && p.x < w * 0.62 && p.y < topY) { topY = p.y; top = s / length; }
          if (p.x > 0 && p.x < w && p.y < h * 0.9 - 6) legs += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${h}" />`;
        }
        svg.querySelector(".kts-legs").innerHTML = legs;
        train.style.setProperty("--path", `path("${d}")`);
        train.style.setProperty("--top", `${(top * 100).toFixed(2)}%`);
      };
      layTrack();
      // Mirrors: each cabin and balloon plays its part of the MV.
      const cabins = [...box.querySelectorAll(".kts-cabin b")].map((el, n) => { const canvas = mirror("kts-mirror"); el.append(canvas); return { canvas, crop: KT_CABINS[n] }; });
      const balloons = [...box.querySelectorAll(".kts-balloon")].map((el, n) => { const canvas = mirror("kts-mirror"); el.firstElementChild.append(canvas); return { el, canvas, crop: KT_CABINS[n] }; });
      // The fireworks: rockets that rise to burst on the beat in hearts, rings and stars, with fading
      // trails (the canvas is faded, not cleared, each frame) and twinkling glitter.
      const sparks = box.querySelector(".kts-sparks");
      const ctx = sparks.getContext("2d");
      let particles = [];
      let rockets = [];
      let armed = -1;
      let lastHalf = -1;
      let launched = 0;
      let shape = 0;
      let cue = "";
      let ride = "";
      let last = performance.now();
      const fit = () => {
        const ratio = Math.min(window.devicePixelRatio || 1, SCENE_LITE ? 1 : 1.5);
        sparks.width = Math.round(window.innerWidth * ratio); sparks.height = Math.round(window.innerHeight * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        layTrack();
      };
      window.addEventListener("resize", fit);
      fit();
      const PALETTES = [["#FFFFFF", "#FF8CC6", "#FF4FA3"], ["#CBB8FF", "#FFFFFF", "#A45CFF"], ["#9FD3FF", "#FFFFFF", "#FF8CC6"], ["#FFE27A", "#FFFFFF", "#FFB37A"]];
      const SHAPES = [
        (t) => [16 * Math.sin(t) ** 3 / 16, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16],
        (t) => [Math.cos(t), Math.sin(t)],
        (t) => { const r = 0.55 + 0.45 * Math.cos(5 * t); return [r * Math.sin(t), -r * Math.cos(t)]; },
      ];
      const burst = (x, y, big) => {
        const size = Math.min(window.innerWidth, window.innerHeight) * (big ? 0.34 : 0.22) * (0.85 + Math.random() * 0.3);
        const colors = PALETTES[Math.floor(Math.random() * PALETTES.length)];
        const draw = SHAPES[shape++ % SHAPES.length];
        const count = Math.round((SCENE_LITE ? 50 : 90) * (big ? 1.5 : 1));
        for (let i = 0; i < count; i++) {
          const [dx, dy] = draw((i / count) * Math.PI * 2);
          particles.push({ x, y, vx: dx * size * 2.4, vy: dy * size * 2.4, life: 1, decay: 0.55 + Math.random() * 0.25, color: colors[i % colors.length], twinkle: Math.random() < 0.3 });
        }
        // An inner ring of glitter for the big ones.
        if (big) for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * size; particles.push({ x, y, vx: Math.cos(a) * r, vy: Math.sin(a) * r, life: 1, decay: 0.4, color: "#FFFFFF", twinkle: true }); }
      };
      // A rocket, timed to burst on the beat at `at` (seconds into the clip).
      const rocket = (now, at, big) => {
        const w = window.innerWidth, h = window.innerHeight;
        const tx = w * (0.14 + Math.random() * 0.72), ty = h * (0.14 + Math.random() * 0.32);
        rockets.push({ x: tx + (Math.random() - 0.5) * 80, y: h + 10, tx, ty, from: now, at, big });
      };
      const draw = (now, dt) => {
        const w = window.innerWidth, h = window.innerHeight;
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.fillRect(0, 0, w, h);
        if (!particles.length && !rockets.length) { ctx.clearRect(0, 0, w, h); return; }
        ctx.globalCompositeOperation = "lighter";
        rockets = rockets.filter((r) => {
          const k = Math.min(1, (now - r.from) / Math.max(0.05, r.at - r.from));
          const e = 1 - (1 - k) ** 2;
          const x = r.x + (r.tx - r.x) * e, y = r.y + (r.ty - r.y) * e;
          ctx.fillStyle = "#FFF3C2";
          ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
          if (k >= 1) { burst(r.tx, r.ty, r.big); return false; }
          return true;
        });
        particles = particles.filter((p) => p.life > 0);
        for (const p of particles) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= 1 - 2.2 * dt; p.vy = p.vy * (1 - 2.2 * dt) + 70 * dt;
          p.life -= dt * p.decay;
          const alpha = Math.max(0, p.life) * (p.twinkle ? 0.4 + 0.6 * Math.abs(Math.sin(now * 40 + p.x)) : 1);
          ctx.globalAlpha = alpha * 0.35; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 5 * p.life + 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 * p.life + 0.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      };
      return {
        show(name, now) {
          cue = name;
          // The beat animations start in step with the bars.
          box.style.setProperty("--lag", `${(-(((now - KT_BAR1) % KT_BEAT) + KT_BEAT) % KT_BEAT).toFixed(3)}s`);
          box.style.setProperty("--lag-bar", `${(-(((now - KT_BAR1) % KT_BAR) + KT_BAR) % KT_BAR).toFixed(3)}s`);
          box.classList.toggle("is-cam-pop", name.startsWith("kisscam"));
          box.classList.toggle("is-night", KT_NIGHT.has(name));
          // The marquee sign, when a new ride starts.
          const next = KT_RIDES[name] ?? "";
          if (next !== ride) {
            ride = next;
            signName.textContent = next;
            sign.classList.remove("is-on"); void sign.offsetWidth; sign.classList.toggle("is-on", Boolean(next));
          }
        },
        tick(now) {
          const clock = performance.now();
          const dt = Math.min(0.05, (clock - last) / 1000);
          last = clock;
          const seconds = Math.floor(now);
          time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
          // Rockets: launched 0.42 s ahead so each bursts on the next beat.
          const nextBeat = Math.ceil((now - KT_BAR1) / KT_BEAT);
          const burstAt = KT_BAR1 + nextBeat * KT_BEAT;
          const fireCue = burstAt < 35.53 ? (burstAt >= 24.264 ? "fireworks" : "") : burstAt >= 62.47 && burstAt < 70.2 ? "finale" : "";
          if (fireCue && motionOK() && nextBeat !== armed && burstAt - now < 0.42) {
            armed = nextBeat;
            const downbeat = nextBeat % 4 === 0;
            rocket(now, burstAt, fireCue === "finale" && downbeat);
            if (fireCue === "finale" && nextBeat % 2 === 0) rocket(now, burstAt, false);
          }
          // A balloon on every half bar.
          const half = Math.floor((now - KT_BAR1) / (KT_BAR / 2));
          if (cue === "balloons" && half !== lastHalf) {
            lastHalf = half;
            const balloon = balloons[launched++ % balloons.length].el;
            balloon.classList.remove("is-up"); void balloon.offsetWidth; balloon.classList.add("is-up");
          }
          draw(now, dt);
          if (["wheel", "flash", "spin"].includes(cue)) cabins.forEach(({ canvas, crop }) => drawCrop(canvas, video, ...crop));
          if (cue === "balloons" || cue === "climb") balloons.forEach(({ el, canvas, crop }) => { if (el.classList.contains("is-up")) drawCrop(canvas, video, ...crop); });
        },
        unmount() { window.removeEventListener("resize", fit); particles = []; rockets = []; },
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

  // ── Whiplash's bridge: the photo shoot (the song is modelling and photography) ──
  //   set       (bars 1-4)  the studio is planned: a top-down lighting plot draws itself over the
  //                         dimmed page round the model's mark; on each snap (beats 2 and 4) the
  //                         next piece of kit lands in its place and throws its light at the mark,
  //                         and the page strikes the next pose and holds it
  //   seamless  (14 beats)  the riser: the backdrop paper unrolls from its roll between two stands,
  //                         a pull a beat, down to the floor and out into the sweep, the plot put
  //                         away under it; on the last two beats the tape X is slapped down
  //   cut       (2 beats)   the house lights drop and the wind machine spins up
  //   gust      (3 slams)   each slam is a gust off the fan: the paper billows, the page leans into
  //                         the wind and the next look's hang tag drops in on its string, swinging
  //   out       (the silent beat) the paper snaps back up its roll, the tags with it
  const WL_TRACK2 = 19.048;
  // The kit, in the order it lands: [kind, label, angle (0 = the backdrop, 180 = the camera), reach].
  const WL_KIT = [
    ["paper", "BACKDROP · SEAMLESS", 0, 0.9], ["box", "KEY · OCTABOX 150", -135, 0.8], ["flat", "FILL · V-FLAT", 130, 0.78],
    ["strip", "RIM · STRIP L", -42, 0.74], ["strip", "RIM · STRIP R", 42, 0.74], ["dish", "HAIR · BEAUTY DISH", 0, 0.42],
    ["fan", "WIND · 18 IN FAN", -90, 0.86], ["cam", "CAM · 85 MM · F/2", 180, 0.9],
  ];
  // The page's poses, one a snap: [turn, across, up] (it pivots on its feet).
  const WL_POSES = [[-0.7, -6, 0], [0.5, 4, -3], [0, 0, -6], [-0.4, 8, -2], [0.8, -4, 0], [-0.2, 0, -5], [0.6, -8, -2], [0, 0, 0]];
  const WL_TAGS = [["LOOK 01", "One look", "WL-0101"], ["LOOK 02", "Big flash", "WL-0102"], ["LOOK 03", "Whiplash", "WL-0103"]];
  const whiplashStage = (() => {
    let fx = null, kit = [], tags = [], seam = null, tape = [], landed = -1, pulls = -1, gusts = -1;
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const pose = (p) => {
      if (p) ["--wlx-turn", "--wlx-x", "--wlx-y"].forEach((v, i) => root.style.setProperty(v, `${p[i]}${i ? "px" : "deg"}`));
      else ["--wlx-turn", "--wlx-x", "--wlx-y"].forEach((v) => root.style.removeProperty(v));
    };
    const reset = () => {
      if (!fx) return;
      kit.forEach((el) => el.classList.remove("is-on"));
      tags.forEach((el) => el.classList.remove("is-on"));
      tape.forEach((el) => el.classList.remove("is-on"));
      seam.style.setProperty("--pull", 0);
      landed = -1; pulls = -1; gusts = -1;
      pose(null);
    };
    return {
      mount(box) {
        fx = box;
        const plot = fx.querySelector(".wlx-plot");
        plot.insertAdjacentHTML("beforeend", WL_KIT.map(([kind, label, angle, reach]) =>
          `<div class="wlx-kit is-${kind}" style="--a: ${angle}deg; --r: ${reach}"><i class="wlx-beam"></i><i class="wlx-gear"></i><b>${escapeHtml(label)}</b></div>`).join(""));
        kit = [...plot.querySelectorAll(".wlx-kit")];
        fx.querySelector(".wlx-tags").innerHTML = WL_TAGS.map(([look, name, style], i) =>
          `<div class="wlx-tag" style="--t: ${i}"><div class="wlx-card"><i class="wlx-hole"></i><small>aespa</small><strong>${look}</strong><em>${escapeHtml(name)}</em><i class="wlx-code"></i><small>STYLE ${style} · SIZE ONE</small></div></div>`).join("");
        tags = [...fx.querySelectorAll(".wlx-tag")];
        seam = fx.querySelector(".wlx-seam");
        tape = [...fx.querySelectorAll(".wlx-x i")];
      },
      tick(at, name) {
        if (!fx) return;
        const t = at - WL_TRACK2; // seconds into the bridge
        if (at < 0 || name === "calm") { if (landed !== -1 || pulls !== -1 || gusts !== -1) reset(); return; }
        // The plot: the next piece of kit on each snap (beats 2 and 4), the page posing with it.
        const shown = name === "set" ? Math.min(WL_KIT.length, Math.floor((t + WL_BEAT) / (2 * WL_BEAT))) : WL_KIT.length;
        if (shown !== landed) {
          landed = shown;
          kit.forEach((el, i) => el.classList.toggle("is-on", i < shown));
          pose(name === "set" && shown > 0 ? WL_POSES[(shown - 1) % WL_POSES.length] : null);
        }
        // The seamless: a pull a beat through the riser (fourteen), then down to the floor.
        const p = name === "set" ? 0 : name === "seamless" ? Math.min(14, Math.floor((t - 7.619) / WL_BEAT) + 1) : name === "out" ? 0 : 14;
        if (p !== pulls) {
          pulls = p;
          seam.style.setProperty("--pull", (p / 14).toFixed(3));
          tape.forEach((el, i) => el.classList.toggle("is-on", p >= 13 + i && name !== "out"));
        }
        // The gusts: a hang tag a slam.
        const g = name === "gust" ? Math.min(3, Math.floor((t - 15.238) / WL_BEAT) + 1) : 0;
        if (g !== gusts) {
          gusts = g;
          tags.forEach((el, i) => el.classList.toggle("is-on", i < g));
          if (g) tags.slice(0, g - 1).forEach((el) => restart(el.firstElementChild, "is-blown"));
        }
      },
      unmount() { pose(null); fx = null; },
    };
  })();

  // ── Ditto (NewJeans): the secret within the secrets ──
  // 134 BPM; the intro, track 1 and track 2 are 16 bars each (28.66 s), each played from the
  // encoder's delay. DT_MS(bar, beat, sixteenth) is where that falls in a part, in ms.
  const DT_BEAT = 60 / 134;
  const DT_START = 1105 / 44100;
  const DT_MS = (bar, beat = 0, sixteenth = 0) => Math.round(((bar - 1) * 4 + beat + sixteenth / 4) * DT_BEAT * 1000);
  const DT_STICKERS = [18, 14, 11, 19, 21];
  // The intro: a winter night, an old computer, a folder no one has opened since 2022.
  //   dark (0)          a bedroom at night (dittoRoom): the monitor off on the desk under the window,
  //                     snow falling outside, fairy lights over the window, a mug still steaming
  //   power (1567)      the camera pushes in on the monitor as it comes on (the room grows round it)
  //                     and the first "woo" swells: the screen comes on, a line opening into the picture,
  //                     its light on the room
  //   desktop (1791)    a pastel desktop; the cursor drifts to the folder "ditto (2022)"
  //   ask (3582)        a double click: "This folder hasn't been opened since 12/19/2022. Open it anyway?"
  //   open (4478)       Open
  //   win (5373…8060)   the five of them open as photo windows, a beat and a half apart, a sticker each
  //   player (8731)     the second swell: ditto.avi plays (the camcorder footage) over them
  //   beat (14328)      the drums come in: a cat's paw prints walk across the screen, one a beat
  //   tile (21492)      the five windows line up side by side, "all five · winter 2022"
  //   us (25074)        us.png: the five of them drawn together
  //   hit (26865)       the band comes in: the Ditto logo glows over it all, stickers burst, the
  //                     screen blooms into the chorus
  // The room round the intro's monitor: a bedroom at night, the desk under the window, the town
  // under snow outside, fairy lights strung over the window, a mug of coffee still steaming, the desk
  // calendar on 19 December. Painted round the monitor where it stands before the camera pushes in
  // (the room grows with it, from the same point; .dt-room in ditto.css), and again on a resize.
  const DT_BULBS = ["#FF9EC7", "#FFE08A", "#9DF5C2", "#C3B8F3", "#FFC09E", "#9EC2F0"];
  const dittoRoom = (box) => {
    const room = box.querySelector(".dt-room"), crt = box.querySelector(".dt-crt");
    const sky = room.querySelector(".dt-room-sky"), front = room.querySelector(".dt-room-paint");
    const out = room.querySelector(".dt-room-out"), lights = room.querySelector(".dt-room-lights");
    const steam = room.querySelector(".dt-room-steam"), glow = room.querySelector(".dt-room-glow");
    const paint = () => {
      if (!box.isConnected) return;
      const vw = window.innerWidth, vh = window.innerHeight, tall = vh > vw;
      const ratio = SCENE_LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      let seed = 1219;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      // The monitor before the push in (its scale now may be part way; the zoom is about its middle).
      const at = crt.getBoundingClientRect();
      const scaled = parseFloat(getComputedStyle(crt).scale) || 1;
      const s0 = parseFloat(getComputedStyle(box).getPropertyValue("--dt-s0")) || 0.42;
      const ox = at.left + at.width / 2, oy = at.top + at.height / 2;
      const bw = (at.width / scaled) * s0, bh = (at.height / scaled) * s0;
      room.style.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
      const footY = oy + bh / 2 + bw * 0.085;
      const deskBack = footY - bw * (tall ? 0.1 : 0.075);
      const deskFront = Math.min(vh - 4, footY + (vh - footY) * (tall ? 0.7 : 0.62));
      const winW = tall ? vw * 0.86 : Math.min(vw * 0.84, bw * 2.5);
      const winL = ox - winW / 2, winR = ox + winW / 2, winT = vh * (tall ? 0.06 : 0.075);
      const winB = deskBack - (tall ? 12 : vh * 0.03), winH = winB - winT;
      const ft = Math.max(5, winW * (tall ? 0.022 : 0.016));

      // Outside: the night sky, the moon, the town under the snow (the flakes fall in front of it).
      Object.assign(out.style, { left: `${winL}px`, top: `${winT}px`, width: `${winW}px`, height: `${winH}px` });
      out.style.setProperty("--oh", winH.toFixed(0));
      out.style.setProperty("--fs", `${Math.max(3, bw * 0.011).toFixed(1)}px`);
      sky.width = Math.round(winW * ratio); sky.height = Math.round(winH * ratio);
      const k = sky.getContext("2d");
      k.setTransform(ratio, 0, 0, ratio, 0, 0);
      const air = k.createLinearGradient(0, 0, 0, winH);
      air.addColorStop(0, "#0A0E2A"); air.addColorStop(0.5, "#1F275B"); air.addColorStop(0.8, "#454985"); air.addColorStop(1, "#7A6CA4");
      k.fillStyle = air; k.fillRect(0, 0, winW, winH);
      for (let n = 0; n < 70; n++) { k.fillStyle = `rgba(255, 255, 255, ${(0.15 + rnd() * 0.5).toFixed(2)})`; k.fillRect(rnd() * winW, rnd() * winH * 0.55, 1.3, 1.3); }
      const mx = winW * 0.84, my = winH * 0.2, mr = Math.max(6, Math.min(winW, winH) * 0.045);
      const halo = k.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 6);
      halo.addColorStop(0, "rgba(225, 228, 255, 0.4)"); halo.addColorStop(1, "rgba(225, 228, 255, 0)");
      k.fillStyle = halo; k.fillRect(0, 0, winW, winH);
      k.fillStyle = "#F6F3FF"; k.beginPath(); k.arc(mx, my, mr, 0, Math.PI * 2); k.fill();
      k.fillStyle = "rgba(185, 185, 225, 0.35)";
      [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12]].forEach(([dx, dy, r]) => { k.beginPath(); k.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2); k.fill(); });
      // the town's light on the low clouds
      const town = k.createLinearGradient(0, winH * 0.55, 0, winH);
      town.addColorStop(0, "rgba(244, 154, 193, 0)"); town.addColorStop(1, "rgba(244, 154, 193, 0.22)");
      k.fillStyle = town; k.fillRect(0, 0, winW, winH);
      // two rows of roofs, the far one paler; snow on every roof, a window lit here and there
      [[0.2, 0.11, "#2C2F62", 0.55], [0.3, 0.16, "#161A3A", 0.9]].forEach(([tallest, least, ink, lit]) => {
        let x = -rnd() * winW * 0.05;
        while (x < winW) {
          const w = winW * (0.045 + rnd() * 0.07), h = winH * (least + rnd() * (tallest - least)), y = winH - h, pitched = rnd() < 0.35;
          k.fillStyle = ink;
          k.beginPath();
          if (pitched) { k.moveTo(x, winH); k.lineTo(x, y + w * 0.3); k.lineTo(x + w / 2, y); k.lineTo(x + w, y + w * 0.3); k.lineTo(x + w, winH); }
          else k.rect(x, y, w, h);
          k.fill();
          k.strokeStyle = "rgba(232, 236, 255, 0.85)"; k.lineWidth = Math.max(1.5, winH * 0.008); k.lineCap = "round";
          k.beginPath();
          if (pitched) { k.moveTo(x, y + w * 0.3); k.lineTo(x + w / 2, y); k.lineTo(x + w, y + w * 0.3); } else { k.moveTo(x + 1, y); k.lineTo(x + w - 1, y); }
          k.stroke();
          const ww = Math.max(2, w * 0.12), wh = ww * 1.3;
          for (let wy = y + (pitched ? w * 0.36 : h * 0.18); wy < winH - wh; wy += wh * 2.2) {
            for (let wx = x + w * 0.18; wx < x + w - ww * 1.2; wx += ww * 2) {
              if (rnd() > lit * 0.32) continue;
              k.fillStyle = rnd() < 0.7 ? "rgba(255, 214, 160, 0.9)" : "rgba(255, 190, 218, 0.9)";
              k.fillRect(wx, wy, ww, wh);
            }
          }
          x += w;
        }
      });

      // Inside: the wall, the window (its glass cut out of the wall), the curtains, the desk.
      front.width = Math.round(vw * ratio); front.height = Math.round(vh * ratio);
      const g = front.getContext("2d");
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const wall = g.createLinearGradient(0, 0, 0, deskBack);
      wall.addColorStop(0, "#14172E"); wall.addColorStop(1, "#272B50");
      g.fillStyle = wall; g.fillRect(0, 0, vw, deskBack + 2);
      g.fillStyle = "rgba(255, 255, 255, 0.022)";
      for (let x = 0; x < vw; x += 26) g.fillRect(x, 0, 11, deskBack);
      const spill = g.createRadialGradient(ox, (winT + winB) / 2, winW * 0.3, ox, (winT + winB) / 2, winW * 0.8);
      spill.addColorStop(0, "rgba(130, 140, 215, 0.2)"); spill.addColorStop(1, "rgba(130, 140, 215, 0)");
      g.fillStyle = spill; g.fillRect(0, 0, vw, deskBack);
      g.clearRect(winL, winT, winW, winH);
      // frost in the corners of each pane, a sheen across the glass
      const cols = [0, 1 / 3, 2 / 3, 1], rows = [0, 0.36, 1];
      g.save(); g.beginPath(); g.rect(winL, winT, winW, winH); g.clip();
      for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) {
        const x0 = winL + winW * cols[c], x1 = winL + winW * cols[c + 1], y0 = winT + winH * rows[r], y1 = winT + winH * rows[r + 1];
        const size = Math.min(x1 - x0, y1 - y0) * 0.42;
        [[x0, y1, 0.32], [x1, y1, 0.32], [x0, y0, 0.14], [x1, y0, 0.14]].forEach(([fx, fy, a]) => {
          const frost = g.createRadialGradient(fx, fy, 0, fx, fy, size);
          frost.addColorStop(0, `rgba(235, 240, 255, ${a})`); frost.addColorStop(1, "rgba(235, 240, 255, 0)");
          g.fillStyle = frost; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        });
      }
      g.fillStyle = "rgba(255, 255, 255, 0.045)";
      g.beginPath(); g.moveTo(winL + winW * 0.08, winB); g.lineTo(winL + winW * 0.3, winT); g.lineTo(winL + winW * 0.38, winT); g.lineTo(winL + winW * 0.16, winB); g.fill();
      g.restore();
      // the frame: dark against the snowlight, its inner edges lit
      const mull = ft * 0.7;
      const bar = (x, y, w, h) => { g.fillStyle = "#3F4373"; g.fillRect(x, y, w, h); g.fillStyle = "rgba(170, 178, 230, 0.55)"; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h); };
      bar(winL - ft, winT - ft, winW + ft * 2, ft);
      bar(winL - ft, winT - ft, ft, winH + ft);
      bar(winR, winT - ft, ft, winH + ft);
      [1 / 3, 2 / 3].forEach((f) => bar(winL + winW * f - mull / 2, winT, mull, winH));
      bar(winL, winT + winH * 0.36 - mull / 2, winW, mull);
      // the sill, a snowman on it and a little plant
      const sillY = winB, sillH = Math.max(4, ft * 1.1);
      g.fillStyle = "#5D6194"; g.fillRect(winL - ft * 1.8, sillY, winW + ft * 3.6, sillH);
      g.fillStyle = "rgba(190, 196, 245, 0.7)"; g.fillRect(winL - ft * 1.8, sillY, winW + ft * 3.6, 1.5);
      g.fillStyle = "rgba(8, 8, 25, 0.4)"; g.fillRect(winL - ft * 1.8, sillY + sillH, winW + ft * 3.6, 3);
      const sm = Math.max(8, winH * 0.05), sx = winL + winW * 0.1;
      g.fillStyle = "#B9BDE2";
      g.beginPath(); g.arc(sx, sillY - sm * 0.62, sm * 0.62, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(sx, sillY - sm * 1.55, sm * 0.42, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#E58AB4"; g.fillRect(sx - sm * 0.45, sillY - sm * 1.2, sm * 0.9, sm * 0.16); g.fillRect(sx + sm * 0.1, sillY - sm * 1.2, sm * 0.16, sm * 0.45);
      g.fillStyle = "#2E3350"; g.fillRect(sx - sm * 0.16, sillY - sm * 1.65, sm * 0.08, sm * 0.08); g.fillRect(sx + sm * 0.08, sillY - sm * 1.65, sm * 0.08, sm * 0.08);
      g.fillStyle = "#F2A65A"; g.beginPath(); g.moveTo(sx, sillY - sm * 1.52); g.lineTo(sx + sm * 0.28, sillY - sm * 1.47); g.lineTo(sx, sillY - sm * 1.42); g.fill();
      const px = winR - winW * 0.1, ph = Math.max(8, winH * 0.05);
      g.fillStyle = "#3C6E63";
      for (let n = 0; n < 7; n++) { const a = -Math.PI / 2 + (n - 3) * 0.36; g.beginPath(); g.ellipse(px + Math.cos(a) * ph * 0.42, sillY - ph * 0.95 + Math.sin(a) * ph * 0.42, ph * 0.16, ph * 0.42, a + Math.PI / 2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = "#C98A9E"; g.beginPath(); g.moveTo(px - ph * 0.45, sillY - ph * 0.62); g.lineTo(px + ph * 0.45, sillY - ph * 0.62); g.lineTo(px + ph * 0.34, sillY); g.lineTo(px - ph * 0.34, sillY); g.fill();
      // the fairy lights' wire, sagging between its hooks (the bulbs are lit in .dt-room-lights)
      const hooks = tall ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1], per = tall ? 6 : 7;
      const sag = winW * (tall ? 0.05 : 0.035), wireY = winT + ft * 0.15, bulbs = [];
      g.strokeStyle = "rgba(24, 22, 46, 0.95)"; g.lineWidth = 1.3; g.beginPath();
      for (let h = 0; h < hooks.length - 1; h++) {
        const x0 = winL + winW * hooks[h], x1 = winL + winW * hooks[h + 1];
        for (let n = 0; n <= 24; n++) { const t = n / 24, x = x0 + (x1 - x0) * t, y = wireY + 4 * sag * t * (1 - t); if (h || n) g.lineTo(x, y); else g.moveTo(x, y); }
        for (let n = 1; n <= per; n++) { const t = n / (per + 1); bulbs.push([x0 + (x1 - x0) * t, wireY + 4 * sag * t * (1 - t)]); }
      }
      g.stroke();
      lights.innerHTML = bulbs.map(([x, y], n) => `<i style="left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px; --c: ${DT_BULBS[n % DT_BULBS.length]}; --n: ${n}"></i>`).join("");
      lights.style.setProperty("--b", `${Math.max(4, bw * 0.015).toFixed(1)}px`);
      // the curtain rod and the curtains (sheer, the window's light through them where they cover it)
      const rodY = winT - ft * 2.4, rodL = winL - winW * 0.075, rodR = winR + winW * 0.075;
      g.fillStyle = "#9C8FC4"; g.fillRect(rodL, rodY - 2, rodR - rodL, 4);
      [rodL, rodR].forEach((x) => { g.beginPath(); g.arc(x, rodY, Math.max(4, ft * 0.5), 0, Math.PI * 2); g.fill(); });
      const curtain = (outer, inner) => {
        const top = rodY, bottom = deskBack - 2, span = inner - outer;
        const path = new Path2D();
        path.moveTo(outer, top); path.lineTo(inner, top);
        path.bezierCurveTo(inner + span * 0.12, top + (bottom - top) * 0.4, inner - span * 0.28, top + (bottom - top) * 0.72, inner - span * 0.12, bottom);
        path.lineTo(outer, bottom); path.closePath();
        const folds = g.createLinearGradient(outer, 0, inner, 0);
        for (let n = 0; n <= 8; n++) folds.addColorStop(n / 8, n % 2 ? "rgba(206, 172, 220, 0.55)" : "rgba(140, 112, 178, 0.72)");
        g.fillStyle = folds; g.fill(path);
        g.save(); g.beginPath(); g.rect(winL, winT, winW, winH); g.clip();
        g.fillStyle = "rgba(255, 228, 250, 0.16)"; g.fill(path);
        g.restore();
        g.fillStyle = "#9C8FC4";
        for (let n = 0; n <= 5; n++) { g.beginPath(); g.arc(outer + (span * n) / 5, rodY, 2.2, 0, Math.PI * 2); g.fill(); }
      };
      curtain(rodL + 4, winL + winW * 0.1);
      curtain(rodR - 4, winR - winW * 0.1);
      // the desk: lit by the window at the back, darker toward us; its front edge, its front
      const deskTop = g.createLinearGradient(0, deskBack, 0, deskFront);
      deskTop.addColorStop(0, "#7B76A8"); deskTop.addColorStop(1, "#4A4673");
      g.fillStyle = deskTop; g.fillRect(0, deskBack, vw, deskFront - deskBack);
      const pool = g.createRadialGradient(ox, deskBack, 0, ox, deskBack, winW * 0.6);
      pool.addColorStop(0, "rgba(195, 200, 250, 0.32)"); pool.addColorStop(1, "rgba(195, 200, 250, 0)");
      g.fillStyle = pool; g.fillRect(0, deskBack, vw, deskFront - deskBack);
      g.fillStyle = "rgba(8, 8, 26, 0.4)"; g.fillRect(0, deskBack, vw, 3);
      g.fillStyle = "#A7A2D0"; g.fillRect(0, deskFront, vw, 2);
      const apron = g.createLinearGradient(0, deskFront, 0, vh);
      apron.addColorStop(0, "#2D2950"); apron.addColorStop(1, "#131124");
      g.fillStyle = apron; g.fillRect(0, deskFront + 2, vw, vh - deskFront);
      // the monitor's housing, deep behind its screen as old monitors were: its right side, going back
      const bl = ox - bw / 2, br = ox + bw / 2, bt = oy - bh / 2, bb = oy + bh / 2, deep = bw * 0.11;
      const side = g.createLinearGradient(br, 0, br + deep, 0);
      side.addColorStop(0, "#6A6E9E"); side.addColorStop(1, "#4F5383");
      g.fillStyle = side;
      g.beginPath(); g.moveTo(br - 6, bt + bh * 0.05); g.lineTo(br + deep, bt + bh * 0.15); g.lineTo(br + deep * 0.92, bb - bh * 0.2); g.lineTo(br - 6, bb - bh * 0.07); g.closePath(); g.fill();
      g.strokeStyle = "rgba(180, 186, 240, 0.55)"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(br + deep, bt + bh * 0.15); g.lineTo(br + deep * 0.92, bb - bh * 0.2); g.stroke();
      g.strokeStyle = "rgba(30, 30, 66, 0.55)"; g.lineWidth = Math.max(1, bw * 0.006);
      for (let n = 0; n < 5; n++) { const x = br + deep * (0.45 + n * 0.1); g.beginPath(); g.moveTo(x, bt + bh * (0.24 + n * 0.008)); g.lineTo(x, bt + bh * (0.42 - n * 0.006)); g.stroke(); }
      void bl;
      // the monitor's shadow, cast toward us by the window behind it
      const kd = deskFront - footY;
      const shade = g.createRadialGradient(ox, footY, 0, ox, footY, bw * 0.75);
      shade.addColorStop(0, "rgba(8, 6, 26, 0.55)"); shade.addColorStop(1, "rgba(8, 6, 26, 0)");
      g.save(); g.translate(ox, footY); g.scale(1, 0.32); g.translate(-ox, -footY); g.fillStyle = shade; g.fillRect(ox - bw, footY - bw, bw * 2, bw * 2); g.restore();
      // the keyboard
      const ky0 = footY + kd * 0.14, ky1 = ky0 + kd * 0.46, kb = bw * 0.84, kf = bw * 0.98;
      g.fillStyle = "rgba(8, 6, 26, 0.4)"; g.beginPath(); g.ellipse(ox, ky1 + kd * 0.04, kf * 0.53, kd * 0.07, 0, 0, Math.PI * 2); g.fill();
      const kbody = g.createLinearGradient(0, ky0, 0, ky1);
      kbody.addColorStop(0, "#A9ACD6"); kbody.addColorStop(1, "#8184B4");
      g.fillStyle = kbody; g.beginPath(); g.moveTo(ox - kb / 2, ky0); g.lineTo(ox + kb / 2, ky0); g.lineTo(ox + kf / 2, ky1); g.lineTo(ox - kf / 2, ky1); g.closePath(); g.fill();
      g.fillStyle = "#565989"; g.beginPath(); g.moveTo(ox - kf / 2, ky1); g.lineTo(ox + kf / 2, ky1); g.lineTo(ox + kf / 2 - 2, ky1 + kd * 0.05); g.lineTo(ox - kf / 2 + 2, ky1 + kd * 0.05); g.closePath(); g.fill();
      const row = (t0, t1, keys) => {
        const y0 = ky0 + (ky1 - ky0) * t0, y1 = ky0 + (ky1 - ky0) * t1, w0 = kb + (kf - kb) * t0, w1 = kb + (kf - kb) * t1;
        keys.forEach(([u0, u1]) => {
          const a = [ox - w0 / 2 + w0 * (0.04 + u0 * 0.92), y0], b = [ox - w0 / 2 + w0 * (0.04 + u1 * 0.92), y0];
          const c = [ox - w1 / 2 + w1 * (0.04 + u1 * 0.92), y1], d = [ox - w1 / 2 + w1 * (0.04 + u0 * 0.92), y1];
          g.fillStyle = "#CDD0EE"; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath(); g.fill();
          g.fillStyle = "rgba(60, 62, 110, 0.55)"; g.fillRect(d[0], d[1] - 1, c[0] - d[0], 1.2);
        });
      };
      const even = (count) => Array.from({ length: count }, (_, n) => [n / count + 0.008, (n + 1) / count - 0.008]);
      for (let r = 0; r < 4; r++) row(0.1 + r * 0.17, 0.23 + r * 0.17, even(14 - (r % 2)));
      row(0.78, 0.92, [[0, 0.12], [0.13, 0.23], [0.24, 0.76], [0.77, 0.87], [0.88, 1]]);
      g.strokeStyle = "rgba(30, 28, 60, 0.8)"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(ox + kb * 0.3, ky0); g.bezierCurveTo(ox + kb * 0.32, ky0 - kd * 0.08, ox + bw * 0.12, footY, ox + bw * 0.1, footY - bw * 0.03); g.stroke();
      // the mouse on its pad (a heart on it)
      const mpx = Math.min(vw - bw * 0.22, ox + bw * 0.76), mpy = ky0 + (ky1 - ky0) * 0.55, prx = bw * 0.17, pry = kd * 0.2;
      g.fillStyle = "rgba(226, 130, 178, 0.8)"; g.beginPath(); g.ellipse(mpx, mpy, prx, pry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255, 220, 236, 0.75)"; const hx = mpx - prx * 0.45, hy = mpy + pry * 0.1, hs = prx * 0.12;
      g.beginPath(); g.moveTo(hx, hy + hs * 0.9); g.bezierCurveTo(hx - hs * 1.4, hy - hs * 0.2, hx - hs * 0.5, hy - hs * 1.2, hx, hy - hs * 0.35); g.bezierCurveTo(hx + hs * 0.5, hy - hs * 1.2, hx + hs * 1.4, hy - hs * 0.2, hx, hy + hs * 0.9); g.fill();
      g.strokeStyle = "rgba(30, 28, 60, 0.8)"; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(mpx + prx * 0.12, mpy - pry * 0.5); g.bezierCurveTo(mpx + prx * 0.1, mpy - pry * 1.6, mpx - prx * 0.4, footY - kd * 0.05, ox + bw * 0.2, footY - bw * 0.02); g.stroke();
      g.fillStyle = "#C3C6E8"; g.beginPath(); g.ellipse(mpx + prx * 0.12, mpy - pry * 0.08, prx * 0.2, pry * 0.42, -0.15, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(90, 94, 140, 0.8)"; g.lineWidth = 1; g.beginPath(); g.moveTo(mpx + prx * 0.1, mpy - pry * 0.48); g.lineTo(mpx + prx * 0.12, mpy - pry * 0.12); g.stroke();
      // the mug (Brew Houze's), still steaming
      const mugX = Math.max(bw * 0.3, ox - bw * 0.8), mh = bh * 0.21, mwid = mh * 0.82, mugB = ky1 - kd * 0.02, ery = mwid * 0.16;
      g.fillStyle = "rgba(8, 6, 26, 0.45)"; g.beginPath(); g.ellipse(mugX + mwid * 0.08, mugB + ery * 0.4, mwid * 0.62, ery * 1.4, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#9A9EC8"; g.lineWidth = mwid * 0.13;
      g.beginPath(); g.ellipse(mugX + mwid * 0.5, mugB - mh * 0.52, mwid * 0.22, mh * 0.24, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
      const mug = g.createLinearGradient(mugX - mwid / 2, 0, mugX + mwid / 2, 0);
      mug.addColorStop(0, "#9296C2"); mug.addColorStop(0.32, "#DCDEF3"); mug.addColorStop(1, "#7F83B2");
      g.fillStyle = mug;
      g.beginPath(); g.moveTo(mugX - mwid / 2, mugB - mh); g.lineTo(mugX - mwid / 2, mugB); g.ellipse(mugX, mugB, mwid / 2, ery, 0, Math.PI, 0, true); g.lineTo(mugX + mwid / 2, mugB - mh); g.closePath(); g.fill();
      g.fillStyle = "#E9EAF8"; g.beginPath(); g.ellipse(mugX, mugB - mh, mwid / 2, ery, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#3A2418"; g.beginPath(); g.ellipse(mugX, mugB - mh + ery * 0.15, mwid * 0.42, ery * 0.68, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255, 220, 190, 0.25)"; g.beginPath(); g.ellipse(mugX - mwid * 0.12, mugB - mh, mwid * 0.14, ery * 0.25, 0, 0, Math.PI * 2); g.fill();
      const lr = mwid * 0.17, lx = mugX - mwid * 0.06, ly = mugB - mh * 0.46;
      g.fillStyle = "#7A4A2A"; g.beginPath(); g.arc(lx, ly, lr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(242, 230, 216, 0.85)"; g.lineWidth = Math.max(0.8, lr * 0.12); g.beginPath(); g.arc(lx, ly, lr * 0.8, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#F2E6D8"; g.beginPath(); g.moveTo(lx, ly - lr * 0.45); g.lineTo(lx + lr * 0.42, ly - lr * 0.05); g.lineTo(lx + lr * 0.3, ly - lr * 0.05); g.lineTo(lx + lr * 0.3, ly + lr * 0.4); g.lineTo(lx - lr * 0.3, ly + lr * 0.4); g.lineTo(lx - lr * 0.3, ly - lr * 0.05); g.lineTo(lx - lr * 0.42, ly - lr * 0.05); g.closePath(); g.fill();
      Object.assign(steam.style, { left: `${mugX}px`, top: `${mugB - mh - ery}px` });
      steam.style.setProperty("--sw", `${mwid.toFixed(1)}px`);
      // the desk calendar, on Monday 19 December 2022
      const calX = Math.min(vw - bw * 0.16, ox + bw * 0.68), calB = footY - bw * 0.01, ch = bh * 0.22, cw = ch * 1.05, calT = calB - ch;
      g.fillStyle = "rgba(8, 6, 26, 0.45)"; g.beginPath(); g.ellipse(calX + cw * 0.06, calB + 1, cw * 0.6, ch * 0.08, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#C9CCE8"; g.beginPath(); g.moveTo(calX - cw * 0.47, calT); g.lineTo(calX + cw * 0.47, calT); g.lineTo(calX + cw / 2, calB); g.lineTo(calX - cw / 2, calB); g.closePath(); g.fill();
      g.fillStyle = "#D97FAA"; g.beginPath(); g.moveTo(calX - cw * 0.47, calT); g.lineTo(calX + cw * 0.47, calT); g.lineTo(calX + cw * 0.475, calT + ch * 0.28); g.lineTo(calX - cw * 0.475, calT + ch * 0.28); g.closePath(); g.fill();
      g.fillStyle = "#2E3350"; for (let n = 0; n < 6; n++) { g.beginPath(); g.arc(calX - cw * 0.35 + n * cw * 0.14, calT, Math.max(1.2, cw * 0.025), 0, Math.PI * 2); g.fill(); }
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#FFFFFF"; g.font = `700 ${(ch * 0.17).toFixed(1)}px Tahoma, Verdana, sans-serif`; g.fillText("DEC", calX, calT + ch * 0.15);
      g.fillStyle = "#2E3350"; g.font = `${(ch * 0.5).toFixed(1)}px Anton, Impact, sans-serif`; g.fillText("19", calX, calT + ch * 0.6);
      g.fillStyle = "#6F79CF"; g.font = `700 ${(ch * 0.1).toFixed(1)}px Tahoma, Verdana, sans-serif`; g.fillText("MON · 2022", calX, calT + ch * 0.89);
      // the room in the dark at the edges
      const dim = g.createRadialGradient(ox, vh * 0.45, Math.min(vw, vh) * 0.35, ox, vh * 0.45, Math.max(vw, vh) * 0.8);
      dim.addColorStop(0, "rgba(5, 5, 18, 0)"); dim.addColorStop(1, "rgba(5, 5, 18, 0.5)");
      g.fillStyle = dim; g.fillRect(0, 0, vw, vh);
      // where the screen's light will fall when it comes on
      glow.style.setProperty("--gx", `${ox.toFixed(1)}px`); glow.style.setProperty("--gy", `${oy.toFixed(1)}px`);
      glow.style.setProperty("--gd", `${((ky0 + ky1) / 2).toFixed(1)}px`); glow.style.setProperty("--gr", `${bw.toFixed(1)}px`);
    };
    let queued = 0;
    const onResize = () => {
      if (!box.isConnected) { window.removeEventListener("resize", onResize); return; }
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(paint);
    };
    return () => {
      paint();
      window.addEventListener("resize", onResize);
      // the calendar's numbers are in Anton: again once it has loaded
      document.fonts?.load("40px Anton").then(() => { if (box.isConnected) paint(); }, () => undefined);
    };
  };
  const dittoIntro = {
    end: DT_MS(17),
    video: { wide: "tape.mp4", tall: "tape.mp4" },
    cues: [
      [0, "dark"], [DT_MS(1, 3, 2), "power"], [DT_MS(2), "desktop"], [DT_MS(3), "ask"], [DT_MS(3, 2), "open"],
      ...[0, 1, 2, 3, 4].map((k) => [Math.round(DT_MS(4) + k * 1.5 * DT_BEAT * 1000), "win", k]),
      [DT_MS(5, 3, 2), "player"], [DT_MS(9), "beat"], [DT_MS(13), "tile"], [DT_MS(15), "us"], [DT_MS(16), "hit"],
    ],
    hits: new Set(["power", "open", "win", "player", "tile", "us", "hit"]),
    mount(box, photos, flashes, film) {
      const keys = GROUPS.newjeans.order;
      const sticker = (n) => siteUrl(`ditto/sticker-${n}.webp`);
      box.innerHTML = `
        <div class="dt-room">
          <div class="dt-room-out"><canvas class="dt-room-sky"></canvas>${Array.from({ length: SCENE_LITE ? 36 : 56 }, (_, n) => `<i style="--x: ${(n * 37 + 11) % 100}; --d: ${(n * 13) % 10}; --s: ${(0.35 + ((n * 7) % 7) / 9).toFixed(2)}; --w: ${(n * 5) % 7 - 3}"></i>`).join("")}</div>
          <canvas class="dt-room-paint"></canvas>
          <div class="dt-room-lights"></div>
          <div class="dt-room-steam"><i style="--n: 0"></i><i style="--n: 1"></i><i style="--n: 2"></i></div>
          <i class="dt-room-dim"></i><i class="dt-room-glow"></i>
        </div>
        <div class="dt-snow">${Array.from({ length: 46 }, (_, n) => `<i style="--x: ${(n * 37 + 5) % 100}; --d: ${(n * 13) % 10}; --s: ${0.5 + ((n * 7) % 6) / 6}; --w: ${(n * 11) % 7 - 3}"></i>`).join("")}</div>
        <div class="dt-crt">
          <div class="dt-bezel">
            <div class="dt-screen">
              <div class="dt-desk">
                <i class="dt-cloud is-1"></i><i class="dt-cloud is-2"></i><i class="dt-cloud is-3"></i>
                <div class="dt-icons">
                  <span class="dt-icon is-folder"><i></i><b>ditto (2022)</b></span>
                  <span class="dt-icon is-pics"><i></i><b>photos</b></span>
                  <span class="dt-icon is-avi"><i></i><b>ditto.avi</b></span>
                </div>
                <div class="dt-dialog"><p class="dt-bar"><span>ditto (2022)</span><b>×</b></p>
                  <div class="dt-dialog-body"><i class="dt-dialog-icon">i</i><p>This folder hasn’t been opened since <b>12/19/2022</b>.<br />Open it anyway?</p></div>
                  <p class="dt-dialog-buttons"><span class="dt-btn is-open">Open</span><span class="dt-btn">Not now</span></p></div>
                <div class="dt-wins">${keys.map((key, k) => `<div class="dt-win" style="--k: ${k}"><p class="dt-bar"><span>${key}.jpg</span><b>_ □ ×</b></p><div class="dt-win-body"></div><img class="dt-win-sticker" src="${sticker(DT_STICKERS[k])}" alt="" draggable="false" /></div>`).join("")}</div>
                <div class="dt-player"><p class="dt-bar"><span>ditto.avi · Media Player</span><b>_ □ ×</b></p><div class="dt-player-body"></div>
                  <p class="dt-player-controls"><span class="dt-play">▶</span><span class="dt-seek"><i></i></span><span class="dt-time">00:00 / 00:43</span></p></div>
                <div class="dt-paws">${Array.from({ length: 16 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</div>
                <p class="dt-caption">all five · winter 2022</p>
                <div class="dt-us"><p class="dt-bar"><span>us.png</span><b>×</b></p><img src="${siteUrl("ditto/all-together.webp")}" alt="" draggable="false" /></div>
                <div class="dt-cursor"></div>
                <p class="dt-task"><span class="dt-start">♡ start</span><span class="dt-tray">12:19 AM</span></p>
              </div>
              <i class="dt-scan"></i><i class="dt-glare"></i><i class="dt-power"></i>
            </div>
            <span class="dt-led"></span>
          </div>
          <div class="dt-stand"><i class="dt-neck"></i><i class="dt-foot"></i></div>
        </div>
        <div class="dt-logo"></div>
        <div class="dt-burst">${Array.from({ length: 14 }, (_, n) => `<img src="${sticker([14, 19, 11, 18, 21, 13, 12][n % 7])}" alt="" draggable="false" style="--a: ${n * 25.7}deg; --r: ${32 + ((n * 17) % 22)}vmax; --s: ${0.5 + ((n * 5) % 5) / 8}" />`).join("")}</div>`;
      // Her photo in her window; the footage in the player.
      box.querySelectorAll(".dt-win-body").forEach((body, k) => { if (photos[k]) body.append(photos[k]); });
      const player = box.querySelector(".dt-player-body");
      if (film) player.append(film);
      const seek = box.querySelector(".dt-seek i");
      const time = box.querySelector(".dt-time");
      const paws = [...box.querySelectorAll(".dt-paws i")];
      const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
      let opened = -1;
      let playing = false;
      let furnished = false;
      const furnish = dittoRoom(box);
      const show = (step) => {
        const [, scene, value] = this.cues[step];
        if (scene === "win") opened = value;
        // is-<scene>: the step now; has-<scene>: every step reached so far (what stays on screen).
        const reached = new Set(this.cues.slice(0, step + 1).map(([, name]) => name));
        box.className = ["dt-intro", `is-${scene}`, ...[...reached].map((name) => `has-${name}`)].join(" ");
        box.querySelectorAll(".dt-win").forEach((win, k) => win.classList.toggle("is-open", k <= opened));
        if (!furnished) { furnished = true; furnish(); }
        if (scene === "player" && film && !playing) {
          playing = true;
          try { film.currentTime = 11.5; } catch { /* not loaded yet: from the start */ }
          void film.play().catch(() => undefined);
        }
        if (this.hits.has(scene)) { void box.offsetWidth; box.classList.add("is-hit"); }
      };
      show.tick = (now) => {
        // A paw print a beat while the drums play (bars 9-12), each fading a few beats later.
        const step = Math.floor((now - DT_MS(9)) / (DT_BEAT * 1000));
        paws.forEach((paw, n) => {
          paw.classList.toggle("is-on", step >= n && step < 16 + 4);
          paw.classList.toggle("is-old", step >= n + 5);
        });
        if (playing && film) {
          const at = film.currentTime || 0;
          seek.style.width = `${Math.min(100, (at / (film.duration || 44)) * 100).toFixed(1)}%`;
          time.textContent = `${clock(at)} / ${clock(film.duration || 44)}`;
        }
      };
      return show;
    },
  };

  // Ditto's bridge (track 2, seconds into it; 1.791 s a bar):
  //   ditto (0)      bars 1-4, "say it ditto": on each of the two big hits (0 and 3.58 s) a window
  //   ditto2 (3.58)  streaks across the screen leaving a trail of copies of itself, as a dragged
  //                  window does on a frozen old desktop: the same, again and again
  //   globe (7.16)   bars 5-8, Danielle's bridge: the page goes quiet as a winter night and a snow
  //                  globe rises with her in it, a moment kept as it was. Her five lines come one by
  //                  one under it (and only her words fill the page); on the a cappella bar the snow
  //                  in the globe settles; on "기다렸지 all this time" the globe glows
  //   amp (14.33)    bars 9-12, Hyein: DITTO AMP, the old music player, opens (its equalizer and
  //                  playlist docking under it on the next beats, a button in the taskbar), its
  //                  spectrum dancing to the song itself (to a made-up music with the sound off),
  //                  turning into an oscilloscope on each "ooh-whoa"; minimized as her part ends
  //   heart (21.49)  bars 13-15, Haerin's "Ra-ta-ta-ta 울린 심장": a jelly heart squashes and springs
  //                  back on every "ta" (the accents on sixteenths 5, 13 and 15 of each bar), heart
  //                  ripples going out and the page's windows wobbling like jelly after them
  //   pause (25.97)  "But I don't want to": the page pauses like a tape, ❚❚ and a tracking band (the
  //                  heart and the wobbling frozen mid-squash)
  //   play (26.87)   bar 16's hit: ▶, the heart bursts into small hearts, a bloom of light, into the
  //                  chorus
  const DT_BRIDGE = 64 * DT_BEAT; // where track 2 starts in the loop
  // Danielle's lines and when each comes (beats into her part, which starts at 7.16 s).
  const DT_DANIELLE = [[0, "Not just anybody"], [2, "너를 상상했지"], [4, "항상 닿아있던"], [8, "처음 느낌 그대로 난"], [12, "기다렸지 all this time"]]
    .map(([beat, text]) => [7.164 + beat * DT_BEAT, text]);
  const DT_RATATA = new Set([4, 12, 14]);
  // The bridge's lines, for the page's text.
  const DT_LINES = ["Oh say it ditto", "I want you so, want you", "So say it ditto", ...DT_DANIELLE.map(([, text]) => text),
    "I got nothing to lose", "널 좋아한다고 wooah wooah wooah", "Ra-ta-ta-ta 울린 심장", "But I don’t want to", "Say it back"];
  // ── Ditto's desktop: the page is the computer the intro switched on ──
  // A taskbar along the bottom: the start menu (the four apps, the photos, the playlist, shut down),
  // a button for each of the page's windows (pressed in for the one in view), the tray with the sound
  // and a clock that stopped at 12:19 (click it: December 2022). Snow falls behind the windows,
  // gusting on the chorus's kicks (beat(), from the stage). On a wide screen the desktop's icons sit
  // down the left: ditto (2022), photos, ditto.avi (a little player, the camcorder tape), 휴지통.
  const dittoDesk = (() => {
    let layer = null, snowFrame = 0, observer = null, gust = 0, soundHome = null, unhook = [];
    const TASKS = [["Staff apps", "staff_apps"], ["Customers", "customer_screens"], ["Printables", "printables"], ["Devices", "devices"], ["Tips", "quick_tips.txt"]];
    const APPS = [["Admin Portal", "#staff-grid", 0, "is-amber"], ["Staff Portal", "#staff-grid", 1, ""], ["Mobile Menu", "#customer-grid", 0, "is-teal"], ["Queue Screen", "#customer-grid", 1, "is-purple"]];
    const ICONS = [["folder", "ditto (2022)"], ["pics", "photos"], ["avi", "ditto.avi"], ["bin", "휴지통"]];
    // December 2022: it began on a Thursday; the 19th was a Monday.
    const month = () => {
      const cells = [...Array(4).fill(""), ...Array.from({ length: 31 }, (_, i) => String(i + 1))];
      return ["S", "M", "T", "W", "T", "F", "S"].map((d) => `<b>${d}</b>`).join("") + cells.map((d) => `<span${d === "19" ? ' class="is-today"' : ""}>${d}</span>`).join("");
    };
    const markup = () => `
      <canvas class="dt-snowfall" aria-hidden="true"></canvas>
      <div class="dt-icons-desk" role="group" aria-label="Desktop">${ICONS.map(([kind, label]) => `<button type="button" class="dt-desk-icon is-${kind}" data-icon="${kind}"><i aria-hidden="true"></i><b>${label}</b></button>`).join("")}</div>
      <div class="dt-startmenu" id="dt-startmenu" role="menu" aria-label="Start" hidden>
        <div class="dt-startmenu-side" aria-hidden="true"><b>Ditto</b><span>2022</span></div>
        <ul>
          ${APPS.map(([name], i) => `<li><a role="menuitem" class="dt-app" data-app="${i}" target="_blank" rel="noopener"><i class="dt-ico ${APPS[i][3]}" aria-hidden="true"></i>${name}</a></li>`).join("")}
          <li class="dt-sep" role="separator"></li>
          <li><button type="button" role="menuitem" data-act="photos"><i class="dt-ico is-pics" aria-hidden="true"></i>Photos (5)</button></li>
          <li><button type="button" role="menuitem" data-act="playlist"><i class="dt-ico is-cd" aria-hidden="true"></i>Playlist…</button></li>
          <li class="dt-sep" role="separator"></li>
          <li><button type="button" role="menuitem" data-act="shutdown"><i class="dt-ico is-power" aria-hidden="true"></i>Shut down…</button></li>
        </ul>
      </div>
      <div class="dt-cal" id="dt-cal" role="dialog" aria-label="Date and time" hidden>
        <p class="dt-bar"><span>Date/Time Properties</span><button type="button" class="dt-x" aria-label="Close">×</button></p>
        <div class="dt-cal-body"><p class="dt-cal-month">December 2022</p><div class="dt-cal-grid">${month()}</div><p class="dt-cal-note">12:19 AM · Seoul<br />The clock hasn’t moved since.</p></div>
      </div>
      <div class="dt-avi" id="dt-avi" hidden>
        <p class="dt-bar"><span>ditto.avi · Media Player</span><button type="button" class="dt-x" aria-label="Close the player">×</button></p>
        <video muted playsinline loop preload="none"></video>
        <div class="dt-avi-seek"><i></i></div>
        <p class="dt-avi-buttons"><button type="button" data-play aria-label="Play or pause">❚❚</button><button type="button" data-stop aria-label="Stop">■</button><span class="dt-avi-time">00:00</span></p>
      </div>
      <nav class="dt-taskbar" aria-label="Ditto desktop">
        <button type="button" class="dt-startbtn" aria-haspopup="menu" aria-expanded="false" aria-controls="dt-startmenu"><i aria-hidden="true">♥</i><span>start</span></button>
        <div class="dt-tbtns">${TASKS.map(([label], i) => `<button type="button" class="dt-tbtn" data-task="${i}"><i aria-hidden="true"></i><span>${label}</span></button>`).join("")}</div>
        <div class="dt-systray"><button type="button" class="dt-systray-clock" aria-label="12:19 AM, December 19, 2022" aria-controls="dt-cal">12<span>:</span>19 AM</button></div>
      </nav>`;
    const seededDesk = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Snow: soft flakes behind the windows (nearer ones bigger, faster), the odd sparkle; a gust on a kick.
    const startSnow = (canvas) => {
      const g = canvas.getContext("2d");
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 32;
      const sg = sprite.getContext("2d"), grad = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, "rgba(255, 255, 255, 1)"); grad.addColorStop(0.45, "rgba(255, 255, 255, 0.85)"); grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      sg.fillStyle = grad; sg.fillRect(0, 0, 32, 32);
      const rnd = seededDesk(1219);
      const flakes = Array.from({ length: SCENE_LITE ? 46 : 96 }, (_, i) => ({ x: rnd(), y: rnd(), z: 0.25 + rnd() * 0.75, sway: rnd() * 6.28, spark: i % 19 === 0 }));
      let last = performance.now(), wind = 0;
      const draw = (now, dt) => {
        const w = window.innerWidth, h = window.innerHeight, r = SCENE_LITE ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
        if (canvas.width !== Math.round(w * r) || canvas.height !== Math.round(h * r)) { canvas.width = Math.round(w * r); canvas.height = Math.round(h * r); }
        wind += (gust * 90 - wind) * Math.min(1, dt * 2.5);
        g.setTransform(r, 0, 0, r, 0, 0);
        g.clearRect(0, 0, w, h);
        for (const f of flakes) {
          f.y += dt * (0.025 + f.z * 0.06) * (1 + gust * 0.9);
          f.x += dt * ((wind * f.z) / w + Math.sin(now / 1300 + f.sway) * 0.006 * f.z);
          if (f.y > 1.04) { f.y = -0.04; f.x = rnd(); }
          if (f.x > 1.04) f.x -= 1.08; else if (f.x < -0.04) f.x += 1.08;
          const size = 1 + f.z * 3.4, x = f.x * w, y = f.y * h;
          g.globalAlpha = 0.3 + f.z * 0.6;
          if (f.spark) {
            const s = size * 2.6 * (0.7 + 0.3 * Math.sin(now / 300 + f.sway));
            g.fillStyle = "#FFFFFF";
            g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill();
          } else g.drawImage(sprite, x - size, y - size, size * 2, size * 2);
        }
        g.globalAlpha = 1;
      };
      if (!motionOK()) { draw(performance.now(), 0); return; }
      const loop = (now) => {
        snowFrame = requestAnimationFrame(loop);
        if (document.hidden) { last = now; return; }
        draw(now, Math.min(0.05, (now - last) / 1000));
        last = now;
      };
      snowFrame = requestAnimationFrame(loop);
    };
    const on = (target, type, handler, opts) => { target.addEventListener(type, handler, opts); unhook.push(() => target.removeEventListener(type, handler, opts)); };
    // "Shut down…": the old goodbye screen, in pastels, then back to the café.
    const shutDown = () => {
      const bye = document.createElement("div");
      bye.className = "dt-bye";
      bye.innerHTML = `<i class="dt-bye-bunny" aria-hidden="true"></i><p>It’s now safe to turn off<br />your computer.</p><small>See you next winter ❄</small>`;
      document.body.append(bye);
      window.setTimeout(() => { void switchTo(null); }, 1900);
      window.setTimeout(() => bye.remove(), 2600);
    };
    return {
      mount() {
        if (layer) return;
        layer = document.createElement("div");
        layer.className = "dt-desktop";
        layer.innerHTML = markup();
        document.body.append(layer);
        startSnow(layer.querySelector(".dt-snowfall"));
        // the sound button lives in the tray while the desktop is up
        const sound = document.getElementById("ae-sound");
        if (sound) { soundHome = sound.parentElement; layer.querySelector(".dt-systray").prepend(sound); }
        const start = layer.querySelector(".dt-startbtn"), menu = layer.querySelector(".dt-startmenu");
        const cal = layer.querySelector(".dt-cal"), clock = layer.querySelector(".dt-systray-clock");
        const player = layer.querySelector(".dt-avi"), video = player.querySelector("video");
        const openMenu = (open) => { menu.hidden = !open; start.setAttribute("aria-expanded", String(open)); if (open) { cal.hidden = true; menu.querySelector("a, button")?.focus({ preventScroll: true }); } };
        on(start, "click", (event) => { event.stopPropagation(); openMenu(menu.hidden); });
        // the four apps: their links, from the page's own cards
        menu.querySelectorAll(".dt-app").forEach((link) => {
          const [, grid, index] = APPS[Number(link.dataset.app)];
          const href = document.querySelectorAll(`${grid} .card a.btn.is-primary`)[index]?.getAttribute("href");
          if (href && href !== "#") link.href = href; else { link.setAttribute("aria-disabled", "true"); link.removeAttribute("href"); }
        });
        on(menu, "click", (event) => {
          const act = event.target.closest("[data-act]")?.dataset.act;
          if (event.target.closest(".dt-app") || act) openMenu(false);
          if (act === "photos") openMember("minji", start);
          if (act === "playlist") openPicker();
          if (act === "shutdown") shutDown();
        });
        on(clock, "click", (event) => { event.stopPropagation(); cal.hidden = !cal.hidden; if (!cal.hidden) openMenu(false); });
        on(document, "click", (event) => {
          if (!menu.hidden && !menu.contains(event.target)) openMenu(false);
          if (!cal.hidden && !cal.contains(event.target)) cal.hidden = true;
        });
        on(document, "keydown", (event) => { if (event.key === "Escape") { if (!menu.hidden) { openMenu(false); start.focus(); } cal.hidden = true; } });
        layer.querySelectorAll(".dt-x").forEach((x) => on(x, "click", () => { const win = x.closest(".dt-cal, .dt-avi"); win.hidden = true; if (win === player) video.pause(); }));
        // a button for each of the page's windows: there on a click, pressed in while in view
        const sections = [...document.querySelectorAll("main .section")];
        const tasks = [...layer.querySelectorAll(".dt-tbtn")];
        tasks.forEach((task, i) => on(task, "click", () => {
          const section = sections[i];
          if (!section) return;
          section.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "start" });
          section.classList.remove("is-focus"); void section.offsetWidth; section.classList.add("is-focus");
        }));
        observer = new IntersectionObserver((entries) => {
          const seen = new Map(entries.map((entry) => [entry.target, entry.intersectionRatio]));
          let best = -1, most = 0;
          sections.forEach((section, i) => { const ratio = seen.get(section) ?? Number(section.dataset.dtSeen || 0); section.dataset.dtSeen = String(ratio); if (ratio > most) { most = ratio; best = i; } });
          tasks.forEach((task, i) => task.classList.toggle("is-on", i === best));
        }, { threshold: [0, 0.15, 0.35, 0.6, 0.85] });
        sections.forEach((section) => observer.observe(section));
            // the icons: a click picks one, a double click (or a second click, or Enter) opens it
        const icons = [...layer.querySelectorAll(".dt-desk-icon")];
        const openIcon = (kind) => {
          if (kind === "folder") { toast("This folder hasn’t been opened since 12/19/2022."); document.getElementById("ae-lineup")?.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "center" }); }
          if (kind === "pics") openMember(["minji", "hanni", "danielle", "haerin", "hyein"][Math.floor(Math.random() * 5)]);
          if (kind === "avi") { player.hidden = false; if (!video.src) video.src = siteUrl("ditto/tape.mp4"); void video.play().catch(() => undefined); }
          if (kind === "bin") { const bin = layer.querySelector(".dt-desk-icon.is-bin"); bin.classList.remove("is-shake"); void bin.offsetWidth; bin.classList.add("is-shake"); toast("휴지통 is empty. Nothing from 2022 was thrown away ♡"); }
        };
        icons.forEach((icon) => {
          on(icon, "click", (event) => {
            if (icon.classList.contains("is-picked") && event.detail < 2) { openIcon(icon.dataset.icon); return; }
            icons.forEach((other) => other.classList.toggle("is-picked", other === icon));
          });
          on(icon, "dblclick", () => openIcon(icon.dataset.icon));
          on(icon, "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); openIcon(icon.dataset.icon); } });
        });
        // the little player: play / pause, stop, the seek bar, dragged by its title bar
        const playBtn = player.querySelector("[data-play]"), seek = player.querySelector(".dt-avi-seek i"), stamp = player.querySelector(".dt-avi-time");
        on(playBtn, "click", () => { if (video.paused) void video.play().catch(() => undefined); else video.pause(); });
        on(player.querySelector("[data-stop]"), "click", () => { video.pause(); video.currentTime = 0; });
        on(video, "play", () => { playBtn.textContent = "❚❚"; });
        on(video, "pause", () => { playBtn.textContent = "▶"; });
        on(video, "timeupdate", () => {
          seek.style.width = `${video.duration ? (video.currentTime / video.duration) * 100 : 0}%`;
          const s = Math.floor(video.currentTime);
          stamp.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
        });
        let drag = null;
        on(player.querySelector(".dt-bar"), "pointerdown", (event) => {
          if (event.target.closest(".dt-x")) return;
          const box = player.getBoundingClientRect();
          drag = [event.clientX - box.left, event.clientY - box.top];
          player.setPointerCapture?.(event.pointerId);
        });
        on(player, "pointermove", (event) => {
          if (!drag) return;
          player.style.left = `${Math.max(0, Math.min(window.innerWidth - player.offsetWidth, event.clientX - drag[0]))}px`;
          player.style.top = `${Math.max(0, Math.min(window.innerHeight - player.offsetHeight - 44, event.clientY - drag[1]))}px`;
          player.style.right = "auto"; player.style.bottom = "auto";
        });
        on(player, "pointerup", () => { drag = null; });
      },
      unmount() {
        if (!layer) return;
        cancelAnimationFrame(snowFrame);
        observer?.disconnect();
        unhook.forEach((undo) => undo());
        unhook = [];
        const sound = document.getElementById("ae-sound");
        if (sound && soundHome) soundHome.append(sound);
        document.querySelectorAll("main .section").forEach((section) => { section.classList.remove("is-focus"); delete section.dataset.dtSeen; });
        layer.remove();
        layer = null;
      },
      beat(level) { gust = level; },
      // A window of the bridge's (the amp) gets a button in the taskbar while it is open.
      task(id, label, open) {
        if (!layer) return;
        const row = layer.querySelector(".dt-tbtns");
        row.querySelector(`[data-temp="${id}"]`)?.remove();
        if (open) row.insertAdjacentHTML("beforeend", `<span class="dt-tbtn is-on is-temp is-${id}" data-temp="${id}" aria-hidden="true"><i></i><span>${label}</span></span>`);
      },
    };
  })();

  const dittoStage = (() => {
    let fx = null, lines = [], pops = [], amp = null, time = null, plTime = null, vis = null, curve = null, bands = [], seek = null, jelly = null;
    let last16 = -1, lastTa = -1, pop = 0, lastFocus = -1, lastKick = -1;
    let ampOpen = false, lastNow = 0, beats = [], wobbles = [], drawnAt = -1;
    // The amp's spectrum: twenty bars, from the bass up (FFT bins of 43 Hz; 43 Hz to 16 kHz, spread
    // out evenly in pitch), each falling back slowly, a peak cap held a moment above it.
    const N = 20;
    const EDGES = [1];
    for (let n = 1; n <= N; n++) EDGES.push(Math.max(EDGES[n - 1] + 1, Math.round((40 * 400 ** (n / N)) / 43.07)));
    const freq = new Uint8Array(512), wave = new Uint8Array(1024);
    const shown = new Array(N).fill(0), peaks = new Array(N).fill(0), held = new Array(N).fill(0), eq = new Array(11).fill(0.5);
    // On each "ooh-whoa" (where the MV's plane loops and rolls), beats into Hyein's part: the oscilloscope.
    const WHOA = [[6, 1.6], [10, 1.2], [13, 1.5]];
    // The chorus (track 1) on the page: its kicks (none in bars 7 and 15, one more in bar 6) glow
    // through the page and gust the snow; the five photo windows take the focus in turn, a bar each.
    const chorusBeat = (at, name) => {
      let kick = 0, focus = -1;
      if (at >= 0 && at < DT_BRIDGE && name === "calm") {
        const six = at / (DT_BEAT / 4), bar = Math.floor(six / 16), inBar = six - bar * 16;
        if (bar !== 6 && bar !== 14) {
          const k = [...DT_KICKS, ...(bar === 5 ? [12] : [])].sort((a, b) => a - b).filter((n) => n <= inBar).pop();
          if (k !== undefined) kick = Math.exp(-(inBar - k) * (DT_BEAT / 4) * 6);
        }
        focus = bar % 5;
      }
      if (focus !== lastFocus) { lastFocus = focus; document.querySelectorAll(".ae-member").forEach((el, i) => el.classList.toggle("is-focus", i === focus)); }
      const rounded = Math.round(kick * 40) / 40;
      if (rounded !== lastKick) { lastKick = rounded; document.documentElement.style.setProperty("--dt-kick", String(rounded)); }
      dittoDesk.beat(kick);
    };
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    // The amp's display: the spectrum bars (mint up to pink, by height, as on the old amps), each with
    // its peak cap; or the oscilloscope, the song's wave as a glowing line.
    const paintVis = (scope, live, a) => {
      const g = vis.getContext("2d"), W = vis.width, H = vis.height;
      g.clearRect(0, 0, W, H);
      if (scope) {
        // (the song's wave turned up to fill the display, as the old scopes did)
        let boost = 1.6;
        if (live) { let peak = 1; for (let n = 0; n < 1024; n += 4) peak = Math.max(peak, Math.abs(wave[n] - 128)); boost = Math.min(5, 108 / peak); }
        g.strokeStyle = "#B8FFD8"; g.lineWidth = 3; g.lineJoin = "round"; g.shadowColor = "#7CF0B4"; g.shadowBlur = 8;
        g.beginPath();
        for (let x = 0; x <= W; x += 3) {
          const v = live ? (wave[Math.floor((x / W) * 1023)] - 128) / 128 : (Math.sin(x * 0.07 + a * 17) * 0.55 + Math.sin(x * 0.23 - a * 9) * 0.22) * (0.4 + shown[Math.floor((x / W) * (N - 1))] * 0.6);
          const y = H / 2 + Math.max(-1, Math.min(1, v * boost)) * H * 0.44;
          if (x) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
        g.shadowBlur = 0;
        return;
      }
      const grad = g.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, "#7CF0B4"); grad.addColorStop(0.5, "#F5E59D"); grad.addColorStop(0.8, "#F7A8C8"); grad.addColorStop(1, "#F07AAE");
      const bw = W / N;
      for (let n = 0; n < N; n++) {
        const bh = Math.max(3, Math.round(shown[n] * (H - 4)));
        g.fillStyle = grad; g.fillRect(Math.round(n * bw) + 1, H - bh, Math.round(bw) - 4, bh);
        g.fillStyle = "#FFFFFF"; g.fillRect(Math.round(n * bw) + 1, Math.round(H - 3 - peaks[n] * (H - 4)), Math.round(bw) - 4, 3);
      }
    };
    // The equalizer's curve, through its ten sliders.
    const paintCurve = () => {
      const g = curve.getContext("2d"), W = curve.width, H = curve.height;
      g.clearRect(0, 0, W, H);
      g.strokeStyle = "rgba(157, 245, 194, 0.25)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      const pts = eq.slice(1).map((v, n) => [(n / 9) * (W - 8) + 4, H - 4 - v * (H - 8)]);
      g.strokeStyle = "#9DF5C2"; g.lineWidth = 2.5; g.shadowColor = "#7CF0B4"; g.shadowBlur = 5;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let n = 1; n < pts.length; n++) { const [x0, y0] = pts[n - 1], [x1, y1] = pts[n]; g.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1); }
      g.stroke(); g.shadowBlur = 0;
    };
    // The jelly heart: a glossy Y2K gel heart with "울린 심장" in it. jig ripples its outline.
    const heartPath = (g, cx, cy, r, jig = 0, phase = 0) => {
      g.beginPath();
      for (let n = 0; n <= 72; n++) {
        const a = (n / 72) * Math.PI * 2, q = r * (1 + jig * Math.sin(a * 3 + phase));
        const x = cx + q * Math.sin(a) ** 3, y = cy - (q * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))) / 16;
        if (n) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
    };
    const drawJelly = (t, burst) => {
      if (t === drawnAt && burst < 0) return;
      drawnAt = t;
      const w = window.innerWidth, h = window.innerHeight, ratio = SCENE_LITE ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      if (jelly.width !== Math.round(w * ratio) || jelly.height !== Math.round(h * ratio)) { jelly.width = Math.round(w * ratio); jelly.height = Math.round(h * ratio); }
      const g = jelly.getContext("2d");
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, w, h);
      const R = Math.min(w * 0.28, h * 0.2), cx = w / 2, cy = h * 0.45;
      const last = beats.filter((at) => at <= t).pop();
      const since = last === undefined ? 9 : t - last;
      const wob = Math.exp(-since * 6.5) * Math.cos(since * 28);
      const hit = Math.max(0, 1 - since / 0.1);
      const sx = (1 + 0.16 * wob) * (1 + 0.08 * hit), sy = (1 - 0.13 * wob) * (1 + 0.05 * hit);
      const breathe = 1 + 0.018 * Math.sin(t * 3.1);
      const jig = 0.035 * Math.exp(-since * 4) + 0.006, phase = t * 7;
      // the ripples, heart-shaped, going out from each "ta"
      beats.forEach((at) => {
        const q = (t - at) / 0.95;
        if (q < 0 || q > 1) return;
        g.save();
        g.globalAlpha = (1 - q) ** 1.5 * 0.85; g.strokeStyle = "#FFE1EE"; g.lineWidth = 2 + 5 * (1 - q); g.shadowColor = "#F49AC1"; g.shadowBlur = 16;
        heartPath(g, cx, cy, R * (1.04 + q * 1.7), 0.02, phase); g.stroke();
        g.restore();
      });
      const grow = burst >= 0 ? 1 + burst * 2.6 : 1;
      const fade = burst >= 0 ? Math.max(0, 1 - burst / 0.32) : 1;
      if (fade > 0) {
        g.save();
        g.translate(cx, cy + R * 1.06); g.scale(sx * breathe * grow, sy * breathe * grow); g.translate(-cx, -(cy + R * 1.06));
        g.globalAlpha = fade;
        // the body: gel, lit from the upper left, deeper at the bottom
        g.shadowColor = "rgba(244, 110, 170, 0.8)"; g.shadowBlur = R * 0.4;
        const body = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.05, cx, cy + R * 0.1, R * 1.25);
        body.addColorStop(0, "#FFD0E4"); body.addColorStop(0.38, "#FA88BA"); body.addColorStop(0.78, "#E2559A"); body.addColorStop(1, "#B83578");
        heartPath(g, cx, cy, R, jig, phase); g.fillStyle = body; g.fill();
        g.shadowBlur = 0;
        g.save();
        heartPath(g, cx, cy, R, jig, phase); g.clip();
        const deep = g.createLinearGradient(0, cy - R * 0.2, 0, cy + R * 1.1);
        deep.addColorStop(0, "rgba(130, 20, 80, 0)"); deep.addColorStop(1, "rgba(130, 20, 80, 0.45)");
        g.fillStyle = deep; g.fillRect(cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8);
        // light through the gel, pooling at the bottom
        const pool = g.createRadialGradient(cx + R * 0.15, cy + R * 0.6, 0, cx + R * 0.15, cy + R * 0.6, R * 0.55);
        pool.addColorStop(0, "rgba(255, 200, 225, 0.55)"); pool.addColorStop(1, "rgba(255, 200, 225, 0)");
        g.fillStyle = pool; g.fillRect(cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8);
        // a rim of light along the upper left
        const rim = g.createLinearGradient(cx - R, cy - R * 0.8, cx + R * 0.4, cy + R * 0.6);
        rim.addColorStop(0, "rgba(255, 255, 255, 0.75)"); rim.addColorStop(0.5, "rgba(255, 255, 255, 0.1)"); rim.addColorStop(1, "rgba(255, 255, 255, 0)");
        g.strokeStyle = rim; g.lineWidth = R * 0.07; heartPath(g, cx, cy + R * 0.015, R * 0.965, jig, phase); g.stroke();
        // bubbles caught in it
        [[0.38, 0.32, 0.05], [0.5, 0.12, 0.028], [-0.2, 0.62, 0.035], [0.18, 0.78, 0.02]].forEach(([bx, by, br], n) => {
          const y = cy + R * by - Math.sin(t * 1.4 + n) * R * 0.03;
          g.strokeStyle = "rgba(255, 255, 255, 0.55)"; g.lineWidth = 1.5; g.beginPath(); g.arc(cx + R * bx, y, R * br, 0, Math.PI * 2); g.stroke();
          g.fillStyle = "rgba(255, 255, 255, 0.8)"; g.beginPath(); g.arc(cx + R * (bx - br * 0.35), y - R * br * 0.35, R * br * 0.28, 0, Math.PI * 2); g.fill();
        });
        // the shine: a soft sheen over the left lobe with a sharp glint in it, a faint one on the right
        const sheen = (x, y, rx, ry, turn, alpha) => {
          g.save(); g.translate(x, y); g.rotate(turn); g.scale(1, ry / rx);
          const glow = g.createRadialGradient(0, 0, 0, 0, 0, rx);
          glow.addColorStop(0, `rgba(255, 255, 255, ${alpha})`); glow.addColorStop(0.55, `rgba(255, 255, 255, ${alpha * 0.4})`); glow.addColorStop(1, "rgba(255, 255, 255, 0)");
          g.fillStyle = glow; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
          g.restore();
        };
        sheen(cx - R * 0.44, cy - R * 0.34, R * 0.46, R * 0.24, -0.62, 0.75);
        sheen(cx + R * 0.5, cy - R * 0.4, R * 0.2, R * 0.09, 0.6, 0.4);
        g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.beginPath(); g.ellipse(cx - R * 0.58, cy - R * 0.42, R * 0.09, R * 0.04, -0.7, 0, Math.PI * 2); g.fill();
        g.restore();
        // "울린 심장", written in it
        g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle";
        g.shadowColor = "rgba(150, 30, 90, 0.65)"; g.shadowBlur = R * 0.06; g.shadowOffsetY = R * 0.012;
        g.font = `700 ${(R * 0.3).toFixed(1)}px Gaegu, cursive`;
        g.fillText("울린 심장", cx, cy + R * 0.08);
        g.restore();
      }
      // ▶: it bursts into small hearts, flying out and fading
      if (burst >= 0) {
        for (let n = 0; n < 22; n++) {
          const a = (n / 22) * Math.PI * 2 + n * 0.7, q = Math.min(1, burst / 1.1);
          const d = R * (0.2 + (1 - (1 - q) ** 3) * (2.2 + (n % 5) * 0.45));
          const hx = cx + Math.cos(a) * d, hy = cy + R * 0.2 + Math.sin(a) * d * 0.85 + q * q * R * 0.6;
          const hr = R * (0.08 + (n % 3) * 0.035) * (1 - q * 0.4);
          g.save(); g.globalAlpha = (1 - q) ** 1.3;
          g.translate(hx, hy); g.rotate(Math.sin(n * 2.3) * 0.5 + q * (n % 2 ? 1.4 : -1.4)); g.translate(-hx, -hy);
          const small = g.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, 1, hx, hy, hr * 1.2);
          small.addColorStop(0, "#FFE1EE"); small.addColorStop(1, ["#F77DB2", "#C3B8F3", "#9EC2F0"][n % 3]);
          heartPath(g, hx, hy, hr); g.fillStyle = small; g.fill();
          g.restore();
        }
      }
    };
    // Each "ta" sends the page's windows wobbling like jelly, out from the heart, after the ripple.
    const JELLY = ".ae-member, .card, .guide-item, .tips li, main .section, .hero h1, .hero .lead, .status-pill, .dt-poster, .dt-decor-logo, .dt-desk-icon";
    const jellyPage = () => {
      if (!motionOK()) return;
      const mx = window.innerWidth / 2, my = window.innerHeight * 0.5, vh = window.innerHeight;
      wobbles = wobbles.filter((wobble) => wobble.playState !== "finished");
      document.querySelectorAll(JELLY).forEach((el) => {
        const box = el.getBoundingClientRect();
        if (!box.width || box.bottom < -40 || box.top > vh + 40) return;
        // the bigger the window, the less it gives
        const j = Math.min(0.045, 9 / Math.max(box.width, box.height));
        const far = Math.hypot(box.left + box.width / 2 - mx, box.top + box.height / 2 - my);
        wobbles.push(el.animate([
          { scale: "1 1" },
          { scale: `${1 + j} ${1 - j}`, offset: 0.14 },
          { scale: `${1 - j * 0.75} ${1 + j * 0.75}`, offset: 0.32 },
          { scale: `${1 + j * 0.45} ${1 - j * 0.45}`, offset: 0.5 },
          { scale: `${1 - j * 0.2} ${1 + j * 0.2}`, offset: 0.7 },
          { scale: "1 1" },
        ], { duration: 720, delay: 60 + far / 1.3, easing: "ease-out" }));
      });
    };
    // Out of the heart: its canvas wiped, the page let go.
    const letGo = () => {
      beats = []; drawnAt = -1;
      wobbles.forEach((wobble) => wobble.cancel());
      wobbles = [];
      jelly?.getContext("2d").clearRect(0, 0, jelly.width, jelly.height);
    };
    // A steady, music-like height for spectrum bar i on sixteenth k (no randomness between frames).
    const level = (i, k) => {
      const low = 0.55 + 0.45 * Math.abs(Math.sin(k * 1.7 + i * 0.4));
      const tilt = 1 - i / 26;
      const kick = k % 4 === 0 ? 0.25 : 0;
      return Math.max(0.08, Math.min(1, (low * tilt + kick) * (0.75 + 0.25 * Math.sin(k * 0.9 + i * i))));
    };
    return {
      mount(box) {
        fx = box;
        lines = [...fx.querySelectorAll(".dtx-lines p")];
        pops = [...fx.querySelectorAll(".dtx-pops img")];
        amp = fx.querySelector(".dtx-amp");
        time = fx.querySelector(".dtx-amp-time");
        plTime = fx.querySelector(".dtx-pl-time");
        vis = fx.querySelector(".dtx-vis");
        curve = fx.querySelector(".dtx-eq-curve");
        bands = [...fx.querySelectorAll(".dtx-band")];
        seek = fx.querySelector(".dtx-seek");
        jelly = fx.querySelector(".dtx-jelly");
        dittoDesk.mount();
      },
      tick(at, name) {
        if (!fx) return;
        chorusBeat(at, name);
        const t = at - DT_BRIDGE;
        const on = at >= 0 && name !== "calm";
        fx.classList.toggle("has-a", on && t >= 0);
        fx.classList.toggle("has-b", on && t >= 3.582);
        // Danielle's lines, one by one.
        lines.forEach((line, i) => line.classList.toggle("is-on", on && t >= DT_DANIELLE[i][0]));
        const inAmp = on && name === "amp", inHeart = on && (name === "heart" || name === "pause" || name === "play");
        if (inAmp !== ampOpen) { ampOpen = inAmp; dittoDesk.task("amp", "DITTO AMP", inAmp); }
        if (!inHeart && (beats.length || wobbles.length)) letGo();
        if (!on) { last16 = -1; lastTa = -1; return; }
        // Hyein: the amp. Its three windows dock on the first three beats; the spectrum (the
        // oscilloscope on each "ooh-whoa") and the equalizer follow the song when the sound is on (a
        // steady made-up music when it is off); it is in the taskbar while it is open, and is
        // minimized to it as her part ends.
        if (inAmp) {
          const a = t - 14.328, b = a / DT_BEAT, k = Math.floor(a / (DT_BEAT / 4));
          const now = performance.now(), dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
          lastNow = now;
          amp.classList.toggle("has-eq", b >= 1);
          amp.classList.toggle("has-pl", b >= 2);
          amp.classList.toggle("is-closing", b >= 15.5);
          const scope = WHOA.some(([from, long]) => b >= from && b < from + long);
          amp.classList.toggle("is-scope", scope);
          const player = players.ditto, tapNode = player?.playing() ? player.analyser() : null;
          let live = false;
          if (tapNode) { tapNode.getByteFrequencyData(freq); tapNode.getByteTimeDomainData(wave); live = freq.some((v) => v > 0); }
          for (let n = 0; n < N; n++) {
            let v = level(n, k);
            if (live) {
              let sum = 0;
              for (let f = EDGES[n]; f < EDGES[n + 1]; f++) sum += freq[f];
              v = Math.min(1, (sum / (EDGES[n + 1] - EDGES[n]) / 255) * (1 + (n / N) * 0.55));
            }
            shown[n] = Math.max(v, shown[n] - dt * 2.2);
            if (shown[n] >= peaks[n]) { peaks[n] = shown[n]; held[n] = 0.3; }
            else if ((held[n] -= dt) < 0) peaks[n] = Math.max(0, peaks[n] - dt * 0.8);
          }
          paintVis(scope, live, a);
          // the equalizer's sliders drift with the bands, the curve above them
          bands.forEach((band, n) => {
            const target = n ? (shown[(n - 1) * 2] + shown[(n - 1) * 2 + 1]) / 2 : 0.62;
            eq[n] += (target - eq[n]) * Math.min(1, dt * 9);
            band.style.setProperty("--v", eq[n].toFixed(3));
          });
          paintCurve();
          if (k !== last16) {
            last16 = k;
            const seconds = 102 + Math.floor(a);
            time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
            plTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
            seek.style.setProperty("--p", ((102 + a) / 185).toFixed(4));
          }
        }
        // Haerin: the jelly heart. On every "ta" it squashes and springs back, a heart-shaped ripple
        // going out, a sticker popping up round it and the page's windows wobbling like jelly after
        // the ripple; on "But I don't want to" all of it freezes with the tape; on ▶ it bursts.
        if (inHeart) {
          const s16 = Math.floor((t - 21.492) / (DT_BEAT / 4));
          if (name === "heart" && s16 !== lastTa && s16 >= 0 && DT_RATATA.has(s16 % 16)) {
            lastTa = s16;
            beats.push(21.492 + s16 * (DT_BEAT / 4));
            restart(pops[pop++ % pops.length], "is-on");
            jellyPage();
          }
          if (name === "pause") wobbles.forEach((wobble) => wobble.pause());
          else if (name === "play") wobbles.forEach((wobble) => { if (wobble.playState === "paused") wobble.play(); });
          drawJelly(name === "pause" ? 25.97 : t, name === "play" ? t - 26.865 : -1);
        }
      },
      unmount() {
        if (fx) letGo();
        fx = null; lastFocus = -1; lastKick = -1; ampOpen = false;
        dittoDesk.unmount();
        document.documentElement.style.removeProperty("--dt-kick");
        document.querySelectorAll(".ae-member.is-focus").forEach((el) => el.classList.remove("is-focus"));
      },
    };
  })();

  // Ditto's scene: the MV (80.2 s), track 2, then the chorus, then the intro's "woo" over camcorder
  // footage. One winter, five girls, each part a memory of it, each member's part her own.
  // DT_MV(part, bar, beat) is where that falls in the MV (part 0 track 2, 1 track 1, 2 the intro; the
  // song starts at 0.276 s).
  //   rewind (0)      "Rewind to that winter": a tear-off calendar on the wall, its days flying back up
  //                   onto it from today to 12.19.2022, a burst on each hit; the sun sweeping the
  //                   wall with every day, the clock spinning backward to 4:12
  //   seasons (7.44)  Danielle's part: she waits under a tree while the year turns around her,
  //                   spring, summer, autumn, the tree's leaves the MV; the a cappella bar stops time,
  //                   the leaves hanging in the air; on "기다렸지 all this time" the first snow
  //   plane (14.61)   Hyein's part, "I got nothing to lose / 널 좋아한다고": she throws a paper plane
  //                   from a classroom window, her note on its wings and the MV under them; it loops
  //                   on each "ooh-whoa" over the snowy schoolyard and climbs into the sun
  //   alarm (21.77)   Haerin's part, "Ra-ta-ta-ta 울린 심장": the alarm clock rings on every "ta", the
  //                   nightstand rattling; "But I don't want to": a hand slaps it quiet; the hit
  //                   sets it off again and its face (the MV) fills the screen
  //   From the chorus on, everything (the page too) is seen through an old camcorder: faded, grainy,
  //   flickering, a date stamp in the corner.
  //   cube (28.93)    "Stay in the middle": a cube puzzle, the five on its centres (the pieces that
  //                   stay in the middle), the MV on its front; scrambled ("don't want no riddle"),
  //                   it is solved a turn a kick
  //   scope (36.10)   "Say it ditto": the MV in a kaleidoscope, copies of copies, turning on the
  //                   kicks; slow in the break (bar 7), whirling into the dark at the end
  //   maze (43.26)    "I don't want to walk in this 미로": a walk through a maze of school corridors
  //                   under a snowy night sky, low-res like the old 3D maze screensaver; a cell or a
  //                   quarter turn on each kick, each corridor ending at the MV with one of the five
  //                   in front of it, who spins away into snow as she is reached; the spinning bunny
  //                   heads turn the world upside down as they are passed (and back); the last kick
  //                   walks into the MV
  //   block (50.43)   "말해줘 say it back": an apartment block on a snowy night, a girl with a camcorder
  //                   looking up at it. Its windows become one big screen of the MV, spell SAY, IT,
  //                   BACK on the kicks and DITTO in the break (bar 15); then a heart (bar 16) that
  //                   goes out window by window until one is left, and the camera pushes into it
  //   chalk (57.59)   the camcorder footage: the board at the front of the classroom, a hand drawing
  //                   on it in chalk: a TV (the MV switching on in it), the date, the five one a bar,
  //                   each with her own hair and her name, hands joined, hearts, "all five"
  //   doodle (71.92)  the drums: "say it ditto", a doodle on every hit
  //   erase (74.61)   the chalk goes down, the eraser comes up and scrubs it all off (the TV and the
  //                   MV with it), lifting over Danielle; back on the tray, a small pink heart by her,
  //                   and the camcorder leans in on her for the last of it
  const DT_MV = (part, bar, beat = 0) => 0.2755 + part * 64 * DT_BEAT + ((bar - 1) * 4 + beat) * DT_BEAT;
  const DT_ERASE = DT_MV(2, 10, 2);
  const DT_NAMES = ["Minji", "Hanni", "Danielle", "Haerin", "Hyein"];
  // The chorus's kicks (sixteenths of each bar; its bar 15 has none, a break), and how hard the last
  // one still rings (1 on it, then fading).
  const DT_KICKS = [0, 4, 8, 11, 14];
  const DT_SIX = DT_BEAT / 4;
  const dtKickPulse = (now) => {
    const s = (now - DT_MV(1, 1)) / DT_SIX;
    const bar = Math.floor(s / 16), inBar = s - bar * 16;
    if (bar === 14) return 0;
    const k = DT_KICKS.filter((n) => n <= inBar).pop();
    return k === undefined ? 0 : Math.exp(-(inBar - k) * DT_SIX * 7);
  };
  // The maze: # the school's corridor walls (w with a window, p a notice, g "미로" chalked on it), M
  // the MV, . open. The walk, one move a kick through bars 9-12: F a cell on, L / R a quarter turn,
  // E the last: into the MV.
  const DT_MAZE = [
    "#############",
    "########M####",
    "#######p.w.##",
    "#####M#....##",
    "###.#....M###",
    "###.p.gw#####",
    "###...w######",
    "##Mw#.#######",
    "#w....M######",
    "#g...########",
    "#..p.########",
    "##.##########",
    "#############",
  ];
  const DT_WALK = "FFFRF" + "FFLFF" + "FFRFF" + "FLFFE";
  // Where the five stand (in front of each corridor's MV) and how near she lets you come; the bunny
  // heads, floating overhead (the screensaver's sign that flips the world over as it is passed).
  const DT_MAZE_FIVE = [[2.5, 8.22, 1.35], [5.78, 8.5, 1], [5.5, 4.22, 1], [8.78, 4.5, 1.35], [8.5, 2.22, 1.35]];
  const DT_MAZE_BUNNIES = [[4.15, 8.5], [5.5, 6.9]];
  // Each member's figure in her -anime.webp (1100 × 1100): from x, how wide.
  const DT_ANIME_CROP = [[314, 547], [303, 520], [266, 568], [316, 459], [239, 622]];
  // The walk as moves: from [x, y, angle] to [x, y, angle] (angle 0 east, -π/2 north), from one kick
  // to the next; and where it is at any moment (a step eases out like a footfall, a turn in and out,
  // the last step speeds up into the wall).
  const dtWalk = (() => {
    const kicks = [];
    for (let bar = 9; bar <= 12; bar++) DT_KICKS.forEach((k) => kicks.push(DT_MV(1, bar) + k * DT_SIX));
    let x = 2.5, y = 11.5, a = -Math.PI / 2;
    return [...DT_WALK].map((move, n) => {
      const from = [x, y, a];
      if (move === "F") { x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a)); }
      if (move === "E") { x += Math.cos(a) * 0.44; y += Math.sin(a) * 0.44; }
      if (move === "L") a -= Math.PI / 2;
      if (move === "R") a += Math.PI / 2;
      return { move, from, to: [x, y, a], at: kicks[n], until: kicks[n + 1] ?? DT_MV(1, 13) };
    });
  })();
  const dtWalkAt = (t) => {
    const step = dtWalk.findLast((m) => m.at <= t) ?? dtWalk[0];
    const p = Math.max(0, Math.min(1, (t - step.at) / (step.until - step.at)));
    const e = step.move === "E" ? p * p * p : step.move === "F" ? 1 - (1 - p) ** 3 : 0.5 - 0.5 * Math.cos(Math.PI * p);
    const [x0, y0, a0] = step.from, [x1, y1, a1] = step.to;
    return { x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * e, a: a0 + (a1 - a0) * e, bob: step.move === "F" ? Math.sin(Math.PI * Math.min(1, p * 1.6)) : 0 };
  };
  // The apartment block's letters (3 × 5 windows) and its heart.
  const DT_FONT = {
    S: ["111", "100", "111", "001", "111"], A: ["010", "101", "111", "101", "101"], Y: ["101", "101", "010", "010", "010"],
    I: ["1", "1", "1", "1", "1"], T: ["111", "010", "010", "010", "010"], B: ["110", "101", "110", "101", "110"],
    C: ["011", "100", "100", "100", "011"], K: ["101", "101", "110", "101", "101"], D: ["110", "101", "101", "101", "110"],
    O: ["010", "101", "101", "101", "010"],
  };
  const DT_HEART = ["..111...111..", ".11111.11111.", "1111111111111", "1111111111111", "1111111111111", ".11111111111.",
    "..111111111..", "...1111111...", "....11111....", ".....111.....", "......1......"];
  const dittoScene = {
    src: "ditto/scene.mp4",
    className: "dt-scene",
    cues: [[0, "rewind"], [DT_MV(0, 5), "seasons"], [DT_MV(0, 9), "plane"], [DT_MV(0, 13), "alarm"],
      [DT_MV(1, 1), "cube"], [DT_MV(1, 5), "scope"], [DT_MV(1, 9), "maze"], [DT_MV(1, 13), "block"], [DT_MV(2, 1), "chalk"], [DT_MV(2, 9), "doodle"], [DT_ERASE, "erase"]],
    mount(box, video) {
      // The scene starts from the top of the page.
      window.scrollTo({ top: 0, behavior: "instant" });
      box.innerHTML = `
        <div class="dts-wall"></div>
        <canvas class="dts-stage"></canvas>
        <div class="dts-maze"><canvas class="dts-maze-view"></canvas></div>
        <div class="dts-block"><div class="dts-block-cam"><canvas class="dts-block-view"></canvas><canvas class="dts-block-glow"></canvas></div><i class="dts-block-bloom"></i></div>
        <div class="dts-cam"><i class="dts-grain"></i><span class="dts-cam-sp">SP</span><span class="dts-cam-battery"><i></i></span><span class="dts-cam-date">PM 4:12<br />DEC. 19 2022</span></div>
        <p class="dts-badge">NewJeans ‘Ditto’ · <span class="dts-time">00:00</span></p>`;
      // The MV itself (hidden; everything draws from it).
      const wall = box.querySelector(".dts-wall");
      video.className = "dts-video";
      wall.append(video);
      const time = box.querySelector(".dts-time");
      const cam = box.querySelector(".dts-cam");
      const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

      // ── The first six parts draw on one canvas in turn (the stage), from the MV's latest frame ──
      const stage = box.querySelector(".dts-stage");
      const clamp = (v) => Math.max(0, Math.min(1, v));
      const mix = (a, b, p) => a + (b - a) * p;
      const easeIO = (p) => p * p * (3 - 2 * p);
      const easeOut3 = (p) => 1 - (1 - p) ** 3;
      const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const stageRatio = () => (SCENE_LITE ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
      const prep = () => {
        const r = stageRatio(), w = window.innerWidth, h = window.innerHeight;
        const W = Math.round(w * r), H = Math.round(h * r);
        if (stage.width !== W || stage.height !== H) { stage.width = W; stage.height = H; }
        const g = stage.getContext("2d");
        g.setTransform(r, 0, 0, r, 0, 0);
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none"; g.shadowBlur = 0;
        g.imageSmoothingEnabled = true; g.textBaseline = "alphabetic";
        return { g, w, h, r, wide: w >= h };
      };
      const mvFrame = document.createElement("canvas");
      mvFrame.width = SCENE_LITE ? 640 : 960; mvFrame.height = SCENE_LITE ? 360 : 540;
      let mvStamp = -1;
      const mv = (now) => {
        if (video.videoWidth && (mvStamp < 0 || mirrorsDue)) { mvFrame.getContext("2d").drawImage(video, 0, 0, mvFrame.width, mvFrame.height); mvStamp = now; }
        return mvFrame;
      };
      // How bright the MV is just now (0-1), looked at a few times a second, so a dark shot can be lifted.
      const levelCanvas = document.createElement("canvas");
      levelCanvas.width = 16; levelCanvas.height = 9;
      let mvLevelAt = -9, mvLevelNow = 0.5;
      const mvLevel = (now) => {
        if (Math.abs(now - mvLevelAt) > 0.25 && mvStamp >= 0) {
          const tg = levelCanvas.getContext("2d", { willReadFrequently: true });
          tg.drawImage(mvFrame, 0, 0, 16, 9);
          const d = tg.getImageData(0, 0, 16, 9).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
          mvLevelNow = sum / (144 * 255); mvLevelAt = now;
        }
        return mvLevelNow;
      };
      // A picture drawn over a box as cover, from a point of it (cx, cy: 0-1), zoomed in.
      const cover = (g, img, x, y, w, h, cx = 0.5, cy = 0.5, zoom = 1) => {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih || w <= 0 || h <= 0) return;
        const s = Math.max(w / iw, h / ih) * zoom, sw = w / s, sh = h / s;
        g.drawImage(img, Math.max(0, Math.min(iw - sw, cx * iw - sw / 2)), Math.max(0, Math.min(ih - sh, cy * ih - sh / 2)), sw, sh, x, y, w, h);
      };
      const roundRect = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
      const pics = new Map();
      const pic = (path) => {
        if (!pics.has(path)) { const img = new Image(); img.src = siteUrl(`ditto/${path}`); pics.set(path, img); }
        const img = pics.get(path);
        return img.complete && img.naturalWidth ? img : null;
      };
      // A wall, a desk, a sky: anything painted once for the screen's size, kept until it changes.
      const painted = new Map();
      const paintOnce = (key, w, h, r, paint) => {
        const id = `${key}:${w}x${h}@${r}`;
        if (!painted.has(id)) {
          const c = document.createElement("canvas");
          c.width = Math.round(w * r); c.height = Math.round(h * r);
          const g = c.getContext("2d");
          g.scale(r, r);
          paint(g, w, h);
          painted.set(id, c);
        }
        return painted.get(id);
      };

      // ── rewind: the tear-off calendar on the wall (일력), its days flying back up onto it ──
      // From today back to 12.19.2022: a burst of days on each hit of bars 1 and 3, a drift between,
      // then the last days one at a time, the last page landing on the last beat of bar 4. The sun
      // through the window sweeps the wall with every day that goes back, the clock spins backward,
      // and it all comes to rest at 4:12 in the afternoon.
      const DAY_KR = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
      const DAY_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      const MONTH_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const HOLIDAYS = { "1-1": "신정", "3-1": "삼일절", "5-5": "어린이날", "6-6": "현충일", "8-15": "광복절", "10-3": "개천절", "10-9": "한글날", "12-25": "성탄절" };
      const DAY_MS = 86400000;
      const rewindTo = Date.UTC(2022, 11, 19);
      const rewindFrom = (() => { const d = new Date(); return Math.max(rewindTo + 400 * DAY_MS, Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); })();
      const rewindDays = Math.round((rewindFrom - rewindTo) / DAY_MS);
      const REWIND_HITS = [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [DT_MV(0, 1, k / 4), 0.075]), ...[0, 2, 6, 7, 8, 9].map((k) => [DT_MV(0, 3, k / 4), 0.04])];
      const REWIND_DRIFTS = [[DT_MV(0, 1, 2), DT_MV(0, 2), 0.04], [DT_MV(0, 2), DT_MV(0, 3), 0.06], [DT_MV(0, 3, 2.5), DT_MV(0, 4), 0.02]];
      const REWIND_LAND = DT_MV(0, 4, 3);
      const woundBack = (t) => {
        let f = 0;
        for (const [at, weight] of REWIND_HITS) f += weight * easeIO(clamp((t - at) / 0.1));
        for (const [a, b, weight] of REWIND_DRIFTS) f += weight * clamp((t - a) / (b - a));
        if (t > DT_MV(0, 4)) f += 0.04 * (1 - (1 - clamp((t - DT_MV(0, 4)) / (REWIND_LAND - DT_MV(0, 4)))) ** 4);
        return Math.min(1, f) * rewindDays;
      };
      const woundDay = (t) => Math.min(rewindDays, Math.floor(woundBack(t) + 1e-6));
      // The pages seen flying: one for each of the last twelve days, otherwise a few a second (more in a burst).
      const rewindPages = (() => {
        const pages = [], rnd = seeded(1219);
        let last = 0, spawned = -1;
        for (let t = 0; t <= REWIND_LAND + 0.01; t += 1 / 240) {
          const day = woundDay(t);
          if (day === last) continue;
          last = day;
          const final = day >= rewindDays - 12;
          const rate = (woundBack(t + 0.05) - woundBack(t - 0.05)) / 0.1;
          if (!final && t - spawned < 1 / Math.max(4, Math.min(30, rate * 0.03))) continue;
          spawned = t;
          pages.push({ land: t, day, dur: final ? 0.8 : 0.45 + rnd() * 0.25, x0: rnd() * 2 - 1, rot: (rnd() * 2 - 1) * 1.4, flip: (rnd() < 0.5 ? -1 : 1) * (1 + rnd() * 1.6) * Math.PI, sway: rnd() * 2 - 1 });
        }
        return pages;
      })();
      const calDate = (day) => { const d = new Date(rewindFrom - day * DAY_MS); return { Y: d.getUTCFullYear(), M: d.getUTCMonth(), D: d.getUTCDate(), wd: d.getUTCDay() }; };
      // One day's page: the year and month, the day's photo (the MV), the big number (red on Sundays
      // and holidays, blue on Saturdays), the weekday, the holiday's name.
      const calPage = (g, day, x, y, pw, ph, photo) => {
        const { Y, M, D, wd } = calDate(day);
        const holiday = HOLIDAYS[`${M + 1}-${D}`];
        const ink = wd === 0 || holiday ? "#D23B47" : wd === 6 ? "#3A66CF" : "#24283B";
        g.fillStyle = "#FBF8F1"; g.fillRect(x, y, pw, ph);
        g.fillStyle = "rgba(60, 50, 40, 0.16)";
        for (let i = 0; i < 18; i++) g.fillRect(x + ((i + 0.25) * pw) / 18, y + ph * 0.014, pw / 40, Math.max(1, ph * 0.008));
        g.fillStyle = "#6B6F86"; g.font = `700 ${(ph * 0.05).toFixed(1)}px Inter, system-ui, sans-serif`;
        g.textAlign = "left"; g.fillText(String(Y), x + pw * 0.08, y + ph * 0.09);
        g.textAlign = "right"; g.fillText(`${M + 1}월 ${MONTH_EN[M]}`, x + pw * 0.92, y + ph * 0.09);
        const px = x + pw * 0.08, py = y + ph * 0.12, pw2 = pw * 0.84, ph2 = ph * 0.36;
        if (photo) { g.save(); roundRect(g, px, py, pw2, ph2, pw * 0.03); g.clip(); cover(g, photo, px, py, pw2, ph2); g.restore(); }
        else { g.fillStyle = "#E4E0D6"; roundRect(g, px, py, pw2, ph2, pw * 0.03); g.fill(); }
        g.fillStyle = ink; g.textAlign = "center";
        g.font = `800 ${(ph * 0.32).toFixed(1)}px Inter, system-ui, sans-serif`;
        g.fillText(String(D), x + pw / 2, y + ph * 0.8);
        g.font = `700 ${(ph * 0.048).toFixed(1)}px Inter, system-ui, sans-serif`;
        g.fillText(`${DAY_KR[wd]} · ${DAY_EN[wd]}`, x + pw / 2, y + ph * 0.885);
        if (holiday) { g.font = `700 ${(ph * 0.04).toFixed(1)}px Inter, system-ui, sans-serif`; g.fillText(holiday, x + pw / 2, y + ph * 0.945); }
      };
      const paintWallpaper = (g, w, h) => {
        g.fillStyle = "#EDE3D2"; g.fillRect(0, 0, w, h);
        g.fillStyle = "rgba(255, 255, 255, 0.32)";
        for (let x = 0; x < w; x += 30) g.fillRect(x, 0, 13, h);
        const rnd = seeded(77);
        for (let i = 0; i < (w * h) / 2400; i++) {
          const fx = rnd() * w, fy = rnd() * h;
          g.fillStyle = rnd() < 0.5 ? "rgba(232, 150, 184, 0.42)" : "rgba(140, 172, 228, 0.42)";
          for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(fx + Math.cos(a) * 2.3, fy + Math.sin(a) * 2.3, 1.6, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = "rgba(236, 196, 110, 0.6)"; g.beginPath(); g.arc(fx, fy, 1.1, 0, Math.PI * 2); g.fill();
        }
        const shade = g.createRadialGradient(w * 0.45, h * 0.45, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
        shade.addColorStop(0, "rgba(0, 0, 0, 0)"); shade.addColorStop(1, "rgba(60, 40, 30, 0.38)");
        g.fillStyle = shade; g.fillRect(0, 0, w, h);
      };
      const drawRewind = (now) => {
        const { g, w, h, r, wide } = prep();
        const frame = mv(now);
        const back = woundBack(now), day = woundDay(now);
        const rate = (woundBack(now + 0.02) - woundBack(now - 0.02)) / 0.04;
        const pw = wide ? Math.min(h * 0.44, w * 0.3) : w * 0.6, ph = pw * 1.3;
        const headH = ph * 0.2;
        const padX = (wide ? w * 0.4 : w / 2) - pw / 2, padY = (wide ? h * 0.5 : h * 0.54) - (ph + headH) / 2 + headH;
        // The push-in on the last page, once it has landed.
        const push = 1 + 0.14 * easeIO(clamp((now - REWIND_LAND) / (DT_MV(0, 5) - REWIND_LAND)));
        const fx = padX + pw / 2, fy = padY + ph * 0.3;
        g.translate(fx, fy); g.scale(push, push); g.translate(-fx, -fy);
        g.drawImage(paintOnce("wallpaper", w, h, r, paintWallpaper), 0, 0, w, h);
        // The sun through the window: by the hour of the day being wound back (a blur of days at speed).
        const hour = (((16.2 - back * 24) % 24) + 24) % 24;
        let sun = clamp((hour - 6.5) / 1.5) * clamp((18.5 - hour) / 1.5);
        sun = mix(sun, 0.5 + 0.18 * Math.sin(now * 53) * Math.sin(now * 31), clamp(rate / 25));
        const lx = w * mix(0.98, 0.18, clamp((hour - 6) / 12)), ly = h * 0.08;
        g.save();
        g.globalAlpha = 0.34 * sun;
        g.fillStyle = "#FFE7B0";
        const paneW = Math.min(w, h) * 0.2, paneH = Math.min(w, h) * 0.34, skew = paneW * 0.55;
        [0, 1].forEach((col) => [0, 1].forEach((row) => {
          const x = lx + col * (paneW + 10) + row * skew * 0.5, y = ly + row * (paneH / 2 + 8);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + paneW, y); g.lineTo(x + paneW + skew * 0.5, y + paneH / 2); g.lineTo(x + skew * 0.5, y + paneH / 2); g.closePath(); g.fill();
        }));
        g.restore();
        // The wall clock, spinning backward (its hands a blur at speed), stopping at 4:12.
        const [cx, cy, cr] = wide ? [w * 0.75, h * 0.3, Math.min(w, h) * 0.12] : [w * 0.8, h * 0.115, w * 0.11];
        g.save();
        g.fillStyle = "rgba(60, 40, 30, 0.18)"; g.beginPath(); g.arc(cx + cr * 0.06, cy + cr * 0.1, cr * 1.06, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#F4B6C8"; g.beginPath(); g.arc(cx, cy, cr * 1.06, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#FFFDF8"; g.beginPath(); g.arc(cx, cy, cr * 0.92, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#2D3148"; g.font = `700 ${(cr * 0.24).toFixed(1)}px Inter, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        [12, 3, 6, 9].forEach((n) => { const a = (n / 12) * Math.PI * 2 - Math.PI / 2; g.fillText(String(n), cx + Math.cos(a) * cr * 0.7, cy + Math.sin(a) * cr * 0.7); });
        g.textBaseline = "alphabetic";
        const blur = clamp(rate / 3);
        const hand = (angle, len, width, color) => {
          const copies = blur > 0.05 ? 7 : 1;
          for (let k = 0; k < copies; k++) {
            const a = angle + (copies > 1 ? (k / (copies - 1) - 0.5) * blur * 2.2 : 0);
            g.globalAlpha = copies > 1 ? 0.28 : 1;
            g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round";
            g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
          }
          g.globalAlpha = 1;
        };
        hand(((hour % 12) / 12) * Math.PI * 2 - Math.PI / 2, cr * 0.48, cr * 0.075, "#2D3148");
        hand(((hour % 1) * Math.PI * 2) - Math.PI / 2, cr * 0.72, cr * 0.05, "#2D3148");
        g.fillStyle = "#E06A92"; g.beginPath(); g.arc(cx, cy, cr * 0.06, 0, Math.PI * 2); g.fill();
        g.restore();
        // The calendar: its nail and string, the shop's card with the year, the pad (thicker the
        // earlier in the year), the day on top. It jolts as each page lands.
        const { Y, M, D } = calDate(day);
        const left = (Date.UTC(Y, 11, 31) - Date.UTC(Y, M, D)) / DAY_MS;
        const landed = rewindPages.findLast((p) => p.land <= now);
        const jolt = landed ? Math.max(0, 1 - (now - landed.land) / 0.12) * ph * 0.012 : 0;
        g.save();
        g.translate(0, jolt);
        g.strokeStyle = "rgba(70, 50, 40, 0.6)"; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(padX + pw * 0.2, padY - headH); g.lineTo(padX + pw / 2, padY - headH - ph * 0.12); g.lineTo(padX + pw * 0.8, padY - headH); g.stroke();
        g.fillStyle = "#8D8D96"; g.beginPath(); g.arc(padX + pw / 2, padY - headH - ph * 0.12, ph * 0.012, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(60, 40, 30, 0.25)"; g.fillRect(padX + pw * 0.03, padY - headH + ph * 0.03, pw, headH + ph + ph * 0.07);
        const card = g.createLinearGradient(0, padY - headH, 0, padY);
        card.addColorStop(0, "#D9414D"); card.addColorStop(1, "#B5303B");
        g.fillStyle = card; g.fillRect(padX - pw * 0.03, padY - headH, pw * 1.06, headH);
        g.textAlign = "center";
        g.fillStyle = "#F6CE72"; g.font = `800 ${(headH * 0.42).toFixed(1)}px Inter, system-ui, sans-serif`;
        g.fillText(String(Y), padX + pw / 2, padY - headH * 0.42);
        g.fillStyle = "rgba(255, 245, 235, 0.92)"; g.font = `700 ${(headH * 0.17).toFixed(1)}px Inter, system-ui, sans-serif`;
        g.fillText("토끼 문구 · ☎ 1219-2022", padX + pw / 2, padY - headH * 0.13);
        const thick = 2 + (left / 365) * ph * 0.08;
        for (let i = Math.ceil(thick / 2); i >= 1; i--) { g.fillStyle = i % 2 ? "#E9E3D6" : "#D9D2C2"; g.fillRect(padX, padY + ph + i * 2 - 2, pw, 2); }
        calPage(g, day, padX, padY, pw, ph, frame);
        g.restore();
        // The days flying back up onto it from the floor, turning over and over, flat as they land.
        for (const p of rewindPages) {
          const start = p.land - p.dur;
          if (now < start || now >= p.land) continue;
          const q = (now - start) / p.dur, e = easeOut3(q);
          const x = mix(padX + pw / 2 + p.x0 * w * 0.45, padX + pw / 2, e) + Math.sin(q * Math.PI) * p.sway * w * 0.08;
          const y = mix(h + ph * 0.75, padY + ph / 2, e);
          const turn = Math.cos(p.flip * (1 - e));
          g.save();
          const near = mix(1.3, 1, e);
          g.translate(x, y); g.rotate(p.rot * (1 - e)); g.scale(near, near * turn);
          if (!SCENE_LITE) { g.shadowColor = "rgba(60, 40, 30, 0.25)"; g.shadowBlur = 10; g.shadowOffsetY = 6; }
          if (turn >= 0) calPage(g, p.day, -pw / 2, -ph / 2, pw, ph, SCENE_LITE ? null : frame);
          else {
            g.fillStyle = "#EEE9DE"; g.fillRect(-pw / 2, -ph / 2, pw, ph);
            g.scale(-1, 1); g.globalAlpha = 0.09; g.fillStyle = "#24283B"; g.textAlign = "center";
            g.font = `800 ${(ph * 0.32).toFixed(1)}px Inter, system-ui, sans-serif`; g.fillText(String(calDate(p.day).D), 0, ph * 0.3);
          }
          g.restore();
        }
        // Night falls and lifts on the wall with every day; the start fades up from black.
        g.setTransform(r, 0, 0, r, 0, 0);
        g.fillStyle = `rgba(20, 26, 60, ${(0.32 * (1 - sun)).toFixed(3)})`; g.fillRect(0, 0, w, h);
        if (now < 0.3) { g.fillStyle = `rgba(6, 8, 20, ${(1 - now / 0.3).toFixed(3)})`; g.fillRect(0, 0, w, h); }
      };
      // ── seasons: Danielle under a tree while the year turns round her ──
      // Bar 5 spring (the tree blossoms), bar 6 summer, bar 7 autumn: the a cappella bar stops time,
      // the leaves hanging in the air, the sun standing still; bar 8 "기다렸지 all this time": the
      // leaves come down, the tree goes bare, the first snow. She does not change ("처음 느낌 그대로").
      // The tree's leaves are the MV, in the season's colour; some of the falling leaves carry it too.
      const SEASON = {
        skyTop: [[178, 214, 243], [104, 176, 236], [226, 160, 112], [176, 187, 208]],
        skyLow: [[252, 228, 238], [218, 241, 255], [250, 218, 180], [232, 236, 243]],
        hill: [[165, 204, 156], [104, 166, 100], [208, 158, 88], [214, 222, 236]],
        far: [[196, 222, 214], [150, 196, 186], [222, 190, 150], [200, 208, 224]],
        ground: [[150, 202, 138], [104, 168, 90], [214, 172, 82], [238, 242, 248]],
        leaf: [[248, 176, 204], [92, 166, 90], [244, 188, 52], [244, 188, 52]],
      };
      const seasonAt = (key, s) => { const i = Math.min(2, Math.floor(s)), f = s - i, a = SEASON[key][i], b = SEASON[key][i + 1]; return a.map((v, k) => v + (b[k] - v) * f); };
      const rgba = (c, a = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
      const SEASON_TURNS = [[3.7, 4.3], [7.7, 8.3], [11.9, 12.6]];
      const SEASON_NAMES = ["2023 봄 · spring", "여름 · summer", "가을 · autumn", "겨울 · 첫눈"];
      // Time as the leaves feel it: stopped (almost) through the a cappella bar.
      const leafTime = (b) => (b < 9.5 ? b : b < 12 ? 9.5 + (b - 9.5) * 0.03 : 9.575 + (b - 12));
      const frozen = document.createElement("canvas");
      let frozenAt = -1;
      const treeShape = (w, h, wide) => {
        const rnd = seeded(11);
        const base = [wide ? w * 0.4 : w * 0.36, wide ? h * 0.8 : h * 0.77];
        const len0 = wide ? h * 0.19 : h * 0.14, width0 = wide ? Math.min(w, h) * 0.05 : w * 0.06;
        const segs = [], tips = [];
        const grow = (x, y, angle, len, width, depth) => {
          const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
          segs.push([x, y, x2, y2, width]);
          if (depth >= 2) tips.push([x2, y2, len * (depth >= 6 ? 0.95 : depth === 2 ? 0.7 : 0.8)]);
          if (depth >= 6) return;
          const n = depth < 2 ? 2 : rnd() < 0.35 ? 3 : 2;
          for (let k = 0; k < n; k++) {
            const spread = (k / (n - 1) - 0.5) * (0.7 + rnd() * 0.35);
            grow(x2, y2, angle + spread + (rnd() - 0.5) * 0.25, len * (0.72 + rnd() * 0.12), width * 0.66, depth + 1);
          }
        };
        grow(base[0], base[1], -Math.PI / 2 + (rnd() - 0.5) * 0.06, len0, width0, 0);
        // Lean it so the crown sits over the trunk (the higher, the more it moves).
        const top = Math.min(...tips.map(([, y]) => y)), mid = tips.reduce((sum, [x]) => sum + x, 0) / tips.length;
        const lean = (y) => (base[0] - mid) * clamp((base[1] - y) / (base[1] - top));
        segs.forEach((sg) => { sg[0] += lean(sg[1]); sg[2] += lean(sg[3]); });
        tips.forEach((tp) => { tp[0] += lean(tp[1]); });
        const box = tips.reduce((b, [x, y, r]) => [Math.min(b[0], x - r), Math.min(b[1], y - r), Math.max(b[2], x + r), Math.max(b[3], y + r)], [Infinity, Infinity, -Infinity, -Infinity]);
        const dots = tips.flatMap(([x, y, r], i) => [0, 1, 2].map((k) => { const a = rnd() * Math.PI * 2; return [x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, r * (0.16 + rnd() * 0.14), rnd(), i]; }));
        return { base, segs, tips, box, dots };
      };
      let tree = null;
      const drawSeasons = (now) => {
        const { g, w, h, wide } = prep();
        const b = (now - DT_MV(0, 5)) / DT_BEAT, tau = leafTime(b), tSec = tau * DT_BEAT;
        const s = SEASON_TURNS.reduce((sum, [a, c]) => sum + easeIO(clamp((b - a) / (c - a))), 0);
        const winter = clamp(s - 2);
        if (!tree || tree.w !== w || tree.h !== h) tree = { ...treeShape(w, h, wide), w, h };
        const ground = tree.base[1];
        // The sky; the sun crossing it once a bar (stopped in the a cappella), gone behind the snow clouds.
        const sky = g.createLinearGradient(0, 0, 0, ground);
        sky.addColorStop(0, rgba(seasonAt("skyTop", s))); sky.addColorStop(1, rgba(seasonAt("skyLow", s)));
        g.fillStyle = sky; g.fillRect(0, 0, w, h);
        const arc = Math.PI * ((tau / 4) % 1);
        const sunX = w * (0.08 + 0.84 * ((tau / 4) % 1)), sunY = ground * 0.78 - Math.sin(arc) * ground * 0.62;
        if (winter < 1) {
          const glow = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.min(w, h) * 0.22);
          glow.addColorStop(0, `rgba(255, 250, 225, ${0.95 * (1 - winter)})`); glow.addColorStop(0.18, `rgba(255, 240, 200, ${0.7 * (1 - winter)})`); glow.addColorStop(1, "rgba(255, 240, 200, 0)");
          g.fillStyle = glow; g.fillRect(0, 0, w, h);
        }
        if (winter > 0) {
          const rnd = seeded(3);
          for (let i = 0; i < 14; i++) {
            const cx = rnd() * w * 1.2 - w * 0.1, cy = rnd() * ground * 0.45, cr = Math.min(w, h) * (0.12 + rnd() * 0.12);
            const cloud = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
            cloud.addColorStop(0, `rgba(206, 212, 226, ${0.85 * winter})`); cloud.addColorStop(1, "rgba(206, 212, 226, 0)");
            g.fillStyle = cloud; g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
          }
        }
        // Far hills with their own little trees, a nearer hill, the ground.
        const hill = (y0, amp, color, phase) => {
          g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
          for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x / w * Math.PI * 2 + phase) * amp + Math.sin(x / w * 9 + phase * 2) * amp * 0.25);
          g.lineTo(w, h); g.closePath(); g.fill();
        };
        hill(ground - h * 0.16, h * 0.035, rgba(seasonAt("far", s)), 1.2);
        const leafC = seasonAt("leaf", s);
        const rf = seeded(21);
        for (let i = 0; i < 16; i++) {
          const x = rf() * w, y = ground - h * 0.15 + Math.sin(x / w * Math.PI * 2 + 1.2) * h * 0.035, rr = h * (0.012 + rf() * 0.012);
          g.fillStyle = "rgba(90, 70, 60, 0.5)"; g.fillRect(x - 1, y - rr * 0.4, 2, rr * 1.6);
          if (winter < 1) { g.fillStyle = rgba(leafC, 0.75 * (1 - winter)); g.beginPath(); g.arc(x, y - rr, rr, 0, Math.PI * 2); g.fill(); }
        }
        hill(ground - h * 0.06, h * 0.02, rgba(seasonAt("hill", s)), 2.4);
        g.fillStyle = rgba(seasonAt("ground", s)); g.fillRect(0, ground - h * 0.01, w, h);
        // The shadows of the tree and of her, swinging round with the sun (soft and round under cloud).
        const lean = Math.cos(arc) * (1 - winter);
        const shade = (x, rx, ry) => {
          g.save(); g.translate(x, ground + ry * 0.4); g.transform(1, 0, -lean * 1.6, 1, 0, 0);
          const sh = g.createRadialGradient(0, 0, 0, 0, 0, rx);
          sh.addColorStop(0, "rgba(40, 50, 60, 0.32)"); sh.addColorStop(1, "rgba(40, 50, 60, 0)");
          g.scale(1, ry / rx); g.fillStyle = sh; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
        };
        const [bx0, by0, bx1, by1] = tree.box;
        shade(tree.base[0], (bx1 - bx0) * 0.55, h * 0.05);
        // The fallen leaves on the ground (autumn), going under the snow.
        const fallen = clamp((tau - 8.5) / 3) * (1 - clamp((b - 13) / 2.5));
        if (fallen > 0) {
          const rg = seeded(41);
          for (let i = 0; i < 90; i++) {
            const x = tree.base[0] + (rg() - 0.5) * (bx1 - bx0) * 1.4, y = ground + rg() * h * 0.08;
            if (rg() > fallen) continue;
            g.fillStyle = rgba(seasonAt("leaf", 2).map((v) => v * (0.8 + rg() * 0.3)), 0.85);
            g.beginPath(); g.ellipse(x, y, h * 0.008, h * 0.004, rg() * 3, 0, Math.PI * 2); g.fill();
          }
        }
        // The tree: its branches, snow settling along them.
        g.lineCap = "round"; g.strokeStyle = "#4A3A33";
        for (const [x1, y1, x2, y2, width] of tree.segs) { g.lineWidth = width; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        if (winter > 0) {
          g.strokeStyle = `rgba(250, 252, 255, ${0.9 * clamp((b - 13) / 2)})`;
          for (const [x1, y1, x2, y2, width] of tree.segs) { if (width < 1.5) continue; g.lineWidth = width * 0.35; g.beginPath(); g.moveTo(x1, y1 - width * 0.35); g.lineTo(x2, y2 - width * 0.35); g.stroke(); }
        }
        // The crown: the MV through the leaves, coloured by the season; it blossoms in, thins as the
        // leaves fall, and is gone by winter. In the stopped bar the picture stops too.
        const bloom = easeOut3(clamp(b / 2.2));
        const crown = bloom * (1 - 0.35 * clamp((tau - 8.6) / 1)) * (1 - clamp((tau - 9.8) / 1.6));
        if (crown > 0.01) {
          let leaves = mv(now);
          if (b >= 9.5 && b < 12) {
            if (frozenAt < 0) { frozen.width = leaves.width; frozen.height = leaves.height; frozen.getContext("2d").drawImage(leaves, 0, 0); frozenAt = now; }
            leaves = frozen;
          } else frozenAt = -1;
          const sway = Math.sin(tSec * 1.3) * h * 0.004;
          g.save();
          g.globalAlpha = Math.min(1, crown * 1.2);
          g.beginPath();
          for (const [x, y, r] of tree.tips) { const rr = r * (0.35 + 0.65 * bloom) * (0.75 + 0.25 * crown); g.moveTo(x + sway + rr, y); g.arc(x + sway, y, rr, 0, Math.PI * 2); }
          g.clip();
          cover(g, leaves, bx0, by0, bx1 - bx0, by1 - by0);
          g.globalCompositeOperation = "screen"; g.fillStyle = "rgba(255, 255, 255, 0.38)"; g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
          g.globalCompositeOperation = "color"; g.fillStyle = rgba(leafC); g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
          g.globalCompositeOperation = "soft-light";
          const lit = g.createLinearGradient(0, by0, 0, by1);
          lit.addColorStop(0, "rgba(255, 255, 255, 0.55)"); lit.addColorStop(1, "rgba(0, 0, 0, 0.45)");
          g.fillStyle = lit; g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
          g.restore();
          // the leaves round its edge
          g.save(); g.globalAlpha = Math.min(1, crown * 1.1);
          for (const [x, y, r, v] of tree.dots) {
            const rr = r * (0.35 + 0.65 * bloom);
            g.fillStyle = s < 0.5 && v > 0.6 ? "rgba(255, 246, 250, 0.95)" : rgba(leafC.map((c) => Math.min(255, c * (0.82 + v * 0.36))));
            g.beginPath(); g.arc(x + sway, y, rr, 0, Math.PI * 2); g.fill();
          }
          g.restore();
        }
        // Her, the same through it all.
        const doll = pic("danielle-anime.webp");
        if (doll) {
          const fh = wide ? h * 0.47 : h * 0.33, fw = fh * (568 / 1100);
          const fx = wide ? tree.base[0] + (bx1 - bx0) * 0.3 : w * 0.7;
          shade(fx, fw * 0.5, h * 0.018);
          g.drawImage(doll, 266, 0, 568, 1100, fx - fw / 2, ground + h * 0.01 - fh, fw, fh);
        }
        // What falls: blossom petals in spring, leaves in autumn (some of them carrying the MV), the
        // first snow on "기다렸지 all this time".
        const fall = (count, seed, from, to, draw) => {
          const rp = seeded(seed);
          for (let i = 0; i < count; i++) {
            const tip = tree.tips[Math.floor(rp() * tree.tips.length)];
            const start = from + rp() * (to - from), speed = h * (0.05 + rp() * 0.05), drift = (rp() - 0.5) * w * 0.05, spin = rp() * 6, size = 0.7 + rp() * 0.6;
            const age = (tau - start) * DT_BEAT;
            if (age < 0) continue;
            const y = tip[1] + age * speed;
            if (y > ground + h * 0.06) continue;
            const x = tip[0] + drift * age + Math.sin(age * 2.2 + spin) * w * 0.012;
            draw(x, y, age * 3 + spin, size, i);
          }
        };
        if (b < 6) fall(46, 7, 0.8, 4.5, (x, y, a, size) => {
          g.save(); g.translate(x, y); g.rotate(a); g.scale(1, Math.abs(Math.cos(a * 0.7)) + 0.2);
          g.fillStyle = "rgba(255, 214, 228, 0.95)"; g.beginPath(); g.ellipse(0, 0, h * 0.007 * size, h * 0.0045 * size, 0, 0, Math.PI * 2); g.fill(); g.restore();
        });
        const autumnLeaf = seasonAt("leaf", 2);
        if (tau > 8.4) fall(96, 9, 8.5, 13.3, (x, y, a, size, i) => {
          const r = h * (i % 4 === 0 ? 0.034 : 0.02) * size;
          g.save(); g.translate(x, y); g.rotate(a); g.scale(1, Math.abs(Math.cos(a * 0.6)) * 0.8 + 0.2);
          g.beginPath(); g.moveTo(0, r * 0.5); g.arc(0, r * 0.5, r, -Math.PI * 0.85, -Math.PI * 0.15); g.closePath();
          if (i % 4 === 0) { g.save(); g.clip(); cover(g, mv(now), -r, -r * 0.5, r * 2, r * 1.2); g.globalCompositeOperation = "color"; g.fillStyle = rgba(autumnLeaf); g.fillRect(-r, -r * 0.6, r * 2, r * 1.3); g.restore(); }
          else { g.fillStyle = rgba(autumnLeaf.map((c) => c * (0.85 + (i % 3) * 0.08))); g.fill(); }
          g.restore();
        });
        if (b > 12.2) {
          const rs = seeded(13);
          g.fillStyle = "#FFFFFF";
          for (let i = 0; i < 150; i++) {
            const start = 12.2 + rs() * 3, x0 = rs() * w, size = 1 + rs() * 2.4, speed = h * (0.06 + rs() * 0.06);
            const age = (b - start) * DT_BEAT;
            if (age < 0) continue;
            const y = -10 + age * speed + rs() * h * 0.2;
            if (y > h) continue;
            g.globalAlpha = 0.85;
            g.beginPath(); g.arc(x0 + Math.sin(age * 1.4 + i) * 12, y, size, 0, Math.PI * 2); g.fill();
          }
          g.globalAlpha = 1;
        }
        // While time stands still (the a cappella bar), a faint haze over it all.
        const still = clamp((b - 9.5) / 0.4) * (1 - clamp((b - 11.8) / 0.3));
        if (still > 0) { g.fillStyle = `rgba(236, 240, 255, ${(0.14 * still).toFixed(3)})`; g.fillRect(0, 0, w, h); }
        // The season, written in the corner like a photo album's caption.
        const name = SEASON_NAMES[Math.min(3, Math.round(s))];
        g.font = `700 ${Math.round(Math.min(w, h) * 0.045)}px Gaegu, cursive`; g.textAlign = "left";
        g.fillStyle = "rgba(40, 44, 70, 0.55)"; g.fillText(name, w * 0.05 + 2, h * 0.1 + 2);
        g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.fillText(name, w * 0.05, h * 0.1);
        const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        vig.addColorStop(0, "rgba(0, 0, 0, 0)"); vig.addColorStop(1, "rgba(20, 20, 40, 0.3)");
        g.fillStyle = vig; g.fillRect(0, 0, w, h);
      };
      // ── plane: Hyein's paper plane over the snowy schoolyard ──
      // "I got nothing to lose": from the camera close on her classroom window, she throws it (beat 3)
      // and the camera pulls back and follows it; "널 좋아한다고 ooh-whoa ×3": a loop, a barrel roll,
      // a loop, then it climbs into the sun. Her note is on its wings (in pencil, on lined paper); the
      // MV is under them, seen whenever it rolls or loops.
      const PLANE_PTS = { N: [1, 0, 0], T: [-0.75, 0, 0], L: [-0.75, 0.07, -0.52], R: [-0.75, 0.07, 0.52], K: [-0.75, -0.24, 0] };
      const PLANE_UV = { N: [1, 0.5], T: [0, 0.5], L: [0, 0], R: [0, 1], K: [0, 0.5] };
      const PLANE_FACES = [["N", "T", "L", true], ["N", "R", "T", true], ["N", "K", "T", false], ["N", "T", "K", false]];
      let noteTex = null;
      const makeNote = () => {
        const c = document.createElement("canvas");
        c.width = 512; c.height = 256;
        const g = c.getContext("2d");
        g.fillStyle = "#FCFBF6"; g.fillRect(0, 0, 512, 256);
        g.strokeStyle = "rgba(120, 160, 220, 0.55)"; g.lineWidth = 1.5;
        for (let y = 16; y < 256; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
        g.strokeStyle = "rgba(232, 110, 140, 0.6)"; g.beginPath(); g.moveTo(18, 0); g.lineTo(18, 256); g.stroke();
        g.fillStyle = "#34406A"; g.font = "700 36px Gaegu, cursive"; g.fillText("널 좋아한다고 ♡", 22, 182);
        g.font = "700 26px Gaegu, cursive"; g.fillText("- 혜인", 40, 220);
        g.fillStyle = "rgba(226, 104, 150, 0.85)"; g.font = "700 26px Gaegu, cursive"; g.fillText("☆ say it ditto", 46, 98);
        return c;
      };
      // A picture mapped onto a triangle: the affine map from three points of it (u, v in pixels) to
      // three points on the screen.
      const texTri = (g, img, p0, p1, p2, t0, t1, t2) => {
        const du1 = t1[0] - t0[0], dv1 = t1[1] - t0[1], du2 = t2[0] - t0[0], dv2 = t2[1] - t0[1];
        const det = du1 * dv2 - du2 * dv1;
        if (Math.abs(det) < 1e-6) return;
        const dx1 = p1[0] - p0[0], dy1 = p1[1] - p0[1], dx2 = p2[0] - p0[0], dy2 = p2[1] - p0[1];
        const a = (dx1 * dv2 - dx2 * dv1) / det, b = (dy1 * dv2 - dy2 * dv1) / det;
        const c = (dx2 * du1 - dx1 * du2) / det, d = (dy2 * du1 - dy1 * du2) / det;
        g.save();
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath(); g.clip();
        g.transform(a, b, c, d, p0[0] - a * t0[0] - c * t0[1], p0[1] - b * t0[0] - d * t0[1]);
        g.drawImage(img, 0, 0);
        g.restore();
      };
      // The plane's turns: roll about its length, pitch its nose up, yaw it toward us, and the view
      // from a little above.
      const turnPoint = ([x, y, z], { yaw, pitch, roll }) => {
        const y1 = y * Math.cos(roll) - z * Math.sin(roll), z1 = y * Math.sin(roll) + z * Math.cos(roll);
        const x2 = x * Math.cos(pitch) - y1 * Math.sin(pitch), y2 = x * Math.sin(pitch) + y1 * Math.cos(pitch);
        const x3 = x2 * Math.cos(yaw) + z1 * Math.sin(yaw), z3 = -x2 * Math.sin(yaw) + z1 * Math.cos(yaw);
        const tilt = 0.42;
        return [x3, y2 * Math.cos(tilt) - z3 * Math.sin(tilt), y2 * Math.sin(tilt) + z3 * Math.cos(tilt)];
      };
      // Where it is (on the screen) and how it is turned, b beats into the part.
      const planePose = (b, w, h, hand) => {
        let px = w * 0.42, py = h * 0.42 + Math.sin(b * 1.3) * h * 0.03, s = Math.min(w, h) * 0.3;
        let yaw = -0.4 + Math.sin(b * 0.7) * 0.12, pitch = Math.sin(b * 1.3 + 1) * 0.09, roll = Math.sin(b * 0.9) * 0.2;
        if (b < 4) {
          const q = easeOut3(clamp((b - 2) / 2));
          px = mix(hand[0], px, q); py = mix(hand[1], py, q); s = mix(s * 0.16, s, q);
          yaw = mix(-1.2, yaw, q); pitch = mix(0.3, pitch, q); roll = mix(0, roll, q);
        }
        const loop = (start, dur, radius) => {
          const q = clamp((b - start) / dur);
          if (q <= 0 || q >= 1) return;
          const a = easeIO(q) * Math.PI * 2;
          px += Math.sin(a) * radius * 0.7; py -= (1 - Math.cos(a)) * radius; pitch += a;
        };
        loop(6, 1.6, h * 0.2);
        const rq = clamp((b - 10) / 1.2);
        if (rq > 0 && rq < 1) { roll += easeIO(rq) * Math.PI * 2; py -= Math.sin(rq * Math.PI) * h * 0.07; }
        loop(13, 1.5, h * 0.22);
        const sq = easeIO(clamp((b - 14.5) / 1.4));
        px = mix(px, w * 0.82, sq); py = mix(py, h * 0.13, sq); s *= 1 - 0.88 * sq; pitch += sq * 0.5;
        return { px, py, s, yaw, pitch, roll };
      };
      const drawPaperPlane = (g, pose, mvPic) => {
        noteTex ??= makeNote();
        const pts = {};
        for (const [name, p] of Object.entries(PLANE_PTS)) {
          const [x, y, z] = turnPoint(p, pose);
          const persp = 1 / (1 - z * 0.12);
          pts[name] = [pose.px + pose.s * x * persp, pose.py - pose.s * y * persp, z];
        }
        const faces = PLANE_FACES.map(([a, b2, c, wing]) => ({ a, b: b2, c, wing, z: (pts[a][2] + pts[b2][2] + pts[c][2]) / 3 })).sort((f1, f2) => f1.z - f2.z);
        for (const f of faces) {
          const p0 = pts[f.a], p1 = pts[f.b], p2 = pts[f.c];
          const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
          const front = area > 0;
          if (f.wing) {
            const img = front ? noteTex : mvPic;
            const uv = (n) => [PLANE_UV[n][0] * (img.width - 1), PLANE_UV[n][1] * (img.height - 1)];
            texTri(g, img, p0, p1, p2, uv(f.a), uv(f.b), uv(f.c));
          } else {
            g.fillStyle = front ? "#ECE9E0" : "#DAD6CB";
            g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath(); g.fill();
          }
          // shading by how it faces the light, and the fold's edge
          const shadeA = Math.max(0, Math.min(0.35, (front ? 0.06 : 0.22) + (f.wing ? 0 : 0.08) - Math.abs(area) / (pose.s * pose.s * 6)));
          g.fillStyle = `rgba(30, 40, 70, ${shadeA.toFixed(3)})`;
          g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath(); g.fill();
          g.strokeStyle = "rgba(60, 70, 100, 0.35)"; g.lineWidth = 1; g.stroke();
        }
      };
      // The school: four floors of classroom windows, the clock and the name over the door, snow on
      // every ledge. Drawn at the camera's zoom, so it stays sharp close up.
      const SCHOOL_WINDOW = [11, 1];
      const drawSchool = (g, w, h, ground, hyein, b) => {
        const left = -w * 0.06, right = w * 1.06, floors = 4, floorH = h * 0.085, top = ground - floors * floorH - h * 0.03;
        g.fillStyle = "#E9DFCF"; g.fillRect(left, top, right - left, ground - top);
        g.fillStyle = "#F4EDE2"; g.fillRect(left, top - h * 0.012, right - left, h * 0.014);
        g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.fillRect(left, top - h * 0.018, right - left, h * 0.007);
        const tower = [w * 0.42, w * 0.58];
        g.fillStyle = "#EFE6D8"; g.fillRect(tower[0], top - h * 0.09, tower[1] - tower[0], ground - top + h * 0.09);
        g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.fillRect(tower[0], top - h * 0.096, tower[1] - tower[0], h * 0.008);
        const clockR = h * 0.032, ccx = (tower[0] + tower[1]) / 2, ccy = top - h * 0.045;
        g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(ccx, ccy, clockR, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#3A4466"; g.lineWidth = Math.max(1, clockR * 0.12); g.stroke();
        g.lineWidth = Math.max(1, clockR * 0.1); g.lineCap = "round";
        g.beginPath(); g.moveTo(ccx, ccy); g.lineTo(ccx, ccy - clockR * 0.7); g.moveTo(ccx, ccy); g.lineTo(ccx + clockR * 0.42, ccy + clockR * 0.25); g.stroke();
        g.fillStyle = "#3A4466"; g.font = `800 ${(h * 0.026).toFixed(1)}px Inter, system-ui, sans-serif`; g.textAlign = "center";
        g.fillText("버니 고등학교", ccx, ground - floorH * 1.35);
        const cols = 24, colW = (right - left) / cols;
        for (let f = 0; f < floors; f++) {
          const y = top + f * floorH + floorH * 0.18, wh = floorH * 0.58;
          for (let c = 0; c < cols; c++) {
            const x = left + c * colW + colW * 0.12, ww = colW * 0.76;
            if (x + ww > tower[0] && x < tower[1] && f === floors - 1) continue;
            const open = c === SCHOOL_WINDOW[0] && f === SCHOOL_WINDOW[1];
            const glass = g.createLinearGradient(0, y, 0, y + wh);
            glass.addColorStop(0, open ? "#2B2F45" : "#8FA9D2"); glass.addColorStop(1, open ? "#3B3A55" : "#5C6F98");
            g.fillStyle = glass; g.fillRect(x, y, ww, wh);
            if (open && hyein) {
              g.save(); g.beginPath(); g.rect(x, y, ww, wh); g.clip();
              const fh = wh * 2.4, fw = fh * (622 / 1100);
              g.drawImage(hyein, 239, 0, 622, 1100, x + ww * 0.5 - fw / 2, y + wh * 0.08, fw, fh);
              g.restore();
            }
            g.strokeStyle = "#F7F4EE"; g.lineWidth = Math.max(1, colW * 0.05);
            g.strokeRect(x, y, ww, wh);
            if (!open) { g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + wh); g.stroke(); }
            g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.fillRect(x - colW * 0.04, y + wh, ww + colW * 0.08, Math.max(1.5, floorH * 0.06));
          }
        }
        g.fillStyle = "#9C8F80"; g.fillRect(left, ground - floorH * 0.05, right - left, floorH * 0.05);
        // the door
        g.fillStyle = "#5E6E92"; g.fillRect(ccx - colW * 0.9, ground - floorH * 0.9, colW * 1.8, floorH * 0.9);
        g.strokeStyle = "#F7F4EE"; g.strokeRect(ccx - colW * 0.9, ground - floorH * 0.9, colW * 1.8, floorH * 0.9);
        return { x: left + SCHOOL_WINDOW[0] * colW + colW * 0.5, y: top + SCHOOL_WINDOW[1] * floorH + floorH * 0.47, colW };
      };
      const drawPlane = (now) => {
        const { g, w, h, r, wide } = prep();
        const b = (now - DT_MV(0, 9)) / DT_BEAT;
        const frame = mv(now);
        const ground = h * (wide ? 0.74 : 0.7);
        // The camera: close on her window, pulling back as she throws, then following the plane.
        const pull = easeIO(clamp((b - 1.8) / 2.4));
        const zoom = mix(wide ? 3.4 : 4.2, 1, pull);
        const cam = Math.max(0, b - 2.2) * 0.2 * w;
        const anchor = [w * 0.4767, ground - h * 0.245];
        const sx0 = mix(w / 2, anchor[0], pull), sy0 = mix(h * 0.5, anchor[1], pull);
        const layer = (k) => g.setTransform(r * zoom, 0, 0, r * zoom, r * (sx0 - (anchor[0] + cam * k) * zoom), r * (sy0 - anchor[1] * zoom));
        // The winter sky and the sun it will fly into; clouds.
        g.setTransform(r, 0, 0, r, 0, 0);
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#8DB8E8"); sky.addColorStop(0.7, "#DCE9F7"); sky.addColorStop(1, "#EEF3FA");
        g.fillStyle = sky; g.fillRect(0, 0, w, h);
        const sun = [w * 0.82, h * 0.13];
        const sunGlow = g.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], Math.min(w, h) * 0.3);
        sunGlow.addColorStop(0, "rgba(255, 252, 235, 1)"); sunGlow.addColorStop(0.12, "rgba(255, 246, 215, 0.85)"); sunGlow.addColorStop(1, "rgba(255, 246, 215, 0)");
        g.fillStyle = sunGlow; g.fillRect(0, 0, w, h);
        layer(0.05);
        const rc = seeded(31);
        for (let i = 0; i < 9; i++) {
          const cx = rc() * w * 2.2 - w * 0.2, cy = h * (0.08 + rc() * 0.28), cr = Math.min(w, h) * (0.06 + rc() * 0.08);
          for (let k = 0; k < 4; k++) {
            const px = cx + k * cr * 0.7, py = cy + Math.sin(k * 2) * cr * 0.15, pr = cr * (0.6 + (k % 2) * 0.3);
            const puff = g.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr);
            puff.addColorStop(0, "rgba(255, 255, 255, 0.95)"); puff.addColorStop(0.7, "rgba(246, 249, 255, 0.85)"); puff.addColorStop(1, "rgba(236, 242, 252, 0)");
            g.fillStyle = puff; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
          }
        }
        // Mountains, snow on top; far apartment blocks.
        layer(0.1);
        g.fillStyle = "#AFC0DA"; g.beginPath(); g.moveTo(-w, ground);
        for (let x = -w; x <= w * 4; x += 20) g.lineTo(x, ground - h * 0.2 - Math.sin(x / w * 3.1) * h * 0.06 - Math.sin(x / w * 7.3) * h * 0.025);
        g.lineTo(w * 4, ground); g.closePath(); g.fill();
        g.fillStyle = "rgba(255, 255, 255, 0.8)";
        for (let x = -w; x <= w * 4; x += 20) { const y = ground - h * 0.2 - Math.sin(x / w * 3.1) * h * 0.06 - Math.sin(x / w * 7.3) * h * 0.025; if (y < ground - h * 0.24) g.fillRect(x, y, 20, h * 0.012); }
        layer(0.2);
        const ra = seeded(8);
        for (let i = 0; i < 22; i++) {
          const x = -w * 0.5 + i * w * 0.2 + ra() * w * 0.08, bw = w * (0.05 + ra() * 0.05), bh = h * (0.08 + ra() * 0.1);
          g.fillStyle = "#C3CDDF"; g.fillRect(x, ground - bh, bw, bh);
          g.fillStyle = "rgba(255, 255, 255, 0.85)"; g.fillRect(x, ground - bh, bw, h * 0.006);
        }
        // The school, and her at the window.
        layer(0.45);
        const win = drawSchool(g, w, h, ground, pic("hyein-anime.webp"), b);
        const handScreen = [sx0 + (win.x - anchor[0] - cam * 0.45) * zoom, sy0 + (win.y - anchor[1]) * zoom];
        // The schoolyard under snow: the track, a goal, a snowman, bare trees, the fence going by.
        layer(0.8);
        g.fillStyle = "#EEF2F9"; g.fillRect(-w, ground, w * 6, h);
        g.strokeStyle = "rgba(170, 186, 214, 0.7)"; g.lineWidth = 2;
        [0.06, 0.13].forEach((d) => { g.beginPath(); g.moveTo(-w, ground + h * d); g.bezierCurveTo(w, ground + h * (d + 0.05), w * 2.5, ground + h * (d + 0.07), w * 5, ground + h * d); g.stroke(); });
        const gx = w * 1.5;
        g.strokeStyle = "#FFFFFF"; g.lineWidth = Math.max(2, w * 0.004);
        g.strokeRect(gx, ground - h * 0.02, w * 0.18, h * 0.09);
        g.strokeStyle = "rgba(200, 210, 230, 0.6)"; g.lineWidth = 1;
        for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(gx + (w * 0.18 * k) / 8, ground - h * 0.02); g.lineTo(gx + (w * 0.18 * k) / 8 + w * 0.01, ground + h * 0.07); g.stroke(); }
        const sm = [w * 2.3, ground + h * 0.11];
        g.fillStyle = "#FFFFFF";
        [[0, 0.05], [-0.075, 0.035], [-0.13, 0.024]].forEach(([dy, rr]) => { g.beginPath(); g.arc(sm[0], sm[1] + dy * h, rr * h, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = "#E86A92"; g.fillRect(sm[0] - h * 0.03, sm[1] - h * 0.105, h * 0.06, h * 0.012);
        g.fillStyle = "#2E3350"; [[-0.008, -0.135], [0.008, -0.135]].forEach(([dx, dy]) => { g.beginPath(); g.arc(sm[0] + dx * h, sm[1] + dy * h, h * 0.003, 0, Math.PI * 2); g.fill(); });
        g.strokeStyle = "#5A4A42"; g.lineCap = "round";
        const rt = seeded(17);
        for (let i = 0; i < 14; i++) {
          const tx = -w * 0.2 + i * w * 0.36 + rt() * w * 0.1, th = h * (0.1 + rt() * 0.05);
          g.lineWidth = Math.max(2, w * 0.004); g.beginPath(); g.moveTo(tx, ground + h * 0.02); g.lineTo(tx, ground + h * 0.02 - th); g.stroke();
          g.lineWidth = Math.max(1, w * 0.0018);
          for (let k = 0; k < 5; k++) { const y = ground + h * 0.02 - th * (0.45 + k * 0.12); g.beginPath(); g.moveTo(tx, y); g.lineTo(tx + (k % 2 ? 1 : -1) * th * 0.25, y - th * 0.18); g.stroke(); }
        }
        layer(1.25);
        g.fillStyle = "#6F7FA6";
        for (let i = 0; i < 60; i++) { const x = -w * 0.2 + i * w * 0.09; g.fillRect(x, ground + h * 0.17, Math.max(2, w * 0.004), h * 0.07); }
        g.fillRect(-w, ground + h * 0.18, w * 8, Math.max(2, h * 0.004));
        g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.fillRect(-w, ground + h * 0.176, w * 8, Math.max(2, h * 0.005));
        // Falling snow.
        g.setTransform(r, 0, 0, r, 0, 0);
        const rs = seeded(23);
        g.fillStyle = "#FFFFFF";
        for (let i = 0; i < (SCENE_LITE ? 50 : 100); i++) {
          const x0 = rs() * w, y0 = rs() * h, size = 1 + rs() * 2.2, speed = 30 + rs() * 40;
          g.globalAlpha = 0.85;
          g.beginPath(); g.arc(((x0 - cam * (0.3 + size * 0.2)) % w + w) % w, (y0 + (now - DT_MV(0, 9)) * speed) % h, size, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
        // The plane: its shadow on the snow, a faint trail through its loops, sparkles on the claps.
        const pose = planePose(b, w, h, handScreen);
        if (b > 2) {
          const air = clamp((ground + h * 0.12 - pose.py) / (h * 0.6));
          g.fillStyle = `rgba(80, 100, 140, ${(0.18 * (1 - air) * clamp((b - 2.5) / 1)).toFixed(3)})`;
          g.beginPath(); g.ellipse(pose.px, ground + h * 0.12, pose.s * 0.7, pose.s * 0.08, 0, 0, Math.PI * 2); g.fill();
          g.lineCap = "round";
          for (let k = 1; k < 14; k++) {
            const a = planePose(b - k * 0.05, w, h, handScreen), c = planePose(b - (k - 1) * 0.05, w, h, handScreen);
            g.strokeStyle = `rgba(255, 255, 255, ${(0.5 * (1 - k / 14)).toFixed(3)})`; g.lineWidth = pose.s * 0.05 * (1 - k / 14);
            g.beginPath(); g.moveTo(a.px - a.s * 0.6, a.py); g.lineTo(c.px - c.s * 0.6, c.py); g.stroke();
          }
        }
        drawPaperPlane(g, pose, frame);
        const clap = b % 2 > 1 ? (b % 2) - 1 : -1;
        if (b > 4 && clap >= 0 && clap < 0.35) {
          g.fillStyle = `rgba(255, 255, 255, ${(0.9 * (1 - clap / 0.35)).toFixed(3)})`;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + b, d = pose.s * (0.7 + clap * 2);
            g.beginPath(); g.arc(pose.px + Math.cos(a) * d, pose.py + Math.sin(a) * d, pose.s * 0.025, 0, Math.PI * 2); g.fill();
          }
        }
        // Into the sun: it all goes white.
        const white = clamp((b - 15.1) / 0.9);
        if (white > 0) { g.fillStyle = `rgba(255, 252, 240, ${white.toFixed(3)})`; g.fillRect(0, 0, w, h); }
      };
      // ── alarm: Haerin's alarm clock (울린 = rang) ──
      // Dawn on the nightstand. 7:00 on the first "ta" and it rings: on every "ta" (bars 13-15) it hops
      // and 따르릉 pops off its bells, the frame, the glass and her little cat rattling with it. "But I
      // don't want to": a hand slaps it quiet (it twitches under it on the next two). The hit: it goes
      // off again, flinging the hand away and everything into the air, slowing; the camera pushes into
      // its face, which is the MV, until it fills the screen.
      const ALARM_TAS = [];
      for (let bar = 0; bar < 3; bar++) [1, 3, 3.5].forEach((beat) => ALARM_TAS.push(bar * 4 + beat));
      const drawAlarm = (now) => {
        const { g, w, h, r, wide } = prep();
        const b = (now - DT_MV(0, 13)) / DT_BEAT;
        const frame = mv(now);
        // After the hit, time slows for everything but the push-in.
        const slow = b < 12.3 ? b : 12.3 + (b - 12.3) * 0.22;
        const SLAP = 10, HIT = 12;
        const ringing = (b >= 1 && b < SLAP) || b >= HIT;
        const lastTa = ALARM_TAS.filter((t) => t <= b && t < SLAP).pop();
        const sinceTa = lastTa === undefined ? 9 : b - lastTa;
        const hop = (t) => { const q = (b - t) / 0.4; return q > 0 && q < 1 ? Math.sin(q * Math.PI) : 0; };
        const hops = ALARM_TAS.filter((t) => t < SLAP).reduce((sum, t) => sum + hop(t), 0);
        const steps = ALARM_TAS.filter((t) => t < SLAP && t <= b).length;
        // The push into the clock's face after the hit.
        const R = wide ? Math.min(w, h) * 0.16 : w * 0.26;
        const home = [w * 0.5 + steps * R * 0.035, wide ? h * 0.5 : h * 0.47];
        const air = b >= HIT ? easeOut3(clamp((slow - HIT) / 1.2)) : 0;
        const clock = [home[0] + air * R * 0.15, home[1] - air * R * 0.7 - hops * R * 0.16];
        const push = b >= HIT ? (clamp((b - 12.4) / 3.6)) ** 2.4 : 0;
        const zoom = 1 + push * ((Math.hypot(w, h) / (R * 1.6)) - 1);
        const shake = b >= HIT ? Math.max(0, 1 - (b - HIT) / 1.2) * R * 0.08 : 0;
        g.translate(mix(clock[0], w / 2, push) + Math.sin(now * 61) * shake, mix(clock[1], h / 2, push) + Math.cos(now * 47) * shake);
        g.scale(zoom, zoom);
        g.translate(-clock[0], -clock[1]);
        // The wall at dawn, the window (snow drifting past, the sky going pink), the curtains.
        const wall = g.createLinearGradient(0, 0, 0, h);
        wall.addColorStop(0, "#2B3357"); wall.addColorStop(1, "#4A4C78");
        g.fillStyle = wall; g.fillRect(-w, -h, w * 3, h * 3);
        const win = wide ? [w * 0.07, h * 0.07, w * 0.27, h * 0.48] : [w * 0.1, h * 0.06, w * 0.5, h * 0.3];
        const dawn = g.createLinearGradient(0, win[1], 0, win[1] + win[3]);
        dawn.addColorStop(0, "#6F86C6"); dawn.addColorStop(0.65, "#C9B5DC"); dawn.addColorStop(1, "#F2C7D6");
        g.fillStyle = dawn; g.fillRect(win[0], win[1], win[2], win[3]);
        const roofs = seeded(71);
        g.save(); g.beginPath(); g.rect(win[0], win[1], win[2], win[3]); g.clip();
        for (let x = win[0]; x < win[0] + win[2]; ) {
          const bw = win[2] * (0.12 + roofs() * 0.16), top = win[1] + win[3] * (0.58 + roofs() * 0.24);
          g.fillStyle = "#3A416C"; g.fillRect(x, top, bw - 2, win[3]);
          g.fillStyle = "rgba(255, 214, 160, 0.75)";
          for (let k = 0; k < 4; k++) if (roofs() < 0.35) g.fillRect(x + bw * (0.2 + roofs() * 0.5), top + win[3] * (0.05 + roofs() * 0.25), Math.max(2, bw * 0.12), Math.max(2, bw * 0.1));
          x += bw;
        }
        g.restore();
        g.fillStyle = "#FFFFFF";
        const rs = seeded(51);
        for (let i = 0; i < 26; i++) { const x = win[0] + ((rs() * win[2] + now * 9) % win[2]), y = win[1] + ((rs() * win[3] + now * (20 + rs() * 20)) % win[3]); g.globalAlpha = 0.8; g.fillRect(x, y, 2, 2); }
        g.globalAlpha = 1;
        g.strokeStyle = "#E8E6F2"; g.lineWidth = Math.max(4, w * 0.006);
        g.strokeRect(win[0], win[1], win[2], win[3]);
        g.beginPath(); g.moveTo(win[0] + win[2] / 2, win[1]); g.lineTo(win[0] + win[2] / 2, win[1] + win[3]); g.moveTo(win[0], win[1] + win[3] / 2); g.lineTo(win[0] + win[2], win[1] + win[3] / 2); g.stroke();
        [[win[0] - win[2] * 0.12, 1], [win[0] + win[2] * 0.95, -1]].forEach(([x]) => {
          const cur = g.createLinearGradient(x, 0, x + win[2] * 0.17, 0);
          cur.addColorStop(0, "#C98BA6"); cur.addColorStop(0.5, "#EBB3C8"); cur.addColorStop(1, "#B97A96");
          g.fillStyle = cur; g.fillRect(x, win[1] - h * 0.03, win[2] * 0.17, win[3] + h * 0.08);
        });
        const morning = g.createRadialGradient(win[0] + win[2] / 2, win[1] + win[3], 0, win[0] + win[2] / 2, win[1] + win[3], w * 0.6);
        morning.addColorStop(0, "rgba(242, 199, 214, 0.25)"); morning.addColorStop(1, "rgba(242, 199, 214, 0)");
        g.fillStyle = morning; g.fillRect(-w, -h, w * 3, h * 3);
        // The nightstand.
        const top = wide ? h * 0.66 : h * 0.62, edge = wide ? h * 0.86 : h * 0.8;
        g.fillStyle = "#B88C66";
        g.beginPath(); g.moveTo(-w * 0.1, top); g.lineTo(w * 1.1, top); g.lineTo(w * 1.3, edge); g.lineTo(-w * 0.3, edge); g.closePath(); g.fill();
        const grain = g.createLinearGradient(0, top, 0, edge);
        grain.addColorStop(0, "rgba(255, 230, 200, 0.18)"); grain.addColorStop(1, "rgba(60, 30, 10, 0.2)");
        g.fillStyle = grain; g.fill();
        g.fillStyle = "#8E6141"; g.fillRect(-w, edge, w * 3, h);
        g.fillStyle = "#6E4A33"; g.fillRect(-w, edge, w * 3, h * 0.012);
        g.fillStyle = "#D9B48A"; g.beginPath(); g.arc(w * 0.5, edge + (h - edge) * 0.5, Math.min(w, h) * 0.012, 0, Math.PI * 2); g.fill();
        // The things on it: her photo in a frame, a glass of water, her little black cat.
        const objT = b >= HIT ? slow - HIT : 0;
        const wobble = (t0) => ALARM_TAS.filter((t) => t < SLAP && t <= b).reduce((sum, t) => sum + Math.sin((b - t) * 9) * Math.exp(-(b - t) * 3), 0) + t0;
        const rattle = ringing && b < SLAP ? Math.sin(now * 80) * 0.012 : 0;
        // the frame: falls flat back at the hit
        const fr = wide ? [w * 0.26, top + (edge - top) * 0.32, h * 0.13] : [w * 0.2, top + (edge - top) * 0.3, w * 0.2];
        g.save();
        g.translate(fr[0], fr[1] - (b >= HIT ? Math.sin(Math.min(Math.PI, objT * 2.4)) * h * 0.08 : 0));
        g.rotate(wobble(0) * 0.05 + rattle - (b >= HIT ? Math.min(1.35, objT * 1.6) : 0));
        g.fillStyle = "rgba(20, 20, 40, 0.3)"; g.fillRect(-fr[2] * 0.45, -fr[2] * 1.28, fr[2] * 0.98, fr[2] * 1.3);
        g.fillStyle = "#F4F0F6"; g.fillRect(-fr[2] * 0.5, -fr[2] * 1.32, fr[2], fr[2] * 1.32);
        const face = pic("haerin.webp");
        if (face) { g.save(); g.beginPath(); g.rect(-fr[2] * 0.42, -fr[2] * 1.24, fr[2] * 0.84, fr[2] * 1.16); g.clip(); cover(g, face, -fr[2] * 0.42, -fr[2] * 1.24, fr[2] * 0.84, fr[2] * 1.16, 0.48, 0.32); g.restore(); }
        g.restore();
        // the glass: its water rocking and rippling on every ring, splashing up at the hit
        const gl = wide ? [w * 0.7, top + (edge - top) * 0.38, h * 0.06, h * 0.15] : [w * 0.8, top + (edge - top) * 0.36, w * 0.1, w * 0.24];
        const slosh = wobble(0) * 0.25 + (ringing && b < SLAP ? Math.sin(now * 40) * 0.05 : 0);
        g.save(); g.translate(gl[0], gl[1]);
        g.fillStyle = "rgba(160, 200, 240, 0.35)";
        g.beginPath(); g.moveTo(-gl[2] / 2, -gl[3] * 0.55 + slosh * gl[2] * 0.4); g.lineTo(gl[2] / 2, -gl[3] * 0.55 - slosh * gl[2] * 0.4); g.lineTo(gl[2] * 0.42, 0); g.lineTo(-gl[2] * 0.42, 0); g.closePath(); g.fill();
        g.strokeStyle = "rgba(235, 240, 255, 0.7)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-gl[2] / 2, -gl[3]); g.lineTo(-gl[2] * 0.42, 0); g.lineTo(gl[2] * 0.42, 0); g.lineTo(gl[2] / 2, -gl[3]); g.stroke();
        g.fillStyle = "rgba(255, 255, 255, 0.35)"; g.fillRect(-gl[2] * 0.36, -gl[3] * 0.9, gl[2] * 0.08, gl[3] * 0.8);
        if (b >= HIT) {
          const rd = seeded(61);
          g.fillStyle = "rgba(200, 225, 255, 0.85)";
          for (let i = 0; i < 18; i++) { const vx = (rd() - 0.5) * gl[2] * 3, vy = -(0.6 + rd()) * gl[3] * 2.2; const t = objT * 1.4; g.beginPath(); g.arc(vx * t, -gl[3] * 0.55 + vy * t + gl[3] * 2.6 * t * t, gl[2] * (0.05 + rd() * 0.05), 0, Math.PI * 2); g.fill(); }
        }
        g.restore();
        // the cat: hops with every ring, somersaults at the hit
        const ct = wide ? [w * 0.84, top + (edge - top) * 0.3, h * 0.1] : [w * 0.86, top + (edge - top) * 0.2, w * 0.14];
        g.save();
        g.translate(ct[0], ct[1] - hops * ct[2] * 0.12 - (b >= HIT ? Math.sin(Math.min(Math.PI, objT * 2)) * h * 0.12 : 0));
        g.rotate(rattle * 2 + (b >= HIT ? Math.min(Math.PI * 2, objT * 5) : 0));
        g.fillStyle = "#1E1C2A";
        g.beginPath(); g.ellipse(0, -ct[2] * 0.32, ct[2] * 0.3, ct[2] * 0.34, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(0, -ct[2] * 0.78, ct[2] * 0.2, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(-ct[2] * 0.18, -ct[2] * 0.86); g.lineTo(-ct[2] * 0.14, -ct[2] * 1.06); g.lineTo(-ct[2] * 0.03, -ct[2] * 0.94); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(ct[2] * 0.18, -ct[2] * 0.86); g.lineTo(ct[2] * 0.14, -ct[2] * 1.06); g.lineTo(ct[2] * 0.03, -ct[2] * 0.94); g.closePath(); g.fill();
        g.strokeStyle = "#1E1C2A"; g.lineWidth = ct[2] * 0.07; g.lineCap = "round";
        g.beginPath(); g.moveTo(ct[2] * 0.25, -ct[2] * 0.1); g.quadraticCurveTo(ct[2] * 0.55, -ct[2] * 0.2, ct[2] * 0.45, -ct[2] * 0.55); g.stroke();
        g.fillStyle = "#F6D46B"; [-0.075, 0.075].forEach((x) => { g.beginPath(); g.ellipse(x * ct[2], -ct[2] * 0.8, ct[2] * 0.035, ct[2] * 0.05, 0, 0, Math.PI * 2); g.fill(); });
        g.restore();
        // The clock: two bells and the hammer between them, a mint body, its face the MV, the hands
        // at seven; trembling and hopping as it rings.
        const shakeA = ringing ? (b >= HIT ? 1 : 0.55 + 0.45 * Math.exp(-sinceTa * 3)) : 0;
        g.save();
        g.translate(clock[0] + Math.sin(now * 95) * R * 0.014 * shakeA, clock[1]);
        g.rotate(Math.sin(now * 70) * 0.03 * shakeA + (b >= HIT ? air * 0.18 : 0) + (b >= SLAP && b < HIT ? [11, 11.5].reduce((sum, t) => sum + (b > t ? Math.sin((b - t) * 30) * Math.exp(-(b - t) * 8) * 0.04 : 0), 0) : 0));
        const squash = b >= SLAP && b < HIT ? 1 - 0.08 * Math.exp(-(b - SLAP) * 10) : 1;
        g.scale(1 / squash, squash);
        g.fillStyle = "rgba(20, 20, 40, 0.28)"; g.beginPath(); g.ellipse(R * 0.05, R * 1.12 + hops * R * 0.16 + air * R * 0.7, R * 0.9 * (1 - air * 0.4), R * 0.12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#3E4560"; [-0.55, 0.55].forEach((x) => { g.beginPath(); g.ellipse(x * R, R * 1.0, R * 0.12, R * 0.14, 0, 0, Math.PI * 2); g.fill(); });
        const bell = (x, blurX) => {
          for (let k = 0; k < (shakeA ? 3 : 1); k++) {
            const dx = shakeA ? (k - 1) * R * 0.03 * shakeA + blurX : 0;
            g.globalAlpha = shakeA ? 0.45 : 1;
            const metal = g.createLinearGradient(x - R * 0.4, -R * 1.3, x + R * 0.4, -R * 0.75);
            metal.addColorStop(0, "#FBE3EC"); metal.addColorStop(0.5, "#E7B3C6"); metal.addColorStop(1, "#A97E95");
            g.fillStyle = metal; g.beginPath(); g.arc(x + dx, -R * 0.88, R * 0.4, Math.PI, 0); g.closePath(); g.fill();
            g.fillStyle = "#C995AA"; g.beginPath(); g.arc(x + dx, -R * 1.3, R * 0.06, 0, Math.PI * 2); g.fill();
          }
          g.globalAlpha = 1;
        };
        g.strokeStyle = "#8C7487"; g.lineWidth = R * 0.05;
        [-0.62, 0.62].forEach((x) => { g.beginPath(); g.moveTo(x * R * 0.6, -R * 0.75); g.lineTo(x * R, -R * 0.9); g.stroke(); });
        bell(-R * 0.62, 0); bell(R * 0.62, 0);
        const hammer = shakeA ? Math.sin(now * 110) * R * 0.42 : 0;
        g.strokeStyle = "#6F6077"; g.lineWidth = R * 0.05;
        g.beginPath(); g.moveTo(0, -R * 0.95); g.lineTo(hammer * 0.9, -R * 1.18); g.stroke();
        g.fillStyle = "#6F6077"; g.beginPath(); g.arc(hammer, -R * 1.2, R * 0.08, 0, Math.PI * 2); g.fill();
        const body = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.05);
        body.addColorStop(0, "#C5EEE0"); body.addColorStop(0.7, "#93D3BF"); body.addColorStop(1, "#5FA894");
        g.fillStyle = body; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        g.save(); g.beginPath(); g.arc(0, 0, R * 0.8, 0, Math.PI * 2); g.clip();
        cover(g, frame, -R * 0.8, -R * 0.8, R * 1.6, R * 1.6);
        g.fillStyle = `rgba(255, 255, 255, ${(0.16 * (1 - push)).toFixed(3)})`; g.fillRect(-R, -R, R * 2, R * 2);
        g.restore();
        const ink = `rgba(40, 46, 80, ${(1 - push * 0.9).toFixed(3)})`;
        g.strokeStyle = ink; g.fillStyle = ink;
        for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.lineWidth = k % 3 ? R * 0.015 : R * 0.035; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72); g.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78); g.stroke(); }
        g.font = `800 ${(R * 0.13).toFixed(1)}px Inter, system-ui, sans-serif`; g.textAlign = "center";
        g.fillText("HAERIN", 0, -R * 0.38);
        const secs = 6 * 3600 + 59 * 60 + 59 + Math.min(b, HIT + (b - HIT) * 0.2);
        const handAt = (frac, len, width, color) => { const a = frac * Math.PI * 2 - Math.PI / 2; g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round"; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke(); };
        if (push < 0.7) {
          handAt(((secs / 3600) % 12) / 12, R * 0.42, R * 0.06, ink);
          handAt(((secs / 60) % 60) / 60, R * 0.62, R * 0.04, ink);
          handAt((Math.floor(secs) % 60) / 60, R * 0.66, R * 0.015, "#E0628E");
          g.fillStyle = "#E0628E"; g.beginPath(); g.arc(0, 0, R * 0.04, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = "rgba(255, 255, 255, 0.55)"; g.lineWidth = R * 0.05;
        g.beginPath(); g.arc(0, 0, R * 0.7, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
        g.restore();
        // The ring: rings of sound off the bells, and 따르릉 popping off them on every "ta".
        if (ringing) {
          g.strokeStyle = "rgba(255, 236, 246, 0.55)"; g.lineWidth = R * 0.03;
          for (let k = 0; k < 3; k++) {
            const q = ((now * 2.2 + k / 3) % 1);
            [-1, 1].forEach((side) => { g.globalAlpha = (1 - q) * shakeA; g.beginPath(); g.arc(clock[0] + side * R * 0.62, clock[1] - R * 0.9, R * (0.5 + q * 0.9), side < 0 ? Math.PI * 0.9 : Math.PI * 1.6, side < 0 ? Math.PI * 1.4 : Math.PI * 2.1); g.stroke(); });
          }
          g.globalAlpha = 1;
        }
        const pops = [...ALARM_TAS.filter((t) => t < SLAP), HIT];
        pops.forEach((t, n) => {
          const q = (b - t) / (t === HIT ? 1.6 : 0.6);
          if (q < 0 || q > 1) return;
          const big = t === HIT ? 2.2 : 1;
          const side = n % 2 ? 1 : -1;
          g.save();
          g.translate(clock[0] + side * R * (1.1 + q * 0.4), clock[1] - R * (1.2 + q * 0.5));
          g.rotate(side * 0.2);
          g.globalAlpha = 1 - q * q;
          g.font = `700 ${(R * 0.32 * big * (0.8 + easeOut3(Math.min(1, q * 4)) * 0.2)).toFixed(1)}px Gaegu, cursive`;
          g.textAlign = "center"; g.lineWidth = R * 0.06 * big; g.strokeStyle = "#2B3357"; g.strokeText("따르릉!", 0, 0);
          g.fillStyle = "#FFE3EE"; g.fillText("따르릉!", 0, 0);
          g.restore();
        });
        // The hand that slaps it quiet ("But I don't want to"), flung off at the hit.
        const handIn = easeOut3(clamp((b - (SLAP - 0.35)) / 0.35)), handOut = b >= HIT ? easeOut3(clamp((b - HIT) / 0.5)) : 0;
        if (handIn > 0 && handOut < 1) {
          const hx = mix(w * 1.1, clock[0] + R * 0.1, handIn) + handOut * w * 0.6, hy = mix(-h * 0.2, clock[1] - R * 1.45, handIn) - handOut * h * 0.6;
          g.save(); g.translate(hx, hy); g.rotate(-0.5 + handOut * 0.8);
          g.fillStyle = "#AFC6EC"; g.fillRect(R * 0.3, -R * 0.32, R * 1.8, R * 0.64);
          g.fillStyle = "rgba(255, 255, 255, 0.75)"; for (let k = 0; k < 5; k++) g.fillRect(R * (0.42 + k * 0.32), -R * 0.32, R * 0.1, R * 0.64);
          g.fillStyle = "#F3D2BF";
          g.beginPath(); g.ellipse(0, 0, R * 0.48, R * 0.36, 0, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.ellipse(-R * 0.1, R * 0.32, R * 0.14, R * 0.1, -0.4, 0, Math.PI * 2); g.fill();
          g.strokeStyle = "rgba(170, 120, 100, 0.5)"; g.lineWidth = R * 0.02;
          for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-R * 0.36, -R * 0.16 + k * R * 0.14); g.lineTo(-R * 0.1, -R * 0.18 + k * R * 0.14); g.stroke(); }
          g.restore();
        }
        // The hit's flash.
        g.setTransform(r, 0, 0, r, 0, 0);
        if (b >= HIT && b < HIT + 0.4) { g.fillStyle = `rgba(255, 250, 245, ${(0.85 * (1 - (b - HIT) / 0.4)).toFixed(3)})`; g.fillRect(0, 0, w, h); }
      };
      // ── cube: "Stay in the middle" ──
      // A cube puzzle on the desk under the lamp: the MV on its front; on the other five faces, the five,
      // each on her centre piece (centres never move: they stay in the middle) in her colour. It starts
      // scrambled ("don't want no riddle") and is solved one quarter turn a kick, turning in the lamp
      // light so each face comes round; solved on "say it back", it turns its MV face to us.
      // Faces: F front (+z) the MV, U Minji, R Hanni, B Danielle, L Haerin, D Hyein.
      const CUBE_FACES = {
        F: { n: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] }, B: { n: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
        R: { n: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] }, L: { n: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
        U: { n: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] }, D: { n: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
      };
      const CUBE_MEMBER = { U: ["minji", "#6E9DF4", 0.425, 0.13], R: ["hanni", "#F57FB6", 0.46, 0.21], B: ["danielle", "#F7CB45", 0.465, 0.27], L: ["haerin", "#4FCDA9", 0.5, 0.28], D: ["hyein", "#A880F2", 0.465, 0.315] };
      const axisOfFace = (f) => (f === "R" || f === "L" ? 0 : f === "U" || f === "D" ? 1 : 2);
      // 20 quarter turns to scramble it (never the same axis twice running); it is solved by undoing them.
      const CUBE_SCRAMBLE = (() => {
        const rnd = seeded(2022), out = [];
        let last = -1;
        while (out.length < 20) { const f = "UDLRFB"[Math.floor(rnd() * 6)]; if (axisOfFace(f) === last) continue; last = axisOfFace(f); out.push([f, rnd() < 0.5 ? 1 : -1]); }
        return out;
      })();
      const CUBE_SOLVE = [...CUBE_SCRAMBLE].reverse().map(([f, dir]) => [f, -dir]);
      const CUBE_KICKS = [];
      for (let bar = 1; bar <= 4; bar++) DT_KICKS.forEach((k) => CUBE_KICKS.push(DT_MV(1, bar) + k * DT_SIX));
      const mat = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
      const matMul = (a, b) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
      const rotAxis = (axis, angle) => {
        const c = Math.cos(angle), s = Math.sin(angle);
        return axis === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
      };
      const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      // A turn of a face: its layer, and the angle (clockwise as you look at that face).
      const turnOf = ([f, dir]) => { const n = CUBE_FACES[f].n, axis = axisOfFace(f), sign = n[axis]; return { axis, layer: sign, angle: (-Math.PI / 2) * sign * dir }; };
      // The pieces as they start (solved): position, orientation, and their stickers (corners and
      // picture coordinates as seen when solved).
      const cubeSolved = () => {
        const pieces = [];
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          const p = [x, y, z], stickers = [];
          for (const [f, face] of Object.entries(CUBE_FACES)) {
            const axis = axisOfFace(f);
            if (p[axis] !== face.n[axis]) continue;
            const center = p.map((v, k) => v + face.n[k] * 0.5);
            const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b2]) => face.n.map((v, k) => v * 0.51 + face.right[k] * a * 0.43 + face.up[k] * b2 * 0.43));
            const isCenter = p.filter((v) => v !== 0).length === 1;
            const uv = corners.map((c) => {
              const at = p.map((v, k) => v + c[k]);
              const u = at[0] * face.right[0] + at[1] * face.right[1] + at[2] * face.right[2];
              const v = at[0] * face.up[0] + at[1] * face.up[1] + at[2] * face.up[2];
              return f === "F" ? [(u + 1.5) / 3, (1.5 - v) / 3] : [(u + 0.5), (0.5 - v)];
            });
            stickers.push({ f, corners, uv, isCenter, center });
          }
          pieces.push({ p, O: ID3, stickers });
        }
        return pieces;
      };
      const applyTurn = (pieces, turn) => {
        const R = rotAxis(turn.axis, turn.angle);
        for (const piece of pieces) {
          if (piece.p[turn.axis] !== turn.layer) continue;
          piece.p = mat(R, piece.p).map(Math.round);
          piece.O = matMul(R, piece.O).map(Math.round);
        }
      };
      const cubeScrambled = (() => { const pieces = cubeSolved(); CUBE_SCRAMBLE.forEach((m) => applyTurn(pieces, turnOf(m))); return pieces.map((pc) => ({ ...pc })); })();
      const drawCube = (now) => {
        const { g, w, h, r, wide } = prep();
        const b = (now - DT_MV(1, 1)) / DT_BEAT;
        const frame = mv(now);
        // the state: the scramble, with the turns done so far undone, and the one under way
        const pieces = cubeScrambled.map((pc) => ({ ...pc }));
        const k = CUBE_KICKS.filter((t) => t <= now).length - 1;
        for (let i = 0; i < k; i++) applyTurn(pieces, turnOf(CUBE_SOLVE[i]));
        let moving = null;
        if (k >= 0 && k < CUBE_SOLVE.length) {
          const turn = turnOf(CUBE_SOLVE[k]);
          const until = CUBE_KICKS[k + 1] ?? DT_MV(1, 5) - DT_SIX;
          const q = easeIO(clamp((now - CUBE_KICKS[k]) / Math.max(0.08, (until - CUBE_KICKS[k]) * 0.85)));
          if (q >= 1) applyTurn(pieces, turn); else moving = { ...turn, R: rotAxis(turn.axis, turn.angle * q) };
        }
        // The room: dark, the desk lamp's warm pool, fairy lights out of focus behind.
        const room = g.createLinearGradient(0, 0, 0, h);
        room.addColorStop(0, "#17131F"); room.addColorStop(1, "#2B2132");
        g.fillStyle = room; g.fillRect(0, 0, w, h);
        const rf = seeded(4);
        for (let i = 0; i < 26; i++) {
          const x = (i / 25) * w * 1.1 - w * 0.05, y = h * 0.16 + Math.sin((i / 25) * Math.PI) * h * 0.12 + rf() * h * 0.02;
          const glow = g.createRadialGradient(x, y, 0, x, y, Math.min(w, h) * 0.035);
          const warm = i % 3 ? "255, 196, 140" : "255, 170, 200";
          glow.addColorStop(0, `rgba(${warm}, ${(0.55 + 0.25 * Math.sin(now * 2 + i)).toFixed(3)})`); glow.addColorStop(1, `rgba(${warm}, 0)`);
          g.fillStyle = glow; g.fillRect(x - 40, y - 40, 80, 80);
        }
        const deskY = h * (wide ? 0.72 : 0.68);
        g.fillStyle = "#33241F"; g.fillRect(0, deskY, w, h);
        const pool = g.createRadialGradient(w * 0.5, deskY + h * 0.06, 0, w * 0.5, deskY + h * 0.06, Math.max(w, h) * 0.55);
        pool.addColorStop(0, "rgba(255, 200, 140, 0.42)"); pool.addColorStop(1, "rgba(255, 200, 140, 0)");
        g.fillStyle = pool; g.fillRect(0, 0, w, h);
        // The cube: turning in the light (once round over the solve, then its front to us), a bump on
        // each kick.
        const spin = mix(-0.62, Math.PI * 2, easeIO(clamp(b / 15.2)));
        const tilt = mix(0.5 * Math.cos(b * 0.45), 0, easeIO(clamp((b - 13.2) / 2.4)));
        const G = matMul(rotAxis(0, tilt), rotAxis(1, spin));
        const kickBump = dtKickPulse(now) * 0.035;
        const unit = Math.min(w, h) * (wide ? 0.13 : 0.165);
        const size = unit * (1 + kickBump) * (1 + 0.6 * easeIO(clamp((b - 14.5) / 1.5)) ** 2);
        const cx = w / 2, cy = deskY - unit * 1.75 + Math.sin(b * 0.8) * h * 0.006, D = 10;
        const project = (v) => { const s = D / (D - v[2]); return [cx + v[0] * size * s, cy - v[1] * size * s, v[2]]; };
        g.fillStyle = "rgba(10, 6, 14, 0.5)";
        g.beginPath(); g.ellipse(cx, deskY + h * 0.03, size * 2.3, size * 0.35, 0, 0, Math.PI * 2); g.fill();
        const L = [0.38, 0.68, 0.62];
        const quads = [];
        for (const piece of pieces) {
          const M = moving && piece.p[moving.axis] === moving.layer ? matMul(G, moving.R) : G;
          const place = (local) => { const o = mat(piece.O, local); return project(mat(M, [piece.p[0] + o[0], piece.p[1] + o[1], piece.p[2] + o[2]])); };
          // its black body
          for (let axis = 0; axis < 3; axis++) for (const sgn of [-1, 1]) {
            const n = [0, 0, 0]; n[axis] = sgn;
            const nw = mat(M, mat(piece.O, n));
            if (nw[2] < 0.02) continue;
            const a = [0, 0, 0], c = [0, 0, 0]; a[(axis + 1) % 3] = 0.5; c[(axis + 2) % 3] = 0.5;
            const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([s1, s2]) => place(n.map((v, i) => v * 0.5 + a[i] * s1 + c[i] * s2)));
            quads.push({ pts, z: pts.reduce((sum, p) => sum + p[2], 0) / 4 - 0.01, body: true, light: Math.max(0, nw[0] * L[0] + nw[1] * L[1] + nw[2] * L[2]) });
          }
          for (const st of piece.stickers) {
            const nw = mat(M, mat(piece.O, CUBE_FACES[st.f].n));
            if (nw[2] < 0.02) continue;
            const pts = st.corners.map(place);
            quads.push({ pts, z: pts.reduce((sum, p) => sum + p[2], 0) / 4, st, light: Math.max(0, nw[0] * L[0] + nw[1] * L[1] + nw[2] * L[2]) });
          }
        }
        quads.sort((q1, q2) => q1.z - q2.z);
        const path = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
        for (const q of quads) {
          if (q.body) { path(q.pts); g.fillStyle = `rgb(${(14 + q.light * 26) | 0}, ${(12 + q.light * 22) | 0}, ${(20 + q.light * 30) | 0})`; g.fill(); continue; }
          const { f, uv, isCenter } = q.st;
          const member = CUBE_MEMBER[f];
          if (f === "F" || isCenter) {
            let img = frame, sx = 0, sy = 0, side = 0;
            if (f === "F") { side = Math.min(img.width, img.height); sx = (img.width - side) / 2; sy = (img.height - side) / 2; }
            else {
              const photo = pic(`${member[0]}.webp`);
              if (!photo) { path(q.pts); g.fillStyle = member[1]; g.fill(); continue; }
              img = photo; side = photo.naturalWidth * 0.5; sx = photo.naturalWidth * member[2] - side / 2; sy = Math.max(0, photo.naturalHeight * member[3] - side / 2);
            }
            const tex = uv.map(([u, v]) => [sx + u * side, sy + v * side]);
            texTri(g, img, q.pts[0], q.pts[1], q.pts[2], tex[0], tex[1], tex[2]);
            texTri(g, img, q.pts[0], q.pts[2], q.pts[3], tex[0], tex[2], tex[3]);
          } else { path(q.pts); g.fillStyle = member[1]; g.fill(); }
          // the plastic's sheen and the lamp's light
          path(q.pts);
          const sheen = g.createLinearGradient(q.pts[0][0], q.pts[0][1], q.pts[2][0], q.pts[2][1]);
          sheen.addColorStop(0, `rgba(255, 255, 255, ${(0.12 + q.light * 0.18).toFixed(3)})`); sheen.addColorStop(0.5, "rgba(255, 255, 255, 0)"); sheen.addColorStop(1, `rgba(0, 0, 0, ${(0.32 - q.light * 0.28).toFixed(3)})`);
          g.fillStyle = sheen; g.fill();
          if (isCenter && f !== "F" && b < 4) { g.strokeStyle = `rgba(255, 240, 250, ${(0.6 * (1 - b / 4) * (0.6 + 0.4 * Math.sin(now * 6))).toFixed(3)})`; g.lineWidth = 3; g.stroke(); }
        }
        // the lamp light across it all, and the room's edges in shadow
        const lamp = g.createRadialGradient(w * 0.3, -h * 0.1, 0, w * 0.3, -h * 0.1, Math.max(w, h) * 1.1);
        lamp.addColorStop(0, "rgba(255, 210, 160, 0.16)"); lamp.addColorStop(1, "rgba(255, 210, 160, 0)");
        g.fillStyle = lamp; g.fillRect(0, 0, w, h);
      };
      // ── scope: "say it ditto" in a kaleidoscope ──
      // The MV through the mirrors of a kaleidoscope (copies of copies: ditto), its beads (the stickers,
      // bits of coloured glass) tumbling in the end of the tube. A twist on every kick, a punch in;
      // 6 mirrors in bar 5, 8 in bar 6, 12 in the break (bar 7), turning slowly; bar 8 back to 6 and
      // whirling into the dark for the maze.
      const scopeWedge = document.createElement("canvas");
      const SCOPE_BEADS = [3, 8, 12, 16, 21, 5];
      const SCOPE_TWISTS = [];
      for (let bar = 5; bar <= 8; bar++) (bar === 7 ? [] : bar === 6 ? [...DT_KICKS, 12] : DT_KICKS).forEach((k) => SCOPE_TWISTS.push(DT_MV(1, bar) + k * DT_SIX));
      const drawScope = (now) => {
        const { g, w, h, r } = prep();
        const b = (now - DT_MV(1, 5)) / DT_BEAT;
        const frame = mv(now);
        const bar = Math.min(3, Math.floor(b / 4));
        const N = [6, 8, 12, 6][bar];
        const R = Math.hypot(w, h) / 2, cx = w / 2, cy = h / 2;
        // The turning: slow, a twist on each kick (none in the break), faster and faster at the end.
        const twists = SCOPE_TWISTS.reduce((sum, t) => sum + 0.22 * easeOut3(clamp((now - t) / 0.22)), 0);
        const end = clamp((b - 14) / 2);
        const turn = b * 0.05 + twists + end * end * 6;
        const punch = 1 + dtKickPulse(now) * 0.06;
        const shrink = 1 - easeIO(clamp((b - 15) / 1));
        // The wedge (one mirror's worth): the MV, panning and turning inside it, the beads over it.
        const q = SCENE_LITE ? 0.55 : Math.min(1, 900 / R);
        const size = Math.ceil(R * q);
        if (scopeWedge.width !== size) { scopeWedge.width = size; scopeWedge.height = size; }
        const wg = scopeWedge.getContext("2d");
        wg.setTransform(1, 0, 0, 1, 0, 0);
        wg.clearRect(0, 0, size, size);
        wg.save();
        wg.translate(size * (0.42 + 0.12 * Math.sin(b * 0.37)), size * (0.2 + 0.08 * Math.cos(b * 0.29)));
        wg.rotate(b * 0.11 + bar * 0.8);
        const zoom = size * (1.6 + 0.3 * Math.sin(b * 0.23)) / frame.height;
        wg.scale(zoom, zoom);
        wg.filter = `brightness(${Math.min(2.6, Math.max(1, 0.42 / Math.max(0.05, mvLevel(now)))).toFixed(2)}) saturate(1.2)`;
        wg.drawImage(frame, -frame.width / 2 + Math.sin(b * 0.31) * frame.width * 0.05, -frame.height / 2);
        wg.filter = "none";
        wg.globalCompositeOperation = "screen"; wg.globalAlpha = 0.5;
        wg.drawImage(frame, -frame.width / 2 + Math.sin(b * 0.31) * frame.width * 0.05, -frame.height / 2);
        wg.restore();
        wg.globalAlpha = 1;
        wg.globalCompositeOperation = "screen";
        SCOPE_BEADS.forEach((n, i) => {
          const sticker = pic(`sticker-${n}.webp`);
          const a = (0.15 + ((i * 0.37 + b * 0.04 + twists * 0.3) % 0.7)) * (Math.PI / N);
          const d = size * (0.18 + ((i * 0.61 + b * 0.05) % 0.75));
          const s = size * (0.06 + (i % 3) * 0.02);
          wg.save(); wg.translate(Math.cos(a) * d, Math.sin(a) * d); wg.rotate(b * (0.3 + i * 0.07) + twists * (i % 2 ? 1 : -1));
          if (sticker && i % 2 === 0) { wg.globalAlpha = 0.9; wg.drawImage(sticker, -s / 2, -s / 2, s, s); }
          else {
            wg.globalAlpha = 0.55;
            wg.fillStyle = ["#F49AC1", "#9EC2F0", "#C9C1F2", "#F6D674", "#86D9C2"][i % 5];
            wg.beginPath();
            if (i % 3 === 0) wg.arc(0, 0, s * 0.4, 0, Math.PI * 2);
            else { wg.moveTo(0, -s * 0.45); wg.lineTo(s * 0.4, s * 0.3); wg.lineTo(-s * 0.4, s * 0.3); wg.closePath(); }
            wg.fill();
          }
          wg.restore();
        });
        wg.globalCompositeOperation = "source-over"; wg.globalAlpha = 1;
        // The mirrors: the wedge, and its reflection, all the way round.
        g.fillStyle = "#05040A"; g.fillRect(0, 0, w, h);
        const slice = Math.PI / N;
        for (let k = 0; k < 2 * N; k++) {
          g.save();
          g.translate(cx, cy); g.scale(punch * shrink, punch * shrink); g.rotate(turn + (k + (k % 2)) * slice);
          if (k % 2) g.scale(1, -1);
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 1.02, -0.003, slice + 0.003); g.closePath(); g.clip();
          g.drawImage(scopeWedge, 0, 0, size, size, 0, 0, R, R);
          g.restore();
        }
        // The tube: dark round the edge, the glass catching the light.
        g.setTransform(r, 0, 0, r, 0, 0);
        const tube = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.32, cx, cy, R);
        tube.addColorStop(0, "rgba(5, 4, 10, 0)"); tube.addColorStop(0.75, "rgba(5, 4, 10, 0.35)"); tube.addColorStop(1, "rgba(5, 4, 10, 0.92)");
        g.fillStyle = tube; g.fillRect(0, 0, w, h);
        const shine = g.createLinearGradient(0, 0, w, h);
        shine.addColorStop(0, "rgba(255, 255, 255, 0.08)"); shine.addColorStop(0.4, "rgba(255, 255, 255, 0)"); shine.addColorStop(1, "rgba(255, 255, 255, 0.04)");
        g.fillStyle = shine; g.fillRect(0, 0, w, h);
        if (end > 0) { g.fillStyle = `rgba(5, 4, 10, ${(end ** 3).toFixed(3)})`; g.fillRect(0, 0, w, h); }
      };
      // ── chalk: the board at the front of the classroom, on the camcorder ──
      // A hand draws it all in chalk as the outro plays, stroke by stroke, dust falling from the tip:
      // a chalk TV (bar 1), the MV switching on in it on the first "woo"; the date; the five, one a bar
      // (bars 2-6), each her own hair, then her name; their hands joined and hearts between (bar 7);
      // "all five" (bar 8); on the drums (bars 9-10) "say it ditto" and a doodle on each hit. Then the
      // chalk goes down, the eraser comes up, and it scrubs the board (the TV and the MV with it) the
      // way a hand does: a patch at a time, forward and a little back, dust in the afternoon sun,
      // lifting over Danielle. It goes back on the tray, the hand leaves her one small pink heart, and
      // the camcorder leans in on her. The date and the day's 주번 are up the right edge, the class
      // motto (급훈) over the board, old lessons ghosting through the slate.
      // b: beats into the outro (DT_MV(2, 1)); the erasing from DT_ERASE (b 38).
      const CH_ERASE = (DT_ERASE - DT_MV(2, 1)) / DT_BEAT, CH_ERASED = CH_ERASE + 8.5;
      const CH_HITS = [33.5, 34.75, 35.5, 36, 37.5];
      const chalkInk = { w: "#F3F4EE", p: "#F6B3CF", y: "#F3DF8C", b: "#B3D0F4" };
      let chalk = null;
      const chalkLayerCv = document.createElement("canvas");
      const chalkGrain = (color, seed) => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d");
        g.fillStyle = color; g.fillRect(0, 0, 128, 128);
        g.globalCompositeOperation = "destination-out";
        const rnd = seeded(seed);
        for (let i = 0; i < 1100; i++) { g.globalAlpha = 0.25 + rnd() * 0.75; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1); }
        for (let i = 0; i < 70; i++) { g.globalAlpha = 0.45; g.fillRect(rnd() * 128, rnd() * 128, 5 + rnd() * 12, 1); }
        return c;
      };
      const chalkGrains = Object.fromEntries(Object.entries(chalkInk).map(([k, color], i) => [k, chalkGrain(color, 101 + i)]));
      const chalkPatterns = new WeakMap();
      const patternFor = (g, ink) => {
        if (!chalkPatterns.has(g)) chalkPatterns.set(g, {});
        const cache = chalkPatterns.get(g);
        cache[ink] ??= g.createPattern(chalkGrains[ink], "repeat");
        return cache[ink];
      };
      const chalkLayout = (w, h) => {
        const wide = w >= h;
        const bx = w * 0.04, bw = w * 0.92, by = h * (wide ? 0.16 : 0.12), bh = h * (wide ? 0.64 : 0.7);
        const u = Math.min(bw, bh);
        const tv = wide ? { x: bx + bw * 0.37, y: by + bh * 0.15, w: bw * 0.25, h: bh * 0.28 } : { x: bx + bw * 0.16, y: by + bh * 0.12, w: bw * 0.58, h: bh * 0.2 };
        const figH = wide ? bh * 0.3 : bh * 0.15;
        const feet = by + bh * (wide ? 0.83 : 0.85);
        const xs = (wide ? [0.15, 0.325, 0.5, 0.675, 0.85] : [0.12, 0.305, 0.49, 0.675, 0.86]).map((f) => bx + bw * f);
        const nameSize = figH * (wide ? 0.17 : 0.19);
        return {
          w, h, wide, bx, by, bw, bh, u, tv, figH, feet, xs, nameSize,
          tray: by + bh, trayH: u * 0.045,
          date: wide ? [bx + bw * 0.035, by + bh * 0.12, u * 0.075] : [bx + bw * 0.04, by + bh * 0.05, u * 0.06],
          notes: [bx + bw * (wide ? 0.962 : 0.945), by + bh * 0.07, u * (wide ? 0.042 : 0.042)],
          say: wide ? [bx + bw * 0.68, by + bh * 0.31, u * 0.1] : [bx + bw * 0.24, by + bh * 0.47, u * 0.12],
          all: wide ? [bx + bw * 0.06, by + bh * 0.47, u * 0.085] : [bx + bw * 0.07, by + bh * 0.6, u * 0.085],
          doodles: (wide ? [[0.3, 0.22], [0.8, 0.13], [0.93, 0.42], [0.13, 0.3], [0.71, 0.45]] : [[0.08, 0.37], [0.9, 0.37], [0.82, 0.6], [0.5, 0.62], [0.56, 0.38]]).map(([x, y]) => [bx + bw * x, by + bh * y]),
          eraserRest: [bx + bw * 0.8, by + bh + u * 0.012], chalkRest: [bx + bw * 0.74, by + bh + u * 0.012], pinkRest: [bx + bw * 0.69, by + bh + u * 0.012],
        };
      };
      // The drawing, as timed strokes (points on the screen) and timed writing; and the eraser's plan.
      const buildChalk = (L) => {
        const items = [];
        const len = (pts) => pts.reduce((sum, p, i) => sum + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
        const arc = (cx, cy, rx, ry, a0, a1, n = 20) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
        const wobble = (pts, amount, seed) => { const rnd = seeded(seed); return pts.map(([x, y]) => [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]); };
        // A group of strokes, spread over [a, b] beats by their lengths, a short lift between each.
        const group = (strokes, a, b, width, ink = "w") => {
          const total = strokes.reduce((sum, s) => sum + len(s) + 1, 0), lift = Math.min(0.08, ((b - a) * 0.25) / strokes.length);
          let t = a;
          const span = b - a - lift * (strokes.length - 1);
          strokes.forEach((pts) => { const d = span * ((len(pts) + 1) / total); items.push({ kind: "line", pts, len: len(pts), t0: t, t1: t + d, width, ink }); t += d + lift; });
        };
        const meas = document.createElement("canvas").getContext("2d");
        const write = (text, x, y, size, a, b, ink = "w", angle = 0, align = "left") => {
          meas.font = `700 ${size.toFixed(1)}px Gaegu, cursive`;
          items.push({ kind: "text", text, x, y, size, t0: a, t1: b, ink, angle, align, tw: meas.measureText(text).width });
        };
        const { tv, figH: H, feet, xs, u } = L;
        const lw = Math.max(2, u * 0.0065);
        // the TV: its body, the screen, rabbit ears, two knobs, its legs
        const m = tv.w * 0.05;
        const body = { x: tv.x - m, y: tv.y - m, w: tv.w + m * 4.2, h: tv.h + m * 2.1 };
        const rr = m * 1.2;
        const roundBox = (x, y, bw2, bh2, rad) => [...arc(x + rad, y + rad, rad, rad, Math.PI, Math.PI * 1.5, 5), ...arc(x + bw2 - rad, y + rad, rad, rad, -Math.PI / 2, 0, 5), ...arc(x + bw2 - rad, y + bh2 - rad, rad, rad, 0, Math.PI / 2, 5), ...arc(x + rad, y + bh2 - rad, rad, rad, Math.PI / 2, Math.PI, 5), [x, y + rad]];
        const tvTop = [body.x + body.w * (L.wide ? 0.45 : 0.62), body.y];
        group([
          wobble(roundBox(body.x, body.y, body.w, body.h, rr), 1.5, 3),
          wobble(roundBox(tv.x, tv.y, tv.w, tv.h, rr * 0.6), 1.2, 4),
          [tvTop, [tvTop[0] - body.w * 0.18, tvTop[1] - body.h * 0.26]], [tvTop, [tvTop[0] + body.w * 0.15, tvTop[1] - body.h * 0.29]],
          arc(tvTop[0] - body.w * 0.18, tvTop[1] - body.h * 0.26 - m * 0.4, m * 0.4, m * 0.4, 0, Math.PI * 2, 10),
          arc(tvTop[0] + body.w * 0.15, tvTop[1] - body.h * 0.29 - m * 0.4, m * 0.4, m * 0.4, 0, Math.PI * 2, 10),
          arc(tv.x + tv.w + m * 1.6, tv.y + tv.h * 0.25, m * 0.55, m * 0.55, 0, Math.PI * 2, 12),
          arc(tv.x + tv.w + m * 1.6, tv.y + tv.h * 0.55, m * 0.55, m * 0.55, 0, Math.PI * 2, 12),
          [[body.x + body.w * 0.18, body.y + body.h], [body.x + body.w * 0.12, body.y + body.h + m * 1.4]],
          [[body.x + body.w * 0.82, body.y + body.h], [body.x + body.w * 0.88, body.y + body.h + m * 1.4]],
        ], 0.35, 3.0, lw * 1.15);
        write("2022. 12. 19", L.date[0], L.date[1], L.date[2], 3.0, 4.0);
        // the five: a girl in her uniform, each with her own hair
        const HAIR = [
          // Minji: long and straight
          (f) => [f([[-0.07, -0.92], [-0.115, -0.86], [-0.125, -0.74], [-0.13, -0.6]]), f([[0.07, -0.92], [0.115, -0.86], [0.125, -0.74], [0.13, -0.6]]), f([[-0.07, -0.92], [0, -0.935], [0.07, -0.92]])],
          // Hanni: long, with a fringe
          (f) => [f([[-0.08, -0.9], [-0.12, -0.82], [-0.125, -0.7], [-0.135, -0.58]]), f([[0.08, -0.9], [0.12, -0.82], [0.125, -0.7], [0.135, -0.58]]), f([[-0.085, -0.875], [-0.05, -0.85], [-0.02, -0.875], [0.015, -0.85], [0.05, -0.875], [0.085, -0.85]])],
          // Danielle: two curly pigtails
          (f) => [-1, 1].map((side) => f(Array.from({ length: 16 }, (_, i) => { const t = i / 15; return [side * (0.1 + t * 0.09 + Math.sin(t * Math.PI * 4) * 0.025), -0.86 + t * 0.3]; }))).concat([f([[-0.09, -0.89], [0, -0.935], [0.09, -0.89]])]),
          // Haerin: cat ears
          (f) => [f([[-0.085, -0.88], [-0.075, -0.99], [-0.025, -0.915]]), f([[0.085, -0.88], [0.075, -0.99], [0.025, -0.915]]), f([[-0.1, -0.86], [-0.115, -0.75], [-0.11, -0.66]]), f([[0.1, -0.86], [0.115, -0.75], [0.11, -0.66]])],
          // Hyein: a bobble hat
          (f) => [f(arc(0, -0.85, 0.115, 0.1, Math.PI, Math.PI * 2, 14)), f([[-0.12, -0.855], [0.12, -0.855]]), f(arc(0, -0.975, 0.028, 0.028, 0, Math.PI * 2, 10)), f([[-0.105, -0.84], [-0.12, -0.72], [-0.125, -0.62]]), f([[0.105, -0.84], [0.12, -0.72], [0.125, -0.62]])],
        ];
        L.hands = [];
        DT_NAMES.forEach((name, k) => {
          const f = (pts) => pts.map(([x, y]) => [xs[k] + x * H, feet + y * H]);
          const start = 4 + k * 4;
          L.hands.push([f([[-0.23, -0.47]])[0], f([[0.23, -0.47]])[0]]);
          group([
            f(arc(0, -0.82, 0.1, 0.1, -Math.PI / 2, Math.PI * 1.5, 22)),
            ...HAIR[k](f),
            f([[-0.04, -0.835], [-0.036, -0.83]]), f([[0.036, -0.835], [0.04, -0.83]]),
            f(arc(0, -0.805, 0.035, 0.025, 0.15 * Math.PI, 0.85 * Math.PI, 8)),
            f([[-0.07, -0.7], [-0.15, -0.36], [0.15, -0.36], [0.07, -0.7]]),
            f([[-0.045, -0.7], [0, -0.64], [0.045, -0.7]]),
            f([[-0.08, -0.66], [-0.23, -0.47]]), f([[0.08, -0.66], [0.23, -0.47]]),
            f([[-0.06, -0.36], [-0.07, -0.05], [-0.11, -0.04]]), f([[0.06, -0.36], [0.07, -0.05], [0.11, -0.04]]),
          ], start + 0.15, start + 2.95, lw);
          write(name, xs[k], feet + L.nameSize * 1.15, L.nameSize, start + 3.0, start + 3.85, "w", 0, "center");
        });
        // hands joined, a heart between each, then "all five"
        group(L.hands.slice(0, 4).map(([, right], k) => { const left = L.hands[k + 1][0]; return [right, [(right[0] + left[0]) / 2, right[1] + H * 0.03], left]; }), 24.2, 25.6, lw);
        const heartAt = (cx, cy, s) => arc(0, 0, 1, 1, 0, Math.PI * 2, 28).map((_, i) => { const t = (i / 28) * Math.PI * 2; return [cx + s * 16 * Math.sin(t) ** 3 / 16, cy - (s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))) / 16]; });
        L.hands.slice(0, 4).forEach(([, right], k) => { const t = 25.8 + k * 0.45; group([heartAt((right[0] + L.hands[k + 1][0][0]) / 2, right[1] - H * 0.2, H * 0.06)], t, t + 0.4, lw, "p"); });
        write("all five", L.all[0], L.all[1], L.all[2], 28.2, 30.0, "w", -0.06);
        group([Array.from({ length: 24 }, (_, i) => { const t = i / 23; return [L.all[0] + t * L.all[2] * 3.6, L.all[1] + L.all[2] * 0.35 + Math.sin(t * Math.PI) * L.all[2] * 0.12 - t * L.all[2] * 0.2]; })], 30.0, 30.6, lw);
        // the drums: "say it ditto", and a doodle on each hit (a heart, a star, the bunny, a snowflake, a heart)
        write("say it ditto", L.say[0], L.say[1], L.say[2], 32.0, 33.4, "p", 0.05);
        const star = (cx, cy, s) => Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.45 : s; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
        const flake = (cx, cy, s) => Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return [[cx, cy], [cx + Math.cos(a) * s, cy + Math.sin(a) * s]]; }).concat(Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3, mx = cx + Math.cos(a) * s * 0.6, my = cy + Math.sin(a) * s * 0.6; return [[mx + Math.cos(a + 0.8) * s * 0.25, my + Math.sin(a + 0.8) * s * 0.25], [mx, my], [mx + Math.cos(a - 0.8) * s * 0.25, my + Math.sin(a - 0.8) * s * 0.25]]; }));
        const bunny = (cx, cy, s) => [arc(cx, cy, s * 0.55, s * 0.45, 0, Math.PI * 2, 20), arc(cx - s * 0.22, cy - s * 0.85, s * 0.14, s * 0.42, 0, Math.PI * 2, 16), arc(cx + s * 0.22, cy - s * 0.85, s * 0.14, s * 0.42, 0, Math.PI * 2, 16), [[cx - s * 0.2, cy - s * 0.05], [cx - s * 0.18, cy - s * 0.02]], [[cx + s * 0.18, cy - s * 0.05], [cx + s * 0.2, cy - s * 0.02]], arc(cx, cy + s * 0.08, s * 0.12, s * 0.08, 0.1 * Math.PI, 0.9 * Math.PI, 8)];
        const ds = u * 0.045;
        [[[heartAt(...L.doodles[0], ds)], "p"], [[star(...L.doodles[1], ds)], "y"], [bunny(L.doodles[2][0], L.doodles[2][1], ds * 1.2), "w"], [flake(...L.doodles[3], ds), "b"], [[heartAt(...L.doodles[4], ds * 0.8)], "p"]]
          .forEach(([strokes, ink], i) => group(strokes, CH_HITS[i], CH_HITS[i] + (i === 2 || i === 3 ? 0.55 : 0.35), lw, ink));
        // up the right edge, already there: the date and the day's 주번
        ["12.19", "(월)", "", "주번", "민지", "하니"].forEach((line, i) => { if (line) write(line, L.notes[0], L.notes[1] + i * L.notes[2] * 1.25, L.notes[2], -2, -1.5, "w", 0, "center"); });
        // and at the end, a small pink heart by her
        group([heartAt(xs[2] + H * 0.24, feet - H * 0.93, H * 0.07)], CH_ERASED + 1.1, CH_ERASED + 1.85, lw, "p");
        // The eraser: patches (the top, then either side of her), row by row, forward and a little back.
        const brush = u * 0.15, reach = brush / 2 + u * 0.02;
        const her = { l: xs[2] - H * 0.26 - reach, r: xs[2] + H * 0.26 + reach, t: feet - H * 1.02 - reach };
        const step = brush * 0.72;
        const rnd = seeded(19);
        const patch = (x0, x1, y0, y1) => {
          const n = Math.max(1, Math.round(Math.abs(y1 - y0) / step) + 1), rows = [];
          for (let r = 0; r < n; r++) {
            const y = n === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * r) / (n - 1);
            const [a, b2] = r % 2 ? [x1, x0] : [x0, x1], dir = Math.sign(b2 - a);
            const wob = () => y + (rnd() - 0.5) * step * 0.4;
            const pts = [[a, wob()]];
            let x = a;
            while (dir * (b2 - x) > 2) {
              const go = L.bw * (0.11 + rnd() * 0.08);
              x = dir > 0 ? Math.min(b2, x + go) : Math.max(b2, x - go);
              pts.push([x, wob()]);
              if (dir * (b2 - x) > 2) { x -= dir * go * (0.3 + rnd() * 0.2); pts.push([x, wob()]); }
            }
            rows.push(pts);
          }
          return rows;
        };
        const left = L.bx + L.bw * 0.03, right = L.bx + L.bw * 0.97, top = L.by + L.bh * 0.08, bottom = L.by + L.bh * 0.94;
        const patches = [patch(left, right, top, Math.max(top, her.t))];
        if (her.l > left + 4) patches.push(patch(left, her.l, her.t + step, bottom));
        if (her.r < right - 4) patches.push(patch(her.r, right, bottom, her.t + step));
        const moves = [];
        let at = L.eraserRest, key = 0;
        patches.forEach((rows) => {
          moves.push({ from: at, to: rows[0][0], lifted: true });
          rows.forEach((pts, r) => { key += 1; if (r) moves.push({ from: at, to: pts[0], row: key }); pts.slice(1).forEach((pt, n) => moves.push({ from: pts[n], to: pt, row: key, turn: true })); at = pts[pts.length - 1]; });
        });
        moves.push({ from: at, to: L.eraserRest, lifted: true, home: true });
        const HOP = 0.55;
        const raw = moves.map((mv2) => (mv2.lifted ? 0 : 0.05 + Math.hypot(mv2.to[0] - mv2.from[0], mv2.to[1] - mv2.from[1]) / 900));
        const hops = moves.filter((mv2) => mv2.lifted).length * HOP;
        const scale = (CH_ERASED + 0.7 - CH_ERASE - hops) / raw.reduce((a2, b2) => a2 + b2, 0);
        let t = CH_ERASE;
        moves.forEach((mv2, n) => { mv2.t0 = t; t += mv2.lifted ? HOP : raw[n] * scale; mv2.t1 = t; mv2.seed = n * 7919; });
        return { items: items.sort((a, b) => a.t0 - b.t0), moves, brush, her };
      };
      const paintClassroom = (g, w, h, L) => {
        const { bx, by, bw, bh, u } = L;
        // the wall, cream above the board, the school's mint green below it
        const wall = g.createLinearGradient(0, 0, 0, h);
        wall.addColorStop(0, "#E6DECC"); wall.addColorStop(1, "#D8CFBB");
        g.fillStyle = wall; g.fillRect(0, 0, w, h);
        g.fillStyle = "#82AE97"; g.fillRect(0, L.tray + L.trayH * 1.2, w, h);
        g.fillStyle = "#8A6747"; g.fillRect(0, L.tray + L.trayH * 1.2, w, Math.max(3, u * 0.008));
        // the board: green slate, old lessons ghosting through, old swipes of the eraser
        const slate = g.createLinearGradient(bx, by, bx + bw, by + bh);
        slate.addColorStop(0, "#36524A"); slate.addColorStop(1, "#2A443A");
        g.fillStyle = slate; g.fillRect(bx, by, bw, bh);
        const rnd = seeded(99);
        for (let i = 0; i < (bw * bh) / 350; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255, 255, 255, 0.035)" : "rgba(0, 0, 0, 0.05)"; g.fillRect(bx + rnd() * bw, by + rnd() * bh, 1 + rnd() * 2, 1 + rnd()); }
        for (let i = 0; i < 9; i++) { g.save(); g.translate(bx + rnd() * bw, by + rnd() * bh); g.rotate((rnd() - 0.5) * 0.3); const sw = g.createRadialGradient(0, 0, 0, 0, 0, u * 0.25); sw.addColorStop(0, "rgba(255, 255, 255, 0.05)"); sw.addColorStop(1, "rgba(255, 255, 255, 0)"); g.scale(2.4, 0.5); g.fillStyle = sw; g.beginPath(); g.arc(0, 0, u * 0.25, 0, Math.PI * 2); g.fill(); g.restore(); }
        g.fillStyle = "rgba(255, 255, 255, 0.06)"; g.textAlign = "left";
        [["x² − 5x + 6 = 0", 0.08, 0.3, 0.07], ["Unit 7 · Past Perfect", 0.5, 0.7, 0.06], ["기말고사 D-7", 0.7, 0.9, 0.065], ["(x − 2)(x − 3)", 0.12, 0.42, 0.06]].forEach(([text, x, y, s]) => { g.font = `700 ${(u * s).toFixed(1)}px Gaegu, cursive`; g.fillText(text, bx + bw * x, by + bh * y); });
        // its wooden frame and the chalk tray, dust gathered along it
        const fw = Math.max(6, u * 0.022);
        g.fillStyle = "#A9825A";
        g.fillRect(bx - fw, by - fw, bw + fw * 2, fw); g.fillRect(bx - fw, by, fw, bh); g.fillRect(bx + bw, by, fw, bh);
        g.fillStyle = "rgba(0, 0, 0, 0.18)"; g.fillRect(bx, by, bw, fw * 0.5); g.fillRect(bx, by, fw * 0.4, bh);
        const tray = g.createLinearGradient(0, L.tray, 0, L.tray + L.trayH);
        tray.addColorStop(0, "#C39C6C"); tray.addColorStop(0.45, "#A57D52"); tray.addColorStop(1, "#7E5D3B");
        g.fillStyle = tray; g.fillRect(bx - fw * 1.6, L.tray, bw + fw * 3.2, L.trayH);
        g.fillStyle = "rgba(255, 255, 255, 0.5)";
        for (let i = 0; i < 160; i++) g.fillRect(bx + rnd() * bw, L.tray + rnd() * L.trayH * 0.3, 1 + rnd() * 2, 1);
        // above it: the class motto in its frame, the clock (4:12), the speaker
        const mw = Math.min(w * 0.3, by * 2.4), mh = by * 0.5, mx = w / 2 - mw / 2, my = by * 0.22;
        g.fillStyle = "#7B5A3C"; g.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
        g.fillStyle = "#FBF7EC"; g.fillRect(mx, my, mw, mh);
        g.fillStyle = "#3A3D52"; g.textAlign = "center"; g.font = `700 ${(mh * 0.22).toFixed(1)}px Gaegu, cursive`; g.fillText("급훈", w / 2, my + mh * 0.32);
        g.font = `700 ${(mh * 0.36).toFixed(1)}px Gaegu, cursive`; g.fillText("함께라서 좋아", w / 2, my + mh * 0.78);
        const cr = by * 0.3, cx = w * 0.14, cy = by * 0.5;
        g.fillStyle = "#3A3D52"; g.beginPath(); g.arc(cx, cy, cr * 1.08, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#FBF8F1"; g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#3A3D52"; g.lineCap = "round";
        for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.lineWidth = k % 3 ? 1 : 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * cr * 0.8, cy + Math.sin(a) * cr * 0.8); g.lineTo(cx + Math.cos(a) * cr * 0.92, cy + Math.sin(a) * cr * 0.92); g.stroke(); }
        const hand = (frac, len, width) => { const a = frac * Math.PI * 2 - Math.PI / 2; g.lineWidth = width; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke(); };
        hand((4 + 12 / 60) / 12, cr * 0.5, Math.max(2, cr * 0.1)); hand(12 / 60, cr * 0.75, Math.max(1.5, cr * 0.06));
        const sx = w * 0.76, sy = by * 0.18, sw2 = by * 0.7, sh = by * 0.56;
        g.fillStyle = "#EEE8DA"; g.fillRect(sx - sw2 / 2, sy, sw2, sh);
        g.fillStyle = "rgba(60, 60, 80, 0.5)";
        for (let i = 0; i < 5; i++) g.fillRect(sx - sw2 * 0.35, sy + sh * (0.2 + i * 0.14), sw2 * 0.7, Math.max(1, sh * 0.05));
      };
      const drawChalkStroke = (g, it, p, ink) => {
        const pts = it.pts;
        let left = it.len * p;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        let head = pts[0];
        for (let i = 1; i < pts.length && left > 0; i++) {
          const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          if (seg <= left) { g.lineTo(pts[i][0], pts[i][1]); head = pts[i]; left -= seg; }
          else { const f = left / seg; head = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; g.lineTo(head[0], head[1]); left = 0; }
        }
        g.strokeStyle = ink; g.lineWidth = it.width * 1.9; g.globalAlpha = 0.22; g.stroke();
        g.lineWidth = it.width; g.globalAlpha = 0.95; g.stroke();
        g.globalAlpha = 1;
        return head;
      };
      // Where the hand's tip is between strokes: from where it left off to where it starts next (the
      // tray at either end of the drawing); after the erasing, from the eraser to the pink chalk, to
      // the heart, and away.
      const chalkHand = (b, C, L) => {
        const drawn = C.items.filter((it) => it.t0 >= 0);
        const start = (it) => (it.kind === "line" ? it.pts[0] : [it.align === "center" ? it.x - it.tw / 2 : it.x, it.y - it.size * 0.3]);
        const end = (it) => (it.kind === "line" ? it.pts[it.pts.length - 1] : [it.align === "center" ? it.x + it.tw / 2 : it.x + it.tw, it.y - it.size * 0.3]);
        const go = (from, to, a, c) => { const q = easeIO(clamp((b - a) / Math.max(0.05, c - a))); return [mix(from[0], to[0], q), mix(from[1], to[1], q)]; };
        const heart = drawn[drawn.length - 1];
        if (b >= CH_ERASED + 0.7) {
          if (b < CH_ERASED + 1.0) return go(L.eraserRest, L.pinkRest, CH_ERASED + 0.7, CH_ERASED + 1.0);
          if (b < heart.t0) return go(L.pinkRest, start(heart), CH_ERASED + 1.0, heart.t0);
          return go(end(heart), [L.w * 1.25, L.h * 1.35], heart.t1, heart.t1 + 0.7);
        }
        const early = drawn.filter((it) => it.t0 < CH_ERASE);
        const before = early.filter((it) => it.t1 <= b).pop(), after = early.find((it) => it.t0 > b);
        return go(before ? end(before) : L.chalkRest, after ? start(after) : L.chalkRest, before ? before.t1 : -0.2, after ? after.t0 : CH_ERASE);
      };
      // Her arm: from the shoulder (below the frame, to the right) to the elbow, bent out, to the wrist
      // (a navy cardigan, the shirt's cuff), her hand, and the chalk in her fingers.
      const drawChalkHand = (g, tip, L, holding) => {
        const { u, w, h } = L;
        const shoulder = [tip[0] + w * 0.16, h * 1.32];
        const reach = Math.hypot(shoulder[0] - tip[0], shoulder[1] - tip[1]);
        const dx = (shoulder[0] - tip[0]) / reach, dy = (shoulder[1] - tip[1]) / reach;
        const wrist = [tip[0] + dx * u * 0.065, tip[1] + dy * u * 0.065];
        const fore = Math.min(reach * 0.5, h * 0.4), bend = -0.38;
        const elbow = [wrist[0] + (Math.cos(bend) * dx - Math.sin(bend) * dy) * fore, wrist[1] + (Math.sin(bend) * dx + Math.cos(bend) * dy) * fore];
        g.save();
        g.lineCap = "round"; g.lineJoin = "round";
        g.shadowColor = "rgba(10, 20, 15, 0.38)"; g.shadowBlur = u * 0.035; g.shadowOffsetX = u * 0.02; g.shadowOffsetY = u * 0.025;
        g.strokeStyle = "#2C3354"; g.lineWidth = u * 0.13;
        g.beginPath(); g.moveTo(elbow[0], elbow[1]); g.lineTo(shoulder[0], shoulder[1]); g.stroke();
        g.lineWidth = u * 0.095;
        g.beginPath(); g.moveTo(wrist[0] + dx * u * 0.03, wrist[1] + dy * u * 0.03); g.lineTo(elbow[0], elbow[1]); g.stroke();
        g.shadowColor = "transparent";
        // the cardigan's knit: a few lines down the sleeve, and its ribbed cuff, the shirt under it
        g.strokeStyle = "rgba(255, 255, 255, 0.08)"; g.lineWidth = Math.max(1, u * 0.004);
        for (let k = -1; k <= 1; k++) { const ox = -dy * k * u * 0.025, oy = dx * k * u * 0.025; g.beginPath(); g.moveTo(wrist[0] + dx * u * 0.06 + ox, wrist[1] + dy * u * 0.06 + oy); g.lineTo(elbow[0] + ox, elbow[1] + oy); g.stroke(); }
        g.strokeStyle = "#252B48"; g.lineWidth = u * 0.1;
        g.beginPath(); g.moveTo(wrist[0] + dx * u * 0.03, wrist[1] + dy * u * 0.03); g.lineTo(wrist[0] + dx * u * 0.055, wrist[1] + dy * u * 0.055); g.stroke();
        g.strokeStyle = "#F4F1EA"; g.lineWidth = u * 0.07;
        g.beginPath(); g.moveTo(wrist[0] + dx * u * 0.012, wrist[1] + dy * u * 0.012); g.lineTo(wrist[0] + dx * u * 0.028, wrist[1] + dy * u * 0.028); g.stroke();
        if (holding !== "none") {
          g.strokeStyle = holding; g.lineWidth = u * 0.015;
          g.beginPath(); g.moveTo(tip[0], tip[1]); g.lineTo(tip[0] + dx * u * 0.05, tip[1] + dy * u * 0.05); g.stroke();
        }
        g.shadowColor = "rgba(10, 20, 15, 0.3)"; g.shadowBlur = u * 0.02; g.shadowOffsetX = u * 0.012; g.shadowOffsetY = u * 0.016;
        g.fillStyle = "#F2D3BF";
        g.beginPath(); g.ellipse(wrist[0] - dx * u * 0.006, wrist[1] - dy * u * 0.006, u * 0.045, u * 0.034, Math.atan2(dy, dx), 0, Math.PI * 2); g.fill();
        g.shadowColor = "transparent";
        g.beginPath(); g.ellipse(tip[0] + dx * u * 0.034, tip[1] + dy * u * 0.034, u * 0.019, u * 0.013, Math.atan2(dy, dx), 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(170, 120, 100, 0.45)"; g.lineWidth = Math.max(1, u * 0.003);
        for (let k = 0; k < 3; k++) { const ox = -dy * (k - 1) * u * 0.013, oy = dx * (k - 1) * u * 0.013; g.beginPath(); g.moveTo(wrist[0] - dx * u * 0.034 + ox, wrist[1] - dy * u * 0.034 + oy); g.lineTo(wrist[0] - dx * u * 0.014 + ox, wrist[1] - dy * u * 0.014 + oy); g.stroke(); }
        g.restore();
      };
      const drawBoardEraser = (g, at, angle, lifted, L, withHand) => {
        const { u } = L;
        const ew = u * 0.13, eh = u * 0.05;
        g.save();
        g.translate(at[0], at[1] - (lifted ? u * 0.02 : 0)); g.rotate(angle); g.scale(lifted ? 1.12 : 1, lifted ? 1.12 : 1);
        g.shadowColor = "rgba(10, 20, 15, 0.4)"; g.shadowBlur = u * (lifted ? 0.04 : 0.015); g.shadowOffsetY = u * (lifted ? 0.03 : 0.008);
        g.fillStyle = "#2B3352"; roundRect(g, -ew / 2, -eh * 0.1, ew, eh * 0.55, eh * 0.12); g.fill();
        g.shadowColor = "transparent";
        const top = g.createLinearGradient(0, -eh * 0.6, 0, 0);
        top.addColorStop(0, "#F7C3D7"); top.addColorStop(1, "#E89AB9");
        g.fillStyle = top; roundRect(g, -ew / 2, -eh * 0.62, ew, eh * 0.56, eh * 0.18); g.fill();
        g.fillStyle = "rgba(255, 255, 255, 0.55)"; g.fillRect(-ew * 0.42, -eh * 0.5, ew * 0.84, eh * 0.08);
        g.fillStyle = "rgba(255, 255, 255, 0.4)"; g.fillRect(-ew / 2, eh * 0.38, ew, eh * 0.06);
        g.restore();
        if (withHand) drawChalkHand(g, [at[0] + u * 0.01, at[1] - u * 0.045], L, "none");
      };
      const drawChalk = (now) => {
        const { g, w, h, r } = prep();
        const b = (now - DT_MV(2, 1)) / DT_BEAT;
        if (!chalk || chalk.w !== w || chalk.h !== h) { const L = chalkLayout(w, h); chalk = { w, h, L, C: buildChalk(L) }; }
        const { L, C } = chalk;
        const frame = mv(now);
        // The camcorder, handheld; at the very end it leans in on her.
        const lean = easeIO(clamp((b - (CH_ERASED + 1.7)) / 2.3));
        const herAt = [L.xs[2], L.feet - L.figH * 0.6];
        const zoom = 1.015 + 0.4 * lean;
        g.translate(mix(herAt[0], w / 2, lean * 0.5) + Math.sin(now * 0.7) * 2.5 + Math.sin(now * 1.9), mix(herAt[1], h * 0.55, lean * 0.5) + Math.cos(now * 0.8) * 2);
        g.scale(zoom, zoom);
        g.translate(-herAt[0], -herAt[1]);
        g.drawImage(paintOnce("classroom", w, h, r, (pg, pw, ph) => paintClassroom(pg, pw, ph, L)), 0, 0, w, h);
        // The chalk, drawn so far, on its own layer (so the eraser can take it off again).
        if (chalkLayerCv.width !== stage.width || chalkLayerCv.height !== stage.height) { chalkLayerCv.width = stage.width; chalkLayerCv.height = stage.height; }
        const lg = chalkLayerCv.getContext("2d");
        lg.setTransform(r, 0, 0, r, 0, 0);
        lg.clearRect(0, 0, w, h);
        lg.lineCap = "round"; lg.lineJoin = "round";
        let tip = null, tipInk = null;
        for (const it of C.items) {
          if (b < it.t0) continue;
          const p = clamp((b - it.t0) / (it.t1 - it.t0));
          const ink = patternFor(lg, it.ink);
          if (it.kind === "line") { const head = drawChalkStroke(lg, it, p, ink); if (p < 1) { tip = head; tipInk = it.ink; } }
          else {
            lg.save(); lg.translate(it.x, it.y); lg.rotate(it.angle);
            lg.font = `700 ${it.size.toFixed(1)}px Gaegu, cursive`; lg.textAlign = it.align;
            const tw = lg.measureText(it.text).width, x0 = it.align === "center" ? -tw / 2 : 0;
            if (p < 1) { lg.beginPath(); lg.rect(x0 - 4, -it.size * 1.2, (tw + 8) * p, it.size * 1.6); lg.clip(); }
            lg.fillStyle = ink; lg.globalAlpha = 0.95; lg.fillText(it.text, 0, 0); lg.globalAlpha = 1;
            lg.restore();
            if (p < 1) { const c = Math.cos(it.angle), sn = Math.sin(it.angle), lx = x0 + tw * p; tip = [it.x + lx * c, it.y - it.size * 0.3 + lx * sn]; tipInk = it.ink; }
          }
        }
        // the MV in the chalk TV, switching on (a line, then the picture) on the first "woo"
        const on = clamp((b - 3.4) / 0.5);
        if (on > 0) {
          const { tv } = L;
          lg.save(); roundRect(lg, tv.x + 2, tv.y + 2, tv.w - 4, tv.h - 4, tv.w * 0.03); lg.clip();
          const open = easeOut3(on), lineH = Math.max(2, tv.h * open);
          lg.beginPath(); lg.rect(tv.x, tv.y + (tv.h - lineH) / 2, tv.w, lineH); lg.clip();
          cover(lg, frame, tv.x, tv.y, tv.w, tv.h);
          lg.fillStyle = `rgba(255, 255, 255, ${(0.85 * (1 - open)).toFixed(3)})`; lg.fillRect(tv.x, tv.y, tv.w, tv.h);
          lg.fillStyle = "rgba(0, 0, 0, 0.12)";
          for (let y = tv.y; y < tv.y + tv.h; y += 3) lg.fillRect(tv.x, y, tv.w, 1);
          const vg = lg.createRadialGradient(tv.x + tv.w / 2, tv.y + tv.h / 2, tv.h * 0.3, tv.x + tv.w / 2, tv.y + tv.h / 2, tv.w * 0.65);
          vg.addColorStop(0, "rgba(0, 0, 0, 0)"); vg.addColorStop(1, "rgba(0, 0, 0, 0.45)");
          lg.fillStyle = vg; lg.fillRect(tv.x, tv.y, tv.w, tv.h);
          lg.restore();
        }
        // The eraser takes it off again, row by row (a ghost left where it passed once), and smears
        // the board under it.
        const rows = new Map();
        let pen = null, mvNow = null;
        for (const mv2 of C.moves) {
          if (b < mv2.t0) break;
          const p = clamp((b - mv2.t0) / (mv2.t1 - mv2.t0));
          const ease = 0.5 - 0.5 * Math.cos(Math.PI * p);
          const to = [mix(mv2.from[0], mv2.to[0], ease), mix(mv2.from[1], mv2.to[1], ease)];
          if (p < 1) { pen = to; mvNow = mv2; }
          if (mv2.lifted) continue;
          if (!rows.has(mv2.row)) rows.set(mv2.row, [mv2.from]);
          rows.get(mv2.row).push(to);
        }
        lg.globalCompositeOperation = "destination-out"; lg.strokeStyle = "#000000";
        rows.forEach((pts) => {
          lg.beginPath(); pts.forEach(([x, y], n) => (n ? lg.lineTo(x, y) : lg.moveTo(x, y)));
          lg.globalAlpha = 0.45; lg.lineWidth = C.brush * 1.3; lg.stroke();
          lg.globalAlpha = 0.88; lg.lineWidth = C.brush; lg.stroke();
        });
        lg.globalCompositeOperation = "source-over"; lg.globalAlpha = 1;
        g.lineCap = "round"; g.lineJoin = "round";
        rows.forEach((pts) => {
          const path = () => { g.beginPath(); pts.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y))); };
          path(); g.strokeStyle = "rgba(235, 245, 238, 0.045)"; g.lineWidth = C.brush; g.stroke();
          g.strokeStyle = "rgba(235, 245, 238, 0.05)"; g.lineWidth = Math.max(1, C.brush * 0.03);
          [-0.34, -0.12, 0.1, 0.32].forEach((off) => { g.save(); g.translate(0, off * C.brush); path(); g.stroke(); g.restore(); });
        });
        g.drawImage(chalkLayerCv, 0, 0, w, h);
        // the tray: the chalks, and the eraser while it rests there
        const inUse = b >= CH_ERASE && b < CH_ERASED + 0.7;
        [[L.chalkRest, "#F3F4EE", b < 0 || b >= CH_ERASE - 0.05], [L.pinkRest, "#F6B3CF", b < CH_ERASED + 1.0], [[L.bx + L.bw * 0.56, L.chalkRest[1]], "#F3DF8C", true], [[L.bx + L.bw * 0.52, L.chalkRest[1]], "#B3D0F4", true]].forEach(([at2, color, there]) => {
          if (!there) return;
          g.save(); g.translate(at2[0], at2[1]); g.rotate(-0.05);
          g.fillStyle = "rgba(0, 0, 0, 0.25)"; g.fillRect(-L.u * 0.03, L.u * 0.004, L.u * 0.06, L.u * 0.01);
          g.fillStyle = color; roundRect(g, -L.u * 0.03, -L.u * 0.007, L.u * 0.06, L.u * 0.014, L.u * 0.006); g.fill(); g.restore();
        });
        if (!inUse) drawBoardEraser(g, L.eraserRest, 0, false, L, false);
        // chalk dust: off the tip as it draws, and off the eraser where it turns
        g.fillStyle = "#F4F6F1";
        for (const it of C.items) {
          if (it.kind !== "line" || b < it.t0 || b > it.t1 + 3) continue;
          const rd = seeded(Math.round(it.t0 * 1000) + 7);
          for (let k = 0; k < 6; k++) {
            const f = rd(), born = it.t0 + (it.t1 - it.t0) * f, age = (b - born) * DT_BEAT;
            if (age < 0 || age > 1.3) continue;
            const pt = it.pts[Math.min(it.pts.length - 1, Math.floor(f * it.pts.length))];
            g.globalAlpha = (1 - age / 1.3) * 0.7;
            g.fillRect(pt[0] + (rd() - 0.5) * 6 + (rd() - 0.5) * age * 14, pt[1] + age * age * L.u * 0.12 + rd() * 3, 1.5, 1.5);
          }
        }
        for (const mv2 of C.moves) {
          if (!mv2.turn || b < mv2.t1) continue;
          const since = (b - mv2.t1) * DT_BEAT;
          if (since > 1.6) continue;
          const rd = seeded(mv2.seed + 3);
          for (let k = 0; k < 7; k++) {
            g.globalAlpha = (1 - since / 1.6) * (0.3 + rd() * 0.5);
            g.fillRect(mv2.to[0] + (rd() - 0.5) * C.brush * 0.9 + (rd() - 0.5) * since * 30, mv2.to[1] + C.brush * 0.3 + since * since * L.u * 0.18 + rd() * since * 20, 1.5, 1.5);
          }
        }
        g.globalAlpha = 1;
        // the hand: with the chalk (white, then the pink one at the end), or on the eraser
        if (inUse && pen) {
          const tilt = mvNow && !mvNow.lifted ? Math.sign(mvNow.to[0] - mvNow.from[0]) * 0.08 + Math.sin(now * 23) * 0.02 : 0;
          drawBoardEraser(g, pen, tilt, !!mvNow?.lifted, L, true);
        } else if (!inUse) {
          const lastInk = C.items.filter((it) => it.t0 >= 0 && it.t0 <= b).pop()?.ink ?? "w";
          const hold = chalkInk[b > CH_ERASED + 0.9 ? "p" : tipInk ?? lastInk];
          const at2 = tip ?? chalkHand(b, C, L);
          if (at2 && b < CH_ERASED + 2.6) drawChalkHand(g, at2, L, hold);
        }
        // the afternoon sun from the windows on the left, and the dust floating in it
        g.globalCompositeOperation = "screen";
        [[0.1, 0.12], [0.42, 0.08]].forEach(([x, a]) => {
          const band = g.createLinearGradient(w * x, 0, w * (x + 0.28), h);
          band.addColorStop(0, "rgba(255, 228, 180, 0)"); band.addColorStop(0.5, `rgba(255, 228, 180, ${a})`); band.addColorStop(1, "rgba(255, 228, 180, 0)");
          g.fillStyle = band; g.beginPath(); g.moveTo(w * (x - 0.05), 0); g.lineTo(w * (x + 0.12), 0); g.lineTo(w * (x + 0.42), h); g.lineTo(w * (x + 0.2), h); g.closePath(); g.fill();
        });
        g.globalCompositeOperation = "source-over";
        g.fillStyle = "#FFF8EA";
        const motes = 50 + (b > CH_ERASE ? 50 : 0);
        for (let i = 0; i < motes; i++) {
          const rx = (i * 0.618034) % 1, ry = (i * 0.754877) % 1;
          const x = w * ((rx + Math.sin(now * 0.13 + i) * 0.03 + now * 0.004) % 1), y = h * ((ry + now * 0.01 * (0.5 + (i % 3) * 0.3)) % 1);
          g.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(now * 0.8 + i));
          g.fillRect(x, y, 1.6, 1.6);
        }
        g.globalAlpha = 1;
      };
      const STAGE_PARTS = { rewind: drawRewind, seasons: drawSeasons, plane: drawPlane, alarm: drawAlarm, cube: drawCube, scope: drawScope, chalk: drawChalk, doodle: drawChalk, erase: drawChalk };

      // ── The maze: a raycaster drawn at a quarter of the screen's size and blown up, pixels and all ──
      const mazeView = box.querySelector(".dts-maze-view");
      const animeImgs = DT_NAMES.map((name) => { const img = new Image(); img.src = siteUrl(`ditto/${name.toLowerCase()}-anime.webp`); return img; });
      const bunnyImg = new Image();
      bunnyImg.src = siteUrl("ditto/bunny.webp");
      const mvSquare = document.createElement("canvas");
      mvSquare.width = mvSquare.height = 192;
      let mazeTex = null, zbuf = new Float32Array(0);
      // When each of the five is reached (she spins away), and when each bunny head is passed (the
      // world turns over), found along the walk.
      const mazeMoments = (() => {
        const gone = DT_MAZE_FIVE.map(() => Infinity), flips = DT_MAZE_BUNNIES.map(() => Infinity);
        for (let t = DT_MV(1, 9); t < DT_MV(1, 13); t += 1 / 120) {
          const { x, y } = dtWalkAt(t);
          DT_MAZE_FIVE.forEach(([sx, sy, reach], k) => { if (gone[k] === Infinity && Math.hypot(sx - x, sy - y) < reach) gone[k] = t; });
          DT_MAZE_BUNNIES.forEach(([sx, sy], k) => { if (flips[k] === Infinity && Math.hypot(sx - x, sy - y) < 0.3) flips[k] = t; });
        }
        return { gone, flips };
      })();
      const makeMazeTex = () => {
        let seed = 5;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const make = (draw) => { const c = document.createElement("canvas"); c.width = c.height = 64; draw(c.getContext("2d")); return c; };
        // The school's corridor wall: cream above a wooden rail, mint green below, a dark skirting.
        const wall = (g) => {
          g.fillStyle = "#E4DCC6"; g.fillRect(0, 0, 64, 35);
          g.fillStyle = "#84B199"; g.fillRect(0, 38, 64, 22);
          g.fillStyle = "#8A6747"; g.fillRect(0, 35, 64, 3);
          g.fillStyle = "#AD8A62"; g.fillRect(0, 35, 64, 1);
          g.fillStyle = "#4E6A5D"; g.fillRect(0, 60, 64, 4);
          for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(50, 40, 20, ${0.03 + rnd() * 0.07})`; g.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 60), 1, 1); }
          g.fillStyle = "rgba(0, 0, 0, 0.14)"; g.fillRect(0, 0, 1, 64); g.fillRect(63, 0, 1, 64);
        };
        const heart = [".11.11.", "1111111", "1111111", ".11111.", "..111..", "...1..."];
        const pixels = (g, rows, x, y, color) => { g.fillStyle = color; rows.forEach((row, j) => [...row].forEach((v, i) => { if (v === "1") g.fillRect(x + i, y + j, 1, 1); })); };
        return {
          "#": make(wall),
          // A window onto the snowy night, frost in its corner.
          w: make((g) => {
            wall(g);
            g.fillStyle = "#F3EFE5"; g.fillRect(11, 4, 42, 28);
            const glass = g.createLinearGradient(0, 6, 0, 30);
            glass.addColorStop(0, "#131C44"); glass.addColorStop(1, "#33437A");
            g.fillStyle = glass; g.fillRect(13, 6, 38, 24);
            const frostCorner = g.createRadialGradient(14, 30, 0, 14, 30, 15);
            frostCorner.addColorStop(0, "rgba(236, 242, 255, 0.85)"); frostCorner.addColorStop(1, "rgba(236, 242, 255, 0)");
            g.fillStyle = frostCorner; g.fillRect(13, 6, 38, 24);
            g.fillStyle = "#F3EFE5"; g.fillRect(31, 6, 2, 24);
            g.fillStyle = "#FFFFFF"; [[18, 10], [26, 15], [38, 9], [45, 18], [41, 25], [22, 23]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
          }),
          // A pink notice pinned up, a heart on it.
          p: make((g) => {
            wall(g);
            g.fillStyle = "rgba(0, 0, 0, 0.2)"; g.fillRect(21, 8, 26, 25);
            g.fillStyle = "#F7CBDC"; g.fillRect(19, 6, 26, 25);
            pixels(g, heart, 28, 10, "#E5609A");
            g.fillStyle = "#C88FA8"; g.fillRect(23, 19, 18, 1); g.fillRect(23, 22, 14, 1); g.fillRect(23, 25, 16, 1);
            g.fillStyle = "#5B7BE0"; g.fillRect(31, 5, 2, 2);
          }),
          // "미로" chalked on the green, a heart drawn in pink marker above it.
          g: make((g) => {
            wall(g);
            pixels(g, heart, 40, 14, "#E5609A");
            g.save(); g.translate(9, 56); g.rotate(-0.08);
            g.font = "700 15px Gaegu, cursive"; g.fillStyle = "rgba(255, 255, 255, 0.9)"; g.fillText("미로", 0, 0);
            g.restore();
          }),
        };
      };
      // The MV as a wall: a square from the middle of the frame, in a white frame.
      const drawMvSquare = () => {
        if (!video.videoWidth) return;
        const g = mvSquare.getContext("2d");
        const side = Math.min(video.videoWidth, video.videoHeight);
        g.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 10, 10, 172, 172);
        g.fillStyle = "#F3F0FF"; g.fillRect(0, 0, 192, 10); g.fillRect(0, 182, 192, 10); g.fillRect(0, 0, 10, 192); g.fillRect(182, 0, 10, 192);
        g.strokeStyle = "#F5A9CB"; g.lineWidth = 2; g.strokeRect(11, 11, 170, 170);
      };
      const drawMaze = (now) => {
        const scale = window.innerWidth >= 900 ? 4 : 3;
        const W = Math.max(80, Math.round(window.innerWidth / scale)), H = Math.max(60, Math.round(window.innerHeight / scale));
        if (mazeView.width !== W || mazeView.height !== H) { mazeView.width = W; mazeView.height = H; }
        if (zbuf.length !== W) zbuf = new Float32Array(W);
        mazeTex ??= makeMazeTex();
        if (mirrorsDue) drawMvSquare();
        const g = mazeView.getContext("2d");
        g.imageSmoothingEnabled = false;
        const at = dtWalkAt(now);
        const pulse = dtKickPulse(now);
        // The lens: a fixed height of view (wider on a tall screen), punching in a little on the kick.
        const vfov = ((W >= H ? 58 : 74) * Math.PI) / 180;
        const focal = (H / 2 / Math.tan(vfov / 2)) * (1 + pulse * 0.05);
        const plane = W / 2 / focal;
        const dirX = Math.cos(at.a), dirY = Math.sin(at.a), planeX = -dirY * plane, planeY = dirX * plane;
        const horizon = H / 2 - at.bob * H * 0.014;
        // The night sky, its stars turning with the view; snow on the ground.
        const sky = g.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, "#060A1C"); sky.addColorStop(1, "#28305E");
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.fillStyle = "#FFFFFF";
        for (let i = 0; i < 80; i++) {
          let d = ((i * 2.39996) % (Math.PI * 2)) - at.a;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) > 1.3) continue;
          g.globalAlpha = 0.3 + ((i * 0.37) % 1) * 0.6;
          g.fillRect(Math.round(W / 2 + Math.tan(d) * focal), Math.round(horizon * (1 - ((i * 0.618) % 1) * 0.95)), 1, 1);
        }
        g.globalAlpha = 1;
        const ground = g.createLinearGradient(0, horizon, 0, H);
        ground.addColorStop(0, "#2A3258"); ground.addColorStop(1, "#C9D1EC");
        g.fillStyle = ground; g.fillRect(0, Math.floor(horizon), W, H);
        // The walls, a column at a time: fogged with distance, the MV's walls glowing through it
        // (and flaring on the kick).
        for (let x = 0; x < W; x++) {
          const cx = (2 * (x + 0.5)) / W - 1;
          const rx = dirX + planeX * cx || 1e-9, ry = dirY + planeY * cx || 1e-9;
          let mx = Math.floor(at.x), my = Math.floor(at.y);
          const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry), stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
          let sdx = rx < 0 ? (at.x - mx) * ddx : (mx + 1 - at.x) * ddx;
          let sdy = ry < 0 ? (at.y - my) * ddy : (my + 1 - at.y) * ddy;
          let side = 0, cell = "#";
          for (let n = 0; n < 40; n++) {
            if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
            cell = DT_MAZE[my]?.[mx] ?? "#";
            if (cell !== ".") break;
          }
          const dist = Math.max(0.02, side === 0 ? sdx - ddx : sdy - ddy);
          zbuf[x] = dist;
          let hit = side === 0 ? at.y + dist * ry : at.x + dist * rx;
          hit -= Math.floor(hit);
          const tex = cell === "M" ? mvSquare : mazeTex[cell] ?? mazeTex["#"];
          let tx = Math.min(tex.width - 1, Math.floor(hit * tex.width));
          if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) tx = tex.width - tx - 1;
          const lineH = focal / dist, top = horizon - lineH / 2;
          g.drawImage(tex, tx, 0, 1, tex.height, x, top, 1, lineH);
          const y0 = Math.max(0, top), y1 = Math.min(H, top + lineH);
          const fog = Math.min(0.82, Math.max(0, (dist - 0.8) / 7)) * (cell === "M" ? 0.45 : 1);
          if (fog > 0.01) { g.fillStyle = `rgba(16, 21, 46, ${fog.toFixed(3)})`; g.fillRect(x, y0, 1, y1 - y0); }
          if (side === 1 && cell !== "M") { g.fillStyle = "rgba(10, 12, 30, 0.16)"; g.fillRect(x, y0, 1, y1 - y0); }
          if (cell === "M" && pulse > 0.02) { g.fillStyle = `rgba(255, 236, 246, ${(pulse * 0.3).toFixed(3)})`; g.fillRect(x, y0, 1, y1 - y0); }
        }
        // The five and the bunny heads, farthest first, hidden where a wall is nearer.
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        const invDet = 1 / (planeX * dirY - dirX * planeY);
        const sprites = [
          ...DT_MAZE_FIVE.map(([x, y], k) => ({ x, y, img: animeImgs[k], crop: [DT_ANIME_CROP[k][0], 0, DT_ANIME_CROP[k][1], 1100], size: 0.74, lift: 0, gone: mazeMoments.gone[k], seed: k + 1 })),
          ...DT_MAZE_BUNNIES.map(([x, y], k) => ({ x, y, img: bunnyImg, crop: [0, 0, 700, 551], size: 0.3, lift: 0.62, spin: now * 3.2 + k * 1.7, seed: 9 + k })),
        ].map((sp) => ({ ...sp, tx: invDet * (dirY * (sp.x - at.x) - dirX * (sp.y - at.y)), ty: invDet * (-planeY * (sp.x - at.x) + planeX * (sp.y - at.y)) }))
          .filter((sp) => sp.ty > 0.22 && sp.img.complete && sp.img.naturalWidth)
          .sort((a, b) => b.ty - a.ty);
        for (const sp of sprites) {
          const v = sp.gone === undefined ? 0 : clamp((now - sp.gone) / 0.4);
          if (v >= 1) continue;
          const unitPx = focal / sp.ty, hPx = unitPx * sp.size;
          const bottom = horizon + unitPx * (0.5 - sp.lift - v * 0.12) + (sp.gone === undefined ? 0 : Math.sin(now * 2.2 + sp.seed) * unitPx * 0.008);
          const [cx0, cy0, cw, ch] = sp.crop;
          const wPx = hPx * (cw / ch) * Math.max(0.04, Math.abs(sp.spin !== undefined ? Math.cos(sp.spin) : Math.cos(v * Math.PI * 3)));
          const sx = (W / 2) * (1 + sp.tx / sp.ty), left = sx - wPx / 2;
          g.globalAlpha = (1 - Math.min(0.5, Math.max(0, (sp.ty - 3.5) / 9))) * (1 - v);
          const mid = Math.round(Math.min(W - 1, Math.max(0, sx)));
          if (sp.gone !== undefined && sp.ty < zbuf[mid]) {
            const halo = g.createRadialGradient(sx, bottom - hPx * 0.5, 0, sx, bottom - hPx * 0.5, hPx * 0.62);
            halo.addColorStop(0, "rgba(255, 244, 250, 0.55)"); halo.addColorStop(0.6, "rgba(246, 196, 222, 0.22)"); halo.addColorStop(1, "rgba(246, 196, 222, 0)");
            g.fillStyle = halo; g.fillRect(sx - hPx * 0.62, bottom - hPx * 1.12, hPx * 1.24, hPx * 1.24);
          }
          // in runs of the columns the walls leave open
          let run = -1;
          const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + wPx));
          for (let x = x0; x <= x1; x++) {
            const open = x < x1 && sp.ty < zbuf[x];
            if (open && run < 0) run = x;
            if (!open && run >= 0) {
              const a = (run - left) / wPx, b = (x - left) / wPx;
              g.drawImage(sp.img, cx0 + a * cw, cy0, (b - a) * cw, ch, run, bottom - hPx, x - run, hPx);
              run = -1;
            }
          }
          // ...and as she is reached, she spins away into snow.
          if (v > 0) {
            let seed = sp.seed * 977 + 3;
            const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
            const size = hPx > 60 ? 2 : 1;
            for (let i = 0; i < 24; i++) {
              const px = sx + (rnd() - 0.5) * hPx * 0.4 + (rnd() - 0.5) * hPx * 0.9 * v;
              const py = bottom - hPx * (0.15 + rnd() * 0.8) - (0.1 + rnd() * 0.5) * hPx * v;
              g.globalAlpha = (1 - v) * (0.6 + rnd() * 0.4);
              g.fillStyle = i % 3 ? "#FFFFFF" : "#F7B6D2";
              g.fillRect(Math.round(px), Math.round(py), size, size);
            }
          }
          g.globalAlpha = 1;
        }
        g.imageSmoothingEnabled = false;
        // Snow falling past, swept sideways as the view turns.
        const sweep = at.a * focal * 0.9;
        g.fillStyle = "#FFFFFF";
        for (let i = 0; i < (SCENE_LITE ? 45 : 90); i++) {
          const r1 = (i * 0.618034) % 1, r2 = (i * 0.754877) % 1, r3 = (i * 0.56984) % 1, near = r3 > 0.78;
          const y = ((r2 * (H + 6) + now * H * (near ? 0.42 : 0.16 + r3 * 0.18)) % (H + 6)) - 3;
          const x = (((r1 * W + Math.sin(now * 1.2 + i) * 2 - sweep * (near ? 1.5 : 0.7)) % W) + W) % W;
          g.globalAlpha = near ? 0.95 : 0.45 + r2 * 0.35;
          g.fillRect(Math.round(x), Math.round(y), near ? 2 : 1, near ? 2 : 1);
        }
        g.globalAlpha = 1;
        // Passing a bunny head turns the world over (the next turns it back), the picture growing as
        // it turns so the screen stays covered.
        const flip = (start) => { const q = clamp((now - start) / 0.36); return q * q * (3 - 2 * q); };
        const over = (flip(mazeMoments.flips[0]) - flip(mazeMoments.flips[1])) * 180;
        if (over > 0.01) {
          const rad = (over * Math.PI) / 180, cs = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
          const vw = window.innerWidth, vh = window.innerHeight;
          mazeView.style.transform = `rotate(${over.toFixed(2)}deg) scale(${Math.max((vw * cs + vh * sn) / vw, (vw * sn + vh * cs) / vh).toFixed(4)})`;
        } else mazeView.style.transform = "";
      };

      // ── The apartment block: its windows a screen, words and a heart ──
      const blockCam = box.querySelector(".dts-block-cam");
      const blockView = box.querySelector(".dts-block-view");
      const blockGlow = box.querySelector(".dts-block-glow");
      const bloom = box.querySelector(".dts-block-bloom");
      const mvTiny = document.createElement("canvas");
      let lay = null, blockBg = null, mvLight = null;
      const hash = (c, r) => { let n = Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
      const blockLayout = () => {
        const w = window.innerWidth, h = window.innerHeight, wide = w >= h, cols = wide ? 29 : 17;
        const unit = (w * (wide ? 0.82 : 0.9)) / cols, floorH = unit * (wide ? 1 : 1.18);
        const ground = h * (wide ? 0.85 : 0.87);
        const floors = Math.max(12, Math.min(26, Math.floor((ground - h * (wide ? 0.2 : 0.16) - floorH * 1.3) / floorH)));
        const left = (w - cols * unit) / 2, top = ground - floorH * 1.3 - floors * floorH;
        // The words and the heart as the windows they light (column + row × 100), in the middle.
        const word = (text) => {
          const glyphs = [...text].map((ch) => DT_FONT[ch]);
          const on = new Map();
          let c = Math.floor((cols - glyphs.reduce((n, rows) => n + rows[0].length + 1, -1)) / 2);
          const r0 = Math.floor((floors - 5) / 2);
          glyphs.forEach((rows, i) => { rows.forEach((row, y) => [...row].forEach((v, x) => { if (v === "1") on.set(c + x + (r0 + y) * 100, i); })); c += rows[0].length + 1; });
          return on;
        };
        const heart = new Set();
        const hc = Math.floor((cols - DT_HEART[0].length) / 2), hr = Math.floor((floors - DT_HEART.length) / 2);
        DT_HEART.forEach((row, y) => [...row].forEach((v, x) => { if (v === "1") heart.add(hc + x + (hr + y) * 100); }));
        const tip = hc + DT_HEART[DT_HEART.length - 1].indexOf("1") + (hr + DT_HEART.length - 1) * 100;
        return { w, h, wide, cols, floors, unit, floorH, ground, left, top, heart, tip, ratio: SCENE_LITE ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
          words: { SAY: word("SAY"), IT: word("IT"), BACK: word("BACK"), DITTO: word("DITTO") } };
      };
      // Everything that stays put, painted once for the screen: the night, 101, the snow, the lamp
      // post, the trees, and her.
      const paintBlock = (L) => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(L.w * L.ratio); canvas.height = Math.round(L.h * L.ratio);
        const g = canvas.getContext("2d");
        g.scale(L.ratio, L.ratio);
        const { w, h, wide, cols, floors, unit, floorH, ground, left, top } = L;
        let seed = 17;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        // The night: stars, a city glow low down, a thin moon.
        const sky = g.createLinearGradient(0, 0, 0, ground);
        sky.addColorStop(0, "#060A1C"); sky.addColorStop(0.75, "#1B2249"); sky.addColorStop(1, "#3B3562");
        g.fillStyle = sky; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 110; i++) { const size = rnd() < 0.15 ? 1.6 : 1; g.fillStyle = `rgba(255, 255, 255, ${(0.2 + rnd() * 0.6).toFixed(2)})`; g.fillRect(rnd() * w, rnd() * ground * 0.75, size, size); }
        const mr = Math.max(10, Math.min(w, h) * 0.032), moon = document.createElement("canvas");
        moon.width = moon.height = Math.ceil(mr * 6);
        const mg = moon.getContext("2d"), o = mr * 3;
        mg.fillStyle = "#FFF5DA"; mg.beginPath(); mg.arc(o, o, mr, 0, Math.PI * 2); mg.fill();
        mg.globalCompositeOperation = "destination-out"; mg.beginPath(); mg.arc(o + mr * 0.48, o - mr * 0.22, mr * 0.9, 0, Math.PI * 2); mg.fill();
        g.save(); g.shadowColor = "rgba(255, 236, 196, 0.9)"; g.shadowBlur = mr; g.drawImage(moon, w * (wide ? 0.16 : 0.18) - o, h * (wide ? 0.1 : 0.075) - o); g.restore();
        // Other blocks, far off, a few windows still lit.
        (wide ? [[0, 0.47, 0.13], [0.86, 0.43, 0.14], [0.72, 0.53, 0.1]] : [[-0.08, 0.36, 0.2], [0.86, 0.31, 0.22]]).forEach(([x, y, fw]) => {
          g.fillStyle = "#121736"; g.fillRect(x * w, y * h, fw * w, ground - y * h);
          for (let i = 0; i < 30; i++) {
            if (rnd() < 0.55) continue;
            g.fillStyle = rnd() < 0.7 ? "rgba(255, 206, 150, 0.5)" : "rgba(150, 185, 255, 0.45)";
            g.fillRect(x * w + 4 + rnd() * (fw * w - 10), y * h + 8 + rnd() * (ground - y * h - 24), Math.max(2, unit * 0.18), Math.max(1.5, unit * 0.12));
          }
        });
        // The block: a slab and a railing on every floor, snow on every ledge.
        const bx = left - unit * 0.55, bw = cols * unit + unit * 1.1, roof = top - floorH * 0.4;
        const body = g.createLinearGradient(0, roof, 0, ground);
        body.addColorStop(0, "#2B3152"); body.addColorStop(1, "#1C2139");
        g.fillStyle = body; g.fillRect(bx, roof, bw, ground - roof);
        for (let r = 0; r <= floors; r++) {
          const y = top + r * floorH;
          g.fillStyle = "#363E63"; g.fillRect(bx, y - floorH * 0.07, bw, Math.max(1.5, floorH * 0.09));
          g.fillStyle = "rgba(232, 238, 255, 0.7)"; g.fillRect(bx, y - floorH * 0.085, bw, Math.max(1, floorH * 0.03));
          if (r < floors) { g.fillStyle = "rgba(130, 140, 190, 0.28)"; g.fillRect(bx, y + floorH * 0.8, bw, Math.max(1, floorH * 0.035)); }
        }
        // On the roof: the parapet, the lift's machine room with 101 painted on it, a water tank,
        // aerials, and the warning light's mast.
        g.fillStyle = "#262C4C"; g.fillRect(bx, roof - floorH * 0.18, bw, floorH * 0.18);
        g.fillStyle = "rgba(232, 238, 255, 0.75)"; g.fillRect(bx, roof - floorH * 0.2, bw, Math.max(1, floorH * 0.04));
        const room = { x: left + unit * (wide ? 2 : 1), y: roof - floorH * 1.6, w: unit * (wide ? 5 : 5.5), h: floorH * 1.42 };
        g.fillStyle = "#2E3557"; g.fillRect(room.x, room.y, room.w, room.h);
        g.fillStyle = "rgba(232, 238, 255, 0.75)"; g.fillRect(room.x - 2, room.y - 2, room.w + 4, Math.max(1.5, floorH * 0.06));
        g.save();
        g.fillStyle = "rgba(240, 242, 255, 0.92)"; g.font = `800 ${Math.round(room.h * 0.62)}px Inter, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("101", room.x + room.w / 2, room.y + room.h * 0.56);
        g.restore();
        const tank = { x: left + cols * unit - unit * (wide ? 6 : 4.5), y: roof - floorH * 1.1, w: unit * (wide ? 3 : 3.2), h: floorH * 0.92 };
        g.fillStyle = "#2A3050"; g.fillRect(tank.x, tank.y, tank.w, tank.h);
        g.fillStyle = "rgba(232, 238, 255, 0.7)"; g.beginPath(); g.ellipse(tank.x + tank.w / 2, tank.y, tank.w / 2, floorH * 0.16, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#3A4268"; g.lineWidth = 1.5;
        [[0.55, 2.2], [0.62, 1.6], [0.86, 1.9]].forEach(([x, high]) => {
          g.beginPath(); g.moveTo(bx + bw * x, roof - floorH * 0.18); g.lineTo(bx + bw * x, roof - floorH * high);
          g.moveTo(bx + bw * x - unit * 0.4, roof - floorH * (high - 0.4)); g.lineTo(bx + bw * x + unit * 0.4, roof - floorH * (high - 0.4)); g.stroke();
        });
        L.beacon = [room.x + room.w / 2, room.y - floorH * 0.3];
        g.fillStyle = "#3A4268"; g.fillRect(L.beacon[0] - 1, L.beacon[1], 2, floorH * 0.3);
        // The ground floor, the entrance lit.
        const base = top + floors * floorH;
        g.fillStyle = "#161A2E"; g.fillRect(bx, base + floorH * 0.02, bw, ground - base);
        const door = { x: w / 2 - unit * 1.3, y: ground - floorH * 1.05, w: unit * 2.6, h: floorH * 1.05 };
        const lobby = g.createLinearGradient(0, door.y, 0, ground);
        lobby.addColorStop(0, "#FFE2B4"); lobby.addColorStop(1, "#E9A86C");
        g.save(); g.shadowColor = "rgba(255, 200, 140, 0.8)"; g.shadowBlur = unit; g.fillStyle = lobby; g.fillRect(door.x, door.y, door.w, door.h); g.restore();
        g.fillStyle = "#1C2036"; g.fillRect(door.x + door.w / 2 - 1, door.y, 2, door.h); g.fillRect(door.x - unit * 0.3, door.y - floorH * 0.12, door.w + unit * 0.6, floorH * 0.12);
        // Snow on the ground, bare trees, a lamp post and its cone of light.
        const snow = g.createLinearGradient(0, ground, 0, h);
        snow.addColorStop(0, "#7F88B0"); snow.addColorStop(1, "#D2D9F0");
        g.fillStyle = snow; g.fillRect(0, ground, w, h - ground);
        const tree = (x, y, len, angle, depth) => {
          const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
          g.lineWidth = Math.max(0.6, depth * 0.9); g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
          if (depth > 1) { tree(x2, y2, len * 0.72, angle - 0.35 - rnd() * 0.3, depth - 1); tree(x2, y2, len * 0.72, angle + 0.35 + rnd() * 0.3, depth - 1); }
        };
        g.strokeStyle = "#0E1227"; g.lineCap = "round";
        (wide ? [0.08, 0.36, 0.64, 0.75, 0.95] : [0.06, 0.72, 0.96]).forEach((x) => tree(w * x, ground + (h - ground) * 0.12, floorH * (1.1 + rnd() * 0.4), -Math.PI / 2 + (rnd() - 0.5) * 0.2, 6));
        const lampFoot = ground + (h - ground) * 0.5, lamp = [w * (wide ? 0.87 : 0.84), lampFoot - floorH * (wide ? 2.4 : 2.8)];
        L.lamp = [lamp[0] - unit * 0.7, lamp[1], (unit * 3) / (h - lamp[1])];
        const cone = g.createLinearGradient(0, lamp[1], 0, h);
        cone.addColorStop(0, "rgba(255, 214, 150, 0.32)"); cone.addColorStop(1, "rgba(255, 214, 150, 0.03)");
        g.fillStyle = cone; g.beginPath(); g.moveTo(L.lamp[0] - unit * 0.15, lamp[1] + 2); g.lineTo(L.lamp[0] + unit * 0.15, lamp[1] + 2); g.lineTo(L.lamp[0] + unit * 3, h); g.lineTo(L.lamp[0] - unit * 3, h); g.closePath(); g.fill();
        g.strokeStyle = "#141830"; g.lineWidth = Math.max(2, unit * 0.1);
        g.beginPath(); g.moveTo(lamp[0], lampFoot); g.lineTo(lamp[0], lamp[1]); g.lineTo(L.lamp[0] - unit * 0.1, lamp[1]); g.stroke();
        g.fillStyle = "#FFE6B8"; g.fillRect(L.lamp[0] - unit * 0.25, lamp[1], unit * 0.5, Math.max(2, floorH * 0.1));
        // Her, from behind: footprints to where she stands, a beanie, a scarf, the camcorder held up
        // over her head, its screen flipped open toward us.
        const gh = h * (wide ? 0.15 : 0.11), gx = w * (wide ? 0.27 : 0.3), gy = h * (wide ? 0.955 : 0.93);
        g.fillStyle = "rgba(86, 96, 136, 0.5)";
        for (let i = 1; i < 9; i++) {
          const t = i / 9;
          g.beginPath(); g.ellipse(gx - t * (gx + w * 0.04) + (i % 2 ? -1 : 1) * gh * 0.04, gy + t * (h - gy) * 0.95, gh * 0.03 * (1 + t), gh * 0.012 * (1 + t), 0, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = "#0B0F20";
        g.fillRect(gx - gh * 0.07, gy - gh * 0.3, gh * 0.05, gh * 0.3); g.fillRect(gx + gh * 0.02, gy - gh * 0.3, gh * 0.05, gh * 0.3);
        g.fillRect(gx - gh * 0.09, gy - gh * 0.05, gh * 0.08, gh * 0.05); g.fillRect(gx + gh * 0.01, gy - gh * 0.05, gh * 0.08, gh * 0.05);
        g.beginPath(); g.moveTo(gx - gh * 0.12, gy - gh * 0.74); g.lineTo(gx + gh * 0.12, gy - gh * 0.74); g.lineTo(gx + gh * 0.17, gy - gh * 0.27); g.lineTo(gx - gh * 0.17, gy - gh * 0.27); g.closePath(); g.fill();
        g.beginPath(); g.ellipse(gx, gy - gh * 0.72, gh * 0.13, gh * 0.05, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#0B0F20"; g.lineWidth = gh * 0.05;
        g.beginPath(); g.moveTo(gx + gh * 0.1, gy - gh * 0.71); g.lineTo(gx + gh * 0.07, gy - gh * 1.05); g.stroke();
        g.beginPath(); g.moveTo(gx - gh * 0.1, gy - gh * 0.71); g.lineTo(gx - gh * 0.03, gy - gh * 1.05); g.stroke();
        g.fillStyle = "#151022"; g.beginPath(); g.ellipse(gx, gy - gh * 0.8, gh * 0.1, gh * 0.14, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#E7A6C2"; g.beginPath(); g.arc(gx, gy - gh * 0.87, gh * 0.088, Math.PI, 0); g.fill();
        g.fillRect(gx - gh * 0.095, gy - gh * 0.875, gh * 0.19, gh * 0.03);
        g.beginPath(); g.arc(gx, gy - gh * 0.965, gh * 0.03, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#CFE0F7"; g.fillRect(gx - gh * 0.1, gy - gh * 0.75, gh * 0.2, gh * 0.04); g.fillRect(gx + gh * 0.04, gy - gh * 0.72, gh * 0.045, gh * 0.16);
        g.fillStyle = "#2A2F44"; g.fillRect(gx - gh * 0.02, gy - gh * 1.13, gh * 0.18, gh * 0.075);
        L.lcd = [gx - gh * 0.17, gy - gh * 1.14, gh * 0.14, gh * 0.095];
        g.fillStyle = "#3A3F58"; g.fillRect(L.lcd[0] - 1.5, L.lcd[1] - 1.5, L.lcd[2] + 3, L.lcd[3] + 3);
        L.rec = [gx + gh * 0.135, gy - gh * 1.105, gh];
        return canvas;
      };
      const drawBlock = (now) => {
        const s = (now - DT_MV(1, 13)) / DT_SIX; // sixteenths into "say it back"
        if (!lay || lay.w !== window.innerWidth || lay.h !== window.innerHeight) {
          lay = blockLayout();
          blockBg = paintBlock(lay);
          blockView.width = Math.round(lay.w * lay.ratio); blockView.height = Math.round(lay.h * lay.ratio);
          mvTiny.width = blockGlow.width = lay.cols; mvTiny.height = blockGlow.height = lay.floors;
          Object.assign(blockGlow.style, { left: `${lay.left}px`, top: `${lay.top}px`, width: `${lay.cols * lay.unit}px`, height: `${lay.floors * lay.floorH}px`, filter: `blur(${(lay.unit * 0.45).toFixed(1)}px)` });
          mvLight = null;
        }
        const L = lay, { cols, floors, unit, floorH, left, top } = L;
        // The MV at the windows: its colours, the levels stretched so a dark shot still shows.
        if ((mirrorsDue || !mvLight) && video.videoWidth) {
          const mg = mvTiny.getContext("2d", { willReadFrequently: true });
          const aspect = (cols * unit) / (floors * floorH), va = video.videoWidth / video.videoHeight;
          const sw = aspect < va ? video.videoHeight * aspect : video.videoWidth, sh = aspect < va ? video.videoHeight : video.videoWidth / aspect;
          mg.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, cols, floors);
          const data = mg.getImageData(0, 0, cols, floors).data;
          let lo = 255, hi = 0;
          for (let i = 0; i < data.length; i += 4) { const l = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11; lo = Math.min(lo, l); hi = Math.max(hi, l); }
          mvLight = { data, lo, span: Math.max(40, hi - lo) };
        }
        const mvAt = (c, r) => {
          if (!mvLight) return null;
          const i = (r * cols + c) * 4, d = mvLight.data;
          const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 - mvLight.lo) / mvLight.span;
          if (l < 0.22) return null;
          const k = ((0.55 + l * 0.6) * 255) / Math.max(60, d[i], d[i + 1], d[i + 2]);
          return [d[i] * k * 0.8 + 50 * l, d[i + 1] * k * 0.8 + 38 * l, d[i + 2] * k * 0.8 + 22 * l];
        };
        // As it is: some rooms dark, some lamps, a TV flickering blue here and there.
        const life = (c, r) => {
          const v = hash(c, r);
          if (v < 0.45) return null;
          if (v < 0.57) { const f = 0.7 + 0.3 * Math.sin(now * 11 + c * 7 + r * 3); return [140 * f, 178 * f, 255 * f]; }
          return v < 0.86 ? [255, 206, 140] : [255, 236, 210];
        };
        const PASTEL = [[255, 178, 210], [214, 196, 255], [176, 206, 255], [214, 196, 255], [255, 178, 210]];
        const bar = Math.floor(s / 16), k = s - bar * 16;
        const word = bar === 1 ? (k < 4 ? [L.words.SAY, 0] : k < 8 ? [L.words.IT, 4] : k < 11 ? [L.words.BACK, 8] : null) : null;
        const lit = new Array(cols * floors).fill(null);
        for (let r = 0; r < floors; r++) for (let c = 0; c < cols; c++) {
          const n = c + r * 100;
          let col = null;
          // Bar 13: the block as it is, then the MV filling it from the ground up.
          if (bar <= 0) col = s < 4 + ((floors - 1 - r) / floors) * 3.5 ? life(c, r) : mvAt(c, r);
          // Bar 14: SAY, IT, BACK on the kicks (a quick wipe across each), then the MV again.
          else if (bar === 1) col = word ? (word[0].has(n) && k - word[1] >= (c / cols) * 0.8 ? [255, 240, 216] : null) : mvAt(c, r);
          // Bar 15, the break: DITTO, a letter an eighth, each flashing as it lights.
          else if (bar === 2) { const i = L.words.DITTO.get(n); if (i !== undefined && k >= i * 2) col = PASTEL[i].map((v) => v * (1 + 0.6 * Math.max(0, 1 - (k - i * 2)))); }
          // Bar 16: the heart, beating on the kicks, then going out window by window, all but one.
          else if (L.heart.has(n) && (n === L.tip || k < 8.5 + hash(c, r) * 3)) col = n === L.tip && k > 11.5 ? [255, 244, 226] : [255, 172, 206];
          // Each kick a ripple out from the middle.
          if (col && bar !== 2) {
            const p = dtKickPulse(now - Math.hypot(c - cols / 2, (r - floors / 2) * 1.2) / cols * 0.3);
            if (p > 0.01) col = col.map((v) => v * (1 + p * 0.45));
          }
          lit[r * cols + c] = col && col.map((v) => Math.min(255, v));
        }
        // Paint: the still parts, then the windows (a curtain half drawn, the frame's middle bar),
        // their light into the glow over them.
        const g = blockView.getContext("2d");
        g.setTransform(L.ratio, 0, 0, L.ratio, 0, 0);
        g.drawImage(blockBg, 0, 0, L.w, L.h);
        const gw = blockGlow.getContext("2d");
        const glow = gw.createImageData(cols, floors);
        for (let r = 0; r < floors; r++) for (let c = 0; c < cols; c++) {
          const col = lit[r * cols + c], v = hash(c, r);
          const x = left + c * unit + unit * 0.17, y = top + r * floorH + floorH * 0.2, ww = unit * 0.66, wh = floorH * 0.52;
          if (!col) { g.fillStyle = v < 0.5 ? "#131930" : "#171E38"; g.fillRect(x, y, ww, wh); continue; }
          g.fillStyle = `rgb(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0})`; g.fillRect(x, y, ww, wh);
          g.fillStyle = "rgba(110, 50, 40, 0.2)"; g.fillRect(v < 0.5 ? x : x + ww * 0.6, y, ww * 0.4, wh);
          g.fillStyle = "rgba(24, 28, 46, 0.6)"; g.fillRect(x + ww / 2 - 0.5, y, 1, wh);
          const i = (r * cols + c) * 4;
          glow.data[i] = col[0]; glow.data[i + 1] = col[1]; glow.data[i + 2] = col[2]; glow.data[i + 3] = 255;
        }
        gw.putImageData(glow, 0, 0);
        // The warning light on the roof, on every beat.
        if (((now - DT_MV(1, 13)) / DT_BEAT) % 1 < 0.35) {
          g.save(); g.fillStyle = "#FF5A6E"; g.shadowColor = "#FF4060"; g.shadowBlur = unit * 0.8;
          g.beginPath(); g.arc(L.beacon[0], L.beacon[1], Math.max(2, unit * 0.09), 0, Math.PI * 2); g.fill(); g.restore();
        }
        // Her camcorder's screen shows what she is filming; its REC light blinks.
        const [lx, ly, lw, lh] = L.lcd;
        g.fillStyle = "#0D1426"; g.fillRect(lx, ly, lw, lh);
        g.imageSmoothingEnabled = false; g.drawImage(blockGlow, lx, ly, lw, lh); g.imageSmoothingEnabled = true;
        g.fillStyle = "rgba(160, 196, 255, 0.22)"; g.fillRect(lx, ly, lw, lh);
        if (now % 1 < 0.55) { g.fillStyle = "#FF3B4E"; g.beginPath(); g.arc(L.rec[0], L.rec[1], Math.max(1.5, L.rec[2] * 0.013), 0, Math.PI * 2); g.fill(); }
        // Snow, near flakes bigger and faster, bright where they fall through the lamp's light.
        const t = now - DT_MV(1, 13);
        g.fillStyle = "#F4F6FF";
        for (let i = 0; i < (SCENE_LITE ? 70 : 140); i++) {
          const r1 = (i * 0.618034) % 1, r2 = (i * 0.754877) % 1, depth = 0.25 + ((i * 0.56984) % 1) * 0.75;
          const y = ((r2 * (L.h + 40) + t * (24 + depth * 80)) % (L.h + 40)) - 20;
          const x = ((((r1 * L.w + Math.sin(t * (0.5 + depth) + i) * 16 * depth + t * 14 * depth) % L.w) + L.w) % L.w);
          const inLight = y > L.lamp[1] && Math.abs(x - L.lamp[0]) < (y - L.lamp[1]) * L.lamp[2] + unit * 0.2;
          g.globalAlpha = Math.min(1, (0.25 + depth * 0.55) * (inLight ? 1.8 : 1));
          g.beginPath(); g.arc(x, y, (0.7 + depth * depth * 3.2) * (L.wide ? 1 : 0.85), 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
        // The camera: handheld, pushing in slowly; at the end into the last window, its light
        // filling the screen.
        const push = 1 + 0.05 * clamp(s / 60);
        let S = push, tx = ((1 - push) * L.w) / 2 + Math.sin(now * 1.1) * 3 + Math.sin(now * 2.6) * 1.2, ty = ((1 - push) * L.h) / 2 + Math.cos(now * 1.3) * 2;
        const zoom = clamp((s - 60) / 4);
        let wx = 0, wy = 0;
        if (zoom > 0) {
          wx = S * (left + ((L.tip % 100) + 0.5) * unit) + tx; wy = S * (top + (Math.floor(L.tip / 100) + 0.46) * floorH) + ty;
          const S2 = 1 + 60 * zoom ** 3;
          S *= S2; tx = S2 * tx + (1 - S2) * wx; ty = S2 * ty + (1 - S2) * wy;
        }
        blockCam.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${S.toFixed(4)})`;
        blockGlow.style.opacity = String(1 - clamp(zoom * 3));
        bloom.style.opacity = (zoom ** 2 * 0.95).toFixed(3);
        if (zoom > 0) { bloom.style.setProperty("--x", `${wx.toFixed(0)}px`); bloom.style.setProperty("--y", `${wy.toFixed(0)}px`); }
      };

      return {
        show(cue, now) {
          box.dataset.cue = cue;
          if (cue === "cube" || cue === "scope" || cue === "maze" || cue === "block" || cue === "chalk") restart(cam, "is-tape");
        },
        tick(now) {
          const s = Math.floor(now);
          time.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
          const cue = box.dataset.cue;
          STAGE_PARTS[cue]?.(now);
          if (cue === "maze") drawMaze(now);
          if (cue === "block") drawBlock(now);
        },
        unmount() { video.remove(); },
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
      // silent last beat (16.67 s). Its effects, the photo shoot, are its own (whiplashStage, fx
      // styled in whiplash.css).
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
        ...whiplashStage,
        fx: `<i class="wlx-dim"></i><div class="wlx-plot"><i class="wlx-grid"></i><div class="wlx-mark"><i></i><i></i><b>TALENT</b></div></div>`
          + `<div class="wlx-seam"><i class="wlx-stand"></i><i class="wlx-stand is-r"></i><div class="wlx-sheet"><div class="wlx-x"><i></i><i></i></div></div><i class="wlx-roll"></i></div>`
          + `<svg class="wlx-wind" viewBox="0 0 100 60" preserveAspectRatio="none">${["M-5 14 C 25 6, 45 22, 70 12 S 100 8, 105 12", "M-5 26 C 30 20, 50 34, 75 24 S 98 22, 105 26", "M-5 38 C 20 32, 40 46, 66 38 S 96 34, 105 40", "M-5 50 C 28 44, 52 58, 78 48 S 100 46, 105 50"].map((d, i) => `<path d="${d}" pathLength="1" style="--w: ${i}"/>`).join("")}</svg>`
          + `<div class="wlx-fan"><i class="wlx-cage"></i><svg class="wlx-blades" viewBox="0 0 100 100">${[0, 120, 240].map((r) => `<g transform="rotate(${r} 50 50)"><path d="M50 50 C 44 30, 46 12, 58 6 C 66 14, 62 34, 50 50 Z"/></g>`).join("")}<circle cx="50" cy="50" r="7"/></svg><i class="wlx-cage is-front"></i></div>`
          + `<div class="wlx-tags"></div>`,
        sections: [[0, "calm"], ...[[0, "set"], [7.619, "seamless"], [14.286, "cut"], [15.238, "gust"], [16.667, "out"]].map(([at, name]) => [19.048 + at, name])],
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
          + `<div class="drx-script"><div class="drx-sheet"><i class="drx-holes"></i><p class="drx-rev"></p><p class="drx-pageno">12.</p><div class="drx-page"><div class="drx-lines"></div></div><b class="drx-note"></b></div></div>`
          + `<div class="drx-cut"><div class="drx-cut-stick"></div><div class="drx-cut-board"><b>CUT!</b><span>Scene 04 · Take 01 · Drama</span></div></div>`
          + `<div class="drx-neg">${[1, 2, 3].map((n) => `<i style="background-image: url('drama/stage/still-${n}.webp')"></i>`).join("")}<b class="drx-neg-label"></b></div>`
          + `<svg class="drx-defs" width="0" height="0" aria-hidden="true"><filter id="drx-redneg" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-0.3030 -1.0192 -0.1029 0 1.1425  -0.0638 -0.2146 -0.0217 0 0.2300  -0.0542 -0.1824 -0.0184 0 0.2055  0 0 0 1 0"/></filter></svg>`
          + `<i class="drx-curtain is-l"></i><i class="drx-curtain is-r"></i><div class="drx-leader"><i></i><b></b></div>`
          + `<i class="drx-logo"></i><i class="drx-flash"></i>`,
        sections: [[0, "calm"], ...[[0, "project"], [12.824, "burn"], [14.656, "script"], [24.733, "cut"], [25.649, "neg1"], [26.565, "neg2"], [27.481, "neg3"], [27.939, "curtain"], [28.855, "leader"], [29.313, "premiere"], [30.229, "premiere2"]].map(([at, name]) => [29.304 + at, name])],
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
    // KISS N TELL: the only light theme (scheme). The intro (5 bars at 126 BPM) runs straight into
    // track 1 (the chorus, 8 bars); tracks 1 and 2 (the bridge, 12 bars) then take turns with no gap,
    // each played from the encoder's delay for exactly its length (see KT_SEAM). The header wears the
    // chrome logo and doodles (decor); the card backs are "our little secret" notes signed with a
    // kiss, and every flip leaves a kiss with a chime (see flipCard).
    kissntell: {
      era: "Kiss N Tell", folder: "kiss-n-tell/", tag: "KISS N TELL", back: "kiss", scheme: "light",
      title: "Brew Houze × aespa · KISS N TELL", toast: "Brew Houze × aespa · KISS N TELL 💋",
      sub: "Kiss N Tell · System portal", h1: "Every Brew Houze app. Kiss and tell.", footer: "Brew Houze × aespa · KISS N TELL · café management system",
      introClip: "kiss-n-tell/intro.mp3", introStart: KT_START, introLength: 20 * KT_BEAT,
      loops: [{ src: "kiss-n-tell/track-1.mp3", start: KT_START, length: 32 * KT_BEAT + KT_SEAM }, { src: "kiss-n-tell/track-2.mp3", start: KT_START, length: 48 * KT_BEAT - KT_SEAM }],
      joined: true, intro: kissIntro, introClass: "kt-intro",
      // The bridge (seconds into the loop; bar 1 at 15.24 s, 1.905 s a bar): a slumber party,
      // "Pajama Party Ver." The groove (bars 1-7) bounces the page like a mattress, a bigger boing on
      // the crash of bars 1 and 5, feathers drifting; the one-eighth stop in bar 4 dips
      // the lights, a soft "shh…" drifting up; the fill (bar 7, beat 3) swings the pillows in; bar 8's six accents are
      // six pillow whacks from alternate sides, the last a feather blizzard; the break (bars 9-10) is
      // lights out: glow-in-the-dark stars and a lava lamp, blooping on bar 11's two accents; the
      // riser (bar 12) blows a bubblegum bubble that pops into the chorus. The page's text turns into
      // the song's lines on folded notes passed round. Styled in kissntell.css.
      stage: {
        beat: KT_BEAT, parts: [32 * KT_BEAT + KT_SEAM, 48 * KT_BEAT - KT_SEAM], grid: 32 * KT_BEAT,
        lyrics: [
          "Come on, just say it",
          "秘密の girls talk",
          "甘く bitter, 時々spicy",
          "Everything 打ち明けてよ",
          "Hush, hush",
          "We can't stop",
          "ねえ ほら kiss and tell",
          "Dee-da-da-dee",
          "I wanna kiss and tell",
          "Eyes to eyes, be alright",
          "ゆっくりでいい",
          "ひとりきり 溜め込まないで",
          "Don't forget, 味方だから",
          "終わらない secret time",
          "お互いをわかり合う",
          "結んでいく friendship",
          "Oh, I'm gonna shout it",
        ],
        fx: `<i class="ktx-night"></i>`
          + `<div class="ktx-stars">${Array.from({ length: 14 }, (_, n) => `<i style="--x: ${(n * 41 + 6) % 94 + 3}; --y: ${(n * 23 + 4) % 34 + 3}; --s: ${0.6 + ((n * 7) % 5) / 6}; --n: ${n}"></i>`).join("")}</div>`
          + `<div class="ktx-lava">${Array.from({ length: 9 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</div>`
          + `<svg class="ktx-defs" width="0" height="0" aria-hidden="true"><filter id="ktx-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="16" /><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" /></filter></svg>`
          + `<div class="ktx-feathers">${Array.from({ length: 18 }, (_, n) => `<i style="--x: ${(n * 53 + 9) % 100}; --d: ${(n * 7) % 10}; --s: ${0.7 + ((n * 3) % 5) / 8}"><b></b></i>`).join("")}</div>`
          + `<div class="ktx-puff">${Array.from({ length: 16 }, (_, n) => `<i style="--a: ${n * 22.5}deg; --r: ${30 + ((n * 37) % 30)}vmin; --s: ${0.6 + ((n * 5) % 6) / 6}"></i>`).join("")}</div>`
          + `<div class="ktx-pillow is-l"></div><div class="ktx-pillow is-r"></div>`
          + `<b class="ktx-hush">shh…</b>`
          + `<div class="ktx-bubble"><span></span></div><div class="ktx-gum">${Array.from({ length: 12 }, (_, n) => `<i style="--a: ${n * 30 + 8}deg; --r: ${34 + ((n * 29) % 24)}vmax"></i>`).join("")}</div>`
          + `<i class="ktx-flash"></i>`,
        sections: [[0, "calm"], ...[
          [0, "boing"], [0.476, "party"], [6.905, "hush"], [7.143, "party"], [7.619, "boing"], [8.095, "party"],
          [12.381, "fill"], [13.333, "whack1"], [13.690, "whack2"], [14.048, "whack3"], [14.405, "whack4"], [14.762, "whack5"], [15.000, "whack6"],
          [15.238, "night"], [19.048, "bloop"], [19.524, "night"], [20.000, "bloop2"], [20.476, "night"], [20.952, "bubble"], [22.500, "pop"],
        ].map(([at, name]) => [32 * KT_BEAT + at, name])],
        // The lava lamp's goo filter is set here: a url(#…) written in the stylesheet would be looked
        // up in the stylesheet's own file, not this page.
        mount(fx) { fx.querySelector(".ktx-lava").style.filter = "url(#ktx-goo)"; },
      },
      scene: kissScene,
      decor: `<div class="kt-decor" aria-hidden="true"><i class="kt-decor-sparkle"></i><i class="kt-decor-hearts"></i><div class="kt-decor-logo"><i></i></div><i class="kt-decor-bows"></i><i class="kt-decor-heart"></i></div>`,
      extras: ["logo-black.webp", "kiss.svg", "phone.webp", "heart.webp", "hearts.webp", "doodle-hearts.webp", "doodle-bows.webp", "doodle-sparkle.webp", "teddy.webp", "ribbon.webp", "lightstick.webp", "lightstick-head.webp",
        ...["karina", "giselle", "winter", "ningning"].flatMap((key) => [`${key}-booth.webp`, `${key}-back.webp`])],
    },
    // Ditto: NewJeans, the one theme that is not aespa's, and not in the playlist until found (the
    // word "same" in the last quick tip opens it; see the end of this file). A winter, a Y2K desktop,
    // the five of them as they were in 2022. The intro (16 bars at 134 BPM) runs straight into
    // track 1; tracks 1 and 2 (16 bars each) then take turns. The page is a pastel desktop in the
    // snow (ditto.css); the members' cards turn over to a chat window where she says her own line.
    ditto: {
      group: "newjeans",
      era: "Ditto", folder: "ditto/", tag: "DITTO", back: "chat", scheme: "light",
      title: "Brew Houze × NewJeans · Ditto", toast: "Brew Houze × NewJeans · Ditto ❄",
      sub: "Ditto · System portal", h1: "Every Brew Houze app. Say it ditto.", footer: "Brew Houze × NewJeans · Ditto · café management system",
      introClip: "ditto/intro.mp3", introStart: DT_START, introLength: 64 * DT_BEAT,
      loops: [{ src: "ditto/track-1.mp3", start: DT_START, length: 64 * DT_BEAT }, { src: "ditto/track-2.mp3", start: DT_START, length: 64 * DT_BEAT }],
      joined: true, intro: dittoIntro, introClass: "dt-intro",
      // The bridge (track 2; see dittoStage above). The page's text turns into the bridge's lines,
      // selected as on an old computer (a blue highlight sweeping over each); during Danielle's
      // part, only hers.
      stage: {
        beat: DT_BEAT, parts: [64 * DT_BEAT, 64 * DT_BEAT], grid: DT_BRIDGE,
        lyrics: (t) => (t >= 7.164 && t < 14.328 ? DT_DANIELLE.map(([, text]) => text) : DT_LINES),
        fx: `<i class="dtx-night"></i>`
          + `<div class="dtx-trail is-a"><div class="dtx-copy" style="--i: 0; --x: 4.0; --y: 12.0"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 1; --x: 9.4; --y: 19.2"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 2; --x: 14.8; --y: 25.9"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 3; --x: 20.2; --y: 31.9"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 4; --x: 25.6; --y: 36.7"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 5; --x: 31.0; --y: 40.1"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 6; --x: 36.4; --y: 41.8"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 7; --x: 41.8; --y: 41.8"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 8; --x: 47.2; --y: 40.1"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 9; --x: 52.6; --y: 36.7"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 10; --x: 58.0; --y: 31.9"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 11; --x: 63.4; --y: 25.9"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 12; --x: 68.8; --y: 19.2"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 13; --x: 74.2; --y: 12.0"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div></div><div class="dtx-trail is-b"><div class="dtx-copy" style="--i: 0; --x: 78.0; --y: 60.0"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 1; --x: 72.6; --y: 53.8"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 2; --x: 67.2; --y: 47.9"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 3; --x: 61.8; --y: 42.8"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 4; --x: 56.4; --y: 38.6"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 5; --x: 51.0; --y: 35.7"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 6; --x: 45.6; --y: 34.2"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 7; --x: 40.2; --y: 34.2"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 8; --x: 34.8; --y: 35.7"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 9; --x: 29.4; --y: 38.6"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 10; --x: 24.0; --y: 42.8"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 11; --x: 18.6; --y: 47.9"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 12; --x: 13.2; --y: 53.8"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div><div class="dtx-copy" style="--i: 13; --x: 7.8; --y: 60.0"><p class="dt-bar"><span>say_it_ditto.txt</span><b>_ □ ×</b></p><div class="dtx-copy-body"><i></i><b>ditto</b></div></div></div>`
          + `<div class="dtx-flakes">${Array.from({ length: 30 }, (_, n) => `<i style="--x: ${(n * 41 + 7) % 100}; --d: ${(n * 17) % 10}; --s: ${0.6 + ((n * 7) % 6) / 5}"></i>`).join("")}</div>`
          + `<div class="dtx-globe"><div class="dtx-glass"><img src="${siteUrl("ditto/danielle-anime.webp")}" alt="" draggable="false" /><div class="dtx-inside">${Array.from({ length: 26 }, (_, n) => `<i style="--x: ${(n * 37 + 11) % 86 + 7}; --y: ${(n * 53 + 5) % 70 + 6}; --d: ${(n * 13) % 10}"></i>`).join("")}</div><i class="dtx-shine"></i></div><div class="dtx-base"><span>Danielle · 다니엘 · 2022</span></div></div>`
          + `<div class="dtx-lines">${DT_DANIELLE.map(([, text]) => `<p>${escapeHtml(text)}</p>`).join("")}</div>`
          + `<div class="dtx-amp">`
            + `<div class="dtx-win dtx-main"><p class="dtx-tbar"><i></i><span>DITTO AMP</span><b>_ □ ×</b></p><div class="dtx-main-body">`
              + `<div class="dtx-lcd"><div class="dtx-lcd-left"><p><span class="dtx-state">▶</span><b class="dtx-amp-time">01:42</b></p><canvas class="dtx-vis" width="300" height="76"></canvas></div>`
              + `<div class="dtx-lcd-right"><div class="dtx-marquee"><span>1. NewJeans · Ditto (3:05) *** 혜인 · I got nothing to lose · 널 좋아한다고 wooah wooah wooah ***&nbsp;</span><span>1. NewJeans · Ditto (3:05) *** 혜인 · I got nothing to lose · 널 좋아한다고 wooah wooah wooah ***&nbsp;</span></div>`
              + `<p class="dtx-info"><b>134</b> kbps <b>44</b> kHz <em>mono</em> <em class="is-on">stereo</em></p><div class="dtx-sliders"><i class="dtx-vol"><b></b></i><i class="dtx-bal"><b></b></i><em class="is-on">EQ</em><em class="is-on">PL</em></div></div></div>`
              + `<div class="dtx-seek"><i></i><b></b></div>`
              + `<div class="dtx-controls"><span>⏮</span><span class="is-on">▶</span><span>❚❚</span><span>■</span><span>⏭</span><span>⏏</span><em>SHUFFLE</em><em class="is-on">↻</em></div>`
            + `</div></div>`
            + `<div class="dtx-win dtx-eq"><p class="dtx-tbar"><i></i><span>DITTO AMP EQUALIZER</span><b>×</b></p><div class="dtx-eq-body"><div class="dtx-eq-top"><em class="is-on">ON</em><em>AUTO</em><canvas class="dtx-eq-curve" width="300" height="48"></canvas><em>PRESETS</em></div>`
              + `<div class="dtx-eq-bands">${["PRE", "60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"].map((hz, n) => `<div class="dtx-band${n ? "" : " is-pre"}"><i></i><span>${hz}</span></div>`).join("")}</div></div></div>`
            + `<div class="dtx-win dtx-pl"><p class="dtx-tbar"><i></i><span>DITTO AMP PLAYLIST</span><b>×</b></p><ol class="dtx-pl-list">${[["Ditto", "3:05"], ["OMG", "3:32"], ["Attention", "3:00"], ["Hype Boy", "2:59"], ["Cookie", "3:55"], ["Hurt", "2:57"]].map(([song, time], n) => `<li${n ? "" : ' class="is-on"'}><span>${n + 1}. NewJeans · ${song}</span><b>${time}</b></li>`).join("")}</ol>`
              + `<p class="dtx-pl-foot"><span>+ADD</span><span>−REM</span><span>SEL</span><span>MISC</span><b><span class="dtx-pl-time">1:42</span>/19:28</b></p></div>`
          + `</div>`
          + `<i class="dtx-blush"></i><canvas class="dtx-jelly"></canvas>`
          + `<div class="dtx-pops">${Array.from({ length: 12 }, (_, n) => `<img src="${siteUrl(`ditto/sticker-${[14, 21, 12, 13][n % 4]}.webp`)}" alt="" draggable="false" style="--a: ${n * 137.5}deg; --r: ${22 + ((n * 7) % 5) * 4}vmin; --s: ${0.6 + ((n * 3) % 4) / 6}" />`).join("")}</div>`
          + `<div class="dtx-vhs"><b class="dtx-pause">❚❚ PAUSE</b><b class="dtx-play">▶ PLAY</b><i class="dtx-track"></i></div><i class="dtx-bloom"></i>`,
        sections: [[0, "calm"], ...[[0, "ditto"], [3.582, "ditto2"], [7.164, "globe"], [14.328, "amp"], [21.492, "heart"], [25.970, "pause"], [26.865, "play"]].map(([at, name]) => [DT_BRIDGE + at, name])],
        ...dittoStage,
      },
      scene: dittoScene,
      decor: `<div class="dt-decor" aria-hidden="true"><i class="dt-decor-cd"></i><div class="dt-poster"><i class="dt-poster-tape"></i><div class="dt-poster-photo"></div><p class="dt-poster-title">DITTO<small>2022</small></p><p class="dt-poster-meta">NEWJEANS I 121922</p><p class="dt-poster-meta">OMG</p><p class="dt-poster-meta">MINJI I HANNI I DANIELLE I HAERIN I HYEIN</p></div><i class="dt-decor-logo"></i><i class="dt-decor-bunny"></i><i class="dt-decor-s is-1"></i><i class="dt-decor-s is-2"></i><i class="dt-decor-s is-3"></i><i class="dt-decor-s is-4"></i></div>`,
      extras: ["tape.mp4", "logo-ditto.webp", "sticker-16.webp", "all-together.webp", "cd.webp", "bunny.webp", ...DT_STICKERS.map((n) => `sticker-${n}.webp`), "sticker-12.webp", "sticker-13.webp",
        ...["minji", "hanni", "danielle", "haerin", "hyein"].flatMap((key) => [`${key}-back.webp`, `${key}-anime.webp`])].filter((file) => !file.endsWith(".mp4")),
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
  // A theme's own decoration in the header, behind its text (THEMES[x].decor, styled in its sheet).
  const decor = document.createElement("div");
  decor.className = "ae-decor";
  document.querySelector(".hero").prepend(decor);

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
    const group = groupOf(theme);
    lineup.innerHTML = `<p class="ae-collab"><b>Brew Houze × ${escapeHtml(group.name)}</b> · ${escapeHtml(t.era)}</p><ol>${group.order.map((key, index) => {
      const m = group.members[key];
      return `<li class="ae-member" style="--delay: ${index * 0.35}s" data-member="${key}" role="button" tabindex="0" aria-label="Open ${escapeHtml(m.name)}’s photo card">`
        + `<img draggable="false" class="ae-photo" src="${photoOf(theme, key)}" alt="" loading="lazy" onerror="this.remove()" />`
        + (t.back === "signature" ? `<span class="am-plate-sign" aria-hidden="true" style="--sign: url('${siteUrl(`${t.folder}${key}-signature.svg`)}')"></span>` : "")
        + (t.back === "emblem" ? `<span class="dr-plate-emblem" aria-hidden="true" style="--emblem: url('${siteUrl(`${t.folder}${key}-emblem.webp`)}')"></span>` : "")
        + (t.back === "chat" ? `<span class="dt-still" aria-hidden="true"><b><span>▶ PLAY</span><span>● REC</span></b><i>DEC 19 2022</i></span>` : "")
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
    kissntell: { kicker: "🎟 Admit one", label: "Enter Kiss N Tell Park" },
    ditto: { kicker: "❄ 12.19.2022", label: "Rewind to that winter" },
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
  // and footer (the buttons, links, status and QR codes stay as they are; a theme's lines may be a
  // function of the seconds into the bridge, for lines that belong to one part); each theme brings its
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
        else dealLyrics(typeof stage.lyrics === "function" ? stage.lyrics(at - grid) : stage.lyrics, Math.floor((at - grid) / (bar * 2)));
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
    brandName.innerHTML = t ? `Brew Houze <b>×</b> ${escapeHtml(groupOf(theme).name)}` : cafe.brand;
    brandSub.textContent = t ? t.sub : cafe.sub;
    heading.textContent = t ? t.h1 : cafe.h1;
    footerText.textContent = t ? t.footer : cafe.footer;
    document.title = t ? t.title : cafe.title;
    footerYear.textContent = t ? `${yearText} × ${groupOf(theme).name}` : yearText;
    document.querySelector('meta[name="color-scheme"]').setAttribute("content", t ? (t.scheme ?? "dark") : "light");
    decor.innerHTML = t?.decor ?? "";
    if (t) renderLineup(theme); else { lineup.innerHTML = ""; closeMember(); }
    renderCta(theme);
    if (ORDER.includes(theme) && !visited().includes(theme)) store.set(VISITED_KEY, JSON.stringify([...visited(), theme]));
    onThemeApplied?.();
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
    let tap = null;
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
      // What it plays, as an AnalyserNode (put in after the volume the first time it is asked for;
      // null before the music has started).
      analyser() {
        if (!ctx) return null;
        if (!tap) {
          tap = ctx.createAnalyser();
          tap.fftSize = 1024; tap.smoothingTimeConstant = 0.5; tap.minDecibels = -90; tap.maxDecibels = -22;
          gain.disconnect(); gain.connect(tap); tap.connect(ctx.destination);
        }
        return tap;
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
    warmed[theme] = [...groupOf(theme).order.map((key) => photoOf(theme, key)), ...flashesOf(theme), ...(t.extras ?? []).map((file) => `${t.folder}${file}`)].map((src) => { const img = new Image(); img.src = src; return img; });
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
      const photos = groupOf(theme).order.map((key) => image(photoOf(theme, key)));
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
    kissntell: { logo: "kiss-n-tell/logo-black.webp", tint: "#FF8CC6", mask: true },
    ditto: { logo: "ditto/logo-ditto.webp", tint: "#9AA6E8", mask: true },
  };
  const picker = document.createElement("div");
  picker.className = "ae-picker";
  picker.id = "ae-picker";
  picker.hidden = true;
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Choose a theme");
  // A track for each era (its group photo as the cover, the logo, "aespa"), and the café first.
  const EQ = `<span class="ae-pick-eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
  const pickCard = (theme) => {
    if (!theme) return `<button type="button" class="ae-pick is-cafe" data-pick="cafe" role="radio" style="--i: 0"><span class="ae-pick-no">01</span><span class="ae-pick-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5c-.6.8-.6 1.7 0 2.5M11.5 3.5c-.6.8-.6 1.7 0 2.5M15 3.5c-.6.8-.6 1.7 0 2.5"/></svg></span><span class="ae-pick-text"><span class="ae-pick-name">Café</span><span class="ae-pick-by">Brew Houze · the everyday look</span></span>${EQ}</button>`;
    const p = PICKS[theme];
    const bonus = !ORDER.includes(theme);
    const n = bonus ? ORDER.length + 2 : ORDER.indexOf(theme) + 2;
    return `<button type="button" class="ae-pick${bonus ? " is-bonus" : ""}" data-pick="${theme}" role="radio" style="--i: ${n - 1}; --tint: ${p.tint}"${bonus ? " hidden" : ""}>`
      + `<span class="ae-pick-no">${String(n).padStart(2, "0")}</span>`
      + `<span class="ae-pick-art" data-src="${flashesOf(theme)[0]}"></span>`
      + `<span class="ae-pick-text"><span class="ae-pick-name">${escapeHtml(THEMES[theme].era)}</span><span class="ae-pick-by">${escapeHtml(groupOf(theme).name)}${bonus ? " · hidden track" : ""}</span></span>`
      + `<i class="ae-pick-logo${p.mask ? " is-mask" : ""}" style="--logo: url('${siteUrl(p.logo)}')" aria-hidden="true"></i>${EQ}</button>`;
  };
  picker.innerHTML = `<div class="ae-picker-head"><i class="ae-picker-cover" aria-hidden="true"></i><p><small>Playlist</small><b>Brew Houze × aespa</b><span class="ae-picker-count">${ORDER.length + 1} tracks · pick an era</span></p></div>`
    + `<div class="ae-picker-row" role="radiogroup" aria-label="Themes">${[null, ...ORDER, "ditto"].map(pickCard).join("")}</div>`;
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
    // (A hidden track not found yet is skipped.)
    const shown = pickButtons.filter((button) => !button.hidden);
    const home = { Home: 0, End: shown.length - 1 }[event.key];
    if (step === undefined && home === undefined) return;
    event.preventDefault();
    const now = shown.indexOf(document.activeElement);
    const next = home ?? (now + step + shown.length) % shown.length;
    shown.forEach((button, index) => { button.tabIndex = index === next ? 0 : -1; });
    shown[next].focus();
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
    const group = groupOf(current);
    pcIndex = (index + group.order.length) % group.order.length;
    const key = group.order[pcIndex];
    const member = group.members[key];
    const count = `0${pcIndex + 1} / ${String(group.order.length).padStart(2, "0")}`;
    pcCard.classList.remove("is-flipped");
    document.getElementById("ae-pc-img").src = photoOf(current, key);
    document.getElementById("ae-pc-img").alt = `${member.name} of ${group.name}`;
    document.getElementById("ae-pc-title").textContent = member.name;
    document.getElementById("ae-pc-hangul").textContent = member.hangul;
    document.getElementById("ae-pc-tag").textContent = t.tag;
    document.getElementById("ae-pc-count").textContent = count;
    const back = document.getElementById("ae-pc-back");
    back.classList.toggle("is-signature", t.back === "signature");
    back.classList.toggle("is-spec", t.back === "spec");
    back.classList.toggle("is-emblem", t.back === "emblem");
    back.classList.toggle("is-image", t.back === "image");
    back.classList.toggle("is-tarot", t.back === "tarot");
    back.classList.toggle("is-kiss", t.back === "kiss");
    back.classList.toggle("is-chat", t.back === "chat");
    back.innerHTML = t.back === "chat" ? `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">♡</button>
      <div class="dt-chat">
        <p class="dt-bar"><span>${key}@ditto · Conversation</span><b>_ □ ×</b></p>
        <div class="dt-chat-who"><span class="dt-chat-pic" style="background-image: url('${siteUrl(`${t.folder}${key}-anime.webp`)}')"></span><p><b>${escapeHtml(member.name)}</b> <span>${escapeHtml(member.hangul)}</span><small class="dt-chat-status">● online · 12/19/2022</small></p></div>
        <div class="dt-chat-log">
          <p class="dt-msg"><span>${escapeHtml(member.name)} says:</span>${escapeHtml(member.line)}</p>
          <div class="dt-msg-photo" role="img" aria-label="${escapeHtml(member.name)}, a photo she sent" style="background-image: url('${siteUrl(`${t.folder}${key}-back.webp`)}')"><small>${key}_2022.jpg</small></div>
          <p class="dt-msg is-me"><span>you say:</span><i class="dt-me-text">say it ditto ♡</i></p>
        </div>
        <form class="dt-chat-input" data-member="${key}"><input type="text" maxlength="60" autocomplete="off" enterkeyhint="send" placeholder="Type a message…" aria-label="Message ${escapeHtml(member.name)}" /><button type="submit">Send</button></form>
      </div>
      <p class="dt-chat-foot">${count} · ${escapeHtml(member.real)} · born ${escapeHtml(member.born)}, ${escapeHtml(member.from)}</p>` : t.back === "tarot" ? dirtyTarotBack(member, key, t) : t.back === "kiss" ? `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <i class="kt-back-holo" aria-hidden="true"></i>
      <i class="kt-back-logo" aria-hidden="true"></i>
      <span class="kt-back-num">0${pcIndex + 1} / 04</span>
      <div class="kt-back-frame"><div class="kt-back-photo" role="img" aria-label="${escapeHtml(member.name)}, the back of her card" style="background-image: url('${siteUrl(`${t.folder}${key}-back.webp`)}')"></div></div>
      <p class="kt-back-note">${escapeHtml(KT_NOTES[key])}</p>
      <p class="kt-back-name">${escapeHtml(member.name)} <span>${escapeHtml(member.hangul)}</span></p>
      <i class="kt-back-kiss" aria-hidden="true"></i>
      <p class="kt-back-foot">aespa · The 1st Japan Mini Album<br />Brew Houze × aespa</p>` : t.back === "image" ? `
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
    showMember(groupOf(current).order.indexOf(key));
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
    else if (event.target.matches?.("input, textarea")) return; // typing in Ditto's chat
    else if (event.key === "ArrowLeft") showMember(pcIndex - 1);
    else if (event.key === "ArrowRight") showMember(pcIndex + 1);
  });
  // ── Ditto: the chat on the back of each card ──
  // Anything sent shows as "you say" and the window glows. "ditto" echoes, the window gets a nudge
  // and she answers "ditto ♡". A member's name (in English or Hangul) brings her Powerpuff Girl
  // flying across the card on a streak of her colour; on her own card, she answers too.
  const PPG_COLORS = { minji: "#5B7BE0", hanni: "#D23C9A", danielle: "#F2C230", haerin: "#E8892E", hyein: "#E04A6E" };
  const plain = (text) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  pcModal.addEventListener("submit", (event) => {
    const form = event.target.closest(".dt-chat-input");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    chatSend(form.closest(".dt-chat"), form.dataset.member, text);
  });
  function chatSend(chat, key, text) {
    const me = chat.querySelector(".dt-me-text");
    me.textContent = text;
    restartClass(me, "is-new");
    restartClass(chat, "is-glow");
    const said = plain(text);
    const who = NJ_MEMBERS[key];
    if (said === "ditto") {
      dittoEcho(chat, text);
      chatReply(chat, who, "ditto ♡", 900);
      return;
    }
    const named = Object.keys(NJ_MEMBERS).find((k) => said === plain(NJ_MEMBERS[k].name) || said === plain(NJ_MEMBERS[k].hangul));
    if (named) {
      ppgFly(chat.closest(".ae-pc-back"), named);
      if (named === key) chatReply(chat, who, "that’s me! ♡", 2300);
    }
  }
  function restartClass(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  // Her answer: "… is typing" under her name, then a little pop-up in the corner, the way the old
  // messengers did.
  function chatReply(chat, who, text, delay) {
    const status = chat.querySelector(".dt-chat-status");
    window.setTimeout(() => {
      if (!chat.isConnected) return;
      status.textContent = `✎ ${who.name} is typing…`;
      window.setTimeout(() => {
        if (!chat.isConnected) return;
        status.textContent = "● online · 12/19/2022";
        chat.querySelector(".dt-toast")?.remove();
        const toastEl = document.createElement("div");
        toastEl.className = "dt-toast";
        toastEl.setAttribute("role", "status");
        toastEl.innerHTML = `<p><b></b> says:<br /><span></span></p>`;
        toastEl.querySelector("b").textContent = who.name;
        toastEl.querySelector("span").textContent = text;
        chat.append(toastEl);
        window.setTimeout(() => toastEl.classList.add("is-leaving"), 2800);
        window.setTimeout(() => toastEl.remove(), 3300);
      }, 700);
    }, delay);
  }
  // "ditto": the word said back, again and again, each one fainter and further up (the same, the
  // same…), and the window nudged.
  function dittoEcho(chat, text) {
    chat.querySelector(".dt-echo")?.remove();
    restartClass(chat, "is-nudge");
    if (!motionOK()) return;
    const echo = document.createElement("div");
    echo.className = "dt-echo";
    echo.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 7; i++) {
      const word = document.createElement("b");
      word.textContent = text.toLowerCase();
      word.style.setProperty("--i", String(i));
      echo.append(word);
    }
    echo.insertAdjacentHTML("beforeend", Array.from({ length: 10 }, (_, n) => `<i style="--n: ${n}">${n % 2 ? "♡" : "❄"}</i>`).join(""));
    chat.append(echo);
    window.setTimeout(() => echo.remove(), 2600);
  }
  // A member's name: her Powerpuff Girl swoops in from the bottom, loops round the card trailing a
  // streak of her colour, stops in the middle with a sparkle, then zips off the top.
  function ppgFly(back, key) {
    back.querySelector(".dt-ppg")?.remove();
    const fly = document.createElement("div");
    fly.className = "dt-ppg";
    fly.setAttribute("aria-hidden", "true");
    fly.style.setProperty("--ppg", PPG_COLORS[key]);
    fly.innerHTML = `<canvas></canvas><img src="${siteUrl(`ditto/${key}-ppg.webp`)}" alt="" draggable="false" /><span class="dt-ppg-spark">${Array.from({ length: 8 }, (_, n) => `<i style="--n: ${n}"></i>`).join("")}</span>`;
    back.append(fly);
    const canvas = fly.querySelector("canvas"), img = fly.querySelector("img");
    if (!motionOK()) { fly.classList.add("is-still"); window.setTimeout(() => fly.remove(), 1800); return; }
    const rect = back.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    const g = canvas.getContext("2d");
    // The flight, as fractions of the card: in from the bottom left, a loop, then the middle.
    const path = [[-0.4, 1.15], [0.15, 0.82], [0.72, 0.7], [0.86, 0.36], [0.55, 0.14], [0.2, 0.3], [0.32, 0.52], [0.5, 0.5]];
    const along = (u) => {
      const seg = Math.min(path.length - 2, Math.floor(u * (path.length - 1)));
      const f = u * (path.length - 1) - seg;
      const p0 = path[Math.max(0, seg - 1)], p1 = path[seg], p2 = path[seg + 1], p3 = path[Math.min(path.length - 1, seg + 2)];
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
      return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
    };
    const FLY = 1.5, HOVER = 0.9, ZIP = 0.45, TRAIL = 0.55;
    const trail = [];
    const start = performance.now();
    let was = null;
    const frame = (stamp) => {
      if (!fly.isConnected) return;
      const t = (stamp - start) / 1000;
      let at, tilt = 0;
      if (t < FLY) {
        const u = t / FLY;
        at = along(u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
      } else if (t < FLY + HOVER) {
        at = [0.5, 0.5 + Math.sin((t - FLY) * 9) * 0.012];
        if (!fly.classList.contains("is-hover")) fly.classList.add("is-hover");
      } else {
        const q = (t - FLY - HOVER) / ZIP;
        at = [0.5 + q * q * 0.7, 0.5 - q * q * 1.25];
      }
      if (was) tilt = Math.max(-24, Math.min(24, (at[0] - was[0]) * rect.width * 1.4));
      was = at;
      if (t < FLY + HOVER + ZIP) trail.push({ x: at[0], y: at[1], t });
      while (trail.length && t - trail[0].t > TRAIL) trail.shift();
      img.style.left = `${at[0] * 100}%`;
      img.style.top = `${at[1] * 100}%`;
      img.style.rotate = `${tilt}deg`;
      // The streak: a white edge, her colour inside, narrowing to nothing at its tail. The edge is
      // drawn whole first, then the colour, so the pieces join into one ribbon.
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.lineCap = "round"; g.lineJoin = "round";
      const wide = rect.width * 0.2 * ratio;
      [["#FFFFFF", 6 * ratio], [PPG_COLORS[key], 0]].forEach(([color, edge]) => {
        g.strokeStyle = color;
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1], b = trail[i], life = 1 - (t - b.t) / TRAIL;
          g.beginPath(); g.moveTo(a.x * canvas.width, a.y * canvas.height); g.lineTo(b.x * canvas.width, b.y * canvas.height);
          g.lineWidth = Math.max(0, wide * life + edge * life); g.stroke();
        }
      });
      if (t < FLY + HOVER + ZIP + TRAIL) requestAnimationFrame(frame);
      else fly.remove();
    };
    requestAnimationFrame(frame);
  }

  // Flipping: the card turns over; the face turned away is hidden halfway through the turn (see
  // secret.css), so it never shows through on phones.
  function flipCard() {
    pcCard.classList.toggle("is-flipped");
    if (current === "richman") { strike(); thunder(); }
    if (current === "kissntell") { smooch(); chime(); }
  }
  // Rich Man: lightning over the card as it turns (the bolts in the album's colours), the card jolting.
  // Both belong to that one flip: calmStorm() clears them when the card changes, the card closes or
  // the theme changes, and the jolt's class goes as soon as it has played (a class left behind would
  // replay the jolt each time the card opens, in any theme).
  let stormTimer = 0;
  function calmStorm() {
    clearTimeout(stormTimer);
    pcModal.querySelector(".rm-storm")?.remove();
    pcModal.querySelector(".kt-smooch")?.remove();
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
  // KISS N TELL: a lipstick kiss stamped on the card as it turns, hearts floating up (cleared like the
  // storm by calmStorm), and a little glockenspiel chime when the sound is on (made here, no file).
  function smooch() {
    calmStorm();
    if (!motionOK()) return;
    const kiss = document.createElement("div");
    kiss.className = "kt-smooch";
    kiss.setAttribute("aria-hidden", "true");
    kiss.innerHTML = `<i class="kt-smooch-kiss"></i>${'<i class="kt-smooch-heart"></i>'.repeat(5)}`;
    pcModal.append(kiss);
    stormTimer = setTimeout(() => kiss.remove(), 1500);
  }
  let chimeCtx = null;
  function chime() {
    if (!soundWanted()) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    chimeCtx ??= new AudioContextClass();
    const ctx = chimeCtx;
    void ctx.resume();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.22;
    out.connect(ctx.destination);
    // Three bell notes up (E6, G#6, B6), each with a quieter octave above.
    [1318.5, 1661.2, 1975.5].forEach((freq, index) => {
      [[freq, 1], [freq * 2, 0.25]].forEach(([f, level]) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const env = ctx.createGain();
        const at = now + index * 0.07;
        env.gain.setValueAtTime(0.0001, at);
        env.gain.exponentialRampToValueAtTime(level, at + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
        osc.connect(env).connect(out);
        osc.start(at);
        osc.stop(at + 0.95);
      });
    });
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

  // ── Ditto: the secret within the secrets ──
  // Once this device has had all six aespa themes on, one more quick tip shows under the last one,
  // in Ditto's colours, and only in the café look: "One more thing:". Clicking it types the rest
  // ("say it ditto <3") and switches to Ditto. That unlocks it for good: the tip goes, and Ditto
  // shows in the playlist as its hidden track, to be picked again any time like the others.
  function revealDitto() {
    const bonus = picker.querySelector('.ae-pick[data-pick="ditto"]');
    if (!bonus || !bonus.hidden) return;
    bonus.hidden = false;
    picker.querySelector(".ae-picker-count").textContent = `${ORDER.length + 2} tracks · one was hidden`;
  }
  if (store.get(DITTO_KEY) || current === "ditto") revealDitto();
  const tips = document.querySelector(".tips");
  let more = null, typing = false;
  // Its typing's sound, when the visitor has the sound on: an old keyboard (each key a click, its
  // body knocking, then the key coming back up; the space bar deeper, the Enter firmer), made here
  // (no sound file). "wake" only gets it ready: the click on the tip lets it play.
  let keysCtx = null, keysNoise = null;
  function keySound(kind) {
    if (!soundWanted()) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    keysCtx ??= new AudioContextClass();
    const ctx = keysCtx;
    void ctx.resume();
    if (!keysNoise) {
      keysNoise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.3), ctx.sampleRate);
      const data = keysNoise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (kind === "wake") return;
    const now = ctx.currentTime + 0.005;
    const out = ctx.createGain();
    out.gain.value = kind === "enter" ? 0.5 : 0.36;
    out.connect(ctx.destination);
    const vary = () => 0.88 + Math.random() * 0.24;
    // a burst of noise through a band: a click
    const tick = (at, freq, level, decay) => {
      const source = ctx.createBufferSource();
      source.buffer = keysNoise;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass"; band.frequency.value = freq; band.Q.value = 0.9;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level, at + 0.001);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      source.connect(band).connect(env).connect(out);
      source.start(at, Math.random() * 0.2, decay + 0.02);
    };
    // the key's body: a low knock, falling in pitch
    const knock = (at, freq, level, decay) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, at + decay);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level, at + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + decay + 0.02);
    };
    if (kind === "key") {
      tick(now, 3200 * vary(), 0.9, 0.022);
      knock(now, 210 * vary(), 0.5, 0.04);
      tick(now + 0.05 + Math.random() * 0.025, 4200 * vary(), 0.3, 0.014);
    } else {
      tick(now, (kind === "enter" ? 2400 : 1600) * vary(), 1, 0.045);
      knock(now, kind === "enter" ? 170 : 125, 0.8, 0.08);
      tick(now + 0.012, 900, 0.35, 0.03);
      tick(now + 0.075 + Math.random() * 0.02, 2800 * vary(), 0.35, 0.02);
    }
  }
  const unlockDitto = () => {
    if (typing) return;
    typing = true;
    keySound("wake");
    more.classList.add("is-typing");
    const typed = more.querySelector(".dt-more-typed");
    const text = " say it ditto <3";
    let n = 0;
    const next = () => {
      if (n < text.length) {
        n += motionOK() ? 1 : text.length;
        typed.textContent = text.slice(0, n);
        keySound(text[n - 1] === " " ? "space" : "key");
        window.setTimeout(next, text[n - 1] === " " ? 140 : 70 + Math.random() * 60);
        return;
      }
      // a moment, then Enter
      window.setTimeout(() => keySound("enter"), 380);
      window.setTimeout(() => {
        store.set(DITTO_KEY, new Date().toISOString());
        revealDitto();
        closePicker();
        void switchTo("ditto");
        window.setTimeout(() => { more?.remove(); more = null; }, 400);
      }, 750);
    };
    window.setTimeout(next, 260);
  };
  const showMore = () => {
    const due = !store.get(DITTO_KEY) && ORDER.every((theme) => visited().includes(theme));
    if (due && !more && tips) {
      more = document.createElement("li");
      more.className = "dt-more";
      more.setAttribute("role", "button");
      more.setAttribute("tabindex", "0");
      more.setAttribute("aria-label", "One more thing");
      more.innerHTML = `<span class="dt-more-pill"><b class="dt-more-lead">One more thing:</b><span class="dt-more-typed"></span><i class="dt-more-caret" aria-hidden="true"></i></span>`;
      more.addEventListener("pointerover", () => warm("ditto"), { once: true });
      more.addEventListener("click", unlockDitto);
      more.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); unlockDitto(); } });
      tips.append(more);
    }
    if (more && !typing) more.hidden = !due || current !== null;
  };
  onThemeApplied = showMore;
  showMore();
})();
