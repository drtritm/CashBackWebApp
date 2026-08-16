(() => {
  "use strict";

  /* App version. Bump this together with version.json and sw.js on every release. */
  const APP_VERSION = "1.0.0";

  /* NEVER rename these keys. They are where the user's data physically lives —
     changing one orphans every existing install's history. Schema changes must be
     migrated in place instead. */
  const KEY = "cashbackTracker_v2";
  const LEGACY_KEY = "cashbackTrackerData_v1";

  // Deep, desaturated finishes — white text must stay legible over the lighter stop.
  const GRADIENTS = {
    obsidian:  ["#262a33", "#0b0e13"],
    graphite:  ["#3a4048", "#14171b"],
    slate:     ["#454e60", "#161a22"],
    midnight:  ["#172c46", "#080f18"],
    navy:      ["#1b3a6b", "#08122a"],
    sapphire:  ["#20406f", "#0c1526"],
    azure:     ["#1d5a8a", "#071c2e"],
    cobalt:    ["#2b3f8f", "#0d1233"],
    teal:      ["#14555c", "#061e21"],
    lagoon:    ["#116b6b", "#052424"],
    emerald:   ["#146049", "#06201a"],
    jade:      ["#18715a", "#062620"],
    forest:    ["#2f5430", "#0e180f"],
    olive:     ["#4e5a25", "#171c09"],
    amethyst:  ["#553281", "#1b0c30"],
    violet:    ["#43308c", "#120c2e"],
    orchid:    ["#6c3579", "#240f2a"],
    plum:      ["#5d2a4a", "#1e0c17"],
    rose:      ["#8c3563", "#2c0d24"],
    ruby:      ["#8f2748", "#2c0a17"],
    crimson:   ["#8a2230", "#2a0a10"],
    ember:     ["#93412a", "#2c110a"],
    amber:     ["#8a5f1e", "#2b1c06"],
    bronze:    ["#6f471f", "#241408"],
    gold:      ["#8a6b34", "#2f2210"],
    champagne: ["#7d6a4a", "#282116"],
    steel:     ["#3f5563", "#121a20"],
    ink:       ["#2c2f4a", "#0d0e1a"]
  };
  const GRADIENT_KEYS = Object.keys(GRADIENTS);

  // ---------------- state ----------------
  function blank() {
    return {
      cards: [], transactions: [],
      settings: { recentMccs: [], notify: false, notifyDays: 3, autoBackup: true, lastSnapshotDate: null, lastSavedDate: null }
    };
  }

  function migrateLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      const old = JSON.parse(raw);
      if (!old || !Array.isArray(old.cards)) return null;
      const s = blank();
      const catToMcc = {};
      s.cards = old.cards.map((c, i) => ({
        id: c.id, name: c.name, issuer: "", last4: "",
        gradient: GRADIENT_KEYS[i % GRADIENT_KEYS.length],
        baseRate: c.baseRate || 0, statementDay: null, dueDay: null,
        rules: (c.rules || []).map((r) => {
          // Best-effort: map old free-text category onto a matching MCC group.
          const g = MCC_GROUPS.find((x) => x.name.toLowerCase().includes(String(r.category).toLowerCase())) ||
                    MCC_GROUPS.find((x) => String(r.category).toLowerCase().includes(x.id));
          const gid = g ? g.id : "other";
          catToMcc[r.category] = (g ? g.codes[0][0] : "0000");
          return {
            id: r.id, kind: "group", groupId: gid, mccCodes: [],
            label: r.category, rate: r.rate,
            cap: r.cap != null ? { amount: r.cap, type: "cashback", period: "monthly" } : null
          };
        })
      }));
      s.transactions = (old.transactions || []).map((t) => ({
        id: t.id, cardId: t.cardId, mcc: catToMcc[t.category] || "0000",
        amount: t.amount, date: t.date, note: t.note || ""
      }));
      return s;
    } catch (e) { return null; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const s = blank();
        if (Array.isArray(d.cards)) s.cards = d.cards;
        if (Array.isArray(d.transactions)) s.transactions = d.transactions;
        if (d.settings) Object.assign(s.settings, d.settings);
        return s;
      }
      const migrated = migrateLegacy();
      if (migrated) return migrated;
    } catch (e) { console.error(e); }
    return blank();
  }

  let state = load();
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  // ---------------- automatic daily backup ----------------
  /* Snapshots live under their own key so they never nest inside the data they
     copy. A browser cannot write a file to disk on a timer — that needs a user
     gesture — so the automatic half is this on-device rolling snapshot, and the
     app separately offers a once-a-day one-tap save to Files. */
  const BACKUP_KEY = "cashbackTracker_snapshots";
  const MAX_SNAPSHOTS = 10;

  function loadSnapshots() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeSnapshots(list) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      // Quota exceeded — drop the oldest and retry once.
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, Math.max(1, list.length - 3))));
        return true;
      } catch (e2) { return false; }
    }
  }

  function takeSnapshot(reason) {
    const list = loadSnapshots();
    const payload = JSON.stringify({ cards: state.cards, transactions: state.transactions });
    // Skip if nothing actually changed since the newest snapshot.
    if (list.length && list[0].payload === payload) {
      list[0].date = todayStr();
      writeSnapshots(list);
      return false;
    }
    list.unshift({
      at: new Date().toISOString(),
      date: todayStr(),
      reason: reason || "daily",
      cards: state.cards.length,
      txns: state.transactions.length,
      payload
    });
    writeSnapshots(list.slice(0, MAX_SNAPSHOTS));
    return true;
  }

  function runDailyBackup() {
    if (!state.settings.autoBackup) return;
    if (state.settings.lastSnapshotDate === todayStr()) return;
    if (!state.cards.length && !state.transactions.length) return;
    takeSnapshot("daily");
    state.settings.lastSnapshotDate = todayStr();
    save();
  }

  /* If the main record is empty but a snapshot still holds data, the primary key
     was lost (cleared storage, failed write) while snapshots survived. Bring it back
     rather than silently showing an empty app. */
  function autoRestoreIfEmpty() {
    if (state.cards.length || state.transactions.length) return false;
    const snap = loadSnapshots().find((s) => s.cards > 0 || s.txns > 0);
    if (!snap) return false;
    try {
      const d = JSON.parse(snap.payload);
      state.cards = d.cards || [];
      state.transactions = d.transactions || [];
      save();
      return snap;
    } catch (e) { return false; }
  }

  /* Ask iOS not to evict this origin's storage on its own. Doesn't stop a manual
     "Clear Website Data", but it does stop the automatic 7-day purge. */
  async function requestPersistentStorage() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (e) { return null; }
  }

  // ---------------- version & updates ----------------
  let latestRelease = null;

  function compareVersions(a, b) {
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  async function checkForUpdate(manual) {
    try {
      const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("bad status");
      const d = await r.json();
      if (!d || !d.version) throw new Error("no version");
      if (compareVersions(d.version, APP_VERSION) > 0) {
        latestRelease = d;
        showUpdateBar(d);
        return d;
      }
      hideUpdateBar();
      if (manual) toast(`Up to date · v${APP_VERSION}`);
      return null;
    } catch (e) {
      if (manual) toast("Couldn't check — no connection?");
      return null;
    }
  }

  function showUpdateBar(d) {
    const bar = document.getElementById("updateBar");
    bar.innerHTML = `
      <div class="ub-body">
        <div class="ub-t1">Version ${esc(d.version)} available</div>
        <div class="ub-t2">${esc(d.notes || "Tap update to get the latest version.")}</div>
      </div>
      <button class="ub-btn" id="ubApply">Update</button>`;
    bar.hidden = false;
    document.getElementById("ubApply").addEventListener("click", applyUpdate);
  }
  function hideUpdateBar() {
    const bar = document.getElementById("updateBar");
    if (bar) bar.hidden = true;
  }

  /* Replaces the cached code and nothing else. localStorage is deliberately
     untouched — this is the whole point, so updating never costs the user data. */
  async function applyUpdate() {
    const btn = document.getElementById("ubApply");
    if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }
    takeSnapshot("pre-update");
    save();
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { /* fall through to reload regardless */ }
    location.reload();
  }

  /* iOS PWAs handle <a download> poorly; the share sheet is the reliable way to
     get a file into Files / iCloud / email from a home-screen app. */
  async function saveBackupFile() {
    const json = JSON.stringify({ cards: state.cards, transactions: state.transactions, settings: state.settings }, null, 2);
    const name = `cashback-backup-${todayStr()}.json`;
    try {
      const file = new File([json], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Cashback backup" });
        state.settings.lastSavedDate = todayStr();
        save();
        return "shared";
      }
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
    }
    download(name, json, "application/json");
    state.settings.lastSavedDate = todayStr();
    save();
    return "downloaded";
  }

  // ---------------- helpers ----------------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function todayStr() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  /* Đồng has no subunit, so every amount is a whole number formatted with
     Vietnamese dot separators: 1.500.000 ₫ */
  const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const money = (n) => VND.format(Math.round(n || 0));

  /* Compact form for tight spots — tr = triệu (million), k = nghìn (thousand). */
  function moneyShort(n) {
    n = Math.round(n || 0);
    const a = Math.abs(n);
    // Keep one decimal until the unit itself is large, so 10.500.000 reads
    // "10,5 tr ₫" rather than rounding away to "11 tr ₫".
    const trim = (s) => s.replace(".", ",").replace(/,0$/, "");
    if (a >= 1e9) return trim((n / 1e9).toFixed(a >= 1e11 ? 0 : 1)) + " tỷ ₫";
    if (a >= 1e6) return trim((n / 1e6).toFixed(a >= 1e8 ? 0 : 1)) + " tr ₫";
    if (a >= 1e4) return Math.round(n / 1e3) + "k ₫";
    return money(n);
  }

  /* Amount fields are text inputs so they can carry separators while typing.
     parseFloat("1.500.000") === 1.5, so amounts must always go through parseVnd. */
  const parseVnd = (raw) => {
    const digits = String(raw == null ? "" : raw).replace(/\D/g, "");
    return digits ? Number(digits) : 0;
  };
  const formatVnd = (raw) => {
    const digits = String(raw == null ? "" : raw).replace(/\D/g, "");
    return digits ? Number(digits).toLocaleString("vi-VN") : "";
  };

  /* Live thousand-separator formatting that keeps the caret in the right place. */
  function wireMoneyInput(el) {
    if (!el) return;
    el.addEventListener("input", () => {
      const digitsBefore = el.value.slice(0, el.selectionStart || 0).replace(/\D/g, "").length;
      const formatted = formatVnd(el.value);
      el.value = formatted;
      let pos = 0;
      if (digitsBefore > 0) {
        let seen = 0;
        pos = formatted.length;
        for (let i = 0; i < formatted.length; i++) {
          if (formatted.charCodeAt(i) >= 48 && formatted.charCodeAt(i) <= 57) {
            if (++seen === digitsBefore) { pos = i + 1; break; }
          }
        }
      }
      try { el.setSelectionRange(pos, pos); } catch (e) {}
    });
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const getCard = (id) => state.cards.find((c) => c.id === id);
  const grad = (key) => GRADIENTS[key] || GRADIENTS.obsidian;
  const gradStyle = (key) => { const g = grad(key); return `--g1:${g[0]};--g2:${g[1]}`; };

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2000);
  }

  function periodKey(dateStr, period) {
    const [y, m] = dateStr.split("-");
    if (period === "yearly") return y;
    if (period === "quarterly") return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
    return `${y}-${m}`;
  }
  const PERIOD_LABEL = { monthly: "mo", quarterly: "qtr", yearly: "yr" };

  function monthLabel(mk) {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const dateLabel = (s) => parseDate(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  /* Next calendar occurrence of a day-of-month, clamped to short months. */
  function nextOccurrence(day) {
    if (!day) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const build = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
    let d = build(now.getFullYear(), now.getMonth());
    if (d < now) d = build(now.getFullYear(), now.getMonth() + 1);
    return d;
  }
  function daysUntil(d) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 86400000);
  }

  // ---------------- cash back engine ----------------
  /* A specific-MCC rule always beats a group rule; ties break on the higher rate. */
  function matchRule(card, mcc) {
    const info = mccInfo(mcc);
    const specific = card.rules.filter((r) => r.kind === "mcc" && (r.mccCodes || []).includes(mcc));
    const group = card.rules.filter((r) => r.kind === "group" && r.groupId === info.groupId);
    const pool = specific.length ? specific : group;
    if (!pool.length) return { rule: null, rate: card.baseRate || 0 };
    const best = pool.reduce((a, b) => (b.rate > a.rate ? b : a));
    return { rule: best, rate: best.rate };
  }

  function ruleLabel(rule) {
    if (!rule) return "Base rate";
    if (rule.label) return rule.label;
    if (rule.kind === "group") return groupName(rule.groupId);
    return (rule.mccCodes || []).map((c) => mccInfo(c).name).join(", ") || "Custom";
  }

  /* Transactions store an MCC, but the Log screen offers plain categories.
     This picks the code that will match the chosen rule in the engine. */
  function ruleMcc(rule) {
    if (!rule) return "0000";
    if (rule.kind === "mcc") return (rule.mccCodes || [])[0] || "0000";
    const g = MCC_GROUPS.find((x) => x.id === rule.groupId);
    return g ? g.codes[0][0] : "0000";
  }
  function ruleIcon(rule) {
    if (!rule) return "•";
    return rule.kind === "group" ? groupIcon(rule.groupId) : mccInfo(ruleMcc(rule)).icon;
  }

  /* Cash back is always DERIVED from raw transactions, never stored as truth.
     Recomputing chronologically keeps caps correct after any edit or delete. */
  function recompute() {
    const acc = {};
    const cardAcc = {};
    // Pre-pass: some cards (Cake, MSB Visa Online) pay nothing unless the whole
    // cycle clears a spend threshold, so the gate needs the period total up front.
    const spendAcc = {};
    for (const t of state.transactions) {
      const card = getCard(t.cardId);
      if (!card || !card.cardCap || !(card.cardCap.minSpend > 0)) continue;
      const k = `${card.id}|${periodKey(t.date, card.cardCap.period || "monthly")}`;
      spendAcc[k] = (spendAcc[k] || 0) + t.amount;
    }

    const sorted = [...state.transactions].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)
    );
    for (const t of sorted) {
      const card = getCard(t.cardId);
      if (!card) { t._cb = 0; t._rate = 0; t._capped = false; t._ruleId = null; t._pending = false; continue; }
      const base = card.baseRate || 0;
      const { rule, rate } = matchRule(card, t.mcc);
      t._ruleId = rule ? rule.id : null;
      t._rate = rate;
      t._capped = false;
      t._pending = false;
      t._shortfall = 0;

      let cb, bonusPart = 0, acc4rule = null, eligibleSpend = 0;
      if (!rule || !rule.cap || !(rule.cap.amount > 0)) {
        cb = (t.amount * rate) / 100;
        bonusPart = cb;
      } else {
        const k = `${card.id}|${rule.id}|${periodKey(t.date, rule.cap.period)}`;
        const a = acc[k] || (acc[k] = { cashback: 0, spend: 0 });
        acc4rule = a;
        // How much of this purchase still qualifies for the bonus rate?
        let eligible;
        if (rule.cap.type === "spend") {
          eligible = Math.max(0, Math.min(t.amount, rule.cap.amount - a.spend));
        } else {
          const remainingCb = Math.max(0, rule.cap.amount - a.cashback);
          eligible = rate > 0 ? Math.min(t.amount, (remainingCb * 100) / rate) : 0;
        }
        const overflow = t.amount - eligible;
        // Spend past the cap drops to the card's base rate, like a real issuer.
        bonusPart = (eligible * rate) / 100;
        cb = bonusPart + (overflow * base) / 100;
        eligibleSpend = eligible;
        if (overflow > 0.004) t._capped = true;
      }

      // Per-transaction ceiling (Cake: 10k under 200k, 50k at or above).
      if (rule && rule.txnCap && rule.txnCap.tierAt != null) {
        const lim = t.amount >= rule.txnCap.tierAt ? rule.txnCap.above : rule.txnCap.below;
        if (lim >= 0 && cb > lim) { cb = lim; t._capped = true; }
      }

      // Credit the category cap with what was actually paid, not the pre-clamp
      // figure — otherwise a transaction capped at 10k still burns 30k of the cap.
      if (acc4rule) {
        acc4rule.spend += eligibleSpend;
        acc4rule.cashback += Math.min(bonusPart, cb);
      }

      // Card-wide cap and minimum-spend gate.
      if (card.cardCap && (card.cardCap.amount > 0 || card.cardCap.minSpend > 0)) {
        const pk = periodKey(t.date, card.cardCap.period || "monthly");
        const k = `${card.id}|${pk}`;
        if (card.cardCap.minSpend > 0 && (spendAcc[k] || 0) < card.cardCap.minSpend) {
          // Cycle hasn't qualified yet — show what it would pay, but count zero.
          t._pending = true;
          t._shortfall = card.cardCap.minSpend - (spendAcc[k] || 0);
          t._cbPotential = cb;
          cb = 0;
        } else if (card.cardCap.amount > 0) {
          const used = cardAcc[k] || 0;
          const remain = Math.max(0, card.cardCap.amount - used);
          if (cb > remain) { cb = remain; t._capped = true; }
          cardAcc[k] = used + cb;
        }
      }

      t._cb = cb;
    }
    capUsageCache = acc;
    cardCapCache = cardAcc;
    cardSpendCache = spendAcc;
  }
  let capUsageCache = {};
  let cardCapCache = {};
  let cardSpendCache = {};

  function cardCapUsage(card, dateStr) {
    if (!card.cardCap) return null;
    const pk = periodKey(dateStr || todayStr(), card.cardCap.period || "monthly");
    const k = `${card.id}|${pk}`;
    return {
      used: cardCapCache[k] || 0,
      spend: cardSpendCache[k] || state.transactions
        .filter((t) => t.cardId === card.id && periodKey(t.date, card.cardCap.period || "monthly") === pk)
        .reduce((s, t) => s + t.amount, 0)
    };
  }

  function capUsage(card, rule, dateStr) {
    const k = `${card.id}|${rule.id}|${periodKey(dateStr || todayStr(), rule.cap.period)}`;
    return capUsageCache[k] || { cashback: 0, spend: 0 };
  }

  /* What a hypothetical purchase would earn right now (for the live preview). */
  function quote(card, mcc, amount, dateStr) {
    const base = card.baseRate || 0;
    const { rule, rate } = matchRule(card, mcc);
    let cashback, capped = false, remaining = null;

    if (!rule || !rule.cap || !(rule.cap.amount > 0)) {
      cashback = (amount * rate) / 100;
    } else {
      const used = capUsage(card, rule, dateStr);
      let eligible;
      if (rule.cap.type === "spend") {
        remaining = Math.max(0, rule.cap.amount - used.spend);
        eligible = Math.min(amount, remaining);
      } else {
        remaining = Math.max(0, rule.cap.amount - used.cashback);
        eligible = rate > 0 ? Math.min(amount, (remaining * 100) / rate) : 0;
      }
      const overflow = amount - eligible;
      cashback = (eligible * rate) / 100 + (overflow * base) / 100;
      capped = overflow > 0.004;
    }

    // Per-transaction ceiling.
    let txnLimited = false;
    if (rule && rule.txnCap && rule.txnCap.tierAt != null) {
      const lim = amount >= rule.txnCap.tierAt ? rule.txnCap.above : rule.txnCap.below;
      if (lim >= 0 && cashback > lim) { cashback = lim; capped = true; txnLimited = true; }
    }

    // Card-wide cap and minimum-spend gate.
    let pending = false, shortfall = 0, cardRemaining = null;
    const potential = cashback;
    if (card.cardCap) {
      const u = cardCapUsage(card, dateStr) || { used: 0, spend: 0 };
      if (card.cardCap.minSpend > 0 && u.spend + amount < card.cardCap.minSpend) {
        // Nothing pays out until the cycle qualifies — show 0, keep the potential.
        pending = true;
        shortfall = card.cardCap.minSpend - (u.spend + amount);
        cashback = 0;
      } else if (card.cardCap.amount > 0) {
        cardRemaining = Math.max(0, card.cardCap.amount - u.used);
        if (cashback > cardRemaining) { cashback = cardRemaining; capped = true; }
      }
    }

    return { cashback, potential, rate, rule, capped, remaining, baseRate: base, txnLimited, pending, shortfall, cardRemaining };
  }

  function cardTotals(cardId) {
    const txns = state.transactions.filter((t) => t.cardId === cardId);
    const mk = todayStr().slice(0, 7);
    const m = txns.filter((t) => t.date.slice(0, 7) === mk);
    return {
      cashback: txns.reduce((s, t) => s + t._cb, 0),
      spent: txns.reduce((s, t) => s + t.amount, 0),
      monthCashback: m.reduce((s, t) => s + t._cb, 0),
      monthSpent: m.reduce((s, t) => s + t.amount, 0),
      count: txns.length
    };
  }

  // ---------------- sheet ----------------
  const sheetEl = document.getElementById("sheet");
  const backdropEl = document.getElementById("sheetBackdrop");
  let onSheetDismiss = null;

  function openSheet(html, dismissHandler) {
    sheetEl.innerHTML = '<div class="sheet-handle"></div>' + html;
    sheetEl.classList.add("open");
    backdropEl.classList.add("open");
    sheetEl.scrollTop = 0;
    sheetEl.style.transform = "";
    // Runs when the sheet is dismissed by gesture/backdrop rather than a button,
    // so a nested picker can hand control back instead of losing the parent sheet.
    onSheetDismiss = dismissHandler || null;
  }
  function closeSheet() {
    onSheetDismiss = null;
    sheetEl.classList.remove("open");
    backdropEl.classList.remove("open");
    sheetEl.style.transform = "";
  }
  function dismissSheet() {
    const cb = onSheetDismiss;
    onSheetDismiss = null;
    if (cb) { sheetEl.style.transform = ""; cb(); return; }
    closeSheet();
  }
  backdropEl.addEventListener("click", dismissSheet);

  /* Swipe down to dismiss. Only starts a drag when the sheet is already scrolled
     to the top, so the gesture never fights the sheet's own scrolling. */
  (() => {
    let startY = 0, delta = 0, dragging = false;
    sheetEl.addEventListener("touchstart", (e) => {
      if (sheetEl.scrollTop > 0 || e.touches.length !== 1) { dragging = false; return; }
      startY = e.touches[0].clientY;
      delta = 0;
      dragging = true;
      sheetEl.style.transition = "none";
    }, { passive: true });

    sheetEl.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      delta = e.touches[0].clientY - startY;
      if (delta < 0) { delta = 0; return; }
      sheetEl.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheetEl.style.transition = "";
      if (delta > 110) dismissSheet();
      else sheetEl.style.transform = "";
    };
    sheetEl.addEventListener("touchend", end);
    sheetEl.addEventListener("touchcancel", end);
  })();

  // ---------------- router ----------------
  const view = document.getElementById("view");
  const titleEl = document.getElementById("topbarTitle");
  const actionEl = document.getElementById("topbarAction");
  const tabbar = document.getElementById("tabbar");
  const TITLES = { home: "Overview", log: "New Purchase", cards: "My Cards", history: "Activity", mcc: "MCC Lookup", more: "Settings" };
  let tab = "home";
  let histFilter = "all";

  function go(t) {
    tab = t;
    titleEl.textContent = TITLES[t];
    [...tabbar.children].forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    render();
  }
  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest(".tab-btn");
    if (b) go(b.dataset.tab);
  });

  function render() {
    recompute();
    actionEl.hidden = tab !== "cards";
    ({ home: renderHome, log: renderLog, cards: renderCards, history: renderHistory, mcc: renderMccTab, more: renderMore }[tab])();
  }

  // ================= HOME =================
  function renderHome() {
    if (!state.cards.length) {
      view.innerHTML = `<div class="empty"><div class="ico">💳</div>
        No cards yet.<br>Open <b>Cards</b> → <b>Add Card</b> and pick your bank<br>to load its cash back categories automatically.</div>`;
      return;
    }
    const total = state.transactions.reduce((s, t) => s + t._cb, 0);
    const mk = todayStr().slice(0, 7);
    const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === mk);
    const mCb = mTx.reduce((s, t) => s + t._cb, 0);
    const mSp = mTx.reduce((s, t) => s + t.amount, 0);
    const effective = mSp > 0 ? (mCb / mSp) * 100 : 0;

    // Billing reminders
    const alerts = [];
    for (const c of state.cards) {
      if (c.statementDay) {
        const d = nextOccurrence(c.statementDay), n = daysUntil(d);
        if (n <= 10) alerts.push({ n, kind: "close", card: c, date: d });
      }
      if (c.dueDay) {
        const d = nextOccurrence(c.dueDay), n = daysUntil(d);
        if (n <= 10) alerts.push({ n, kind: "due", card: c, date: d });
      }
    }
    alerts.sort((a, b) => a.n - b.n);

    const alertsHtml = alerts.length
      ? `<div class="section-title">Upcoming</div>` + alerts.map((a) => `
        <div class="alert ${a.kind === "due" ? (a.n <= 5 ? "due-soon" : "") : (a.n <= 3 ? "close-soon" : "")}">
          <div class="ic">${a.kind === "due" ? "💸" : "📄"}</div>
          <div class="body">
            <div class="t1">${esc(a.card.name)}</div>
            <div class="t2">${a.kind === "due" ? "Payment due" : "Statement closes"} · ${a.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
          </div>
          <div class="cnt"><div class="n num">${a.n === 0 ? "today" : a.n}</div>${a.n === 0 ? "" : `<div class="u">day${a.n === 1 ? "" : "s"}</div>`}</div>
        </div>`).join("")
      : "";

    // Top MCC groups this month
    const byGroup = {};
    for (const t of mTx) {
      const g = mccInfo(t.mcc).groupId;
      (byGroup[g] || (byGroup[g] = { cb: 0, sp: 0 })).cb += t._cb;
      byGroup[g].sp += t.amount;
    }
    const top = Object.entries(byGroup).sort((a, b) => b[1].cb - a[1].cb).slice(0, 4);
    const topHtml = top.length
      ? `<div class="section-title">Top Categories · This Month</div>` + top.map(([g, v]) => `
        <div class="row">
          <div class="glyph">${groupIcon(g)}</div>
          <div class="body"><div class="t1">${esc(groupName(g))}</div><div class="t2">${money(v.sp)} spent</div></div>
          <div class="tail"><div class="a2 num" style="font-size:15px;">${money(v.cb)}</div></div>
        </div>`).join("")
      : "";

    const cardsHtml = [...state.cards]
      .sort((a, b) => cardTotals(b.id).cashback - cardTotals(a.id).cashback)
      .map((c) => {
        const t = cardTotals(c.id);
        return `<div class="cc" style="${gradStyle(c.gradient)}" data-action="open-card" data-id="${c.id}">
          <div class="cc-head">
            <div>
              ${c.issuer ? `<div class="cc-issuer">${esc(c.issuer)}</div>` : ""}
              <div class="cc-name">${esc(c.name)}</div>
            </div>
            <div class="cc-chip"></div>
          </div>
          <div class="cc-foot">
            <div>
              <div class="cc-k">Cash back earned</div>
              <div class="cc-v num">${money(t.cashback)}</div>
            </div>
            <div class="cc-last4 num">${c.last4 ? "•••• " + esc(c.last4) : ""}</div>
          </div>
        </div>`;
      }).join("");

    view.innerHTML = `
      <div class="hero">
        <div class="label">Total cash back</div>
        <div class="big num">${money(total)}</div>
        <div class="sub">
          <div class="item"><div class="k">This month</div><div class="v num">${money(mCb)}</div></div>
          <div class="item"><div class="k">Spent</div><div class="v num">${moneyShort(mSp)}</div></div>
          <div class="item"><div class="k">Effective</div><div class="v num">${effective.toFixed(2).replace(".", ",")}%</div></div>
        </div>
      </div>
      ${alertsHtml}
      <div class="section-title">Cards</div>
      <div class="card-stack">${cardsHtml}</div>
      ${topHtml}
    `;
  }

  // ================= LOG =================
  const draft = { cardId: null, mcc: null, amount: "", date: null, note: "" };

  function renderLog() {
    if (!state.cards.length) {
      view.innerHTML = `<div class="empty"><div class="ico">💳</div>Add a card first, then log purchases here.</div>`;
      return;
    }
    if (!draft.cardId || !getCard(draft.cardId)) draft.cardId = state.cards[0].id;
    if (!draft.date) draft.date = todayStr();

    const card = getCard(draft.cardId);
    // Offer only the categories this card actually pays on, plus a no-bonus catch-all.
    const cats = card.rules.map((r) => ({ key: r.id, mcc: ruleMcc(r), icon: ruleIcon(r), name: ruleLabel(r), rate: r.rate }));
    // Only pick a default when nothing is chosen yet. The category belongs to the
    // purchase, so switching cards must keep it — that's what makes comparing cards useful.
    if (!draft.mcc) {
      draft.mcc = cats.length ? cats.reduce((a, b) => (b.rate > a.rate ? b : a)).mcc : "0000";
    }
    const isOther = !cats.some((c) => c.mcc === draft.mcc);
    // An exact-MCC pick that earns no bonus still deserves its real name on the tile.
    const otherLabel = isOther && draft.mcc !== "0000" ? mccInfo(draft.mcc).name : "Other";
    const otherIcon = isOther && draft.mcc !== "0000" ? mccInfo(draft.mcc).icon : "•";

    view.innerHTML = `
      <div class="panel">
        <div class="field">
          <label>Amount</label>
          <div class="amount-input">
            <input id="f_amount" type="text" inputmode="numeric" placeholder="0" value="${esc(draft.amount)}" />
            <span class="cur">₫</span>
          </div>
        </div>
        <div class="field">
          <label>Card</label>
          <select id="f_card">
            ${state.cards.map((c) => `<option value="${c.id}" ${c.id === draft.cardId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Category</label>
          <div class="cat-grid">
            ${cats.map((c) => `
              <button type="button" class="cat-tile ${c.mcc === draft.mcc ? "sel" : ""}" data-pickmcc="${esc(c.mcc)}">
                <span class="ci">${c.icon}</span>
                <span class="cn">${esc(c.name)}</span>
                <span class="cr">${c.rate}%</span>
              </button>`).join("")}
            <button type="button" class="cat-tile other ${isOther ? "sel" : ""}" data-pickmcc="${isOther ? esc(draft.mcc) : "0000"}">
              <span class="ci">${otherIcon}</span>
              <span class="cn">${esc(otherLabel)}</span>
              <span class="cr">${card.baseRate > 0 ? card.baseRate + "%" : "no cash back"}</span>
            </button>
          </div>
          ${cats.length ? "" : `<div class="hint" style="margin-top:10px;">This card has no cash back categories yet. Open <b>Cards</b> → this card → <b>Add rule</b>.</div>`}
        </div>
        <div class="row-2">
          <div class="field"><label>Date</label><input id="f_date" type="date" value="${draft.date}" /></div>
          <div class="field"><label>Note</label><input id="f_note" type="text" placeholder="Optional" value="${esc(draft.note)}" /></div>
        </div>
        <button type="button" class="btn btn-ghost" id="mccPick" style="margin-top:2px;font-size:13px;">Pick an exact MCC instead ›</button>
      </div>
      <div id="pv"></div>
      <button class="btn btn-primary" id="saveTxn">Add Purchase</button>
      <button class="btn btn-ghost" id="bestCard">Which card is best for this?</button>
    `;

    const amtEl = document.getElementById("f_amount");
    const cardEl = document.getElementById("f_card");
    const dateEl = document.getElementById("f_date");
    const noteEl = document.getElementById("f_note");

    function sync() {
      draft.amount = amtEl.value;
      draft.cardId = cardEl.value;
      draft.date = dateEl.value || todayStr();
      draft.note = noteEl.value;
      preview();
    }
    function preview() {
      const card = getCard(draft.cardId);
      const amt = parseVnd(draft.amount);
      const pv = document.getElementById("pv");
      if (!card || amt <= 0) { pv.innerHTML = ""; return; }
      const q = quote(card, draft.mcc, amt, draft.date);
      const cls = q.pending ? "capped" : q.capped ? "capped" : q.rule ? "" : "base";
      let note;
      if (q.pending) {
        note = `This card needs ${money(card.cardCap.minSpend)} of spending per cycle before any cash back pays out. ` +
          `<b>${money(q.shortfall)}</b> more to go — this purchase would then be worth ${money(q.potential)}.`;
      } else if (!q.rule) {
        note = q.rate > 0
          ? `No cash back category on this card matches — earning the ${q.rate}% base rate.`
          : `This card pays no cash back on this category.`;
      } else if (q.txnLimited) {
        const lim = amt >= q.rule.txnCap.tierAt ? q.rule.txnCap.above : q.rule.txnCap.below;
        note = `<b>${esc(ruleLabel(q.rule))}</b> pays ${q.rate}%, but this card caps a single transaction at ${money(lim)} ` +
          `(purchases under ${money(q.rule.txnCap.tierAt)} cap at ${money(q.rule.txnCap.below)}).`;
      } else if (q.capped) {
        note = `Cap reached on <b>${esc(ruleLabel(q.rule))}</b>. Part of this purchase earns ${q.rate}%, the rest drops to the ${q.baseRate}% base rate.`;
      } else {
        const unit = PERIOD_LABEL[q.rule.cap ? q.rule.cap.period : "monthly"];
        note = `Matched <b>${esc(ruleLabel(q.rule))}</b> at ${q.rate}%.` +
          (q.remaining != null ? ` ${money(Math.max(0, q.remaining - (q.rule.cap.type === "spend" ? amt : q.cashback)))} of cap left this ${unit}.` : "");
      }
      pv.innerHTML = `<div class="preview ${cls}">
        <div class="pv-top">
          <span class="pv-amt num">${money(q.cashback)}</span>
          <span class="pv-rate">${q.pending ? "pending" : q.rate + "%" + (q.capped ? " (capped)" : "")}</span>
        </div>
        <div class="pv-note">${note}</div>
      </div>`;
    }

    wireMoneyInput(amtEl);
    amtEl.addEventListener("input", sync);
    // Switching card changes which categories exist, so re-render rather than just re-preview.
    cardEl.addEventListener("change", () => { draft.amount = amtEl.value; draft.note = noteEl.value; draft.cardId = cardEl.value; renderLog(); });
    dateEl.addEventListener("change", sync);
    noteEl.addEventListener("input", sync);
    view.querySelectorAll("[data-pickmcc]").forEach((b) => {
      b.addEventListener("click", () => {
        draft.amount = amtEl.value; draft.note = noteEl.value; draft.date = dateEl.value || todayStr();
        draft.mcc = b.dataset.pickmcc;
        renderLog();
      });
    });
    document.getElementById("mccPick").addEventListener("click", () => openMccPicker((code) => { draft.mcc = code; renderLog(); }));
    document.getElementById("bestCard").addEventListener("click", showBestCard);
    document.getElementById("saveTxn").addEventListener("click", () => {
      const card = getCard(draft.cardId);
      const amt = parseVnd(draft.amount);
      if (!card || !(amt > 0)) { toast("Enter an amount first"); return; }
      state.transactions.push({ id: uid(), cardId: card.id, mcc: draft.mcc, amount: amt, date: draft.date, note: draft.note.trim() });
      const recents = state.settings.recentMccs.filter((c) => c !== draft.mcc);
      recents.unshift(draft.mcc);
      state.settings.recentMccs = recents.slice(0, 8);
      save(); recompute();
      // Covers day one: the load-time check skips while there's no data to protect.
      runDailyBackup();
      const t = state.transactions[state.transactions.length - 1];
      toast(`+${money(t._cb)} cash back`);
      draft.amount = ""; draft.note = "";
      renderLog();
    });
    preview();
  }

  /* Ranks every card for the drafted purchase — the "which card do I pull out" answer. */
  function showBestCard() {
    const amt = parseVnd(draft.amount) || 1000000;
    const info = mccInfo(draft.mcc);
    const ranked = state.cards
      .map((c) => ({ card: c, q: quote(c, draft.mcc, amt, draft.date) }))
      .sort((a, b) => b.q.cashback - a.q.cashback);
    openSheet(`
      <h2>Best card for this</h2>
      <div class="sheet-sub">${esc(info.name)} · MCC ${esc(info.code)} · ${money(amt)}</div>
      ${ranked.map((r, i) => `
        <div class="row">
          <div class="glyph" style="background:linear-gradient(140deg,${grad(r.card.gradient)[0]},${grad(r.card.gradient)[1]});border:none;font-size:13px;font-weight:700;">${i === 0 ? "★" : i + 1}</div>
          <div class="body">
            <div class="t1">${esc(r.card.name)}</div>
            <div class="t2">${esc(ruleLabel(r.q.rule))} · ${r.q.rate}%${r.q.capped ? " · cap reached" : ""}</div>
          </div>
          <div class="tail"><div class="a2 num" style="font-size:16px;">${money(r.q.cashback)}</div></div>
        </div>`).join("")}
      <button class="btn btn-ghost" data-action="close-sheet">Close</button>
    `);
  }

  // ---------------- MCC picker ----------------
  function openMccPicker(onPick, opts) {
    opts = opts || {};
    const multi = !!opts.multi;
    let selected = new Set(opts.selected || []);

    function body(q) {
      q = (q || "").trim().toLowerCase();
      let html = "";
      if (!q && state.settings.recentMccs.length && !multi) {
        html += `<div class="mcc-group-title">Recent</div>`;
        html += state.settings.recentMccs.map((c) => mccRow(mccInfo(c), selected.has(c))).join("");
      }
      for (const g of MCC_GROUPS) {
        const hits = g.codes.filter(([code, name]) =>
          !q || code.includes(q) || name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q));
        if (!hits.length) continue;
        html += `<div class="mcc-group-title">${g.icon} ${esc(g.name)}</div>`;
        html += hits.map(([code, name]) =>
          mccRow({ code, name, groupName: g.name, icon: g.icon }, selected.has(code))).join("");
      }
      return html || `<div class="empty">No MCC matches that search.</div>`;
    }
    function mccRow(info, sel) {
      return `<div class="mcc-row ${sel ? "sel" : ""}" data-mcc="${info.code}">
        <span class="code num">${info.code}</span>
        <span class="nm">${esc(info.name)}<div class="gp">${esc(info.groupName)}</div></span>
        ${sel ? '<span style="color:var(--gold);font-size:17px;">✓</span>' : ""}
      </div>`;
    }

    const cancel = () => { if (opts.onCancel) opts.onCancel(); else closeSheet(); };

    openSheet(`
      <h2>${multi ? "Select MCC codes" : "Merchant category"}</h2>
      <div class="sticky-search"><input id="mccSearch" type="search" placeholder="Search name or code (e.g. 5812)" autocomplete="off" /></div>
      <div id="mccList">${body("")}</div>
      ${multi ? `<button class="btn btn-primary" id="mccDone" style="position:sticky;bottom:0;margin-top:14px;">Use ${selected.size} code(s)</button>` : ""}
      <button class="btn btn-ghost" id="mccCancel">Cancel</button>
    `, cancel);
    document.getElementById("mccCancel").addEventListener("click", cancel);

    const list = document.getElementById("mccList");
    const search = document.getElementById("mccSearch");
    search.addEventListener("input", () => { list.innerHTML = body(search.value); });
    list.addEventListener("click", (e) => {
      const row = e.target.closest(".mcc-row");
      if (!row) return;
      const code = row.dataset.mcc;
      if (multi) {
        selected.has(code) ? selected.delete(code) : selected.add(code);
        list.innerHTML = body(search.value);
        document.getElementById("mccDone").textContent = `Use ${selected.size} code(s)`;
      } else {
        closeSheet();
        onPick(code);
      }
    });
    if (multi) {
      document.getElementById("mccDone").addEventListener("click", () => {
        closeSheet();
        onPick([...selected]);
      });
    }
  }

  // ================= CARDS =================
  function renderCards() {
    if (!state.cards.length) {
      view.innerHTML = `<div class="empty"><div class="ico">💳</div>No cards yet.<br>Tap <b>Add</b> in the top right.</div>`;
      return;
    }
    const mk = todayStr().slice(0, 7);
    const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === mk);
    const monthCb = mTx.reduce((s, t) => s + t._cb, 0);
    const monthSp = mTx.reduce((s, t) => s + t.amount, 0);
    const lifetimeCb = state.transactions.reduce((s, t) => s + t._cb, 0);

    view.innerHTML = `
      <div class="hero" style="padding:20px;">
        <div class="label">All cards · ${monthLabel(mk)}</div>
        <div class="big num">${money(monthCb)}</div>
        <div class="sub">
          <div class="item"><div class="k">Spent</div><div class="v num">${moneyShort(monthSp)}</div></div>
          <div class="item"><div class="k">Purchases</div><div class="v num">${mTx.length}</div></div>
          <div class="item"><div class="k">Lifetime</div><div class="v num">${moneyShort(lifetimeCb)}</div></div>
        </div>
      </div>
      <div class="section-title">Your Cards</div>
      <div class="card-stack">${state.cards.map((c) => {
      const t = cardTotals(c.id);
      const best = c.rules.length ? Math.max(...c.rules.map((r) => r.rate)) : c.baseRate;
      return `<div class="cc" style="${gradStyle(c.gradient)}" data-action="open-card" data-id="${c.id}">
        <div class="cc-head">
          <div>
            ${c.issuer ? `<div class="cc-issuer">${esc(c.issuer)}</div>` : ""}
            <div class="cc-name">${esc(c.name)}</div>
          </div>
          <div class="cc-chip"></div>
        </div>
        <div class="cc-badge">up to ${best}%</div>
        <div class="cc-foot">
          <div>
            <div class="cc-k">This month</div>
            <div class="cc-v num">${money(t.monthCashback)}</div>
            <div class="cc-sub num">Lifetime ${money(t.cashback)}</div>
          </div>
          <div class="cc-last4 num">${c.last4 ? "•••• " + esc(c.last4) : ""}</div>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  function swatchesHtml(sel) {
    return `<div class="swatches" id="gradPick">${GRADIENT_KEYS.map((k) =>
      `<div class="swatch ${k === sel ? "sel" : ""}" style="${gradStyle(k)}" data-grad="${k}"></div>`).join("")}</div>`;
  }
  function wireSwatches() {
    const w = document.getElementById("gradPick");
    w.addEventListener("click", (e) => {
      const s = e.target.closest(".swatch");
      if (!s) return;
      [...w.children].forEach((c) => c.classList.remove("sel"));
      s.classList.add("sel");
    });
  }
  const pickedGrad = () => (document.querySelector("#gradPick .swatch.sel") || {}).dataset?.grad || GRADIENT_KEYS[0];

  /* showBase is off while adding a card — the base rate confuses the first-run
     flow and templates set it. It stays available when editing a card. */
  function cardFormFields(c, opts) {
    c = c || {};
    opts = opts || {};
    return `
      <div class="field"><label>Card Name</label><input id="c_name" type="text" placeholder="Visa Platinum" value="${esc(c.name || "")}" /></div>
      <div class="row-2">
        <div class="field"><label>Bank</label><input id="c_issuer" type="text" placeholder="Vietcombank" value="${esc(c.issuer || "")}" /></div>
        <div class="field"><label>Last 4</label><input id="c_last4" type="text" inputmode="numeric" maxlength="4" placeholder="4821" value="${esc(c.last4 || "")}" /></div>
      </div>
      <div class="row-2">
        <div class="field"><label>Statement Closes (day)</label><input id="c_stmt" type="number" min="1" max="31" placeholder="e.g. 18" value="${c.statementDay || ""}" /></div>
        <div class="field"><label>Payment Due (day)</label><input id="c_due" type="number" min="1" max="31" placeholder="e.g. 15" value="${c.dueDay || ""}" /></div>
      </div>
      <div class="hint">Day of the month, 1–31. Used for the reminders on your Overview screen.</div>
      ${opts.showBase ? `
        <div class="field">
          <label>Base Rate — everything else (%)</label>
          <input id="c_base" type="number" step="0.01" min="0" value="${c.baseRate != null ? c.baseRate : 0}" />
        </div>
        <div class="hint">Leave at 0 if the card only pays on its bonus categories.</div>
      ` : ""}
      <div class="field"><label>Card Colour</label>${swatchesHtml(c.gradient || GRADIENT_KEYS[state.cards.length % GRADIENT_KEYS.length])}</div>
    `;
  }
  function readCardForm(existing) {
    const baseEl = document.getElementById("c_base");
    return {
      name: document.getElementById("c_name").value.trim(),
      issuer: document.getElementById("c_issuer").value.trim(),
      last4: document.getElementById("c_last4").value.trim().slice(0, 4),
      baseRate: baseEl ? (parseFloat(baseEl.value) || 0) : ((existing && existing.baseRate) || 0),
      statementDay: parseInt(document.getElementById("c_stmt").value, 10) || null,
      dueDay: parseInt(document.getElementById("c_due").value, 10) || null,
      gradient: pickedGrad()
    };
  }

  // ---------------- add card: bank → product → details ----------------
  function openAddCard() {
    function bankList(q) {
      q = (q || "").trim().toLowerCase();
      const hits = VN_BANKS.filter((b) => !q || b.name.toLowerCase().includes(q) ||
        b.cards.some((c) => c[0].toLowerCase().includes(q)));
      if (!hits.length) return `<div class="empty">No bank matches that search.</div>`;
      return hits.map((b) => `
        <div class="row" data-bank="${b.id}">
          <div class="glyph" style="background:linear-gradient(140deg,${grad(b.grad)[0]},${grad(b.grad)[1]});border:none;font-size:13px;font-weight:700;">${esc(b.name.slice(0, 2).toUpperCase())}</div>
          <div class="body"><div class="t1">${esc(b.name)}</div><div class="t2">${b.cards.length} card${b.cards.length === 1 ? "" : "s"}</div></div>
          <div class="chev" style="color:var(--text-3);font-size:19px;">›</div>
        </div>`).join("");
    }

    openSheet(`
      <h2>Choose your bank</h2>
      <div class="sheet-sub">Pick a card to prefill its cash back categories, or build one from scratch.</div>
      <div class="sticky-search"><input id="bankSearch" type="search" placeholder="Search bank or card" autocomplete="off" /></div>
      <div id="bankList">${bankList("")}</div>
      <button class="btn btn-secondary" id="blankCard" style="margin-top:14px;">Build a card from scratch</button>
    `);
    const listEl = document.getElementById("bankList");
    const searchEl = document.getElementById("bankSearch");
    searchEl.addEventListener("input", () => { listEl.innerHTML = bankList(searchEl.value); });
    listEl.addEventListener("click", (e) => {
      const row = e.target.closest("[data-bank]");
      if (row) openBankCards(row.dataset.bank);
    });
    document.getElementById("blankCard").addEventListener("click", () => openCardDetailsForm(null, null));
  }

  function openBankCards(bankId) {
    const bank = VN_BANKS.find((b) => b.id === bankId);
    if (!bank) return;
    openSheet(`
      <h2>${esc(bank.name)}</h2>
      <div class="sheet-sub">Templates are starting points — check your card's real terms and edit the rates after.</div>
      ${bank.note ? `<div class="hint" style="margin:-8px 0 14px;">${esc(bank.note)}</div>` : ""}
      ${bank.cards.map((c, i) => {
        const first = (c.rules || [])[0];
        const icon = first ? (first.g ? groupIcon(first.g) : mccInfo(first.mcc[0]).icon) : "✎";
        return `<div class="row" data-cardidx="${i}">
          <div class="glyph">${icon}</div>
          <div class="body"><div class="t1">${esc(c.name)}</div><div class="t2">${esc(c.sub || "")}</div></div>
          <div class="chev" style="color:var(--text-3);font-size:19px;">›</div>
        </div>`;
      }).join("")}
      <button class="btn btn-ghost" id="backBanks">‹ Back to banks</button>
    `);
    document.getElementById("backBanks").addEventListener("click", openAddCard);
    sheetEl.addEventListener("click", function onPick(e) {
      const row = e.target.closest("[data-cardidx]");
      if (!row) return;
      sheetEl.removeEventListener("click", onPick);
      openCardDetailsForm(bank, bank.cards[Number(row.dataset.cardidx)]);
    });
  }

  function openCardDetailsForm(bank, entry) {
    // Keep cards visually distinct: if the bank's house colour is already on another
    // card, offer the next unused one instead.
    const used = new Set(state.cards.map((c) => c.gradient));
    let gradient = bank ? bank.grad : GRADIENT_KEYS[state.cards.length % GRADIENT_KEYS.length];
    if (used.has(gradient)) {
      gradient = GRADIENT_KEYS.find((k) => !used.has(k)) || gradient;
    }
    const seed = {
      name: entry ? entry.name : "",
      issuer: bank ? (bank.id === "custom" ? "" : bank.name) : "",
      gradient
    };
    const rules = entry ? (entry.rules || []) : [];
    const cardCap = entry && entry.cardCap ? entry.cardCap : null;

    openSheet(`
      <h2>Card details</h2>
      <div class="sheet-sub">${rules.length ? "Cash back categories will be prefilled — edit them any time." : "You can add cash back categories next."}</div>
      ${cardFormFields(seed, { showBase: false })}
      ${rules.length ? `<div class="section-title">Prefilled categories</div>
        ${rules.map((r) => {
          const icon = r.g ? groupIcon(r.g) : mccInfo(r.mcc[0]).icon;
          const scope = r.g ? groupName(r.g) : (r.mcc || []).join(", ");
          return `<div class="row"><div class="glyph">${icon}</div>
            <div class="body"><div class="t1">${esc(r.label || scope)}</div>
            <div class="t2">${esc(scope)}${r.cap ? " · cap " + money(r.cap[0]) + "/" + PERIOD_LABEL[r.cap[2]] : ""}</div></div>
            <div class="tail"><div class="a1" style="color:var(--gold);">${r.rate}%</div></div></div>`;
        }).join("")}` : ""}
      ${cardCap ? `<div class="section-title">Card-wide limits</div>
        <div class="panel" style="margin-bottom:0;">
          <div style="font-size:13.5px;line-height:1.6;color:var(--text-2);">
            Max ${money(cardCap[0])} cash back per ${PERIOD_LABEL[cardCap[1]] === "mo" ? "month" : PERIOD_LABEL[cardCap[1]]}
            ${cardCap[2] ? `<br>Requires ${money(cardCap[2])} of spending per cycle to qualify` : ""}
          </div>
        </div>` : ""}
      ${entry && entry.tips && entry.tips.length ? `<div class="section-title">Good to know</div>
        <div class="panel" style="margin-bottom:0;">
          <ul class="tips">${entry.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </div>` : ""}
      ${rules.length || cardCap ? `<div class="hint" style="margin-top:14px;">Checked in August 2026, but issuers change terms often — confirm against your own card agreement and edit anything that differs.</div>` : ""}
      <button class="btn btn-primary" id="doAdd">Add Card</button>
      <button class="btn btn-ghost" id="backBanks2">‹ Back</button>
    `);
    wireSwatches();
    document.getElementById("backBanks2").addEventListener("click", () => (bank ? openBankCards(bank.id) : openAddCard()));
    document.getElementById("doAdd").addEventListener("click", () => {
      const f = readCardForm();
      if (!f.name) { toast("Give the card a name"); return; }
      const built = entry ? buildFromCatalog(entry, uid) : { baseRate: 0, rules: [], cardCap: null };
      const card = Object.assign({ id: uid() }, f, {
        baseRate: built.baseRate,
        rules: built.rules,
        cardCap: built.cardCap
      });
      state.cards.push(card);
      save();
      takeSnapshot("card-added");
      toast("Card added");
      render();
      openCardDetail(card.id);
    });
  }

  function openCardDetail(id) {
    const card = getCard(id);
    if (!card) return;
    recompute();
    const t = cardTotals(id);
    const stmt = card.statementDay ? nextOccurrence(card.statementDay) : null;
    const due = card.dueDay ? nextOccurrence(card.dueDay) : null;

    const rulesHtml = card.rules.length
      ? card.rules.map((r) => {
          let barHtml = "", meta;
          if (r.cap && r.cap.amount > 0) {
            const used = capUsage(card, r, todayStr());
            const cur = r.cap.type === "spend" ? used.spend : used.cashback;
            const pct = Math.min(100, (cur / r.cap.amount) * 100);
            const cls = pct >= 100 ? "full" : pct >= 75 ? "warn" : "";
            meta = `${r.cap.type === "spend" ? "Spend" : "Cash back"} cap ${money(r.cap.amount)} / ${PERIOD_LABEL[r.cap.period]} · ${money(cur)} used`;
            barHtml = `<div class="bar ${cls}"><i style="width:${pct}%"></i></div>`;
          } else {
            meta = "No cap";
          }
          const scope = r.kind === "group"
            ? `${groupIcon(r.groupId)} ${groupName(r.groupId)}`
            : `${(r.mccCodes || []).length} MCC code${(r.mccCodes || []).length === 1 ? "" : "s"}`;
          return `<div class="cap-item" data-action="edit-rule" data-cardid="${card.id}" data-ruleid="${r.id}">
            <div class="cap-head"><span class="cap-name">${esc(ruleLabel(r))}</span><span class="cap-rate num">${r.rate}%</span></div>
            <div class="cap-meta">${esc(scope)}</div>
            <div class="cap-meta">${meta}</div>
            ${barHtml}
          </div>`;
        }).join("")
      : `<div class="empty" style="padding:26px 12px;">No bonus rules yet.<br>Everything earns the ${card.baseRate}% base rate.</div>`;

    openSheet(`
      <div class="cc" style="${gradStyle(card.gradient)};margin-bottom:18px;">
        <div class="cc-head">
          <div>${card.issuer ? `<div class="cc-issuer">${esc(card.issuer)}</div>` : ""}
          <div class="cc-name">${esc(card.name)}</div></div>
          <div class="cc-chip"></div>
        </div>
        <div class="cc-foot">
          <div><div class="cc-k">Cash back earned</div><div class="cc-v num">${money(t.cashback)}</div></div>
          <div class="cc-last4 num">${card.last4 ? "•••• " + esc(card.last4) : ""}</div>
        </div>
      </div>

      <div class="stat-2">
        <div class="stat"><div class="k">Total spent</div><div class="v num">${money(t.spent)}</div></div>
        <div class="stat"><div class="k">This month</div><div class="v mint num">${money(t.monthCashback)}</div></div>
      </div>

      ${(stmt || due) ? `<div class="section-title">Billing Cycle</div>
        ${stmt ? `<div class="alert"><div class="ic">📄</div><div class="body"><div class="t1">Statement closes</div>
          <div class="t2">${stmt.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })}</div></div>
          <div class="cnt"><div class="n num">${daysUntil(stmt)}</div><div class="u">days</div></div></div>` : ""}
        ${due ? `<div class="alert ${daysUntil(due) <= 5 ? "due-soon" : ""}"><div class="ic">💸</div><div class="body"><div class="t1">Payment due</div>
          <div class="t2">${due.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })}</div></div>
          <div class="cnt"><div class="n num">${daysUntil(due)}</div><div class="u">days</div></div></div>` : ""}` : ""}

      ${card.cardCap ? (() => {
        const u = cardCapUsage(card, todayStr()) || { used: 0, spend: 0 };
        const unit = card.cardCap.period === "monthly" ? "month" : PERIOD_LABEL[card.cardCap.period];
        let html = `<div class="section-title">Card-wide Limit</div>`;
        if (card.cardCap.minSpend > 0) {
          const pct = Math.min(100, (u.spend / card.cardCap.minSpend) * 100);
          const met = u.spend >= card.cardCap.minSpend;
          html += `<div class="cap-item">
            <div class="cap-head"><span class="cap-name">Minimum spend to qualify</span>
              <span class="cap-rate" style="color:${met ? "var(--mint)" : "var(--amber)"}">${met ? "met" : money(card.cardCap.minSpend - u.spend) + " to go"}</span></div>
            <div class="cap-meta">${money(u.spend)} of ${money(card.cardCap.minSpend)} this ${unit}</div>
            <div class="bar ${met ? "" : "warn"}"><i style="width:${pct}%"></i></div>
          </div>`;
        }
        if (card.cardCap.amount > 0) {
          const pct = Math.min(100, (u.used / card.cardCap.amount) * 100);
          html += `<div class="cap-item">
            <div class="cap-head"><span class="cap-name">Total cash back cap</span>
              <span class="cap-rate">${money(card.cardCap.amount)}</span></div>
            <div class="cap-meta">${money(u.used)} used this ${unit}</div>
            <div class="bar ${pct >= 100 ? "full" : pct >= 75 ? "warn" : ""}"><i style="width:${pct}%"></i></div>
          </div>`;
        }
        return html;
      })() : ""}

      <div class="section-title">Bonus Rules <span class="link" data-action="add-rule" data-cardid="${card.id}">+ Add rule</span></div>
      ${rulesHtml}

      <div class="divider"></div>
      <div class="section-title" style="margin-top:0;">Card Settings</div>
      ${cardFormFields(card, { showBase: true })}
      <button class="btn btn-primary" data-action="save-card" data-id="${card.id}">Save Changes</button>
      <button class="btn btn-danger" data-action="delete-card" data-id="${card.id}">Delete Card</button>
      <button class="btn btn-ghost" data-action="close-sheet">Close</button>
    `);
    wireSwatches();
  }

  // ---------------- rule editor ----------------
  function openRuleEditor(cardId, ruleId) {
    const card = getCard(cardId);
    if (!card) return;
    const rule = ruleId ? card.rules.find((r) => r.id === ruleId) : null;
    const draftRule = rule
      ? JSON.parse(JSON.stringify(rule))
      : { id: uid(), kind: "group", groupId: "dining", mccCodes: [], label: "", rate: 3, cap: null };
    // Tracked separately from draftRule.cap: the cap inputs don't exist until the
    // section is switched on, so we can't infer "enabled" from the amount.
    let capEnabled = !!(draftRule.cap && draftRule.cap.amount > 0);

    function paint() {
      const capOn = capEnabled;
      const cap = draftRule.cap || { type: "cashback", amount: 500000, period: "monthly" };
      openSheet(`
        <h2>${rule ? "Edit Rule" : "New Rule"}</h2>
        <div class="sheet-sub">${esc(card.name)}</div>

        <div class="field">
          <label>Applies To</label>
          <select id="r_kind">
            <option value="group" ${draftRule.kind === "group" ? "selected" : ""}>A whole MCC category group</option>
            <option value="mcc" ${draftRule.kind === "mcc" ? "selected" : ""}>Specific MCC codes</option>
          </select>
        </div>

        ${draftRule.kind === "group" ? `
          <div class="field">
            <label>Category Group</label>
            <select id="r_group">
              ${MCC_GROUPS.map((g) => `<option value="${g.id}" ${g.id === draftRule.groupId ? "selected" : ""}>${g.icon}  ${esc(g.name)}</option>`).join("")}
            </select>
          </div>
          <div class="mcc-covers">
            <div class="mcc-covers-h">This category covers these MCC codes</div>
            <div class="mcc-covers-list">
              ${(MCC_GROUPS.find((g) => g.id === draftRule.groupId) || { codes: [] }).codes
                .map(([c, n]) => `<div class="mcc-cover"><span class="cc-code num">${c}</span><span class="cc-name">${esc(n)}</span></div>`).join("")}
            </div>
          </div>
        ` : `
          <div class="field">
            <label>MCC Codes</label>
            <button class="picker-btn" id="r_mccBtn" type="button">
              <span class="glyph">#</span>
              <span class="body">
                <span class="t1">${draftRule.mccCodes.length ? draftRule.mccCodes.join(", ") : "Choose codes"}</span>
                <span class="t2">${draftRule.mccCodes.length} selected</span>
              </span>
              <span class="chev">›</span>
            </button>
          </div>
          ${draftRule.mccCodes.length ? `<div class="mcc-covers">
            <div class="mcc-covers-h">Selected codes</div>
            <div class="mcc-covers-list">
              ${draftRule.mccCodes.map((c) => `<div class="mcc-cover"><span class="cc-code num">${esc(c)}</span><span class="cc-name">${esc(mccInfo(c).name)}</span></div>`).join("")}
            </div>
          </div>` : `<div class="hint">Use this when a card bonuses only certain merchants, not the whole group.</div>`}
        `}

        <div class="row-2">
          <div class="field"><label>Rate (%)</label><input id="r_rate" type="number" step="0.01" min="0" value="${draftRule.rate}" /></div>
          <div class="field"><label>Label (optional)</label><input id="r_label" type="text" placeholder="auto" value="${esc(draftRule.label || "")}" /></div>
        </div>

        <div class="field">
          <label>Cap</label>
          <select id="r_capOn">
            <option value="0" ${!capOn ? "selected" : ""}>No cap — unlimited</option>
            <option value="1" ${capOn ? "selected" : ""}>Limit this rule</option>
          </select>
        </div>

        ${capOn ? `
          <div class="field">
            <label>Cap Type</label>
            <select id="r_capType">
              <option value="cashback" ${cap.type === "cashback" ? "selected" : ""}>Max cash back earned (₫)</option>
              <option value="spend" ${cap.type === "spend" ? "selected" : ""}>Max spend at bonus rate (₫)</option>
            </select>
          </div>
          <div class="row-2">
            <div class="field"><label>Cap Amount (₫)</label><input id="r_capAmt" type="text" inputmode="numeric" value="${formatVnd(cap.amount)}" /></div>
            <div class="field"><label>Resets</label>
              <select id="r_capPeriod">
                <option value="monthly" ${cap.period === "monthly" ? "selected" : ""}>Every month</option>
                <option value="quarterly" ${cap.period === "quarterly" ? "selected" : ""}>Every quarter</option>
                <option value="yearly" ${cap.period === "yearly" ? "selected" : ""}>Every year</option>
              </select>
            </div>
          </div>
          <div class="hint">Once the cap is hit, extra spend automatically falls back to the ${card.baseRate}% base rate.</div>
        ` : ""}

        <button class="btn btn-primary" id="r_save">${rule ? "Save Rule" : "Add Rule"}</button>
        ${rule ? `<button class="btn btn-danger" id="r_del">Delete Rule</button>` : ""}
        <button class="btn btn-ghost" id="r_cancel">Cancel</button>
      `);

      function readInputs() {
        draftRule.rate = parseFloat(document.getElementById("r_rate").value) || 0;
        draftRule.label = document.getElementById("r_label").value.trim();
        if (draftRule.kind === "group") {
          const g = document.getElementById("r_group");
          if (g) draftRule.groupId = g.value;
        }
        capEnabled = document.getElementById("r_capOn").value === "1";
        const typeEl = document.getElementById("r_capType");
        const amtEl = document.getElementById("r_capAmt");
        const perEl = document.getElementById("r_capPeriod");
        if (capEnabled && typeEl && amtEl && perEl) {
          draftRule.cap = { type: typeEl.value, amount: parseVnd(amtEl.value), period: perEl.value };
        } else if (capEnabled && !draftRule.cap) {
          draftRule.cap = { type: "cashback", amount: 500000, period: "monthly" };
        }
      }

      document.getElementById("r_kind").addEventListener("change", (e) => {
        readInputs();
        draftRule.kind = e.target.value;
        paint();
      });
      document.getElementById("r_capOn").addEventListener("change", () => {
        readInputs();
        paint();
      });
      ["r_capType", "r_capPeriod"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("change", readInputs);
      });
      // Repaint on group change so the "covers these MCC codes" list stays in sync.
      const groupEl = document.getElementById("r_group");
      if (groupEl) groupEl.addEventListener("change", () => { readInputs(); paint(); });
      wireMoneyInput(document.getElementById("r_capAmt"));
      const mccBtn = document.getElementById("r_mccBtn");
      if (mccBtn) {
        mccBtn.addEventListener("click", () => {
          readInputs();
          openMccPicker((codes) => { draftRule.mccCodes = codes; paint(); },
            { multi: true, selected: draftRule.mccCodes, onCancel: () => paint() });
        });
      }

      document.getElementById("r_save").addEventListener("click", () => {
        readInputs();
        if (draftRule.kind === "mcc" && !draftRule.mccCodes.length) { toast("Pick at least one MCC code"); return; }
        if (!capEnabled || !(draftRule.cap && draftRule.cap.amount > 0)) draftRule.cap = null;
        if (!draftRule.label) draftRule.label = draftRule.kind === "group" ? groupName(draftRule.groupId) : "Custom MCCs";
        if (rule) Object.assign(rule, draftRule);
        else card.rules.push(draftRule);
        save();
        toast("Rule saved");
        render();
        openCardDetail(card.id);
      });
      const del = document.getElementById("r_del");
      if (del) del.addEventListener("click", () => {
        if (!confirm("Delete this rule?")) return;
        card.rules = card.rules.filter((r) => r.id !== rule.id);
        save(); toast("Rule deleted"); render(); openCardDetail(card.id);
      });
      document.getElementById("r_cancel").addEventListener("click", () => openCardDetail(card.id));
    }
    paint();
  }

  // ================= HISTORY =================
  function renderHistory() {
    if (!state.transactions.length) {
      view.innerHTML = `<div class="empty"><div class="ico">🧾</div>Nothing logged yet.<br>Add a purchase from the <b>Log</b> tab.</div>`;
      return;
    }
    const chips = `<div class="chips">
      <button class="chip ${histFilter === "all" ? "active" : ""}" data-action="filter" data-id="all">All cards</button>
      ${state.cards.map((c) => `<button class="chip ${histFilter === c.id ? "active" : ""}" data-action="filter" data-id="${c.id}">${esc(c.name)}</button>`).join("")}
    </div>`;

    const list = state.transactions
      .filter((t) => histFilter === "all" || t.cardId === histFilter)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));

    if (!list.length) return void (view.innerHTML = chips + `<div class="empty">No purchases on this card yet.</div>`);

    let html = chips, lastMonth = null;
    for (const t of list) {
      const mk = t.date.slice(0, 7);
      if (mk !== lastMonth) {
        const mTx = list.filter((x) => x.date.slice(0, 7) === mk);
        html += `<div class="section-title">${monthLabel(mk)}
          <span class="link num">${money(mTx.reduce((s, x) => s + x._cb, 0))}</span></div>`;
        lastMonth = mk;
      }
      const card = getCard(t.cardId);
      const info = mccInfo(t.mcc);
      html += `<div class="row" data-action="open-txn" data-id="${t.id}">
        <div class="glyph">${info.icon}</div>
        <div class="body">
          <div class="t1">${esc(t.note || info.name)}${t._pending ? '<span class="tag pend">PENDING</span>' : t._capped ? '<span class="tag cap">CAP</span>' : ""}</div>
          <div class="t2">${card ? esc(card.name) : "Deleted card"} · ${dateLabel(t.date)} <span class="tag mcc">${esc(t.mcc)}</span></div>
        </div>
        <div class="tail">
          <div class="a1 num">${money(t.amount)}</div>
          <div class="a2 num" ${t._pending ? 'style="color:var(--amber)"' : ""}>${t._pending ? "min spend not met" : "+" + money(t._cb) + " · " + t._rate + "%"}</div>
        </div>
      </div>`;
    }
    view.innerHTML = html;
  }

  function openTxn(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return;
    let mcc = t.mcc;
    function paint() {
      const info = mccInfo(mcc);
      openSheet(`
        <h2>Edit Purchase</h2>
        <div class="sheet-sub">Earned ${money(t._cb)} at ${t._rate}%</div>
        <div class="field">
          <label>Amount</label>
          <div class="amount-input"><input id="e_amount" type="text" inputmode="numeric" value="${formatVnd(t.amount)}" /><span class="cur">₫</span></div>
        </div>
        <div class="field">
          <label>Merchant Category (MCC)</label>
          <button class="picker-btn" id="e_mcc" type="button">
            <span class="glyph">${info.icon}</span>
            <span class="body"><span class="t1">${esc(info.name)}</span><span class="t2">MCC ${esc(info.code)} · ${esc(info.groupName)}</span></span>
            <span class="chev">›</span>
          </button>
        </div>
        <div class="field"><label>Card</label>
          <select id="e_card">${state.cards.map((c) => `<option value="${c.id}" ${c.id === t.cardId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
        </div>
        <div class="row-2">
          <div class="field"><label>Date</label><input id="e_date" type="date" value="${t.date}" /></div>
          <div class="field"><label>Note</label><input id="e_note" type="text" value="${esc(t.note || "")}" /></div>
        </div>
        <button class="btn btn-primary" id="e_save">Save Changes</button>
        <button class="btn btn-danger" id="e_del">Delete Purchase</button>
        <button class="btn btn-ghost" data-action="close-sheet">Cancel</button>
      `);
      wireMoneyInput(document.getElementById("e_amount"));
      document.getElementById("e_mcc").addEventListener("click", () => {
        t.amount = parseVnd(document.getElementById("e_amount").value) || t.amount;
        // Cancelling must return to the edit sheet, not throw the whole edit away.
        openMccPicker((code) => { mcc = code; paint(); }, { onCancel: () => paint() });
      });
      document.getElementById("e_save").addEventListener("click", () => {
        const amt = parseVnd(document.getElementById("e_amount").value);
        if (!(amt > 0)) { toast("Enter a valid amount"); return; }
        t.amount = amt;
        t.mcc = mcc;
        t.cardId = document.getElementById("e_card").value;
        t.date = document.getElementById("e_date").value || t.date;
        t.note = document.getElementById("e_note").value.trim();
        save(); closeSheet(); toast("Purchase updated"); render();
      });
      document.getElementById("e_del").addEventListener("click", () => {
        if (!confirm("Delete this purchase?")) return;
        state.transactions = state.transactions.filter((x) => x.id !== t.id);
        save(); closeSheet(); toast("Purchase deleted"); render();
      });
    }
    paint();
  }

  // ================= MCC LOOKUP =================
  let mccQuery = "";
  let mccOpenGroup = null;

  /* Which of your cards pays the most on a given MCC — the practical question
     behind "what MCC is this merchant?". */
  function bestCardFor(mcc) {
    if (!state.cards.length) return null;
    const ranked = state.cards
      .map((c) => ({ card: c, q: quote(c, mcc, 1000000, todayStr()) }))
      .sort((a, b) => b.q.cashback - a.q.cashback);
    return ranked[0].q.rate > 0 ? ranked[0] : null;
  }

  function renderMccTab() {
    const q = mccQuery.trim().toLowerCase();
    let body = "";

    if (q) {
      const hits = [];
      for (const g of MCC_GROUPS) {
        for (const [code, name] of g.codes) {
          if (code.includes(q) || name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)) {
            hits.push({ code, name, group: g });
          }
        }
      }
      body = hits.length
        ? hits.map((h) => mccResultRow(h.code, h.name, h.group)).join("")
        : `<div class="empty">No MCC matches “${esc(mccQuery)}”.<br>Try a merchant type like “hotel” or a code like “5812”.</div>`;
    } else {
      body = MCC_GROUPS.map((g) => `
        <div class="mcc-group ${mccOpenGroup === g.id ? "open" : ""}">
          <button class="mcc-group-head" data-group="${g.id}">
            <span class="gi">${g.icon}</span>
            <span class="gn">${esc(g.name)}</span>
            <span class="gc num">${g.codes.length}</span>
            <span class="gx">${mccOpenGroup === g.id ? "−" : "+"}</span>
          </button>
          ${mccOpenGroup === g.id ? `<div class="mcc-group-body">${g.codes.map(([c, n]) => mccResultRow(c, n, g)).join("")}</div>` : ""}
        </div>`).join("");
    }

    view.innerHTML = `
      <div class="sticky-search" style="background:linear-gradient(180deg,var(--bg) 70%,transparent);padding-top:2px;">
        <input id="mccTabSearch" type="search" placeholder="Search merchant type or MCC code" value="${esc(mccQuery)}" autocomplete="off" />
      </div>
      <div class="hint" style="margin:2px 4px 12px;">
        Merchant Category Codes decide which cash back rule a purchase hits. Look one up to see
        which of your cards pays best on it.
      </div>
      ${body}
    `;

    const s = document.getElementById("mccTabSearch");
    s.addEventListener("input", () => {
      mccQuery = s.value;
      const pos = s.selectionStart;
      renderMccTab();
      const ns = document.getElementById("mccTabSearch");
      ns.focus();
      try { ns.setSelectionRange(pos, pos); } catch (e) {}
    });
    view.querySelectorAll("[data-group]").forEach((b) => {
      b.addEventListener("click", () => {
        mccOpenGroup = mccOpenGroup === b.dataset.group ? null : b.dataset.group;
        renderMccTab();
      });
    });
  }

  function mccResultRow(code, name, group) {
    const best = bestCardFor(code);
    return `<div class="row row-mcc">
      <div class="glyph">${group.icon}</div>
      <div class="body">
        <div class="t1">${esc(name)}</div>
        <div class="t2">${best
          ? `<b style="color:var(--mint)">${best.q.rate}%</b> on ${esc(best.card.name)}`
          : state.cards.length ? "No cash back on your cards" : esc(group.name)}</div>
      </div>
      <div class="mcc-code num">${esc(code)}</div>
    </div>`;
  }

  // ================= MORE / SETTINGS =================
  function renderMore() {
    const totalCb = state.transactions.reduce((s, t) => s + t._cb, 0);
    const snaps = loadSnapshots();
    view.innerHTML = `
      <div class="panel">
        <div class="stat-2">
          <div class="stat"><div class="k">Cards</div><div class="v num">${state.cards.length}</div></div>
          <div class="stat"><div class="k">Purchases</div><div class="v num">${state.transactions.length}</div></div>
        </div>
        <div class="stat" style="margin-top:11px;"><div class="k">Lifetime cash back</div><div class="v mint num">${money(totalCb)}</div></div>
      </div>

      <div class="section-title">Reminders</div>
      <div class="panel">
        <div class="hint" style="margin:0 0 14px;">iOS only delivers web notifications while this app is installed to your Home Screen. For alerts that fire even when the app is closed, export your billing dates to the iPhone Calendar — that's the reliable route.</div>
        <button class="btn btn-secondary" data-action="export-ics">Add Billing Dates to Calendar</button>
        <button class="btn btn-secondary" data-action="enable-notif">Enable In-App Notifications</button>
      </div>

      <div class="section-title">Automatic Backup</div>
      <div class="panel">
        <label class="toggle-row">
          <span>
            <span class="tr-t1">Daily auto-backup</span>
            <span class="tr-t2">Saves a snapshot on this device once a day</span>
          </span>
          <input type="checkbox" id="autoBackupToggle" ${state.settings.autoBackup ? "checked" : ""} />
        </label>
        <div class="hint" style="margin:12px 0 14px;">
          A browser can't write files to your phone on a timer — that always needs a tap.
          So the app keeps ${MAX_SNAPSHOTS} rolling snapshots on-device automatically, and you save a
          real file to Files with one tap below.
        </div>
        <button class="btn btn-primary" data-action="save-file">Save Backup File Now</button>
        <button class="btn btn-secondary" data-action="view-snapshots" style="margin-top:10px;">
          Restore a Snapshot (${snaps.length})
        </button>
        <label class="btn btn-secondary" style="margin-top:10px;">Import Backup File
          <input type="file" id="importFile" accept="application/json,.json" hidden />
        </label>
        <div class="hint" style="margin:12px 0 0;text-align:center;">
          ${state.settings.lastSavedDate ? "Last file saved " + esc(state.settings.lastSavedDate) : "No backup file saved yet"}
        </div>
      </div>

      <div class="section-title">Version</div>
      <div class="panel">
        <div class="toggle-row" style="margin-bottom:14px;">
          <span>
            <span class="tr-t1">Cashback Tracker v${APP_VERSION}</span>
            <span class="tr-t2" id="persistState">Checking storage protection…</span>
          </span>
        </div>
        <button class="btn btn-secondary" data-action="check-update">Check for Updates</button>
        <div class="hint" style="margin:12px 0 0;">
          Updating from inside the app replaces the code only — your cards and history stay put.
          You never need to delete the app to get a new version.
        </div>
      </div>

      <div class="section-title">Keep Your Data Safe</div>
      <div class="panel warn-panel">
        <div style="font-size:13.5px;line-height:1.65;color:var(--text-2);">
          Your history lives in Safari's storage for this site. It survives app updates and restarts,
          but it is <b style="color:var(--rose)">permanently erased</b> if you:
          <ul class="tips" style="margin-top:9px;">
            <li>delete the app from the Home Screen</li>
            <li>clear Website Data in Settings → Safari</li>
            <li>reset or change phones</li>
          </ul>
          Export a backup file now and then — that file is the only thing that survives all three.
        </div>
      </div>

      <div class="section-title">Danger Zone</div>
      <button class="btn btn-danger" data-action="wipe">Erase All Data</button>
      <div class="hint" style="text-align:center;margin-top:20px;">Cashback Tracker v${APP_VERSION} · data stored locally on this device</div>
    `;
    document.getElementById("importFile").addEventListener("change", onImport);
    requestPersistentStorage().then((ok) => {
      const el = document.getElementById("persistState");
      if (!el) return;
      el.textContent = ok === true
        ? "Storage protected from automatic cleanup"
        : ok === false
          ? "iOS may clear storage if unused — back up regularly"
          : "Storage protection unavailable on this browser";
    });
    document.getElementById("autoBackupToggle").addEventListener("change", (e) => {
      state.settings.autoBackup = e.target.checked;
      save();
      toast(e.target.checked ? "Auto-backup on" : "Auto-backup off");
      if (e.target.checked) runDailyBackup();
    });
  }

  function openSnapshots() {
    const snaps = loadSnapshots();
    openSheet(`
      <h2>Snapshots</h2>
      <div class="sheet-sub">Automatic on-device copies. Restoring replaces your current data.</div>
      ${snaps.length ? snaps.map((s, i) => {
        const d = new Date(s.at);
        return `<div class="row">
          <div class="glyph">🗂️</div>
          <div class="body">
            <div class="t1">${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
            <div class="t2">${s.cards} card${s.cards === 1 ? "" : "s"} · ${s.txns} purchase${s.txns === 1 ? "" : "s"} · ${esc(s.reason || "daily")}</div>
          </div>
          <button class="chip" data-action="restore-snap" data-idx="${i}">Restore</button>
        </div>`;
      }).join("") : `<div class="empty">No snapshots yet.<br>One is taken automatically each day you use the app.</div>`}
      <button class="btn btn-ghost" data-action="close-sheet">Close</button>
    `);
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function exportIcs() {
    const cards = state.cards.filter((c) => c.statementDay || c.dueDay);
    if (!cards.length) { toast("Set statement/due days first"); return; }
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Cashback Tracker//EN\r\nCALSCALE:GREGORIAN\r\n";
    for (const c of cards) {
      const add = (day, title, alarmDays) => {
        const start = nextOccurrence(day);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        ics += "BEGIN:VEVENT\r\n" +
          `UID:${c.id}-${title.replace(/\s/g, "")}@cashback\r\n` +
          `DTSTAMP:${fmt(new Date())}T000000Z\r\n` +
          `DTSTART;VALUE=DATE:${fmt(start)}\r\n` +
          `DTEND;VALUE=DATE:${fmt(end)}\r\n` +
          `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}\r\n` +
          `SUMMARY:${title} - ${c.name}\r\n` +
          "BEGIN:VALARM\r\n" +
          `TRIGGER:-P${alarmDays}D\r\n` +
          "ACTION:DISPLAY\r\n" +
          `DESCRIPTION:${title} - ${c.name}\r\n` +
          "END:VALARM\r\nEND:VEVENT\r\n";
      };
      if (c.statementDay) add(c.statementDay, "Statement closes", 2);
      if (c.dueDay) add(c.dueDay, "Payment due", 3);
    }
    ics += "END:VCALENDAR\r\n";
    download("cashback-billing.ics", ics, "text/calendar");
    toast("Calendar file created");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) { toast("Notifications unsupported here"); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Permission denied"); return; }
    state.settings.notify = true;
    save();
    toast("Reminders on");
    checkReminders(true);
  }

  /* Fires when the app is opened — iOS cannot wake a PWA in the background. */
  function checkReminders(force) {
    if (!state.settings.notify || Notification.permission !== "granted") return;
    const today = todayStr();
    if (!force && state.settings.lastNotifyDate === today) return;
    const within = state.settings.notifyDays || 3;
    const msgs = [];
    for (const c of state.cards) {
      if (c.dueDay) {
        const n = daysUntil(nextOccurrence(c.dueDay));
        if (n <= within) msgs.push(`${c.name}: payment due ${n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`}`);
      }
      if (c.statementDay) {
        const n = daysUntil(nextOccurrence(c.statementDay));
        if (n <= within) msgs.push(`${c.name}: statement closes ${n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`}`);
      }
    }
    if (msgs.length) {
      new Notification("Cashback Tracker", { body: msgs.join("\n"), icon: "icons/icon-192.png", tag: "cashback-billing" });
      state.settings.lastNotifyDate = today;
      save();
    }
  }

  function onImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.cards) || !Array.isArray(d.transactions)) throw new Error("shape");
        if (!confirm("Replace all data on this device with the backup?")) return;
        state = Object.assign(blank(), d);
        save(); toast("Backup restored"); render();
      } catch (err) { alert("That file isn't a valid backup."); }
    };
    r.readAsText(file);
    e.target.value = "";
  }

  // ---------------- delegation ----------------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;

    if (a === "close-sheet") closeSheet();
    else if (a === "open-card") openCardDetail(el.dataset.id);
    else if (a === "add-card") openAddCard();
    else if (a === "add-rule") openRuleEditor(el.dataset.cardid, null);
    else if (a === "edit-rule") openRuleEditor(el.dataset.cardid, el.dataset.ruleid);
    else if (a === "open-txn") openTxn(el.dataset.id);
    else if (a === "filter") { histFilter = el.dataset.id; render(); }
    else if (a === "save-card") {
      const c = getCard(el.dataset.id);
      const f = readCardForm(c);
      if (!f.name) { toast("Give the card a name"); return; }
      Object.assign(c, f);
      save(); closeSheet(); toast("Card saved"); render();
    } else if (a === "delete-card") {
      if (!confirm("Delete this card and every purchase on it?")) return;
      state.cards = state.cards.filter((c) => c.id !== el.dataset.id);
      state.transactions = state.transactions.filter((t) => t.cardId !== el.dataset.id);
      save(); closeSheet(); toast("Card deleted"); render();
    } else if (a === "export") {
      download(`cashback-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json");
      toast("Backup exported");
    } else if (a === "save-file") {
      saveBackupFile().then((r) => {
        if (r === "cancelled") return;
        toast(r === "shared" ? "Backup shared" : "Backup downloaded");
        render();
      });
    } else if (a === "view-snapshots") {
      openSnapshots();
    } else if (a === "restore-snap") {
      const snaps = loadSnapshots();
      const s = snaps[Number(el.dataset.idx)];
      if (!s) return;
      if (!confirm(`Restore the snapshot from ${new Date(s.at).toLocaleString()}? Your current data will be replaced.`)) return;
      try {
        const d = JSON.parse(s.payload);
        takeSnapshot("before-restore");
        state.cards = d.cards || [];
        state.transactions = d.transactions || [];
        save(); closeSheet(); toast("Snapshot restored"); render();
      } catch (err) { alert("That snapshot is unreadable."); }
    } else if (a === "check-update") {
      toast("Checking…");
      checkForUpdate(true);
    } else if (a === "export-ics") exportIcs();
    else if (a === "enable-notif") enableNotifications();
    else if (a === "wipe") {
      if (!confirm("Erase ALL cards and purchases? This cannot be undone.")) return;
      state = blank(); save(); toast("All data erased"); render();
    }
  });

  document.getElementById("topbarAction").addEventListener("click", openAddCard);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    runDailyBackup();
    checkReminders(false);
    checkForUpdate(false);
  });

  // Recover first, so a wiped primary key doesn't get snapshotted as "empty".
  const restored = autoRestoreIfEmpty();
  requestPersistentStorage();
  runDailyBackup();
  go("home");
  if (restored) setTimeout(() => toast(`Recovered your data from ${restored.date}`), 900);
  setTimeout(() => checkReminders(false), 1200);
  setTimeout(() => checkForUpdate(false), 1500);
})();
