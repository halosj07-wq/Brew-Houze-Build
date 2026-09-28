// Brew Houze × aespa: the secret themes of the portal (styles in secret.css, whiplash.css and
// dirtywork.css; photos and sound in whiplash/ and dirty-work/).
//
// The "© Brew Houze" line in the footer cycles café → Whiplash → café → Dirty Work → café. Each
// theme has the four members (plates that open photo cards), an intro that follows its own sound
// clip, and music that loops while the theme is on. index.html sets the theme before the page
// paints (so a reload keeps it without a flash) and provides showToast().
(() => {
  const root = document.documentElement;
  const THEME_KEY = "brew-houze-theme"; // the theme that is on, or "cafe"
  const NEXT_KEY = "brew-houze-theme-next"; // the theme the next click from the café opens
  const SOUND_KEY = "brew-houze-aespa-sound"; // "off" when the visitor muted the music
  const CYCLE = ["whiplash", "dirtywork"];
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked: lasts until reload */ } },
  };
  const motionOK = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const toast = (message) => { if (typeof window.showToast === "function") window.showToast(message); };

  // ── The members ──
  const MEMBERS = {
    karina: { name: "Karina", hangul: "카리나", short: "Leader · main dancer", real: "Yu Ji-min (유지민)", born: "April 11, 2000", from: "Suwon, South Korea", role: "Leader · main dancer · lead rapper", about: "aespa’s leader and center, known for sharp, powerful dancing and a commanding stage presence." },
    giselle: { name: "Giselle", hangul: "지젤", short: "Main rapper", real: "Uchinaga Aeri (内永枝利)", born: "October 30, 2000", from: "Japan and South Korea, raised in Tokyo", role: "Main rapper · sub vocalist", about: "aespa’s main rapper, who moves easily between Korean, Japanese and English." },
    winter: { name: "Winter", hangul: "윈터", short: "Main vocalist · lead dancer", real: "Kim Min-jeong (김민정)", born: "January 1, 2001", from: "Yangsan, South Korea", role: "Main vocalist · lead dancer", about: "A main vocalist with a clear, powerful voice, and one of the group’s lead dancers." },
    ningning: { name: "Ningning", hangul: "닝닝", short: "Main vocalist", real: "Ning Yizhuo (宁艺卓)", born: "October 23, 2002", from: "Harbin, China", role: "Main vocalist · the youngest", about: "The youngest member and a main vocalist, known for her strong live vocals." },
  };
  const memberOrder = Object.keys(MEMBERS);

  // ── Intros: each cue on its beat of the theme's intro clip (ms from its start) ──
  // An intro is { end, cues, mount(box, photos) → show(step) }. The player (playIntro) follows the
  // clip's own clock, so the cues stay in time even if the sound starts late; without sound they
  // follow the page clock instead.

  // Whiplash: "one look give em' whiplash" as hard-cut black and white cards (after the teaser).
  //   build  the words so far, left-aligned on white      black  a strobe frame
  //   wide   WHIPLASH on a spotlit black card             photo  each member in negative, in order
  //   tiny   the small tracked WHIP-WHIPLASH on white
  const whiplashIntro = {
    end: 1880,
    cues: [
      [0, "build", "ONE"], [360, "black"], [420, "build", "ONE LOOK"], [580, "black"], [630, "build", "ONE LOOK GIVE’EM"],
      [1010, "black"], [1100, "spot wide", "WHIPLASH"],
      [1340, "photo", 0], [1390, "photo", 1], [1440, "photo", 2], [1490, "photo", 3], [1540, "tiny", "WHIP-WHIPLASH"],
    ],
    mount(box, photos) {
      const word = document.createElement("span");
      box.append(...photos, word);
      return (step) => {
        const [, scene, value = ""] = this.cues[step];
        const photo = scene === "photo" ? photos[value] : null;
        const ready = !photo || (photo.complete && photo.naturalWidth > 0);
        photos.forEach((img) => img.classList.toggle("is-current", img === photo));
        box.className = `ae-intro ${(ready ? scene : "black").split(" ").map((name) => `is-${name}`).join(" ")}`;
        word.textContent = photo ? "" : value;
      };
    },
  };

  // Dirty Work: the clip is two phrases with the same rhythm, a big hit then a triple hit (about
  // 0.73 / 0.80 / 0.87 s, and again 1.64 / 1.72 / 1.80 s). Blackletter DIRTY slams in on the first
  // hit and WORK on the triple (the middle hit flashes the card orange); the second phrase opens
  // the "aespa ‘Dirty Work’" labels and flashes the four members, each with her gold initial, and
  // it lands on DIRTY WORK in gold.
  const dirtyWorkIntro = {
    end: 2350,
    cues: [
      [0, "dirty"], [730, "work"], [800, "invert"], [870, "work"], [1180, "hold"], [1400, "labels"],
      [1560, "photo", 0], [1640, "photo", 1], [1720, "photo", 2], [1800, "photo", 3], [1880, "final"],
    ],
    hits: new Set(["dirty", "work", "invert", "photo", "final"]),
    mount(box, photos) {
      box.innerHTML = `
        <div class="dw-grain"></div>
        <span class="dw-label is-left">aespa ‘Dirty Work’</span><span class="dw-label is-right">Dirty Worker Ver.</span>
        <div class="dw-stack"><b class="dw-word is-dirty">Dirty</b><b class="dw-word is-work">Work</b></div>
        <div class="dw-photos"></div><i class="dw-initial"></i>
        <div class="dw-final"><b>Dirty Work</b><small>Brew Houze × aespa</small></div>`;
      box.querySelector(".dw-photos").append(...photos);
      const initial = box.querySelector(".dw-initial");
      return (step) => {
        const [, scene, value] = this.cues[step];
        const photo = scene === "photo" ? photos[value] : null;
        const ready = !photo || (photo.complete && photo.naturalWidth > 0);
        photos.forEach((img) => img.classList.toggle("is-current", img === photo));
        initial.textContent = photo ? MEMBERS[memberOrder[value]].name[0] : "";
        box.className = `dw-intro is-${ready ? scene : "labels"}`;
        // Every hit shakes the frame; restart the animation each time.
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
      introClip: "whiplash/whiplash-intro.mp3", loops: ["whiplash/whiplash-loop.mp3"], intro: whiplashIntro, introClass: "ae-intro",
    },
    dirtywork: {
      era: "Dirty Work", folder: "dirty-work/", tag: "Dirty Work",
      title: "Brew Houze × aespa · Dirty Work", toast: "Brew Houze × aespa · Dirty Work",
      sub: "Dirty Work · System portal", h1: "Every Brew Houze app. We do the dirty work.", footer: "Brew Houze × aespa · Dirty Work · café management system",
      introClip: "dirty-work/intro.mp3", loops: ["dirty-work/loop.mp3"], seamless: true, intro: dirtyWorkIntro, introClass: "dw-intro",
    },
  };
  const photoOf = (theme, key) => `${THEMES[theme].folder}${key}.webp`;

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
              <div class="ae-pc-shine"></div>
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
        + `<span class="ae-num">0${index + 1}</span><span class="ae-initial" aria-hidden="true">${escapeHtml(m.name[0])}</span>`
        + `<span class="ae-hangul" aria-hidden="true">${escapeHtml(m.hangul)}</span><p class="ae-name">${escapeHtml(m.name)}</p><p class="ae-role">${escapeHtml(m.short)}</p></li>`;
    }).join("")}</ol>`;
  }

  function applyTheme(theme) {
    current = theme;
    const t = theme ? THEMES[theme] : null;
    if (t) { root.dataset.theme = theme; root.dataset.secret = ""; } else { delete root.dataset.theme; delete root.dataset.secret; }
    brandName.innerHTML = t ? "Brew Houze <b>×</b> aespa" : cafe.brand;
    brandSub.textContent = t ? t.sub : cafe.sub;
    heading.textContent = t ? t.h1 : cafe.h1;
    footerText.textContent = t ? t.footer : cafe.footer;
    document.title = t ? t.title : cafe.title;
    footerYear.textContent = t ? `${yearText} × aespa` : yearText;
    footerYear.setAttribute("aria-pressed", String(Boolean(t)));
    document.querySelector('meta[name="color-scheme"]').setAttribute("content", t ? "dark" : "light");
    if (t) renderLineup(theme); else { lineup.innerHTML = ""; closeMember(); }
  }

  // ── Sound ──
  // Two kinds of music player, with the same controls:
  //   mediaLoop     one file on a looping <audio> (Whiplash: a 2:53 track, too long to decode into
  //                 memory; the tiny gap at its repeat is where the song starts over anyway)
  //   stitchedLoop  one or more files played back to back with Web Audio, sample-exact, then from
  //                 the top again (Dirty Work: its 78 s loop). The silence the MP3 encoder adds at
  //                 both ends of each file is trimmed, so the repeat is seamless.
  // prime() runs inside the click (phones only start audio in a tap); start() plays from the top
  // and fades in, and resolves false if the browser still wants a tap. mute()/unmute() keep the
  // place; stop() ends it; hide()/show() pause it while the tab is hidden.
  const VOLUME = 0.6;
  function mediaLoop(src) {
    let audio = null;
    let fade = null;
    let hiddenPause = false;
    const el = () => { if (!audio) { audio = new Audio(src); audio.loop = true; audio.preload = "auto"; } return audio; };
    const fadeTo = (target, ms, then) => {
      clearInterval(fade);
      const a = el();
      const from = a.volume;
      const start = performance.now();
      fade = setInterval(() => {
        const k = Math.min(1, (performance.now() - start) / ms);
        a.volume = from + (target - from) * k;
        if (k === 1) { clearInterval(fade); if (then) then(); }
      }, 40);
    };
    const play = async (fromTop, ms) => {
      const a = el();
      clearInterval(fade);
      a.volume = 0;
      a.muted = false;
      if (fromTop) a.currentTime = 0;
      try { await a.play(); fadeTo(VOLUME, ms); return true; } catch { return false; }
    };
    const fadeOut = () => { if (audio && !audio.paused) fadeTo(0, 450, () => audio.pause()); };
    return {
      prime() { const a = el(); a.muted = true; a.play().catch(() => undefined); },
      start: () => play(true, 1400),
      unmute: () => play(false, 900),
      mute: fadeOut,
      stop: fadeOut,
      hide() { if (audio && !audio.paused) { hiddenPause = true; clearInterval(fade); audio.pause(); } },
      show() { if (!hiddenPause) return Promise.resolve(true); hiddenPause = false; return audio.play().then(() => true, () => false); },
    };
  }

  function stitchedLoop(srcs) {
    let ctx = null;
    let gain = null;
    let parts = null;
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
    const trim = (buffer) => {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const loud = (i) => channels.some((data) => Math.abs(data[i]) > 1e-4);
      let first = 0;
      while (first < buffer.length && !loud(first)) first++;
      let last = buffer.length - 1;
      while (last > first && !loud(last)) last--;
      return { buffer, offset: first / buffer.sampleRate, duration: (last + 1 - first) / buffer.sampleRate };
    };
    const load = () => {
      if (!loading) {
        loading = Promise.all(srcs.map(async (src) => {
          const response = await fetch(src);
          if (!response.ok) throw new Error(`Could not load ${src}`);
          return trim(await context().decodeAudioData(await response.arrayBuffer()));
        })).then((decoded) => { parts = decoded; }, (error) => { loading = null; throw error; });
      }
      return loading;
    };
    // Keeps about six seconds of music queued, each part starting exactly where the last one ends.
    const schedule = () => {
      while (parts && nextAt < ctx.currentTime + 6) {
        const part = parts[index];
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
    };
    const running = async () => {
      try { await Promise.race([ctx.resume(), new Promise((ok) => setTimeout(ok, 400))]); } catch { /* not allowed yet */ }
      return ctx.state === "running";
    };
    const player = {
      prime() { context().resume().catch(() => undefined); load().catch(() => undefined); },
      async start() {
        const mine = ++generation;
        context();
        try { await load(); } catch { return false; }
        if (!(await running()) || mine !== generation) return false;
        halt();
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        index = 0;
        nextAt = ctx.currentTime + 0.06;
        schedule();
        timer = setInterval(schedule, 1000);
        ramp(VOLUME, 1400);
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
  const playerFor = (theme) => (players[theme] ??= THEMES[theme].seamless ? stitchedLoop(THEMES[theme].loops) : mediaLoop(THEMES[theme].loops[0]));
  const clips = {};
  const clipFor = (theme) => { if (!clips[theme]) { clips[theme] = new Audio(THEMES[theme].introClip); clips[theme].preload = "auto"; } return clips[theme]; };

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
  function playIntro(theme, withSound) {
    const t = THEMES[theme];
    const spec = t.intro;
    const clip = clipFor(theme);
    return new Promise((done) => {
      const box = document.createElement("div");
      box.className = t.introClass;
      box.setAttribute("aria-hidden", "true");
      // The members' photos, loaded now (one not ready in time is skipped).
      const photos = memberOrder.map((key) => { const img = new Image(); img.alt = ""; img.draggable = false; img.src = photoOf(theme, key); return img; });
      const show = spec.mount(box, photos);
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
          done();
          return;
        }
        requestAnimationFrame(frame);
      };
      const silent = () => { const start = performance.now(); clock = () => performance.now() - start; requestAnimationFrame(frame); };
      if (!withSound) { silent(); return; }
      // Wait (briefly) for the sound to actually start, then follow it.
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
  const nextTheme = () => (CYCLE.includes(store.get(NEXT_KEY)) ? store.get(NEXT_KEY) : CYCLE[0]);
  let switching = false;
  async function toggleTheme() {
    if (switching) return;
    switching = true;
    const leaving = current;
    const entering = leaving ? null : nextTheme();
    const motion = motionOK();
    // Entering plays the intro (with its sound) while the page switches and goes back to the top
    // behind it. Leaving fades the music out, and the next click opens the next theme.
    const sound = Boolean(entering) && soundWanted();
    if (sound) playerFor(entering).prime();
    const intro = entering && motion ? playIntro(entering, sound) : null;
    if (leaving) { playerFor(leaving).stop(); clipFor(leaving).pause(); }
    applyTheme(entering);
    window.scrollTo({ top: 0, behavior: "instant" });
    store.set(THEME_KEY, entering ?? "cafe");
    if (leaving) {
      const after = CYCLE[(CYCLE.indexOf(leaving) + 1) % CYCLE.length];
      store.set(NEXT_KEY, after);
      clipFor(after); // ready for the next click
    }
    if (intro) await intro;
    if (entering) showSoundState(sound ? ((await playerFor(entering).start()) ? "on" : "waiting") : "off");
    switching = false;
    if (motion) {
      const flash = document.createElement("div");
      flash.className = "ae-flash";
      document.body.appendChild(flash);
      flash.addEventListener("animationend", () => flash.remove());
    }
    toast(entering ? THEMES[entering].toast : "☕ Back to the café");
  }

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
    document.getElementById("ae-pc-back").innerHTML = `
      <button type="button" class="ae-pc-mark" data-flip title="Flip the card" aria-label="Flip back to the photo">æ</button>
      <span class="ae-pc-back-num">0${pcIndex + 1} / 04</span>
      <h3>${escapeHtml(member.name)}</h3>
      <p class="ae-pc-kr">${escapeHtml(member.hangul)}</p>
      <p class="ae-pc-role">${escapeHtml(member.role)}</p>
      <dl class="ae-pc-facts"><dt>Name</dt><dd>${escapeHtml(member.real)}</dd><dt>Born</dt><dd>${escapeHtml(member.born)}</dd><dt>From</dt><dd>${escapeHtml(member.from)}</dd><dt>Group</dt><dd>aespa · debuted Nov 17, 2020</dd></dl>
      <p class="ae-pc-about">${escapeHtml(member.about)}</p>
      <div class="ae-pc-foot"><span>Brew Houze × aespa<br />${escapeHtml(t.era)}</span><i></i></div>`;
    // Replaying the entrance each time a member is shown.
    pcCard.style.animation = "none"; void pcCard.offsetWidth; pcCard.style.animation = "";
  }
  function openMember(key, opener) {
    pcOpener = opener;
    showMember(memberOrder.indexOf(key));
    pcModal.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("ae-pc-close").focus();
  }
  function closeMember() {
    if (pcModal.hidden) return;
    pcModal.hidden = true;
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
  // Flipping: the tilt steps aside for the length of the flip, so the card turns smoothly.
  let flipping = false;
  let flipTimer = null;
  function flipCard() {
    flipping = true;
    clearTimeout(flipTimer);
    pcCard.classList.remove("is-tilting");
    pcCard.style.setProperty("--rx", "0deg");
    pcCard.style.setProperty("--ry", "0deg");
    pcCard.classList.toggle("is-flipped");
    flipTimer = setTimeout(() => { flipping = false; }, 720);
  }
  pcModal.addEventListener("dragstart", (event) => event.preventDefault());
  // Tilt and gloss follow a mouse or pen (not touch, and not with reduced motion). The position is
  // measured on the card's frame, which does not move, so the tilt does not feed back on itself;
  // near the flip mark (top left corner of that frame) the card settles flat, so the mark stays
  // exactly under the cursor and the click lands on it.
  const pcStage = pcCard.parentElement;
  if (motionOK()) {
    pcStage.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || flipping) return;
      const box = pcStage.getBoundingClientRect();
      if (event.clientX - box.left < 70 && event.clientY - box.top < 66) {
        pcCard.classList.remove("is-tilting");
        pcCard.style.setProperty("--rx", "0deg");
        pcCard.style.setProperty("--ry", "0deg");
        return;
      }
      const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
      const flipped = pcCard.classList.contains("is-flipped");
      pcCard.classList.add("is-tilting");
      pcCard.style.setProperty("--rx", `${((flipped ? 0.5 - x : x - 0.5) * 16).toFixed(2)}deg`);
      pcCard.style.setProperty("--ry", `${((0.5 - y) * 12).toFixed(2)}deg`);
      pcCard.style.setProperty("--gx", `${Math.round(x * 100)}%`);
      pcCard.style.setProperty("--gy", `${Math.round(y * 100)}%`);
    });
    pcStage.addEventListener("pointerleave", () => {
      pcCard.classList.remove("is-tilting");
      pcCard.style.setProperty("--rx", "0deg");
      pcCard.style.setProperty("--ry", "0deg");
    });
  }

  // ── Start ──
  if (store.get(THEME_KEY) === "aespa") store.set(THEME_KEY, "whiplash"); // the old name of Whiplash
  applyTheme(current);
  if (current) {
    // After a reload the browser usually wants a tap before any sound (the button asks for it).
    if (soundWanted()) void playerFor(current).start().then((ok) => showSoundState(ok ? "on" : "waiting"));
    else showSoundState("off");
  } else {
    clipFor(nextTheme()); // ready for the first click
  }
  footerYear.addEventListener("click", toggleTheme);
  footerYear.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleTheme(); } });
})();
