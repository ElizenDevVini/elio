// the meadow: three hay piles are the portfolio. the market drifts hay
// between them; elio eats the overflow and carries it to the starved pile.
// the kill switch genuinely stops the loop. rose hay = above target.

(function () {
  const scene = document.getElementById("scene");
  const logEl = document.getElementById("log");
  const killBtn = document.getElementById("kill");
  if (!scene) return;

  const ROWS = 15, GROUND = 11, TICK = 130;
  const PILES = [
    { sym: "aapl", target: 10, h: 10 },
    { sym: "nvda", target: 6, h: 6 },
    { sym: "cash", target: 4, h: 4 },
  ];
  const TOTAL = 20, MAXH = 10;

  // --- sprites (facing left; right is mirrored) ----------------------------
  const SWAP = { "\\": "/", "/": "\\", "(": ")", ")": "(", "<": ">", ">": "<" };
  function mirror(frame) {
    const w = Math.max(...frame.map(l => l.length));
    return frame.map(l =>
      l.padEnd(w).split("").reverse().map(c => SWAP[c] || c).join("")
    );
  }
  const L = {
    stand: [
      "  \\/\\/",
      "  (o_)_____",
      "   |       \\",
      "   ||     ||",
    ],
    walk: [
      "  \\/\\/",
      "  (o_)_____",
      "   |       \\",
      "   /|     |\\",
    ],
    eat: [
      "   \\/\\/",
      "    ,______",
      "  (o_)     \\",
      "   ||     ||",
    ],
    carry: [
      "  \\/\\/",
      " +(o_)_____",
      "   |       \\",
      "   ||     ||",
    ],
  };
  const R = {};
  for (const k in L) R[k] = mirror(L[k]);
  const SPR_W = 12;

  // --- state ----------------------------------------------------------------
  let cols = 60, pileX = [];
  let dx = 20, dir = 1, pose = "stand", carrying = false;
  let mode = "idle";          // idle | walkTo | eat | drop | wait
  let walkTarget = 0, actTicks = 0, afterWalk = null;
  let driftIn = rnd(30, 55), trips = 0, sparkleTicks = 0, grazePause = 0;
  let running = true, tickCount = 0;
  const fluff = [{ x: 5, r: 1.5 }, { x: 40, r: 3.2 }];
  let grassRow = [];

  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function measure() {
    const probe = document.createElement("span");
    probe.textContent = "M".repeat(50);
    probe.style.visibility = "hidden";
    scene.appendChild(probe);
    const cw = probe.getBoundingClientRect().width / 50 || 7.2;
    probe.remove();
    cols = Math.max(46, Math.floor(scene.clientWidth / cw) - 1);
    const mid = Math.floor(cols / 2), gap = Math.min(24, Math.floor(cols / 3.4));
    pileX = [mid - gap, mid, mid + gap];
    grassRow = Array.from({ length: cols }, (_, i) =>
      ",,,/,//,,".charAt((i * 7) % 9)
    );
    dx = Math.min(dx, cols - SPR_W - 2);
  }

  function log(msg, cls) {
    const t = new Date().toTimeString().slice(0, 8);
    const line = document.createElement("div");
    line.innerHTML = `<span class="f">${t}</span> ${msg}`;
    if (cls) line.className = cls;
    logEl.prepend(line);
    while (logEl.children.length > 4) logEl.lastChild.remove();
  }

  // --- simulation -----------------------------------------------------------
  function overPile() {
    let best = -1;
    PILES.forEach((p, i) => {
      if (p.h > p.target && (best < 0 || p.h - p.target > PILES[best].h - PILES[best].target)) best = i;
    });
    return best;
  }
  function underPile() {
    let best = -1;
    PILES.forEach((p, i) => {
      if (p.h < p.target && (best < 0 || p.target - p.h > PILES[best].target - PILES[best].h)) best = i;
    });
    return best;
  }
  const pct = (p) => Math.round((p.h / TOTAL) * 100) + "%";

  function drift() {
    const from = rnd(0, 2);
    let to = rnd(0, 2);
    if (to === from) to = (to + 1) % 3;
    const amt = Math.min(rnd(1, 3), PILES[from].h - 1, MAXH - PILES[to].h);
    if (amt <= 0) return;
    PILES[from].h -= amt;
    PILES[to].h += amt;
    const grown = PILES[to];
    log(`${grown.sym} drifted to <span class="r">${pct(grown)}</span> <span class="f">(target ${Math.round(grown.target / TOTAL * 100)}%)</span>`);
    trips = 0;
  }

  function think() {
    if (mode === "wait") {
      if (--actTicks <= 0) { mode = "idle"; trips = 0; log("cap window reset. back to work."); }
      return;
    }
    if (mode === "eat") {
      pose = "eat";
      if (--actTicks <= 0) {
        const i = nearestPile();
        PILES[i].h--; carrying = true; pose = "carry";
        log(`trim ${PILES[i].sym} <span class="f">-5%</span> <span class="f">(within per-trade cap)</span>`);
        const u = underPile();
        if (u >= 0) startWalk(pileX[u], "drop");
        else { carrying = false; mode = "idle"; }
      }
      return;
    }
    if (mode === "drop") {
      if (--actTicks <= 0) {
        const i = nearestPile();
        PILES[i].h++; carrying = false;
        log(`feed ${PILES[i].sym} <span class="f">+5%</span> -> ${pct(PILES[i])}`);
        trips++;
        if (overPile() < 0) {
          log(`balanced. <span class="f">elio grazes.</span>`);
          sparkleTicks = 24; mode = "idle"; grazePause = rnd(20, 50);
        } else if (trips >= 3) {
          mode = "wait"; actTicks = rnd(45, 70);
          log(`<span class="r">daily cap reached.</span> elio waits.`);
        } else {
          mode = "idle";
        }
      }
      return;
    }
    if (mode === "walkTo") {
      pose = tickCount % 2 ? "walk" : "stand";
      const cx = dx + Math.floor(SPR_W / 2);
      if (Math.abs(cx - walkTarget) <= 7) {
        mode = afterWalk; actTicks = mode === "eat" ? 7 : 4;
        pose = "stand";
      } else {
        dir = walkTarget > cx ? 1 : -1;
        dx += dir;
      }
      return;
    }
    // idle
    if (grazePause > 0) { grazePause--; pose = tickCount % 9 < 3 ? "eat" : "stand"; }
    else if (Math.random() < 0.02) { dir = -dir; }
    else if (Math.random() < 0.12) {
      pose = tickCount % 2 ? "walk" : "stand";
      dx = Math.max(1, Math.min(cols - SPR_W - 1, dx + dir));
    } else pose = "stand";
    const o = overPile();
    if (o >= 0) startWalk(pileX[o], "eat");
  }

  function startWalk(x, then) { mode = "walkTo"; walkTarget = x; afterWalk = then; }
  function nearestPile() {
    const cx = dx + Math.floor(SPR_W / 2);
    let best = 0;
    pileX.forEach((x, i) => { if (Math.abs(x - cx) < Math.abs(pileX[best] - cx)) best = i; });
    return best;
  }

  // --- render ---------------------------------------------------------------
  function render() {
    const cells = Array.from({ length: ROWS }, () => Array(cols).fill(null));
    const put = (r, c, ch, cls) => {
      if (r >= 0 && r < ROWS && c >= 0 && c < cols && ch !== " ")
        cells[r][c] = { ch, cls };
    };

    // drifting fluff
    for (const f of fluff) put(Math.floor(f.r), Math.floor(f.x), "·", "f");

    // ground
    for (let c = 0; c < cols; c++) put(GROUND, c, grassRow[c], "g");

    // piles + labels + target notches
    PILES.forEach((p, i) => {
      const x = pileX[i];
      for (let u = 0; u < p.h; u++) {
        const row = GROUND - 1 - u;
        const w = Math.min(9, 1 + 2 * (p.h - 1 - u));
        const cls = u >= p.target ? "r" : "g";
        for (let c = x - Math.floor(w / 2); c <= x + Math.floor(w / 2); c++)
          put(row, c, "+", cls);
      }
      put(GROUND - p.target, x - 6, "-", "m");
      put(GROUND - p.target, x + 6, "-", "m");
      const lab = p.sym, val = pct(p);
      lab.split("").forEach((ch, j) => put(GROUND + 1, x - Math.floor(lab.length / 2) + j, ch, "m"));
      val.split("").forEach((ch, j) => put(GROUND + 2, x - Math.floor(val.length / 2) + j, ch, "f"));
    });

    // donkey
    const frames = dir === 1 ? R : L;
    const spr = frames[carrying && pose !== "eat" ? "carry" : pose] || frames.stand;
    spr.forEach((line, r) => {
      line.split("").forEach((ch, c) => {
        if (ch === "+") put(GROUND - spr.length + r, dx + c, ch, "r");
        else put(GROUND - spr.length + r, dx + c, ch, "k");
      });
    });

    // sparkles when balanced
    if (sparkleTicks > 0) {
      sparkleTicks--;
      const sx = dx + (dir === 1 ? SPR_W : -6);
      put(GROUND - 6, sx, "x", "r");
      put(GROUND - 6, sx + 2, "I", "m");
      put(GROUND - 7, sx + 4, "x", "r");
    }

    // stopped banner
    if (!running) {
      const msg = "( stopped )";
      const c0 = Math.floor((cols - msg.length) / 2);
      msg.split("").forEach((ch, j) => put(1, c0 + j, ch, "r"));
    }

    const html = cells.map(row => {
      let line = "", open = null;
      for (const cell of row) {
        const cls = cell ? cell.cls : null;
        if (cls !== open) {
          if (open) line += "</span>";
          if (cls) line += `<span class="${cls}">`;
          open = cls;
        }
        line += cell ? cell.ch : " ";
      }
      return line + (open ? "</span>" : "");
    }).join("\n");
    scene.innerHTML = html;
  }

  function tick() {
    if (!running) return;
    tickCount++;
    for (const f of fluff) {
      f.x += 0.25;
      if (f.x > cols) { f.x = -2; f.r = 1 + Math.random() * 3; }
    }
    if (tickCount % 4 === 0) {
      const i = rnd(0, cols - 1);
      grassRow[i] = grassRow[i] === "," ? "/" : ",";
    }
    if (--driftIn <= 0 && mode === "idle" && overPile() < 0) {
      drift();
      driftIn = rnd(80, 160);
    }
    think();
    render();
  }

  killBtn.addEventListener("click", () => {
    running = !running;
    if (!running) {
      log(`<span class="r">kill switch.</span> nothing moves without you.`);
      killBtn.textContent = "[ resume ]";
      render();
    } else {
      log("resumed. elio stretches.");
      killBtn.textContent = "[ kill switch ]";
    }
  });

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  measure();
  addEventListener("resize", () => { measure(); render(); });
  addEventListener("load", () => { measure(); render(); });
  render();
  log("elio is awake. piles at target.");
  // browsers throttle timers; run as many logical ticks as real time owes us
  if (!reduced) {
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      let steps = Math.min(4, Math.round((now - last) / TICK));
      last = now;
      while (steps-- > 0) tick();
    }, TICK);
  }

  // --- stitch-in for the wreath --------------------------------------------
  if (!reduced) {
    const art = document.querySelector(".frame-art");
    if (art) {
      let i = 0;
      const walk = (node) => {
        [...node.childNodes].forEach((n) => {
          if (n.nodeType === 3) {
            const frag = document.createDocumentFragment();
            for (const ch of n.textContent) {
              if (ch === " " || ch === "\n") frag.append(ch);
              else {
                const s = document.createElement("span");
                s.className = "st";
                s.style.animationDelay = (i++ * 2.5) + "ms";
                s.textContent = ch;
                frag.append(s);
              }
            }
            n.replaceWith(frag);
          } else walk(n);
        });
      };
      walk(art);
    }
  }
})();
