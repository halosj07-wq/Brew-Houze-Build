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
  // A scene is { src, className, cues [[seconds into the clip, name]], mount(box, video) → show(cue, now), tick(now) }:
  // the MV from the bridge to the end, framed in the era's look, following the video's own clock.
  // Whiplash (126 BPM): the bridge on the red stage (0-16.41 s) plays on the camera's monitor under
  // the viewfinder; the drop (16.41 s) flashes white and the shot fills the screen, the shutter
  // firing on every bar (SHOT 01, 02…); the break (32.9 s) goes to a grey letterboxed low-light
  // shot with the focus hunting; the final chorus (37.36 s) snaps back open; on the last hit
  // (47.83 s) the chrome logo lands and the shot fades out.
  const WL_BAR = 240 / 126;
  const whiplashScene = {
    src: "whiplash/scene.mp4",
    className: "wl-scene",
    cues: [[0, "bridge"], [16.41, "drop"], [17.2, "chorus"], [32.9, "break"], [37.36, "final"], [47.83, "end"]],
    mount(box, video) {
      box.innerHTML = `
        <div class="wls-frame"></div>
        <i class="wls-lid is-top"></i><i class="wls-lid is-bottom"></i>
        <div class="wls-hud"><i class="wls-corner"></i><i class="wls-corner"></i><i class="wls-corner"></i><i class="wls-corner"></i><i class="wls-focus"></i>
          <span class="wls-rec">REC</span><span class="wls-tc">00:00:00:00</span><span class="wls-meta">ISO 0320 · 1/8000 · ƒ1.4</span><span class="wls-shot">STANDBY</span></div>
        <i class="wls-flash"></i>
        <div class="wls-logo"></div><p class="wls-credit">Brew Houze × aespa · Whiplash</p>`;
      box.querySelector(".wls-frame").append(video);
      const tc = box.querySelector(".wls-tc");
      const shot = box.querySelector(".wls-shot");
      const meta = box.querySelector(".wls-meta");
      return {
        show(cue, now) {
          // The shutter fires on the bars of the chorus (its bar 1 is the drop).
          box.style.setProperty("--bar-lag", `${(-(((now - 16.41) % WL_BAR) + WL_BAR) % WL_BAR).toFixed(3)}s`);
          meta.textContent = cue === "break" ? "ISO 6400 · 1/60 · ƒ1.4 · LOW LIGHT" : "ISO 0320 · 1/8000 · ƒ1.4";
        },
        tick(now) {
          const frames = Math.floor(now * 30);
          tc.textContent = `00:00:${String(Math.floor(frames / 30)).padStart(2, "0")}:${String(frames % 30).padStart(2, "0")}`;
          shot.textContent = now < 16.41 ? "MONITOR · BRIDGE" : `SHOT ${String(Math.floor((now - 16.41) / WL_BAR) + 1).padStart(2, "0")}`;
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
    // One line on screen glows: a button that opens the theme's secret scene.
    const t = current ? THEMES[current] : null;
    if (!t?.scene) return;
    // A big spot on screen if there is one (a heading, a name, a title), else any spot on screen.
    const onScreen = targets.filter((el) => { const box = el.getBoundingClientRect(); return box.width > 40 && box.top > 70 && box.bottom < window.innerHeight - 70; });
    const big = onScreen.filter((el) => el.matches(".hero h1, .section h2, .ae-name, .card h3, .guide-item strong"));
    const pool = big.length ? big : onScreen.length ? onScreen : targets;
    const pick = pool[(deal * 5 + 3) % pool.length];
    const lyric = pick.querySelector(".ae-lyric");
    const glow = document.createElement("button");
    glow.type = "button";
    glow.className = "ae-glow";
    glow.setAttribute("aria-label", `${lyric.textContent}: play the secret ${t.era} scene`);
    lyric.replaceWith(glow);
    glow.append(lyric);
  }
  function restoreLyrics() {
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
  // The glowing lyric fades the theme out (its music and its stage) and plays the scene: the MV in
  // the era's frame, with its own sound (muted if the visitor turned the music off). When it ends
  // (or is skipped) the theme comes back as it is after its intro: track 1 from the top.
  let scenePlaying = false;
  function playScene(theme) {
    const t = THEMES[theme];
    const spec = t.scene;
    if (!spec || scenePlaying || switching) return;
    scenePlaying = true;
    const box = document.createElement("div");
    box.className = `ae-scene ${spec.className}`;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
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
    // Started inside the click, so phones let it play with sound.
    video.play().catch(() => { video.muted = true; video.play().catch(() => finish()); });
    let cue = "";
    let frame = 0;
    const tick = () => {
      const now = video.currentTime;
      let name = "load";
      if (!video.paused || now > 0) for (const [at, entry] of spec.cues) if (now >= at) name = entry;
      if (name !== cue) {
        cue = name;
        box.dataset.cue = name;
        scene.show(name, now);
        box.classList.remove("is-hit");
        void box.offsetWidth;
        box.classList.add("is-hit");
      }
      scene.tick(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); finish(); } };
    document.addEventListener("keydown", onKey);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      box.classList.add("is-out");
      setTimeout(() => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        box.remove();
        delete root.dataset.scene;
        scenePlaying = false;
        if (current !== theme) return;
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
      }, 500);
    }
    video.addEventListener("ended", finish);
    skip.addEventListener("click", finish);
  }
  document.addEventListener("click", (event) => { if (event.target.closest?.(".ae-glow") && current) playScene(current); });

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
