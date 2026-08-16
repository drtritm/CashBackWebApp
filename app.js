(() => {
  "use strict";

  /* App version. Bump this together with version.json and sw.js on every release. */
  const APP_VERSION = "1.6.1";

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
    ink:       ["#2c2f4a", "#0d0e1a"],
    // Titanium black and pearl white — the two finishes premium physical cards use.
    onyx:      ["#26282d", "#020203"],
    platinum:  ["#fbfaf7", "#dcdad3"]
  };
  // Light finishes need dark text and inverted overlay tints — everything else assumes white text.
  const LIGHT_GRADIENTS = new Set(["platinum"]);
  const isLightGradient = (key) => LIGHT_GRADIENTS.has(key);
  const ccClass = (key) => "cc" + (isLightGradient(key) ? " cc-light" : "");

  /* Cash spending categories. Each maps onto an MCC group so cash and card
     purchases land in the same buckets in the statistics. */
  const CASH_CATEGORIES = [
    { id: "food", name: "Food & Drink", icon: "🍜", group: "dining" },
    { id: "coffee", name: "Coffee & Tea", icon: "☕", group: "dining" },
    { id: "groceries", name: "Groceries & Market", icon: "🛒", group: "groceries" },
    { id: "transport", name: "Transport & Grab", icon: "🛵", group: "transit" },
    { id: "fuel", name: "Fuel", icon: "⛽", group: "gas" },
    { id: "shopping", name: "Shopping", icon: "🛍️", group: "retail" },
    { id: "bills", name: "Bills & Utilities", icon: "💡", group: "utilities" },
    { id: "health", name: "Health & Pharmacy", icon: "⚕️", group: "health" },
    { id: "entertainment", name: "Entertainment", icon: "🎬", group: "entertainment" },
    { id: "education", name: "Education", icon: "🎓", group: "education" },
    { id: "home", name: "Home & Repairs", icon: "🏠", group: "home" },
    { id: "personal", name: "Personal Care", icon: "💈", group: "beauty" },
    { id: "gifts", name: "Family & Gifts", icon: "🎁", group: "other" },
    { id: "other", name: "Other", icon: "•", group: "other" }
  ];
  const cashCat = (id) => CASH_CATEGORIES.find((c) => c.id === id) || CASH_CATEGORIES[CASH_CATEGORIES.length - 1];
  const isCash = (t) => t.type === "cash";

  /* Unified category for any transaction, so cash and card share buckets in stats. */
  function txnGroup(t) {
    return isCash(t) ? cashCat(t.cashCat).group : mccInfo(t.mcc).groupId;
  }
  function txnLabel(t) {
    return isCash(t) ? cashCat(t.cashCat).name : mccInfo(t.mcc).name;
  }
  function txnIcon(t) {
    return isCash(t) ? cashCat(t.cashCat).icon : mccInfo(t.mcc).icon;
  }

  /* Categorical palette for the pie slices. Validated for dark surface #12161f
     across all pairs: lightness band, chroma floor, CVD separation (worst 8.8
     deutan / 10.0 tritan), normal-vision floor 15.9, contrast >= 3:1. Assigned in
     fixed order and never cycled — a 7th category folds into "Other". */
  const PIE_COLORS = ["#00a1e0", "#00886d", "#b27c00", "#b2392b", "#994ec9", "#e356a2"];
  const PIE_OTHER = "#5c6675";

  /* Line icons for billing alerts — matches the tab bar's stroke style instead
     of relying on emoji glyphs, which render inconsistently (some platforms show
     them as a boxed placeholder that reads as a broken/error icon). */
  const ICON_STATEMENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>';
  const ICON_DUE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="18" height="12" rx="2.2"/><path d="M3 10.5h18"/><circle cx="17" cy="14.7" r="1" fill="currentColor" stroke="none"/></svg>';
  const alertIcon = (kind) => (kind === "due" ? ICON_DUE : ICON_STATEMENT);

  /* Grouped like a real embossed card number — only the last 4 digits are ever
     known, everything before them stays masked. */
  const cardNumberDisplay = (last4) => (last4 ? `•••• •••• •••• ${esc(last4)}` : "•••• •••• •••• ••••");
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

  const hex2rgb = (h) => {
    h = String(h).replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const rgb2hex = (r, g, b) => {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  };
  /* A slightly lifted midpoint turns a flat two-stop fill into a metallic band,
     which is most of what separates a "coloured rectangle" from a card face. */
  function midStop(a, b) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex(...[0, 1, 2].map((i) => (A[i] * 0.62 + B[i] * 0.38) * 1.13));
  }
  const gradStyle = (key) => {
    const g = grad(key);
    return `--g1:${g[0]};--gm:${midStop(g[0], g[1])};--g2:${g[1]}`;
  };
  const gradCss = (key) => {
    const g = grad(key);
    return `linear-gradient(135deg, ${g[0]}, ${midStop(g[0], g[1])} 52%, ${g[1]})`;
  };

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
  /* Day heading in Activity — "Today"/"Yesterday" when close, otherwise weekday + date. */
  function dayLabel(s) {
    const today = todayStr();
    if (s === today) return "Today";
    const y = parseDate(today); y.setDate(y.getDate() - 1);
    const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    if (s === ys) return "Yesterday";
    return parseDate(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

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
    // Pre-pass: some rules (MB JCB Platinum's Shopee bonus) only pay out once
    // spend on THAT category clears a threshold for the cycle, so total up the
    // matched category spend per rule/period before the main pass runs.
    const ruleSpendAcc = {};
    for (const t of state.transactions) {
      if (isCash(t)) continue;
      const card = getCard(t.cardId);
      if (!card) continue;
      if (card.cardCap && card.cardCap.minSpend > 0) {
        const k = `${card.id}|${periodKey(t.date, card.cardCap.period || "monthly")}`;
        spendAcc[k] = (spendAcc[k] || 0) + t.amount;
      }
      const { rule } = matchRule(card, t.mcc);
      if (rule && rule.minSpend > 0) {
        const period = (rule.cap && rule.cap.period) || "monthly";
        const k = `${card.id}|${rule.id}|${periodKey(t.date, period)}`;
        ruleSpendAcc[k] = (ruleSpendAcc[k] || 0) + t.amount;
      }
    }

    const sorted = [...state.transactions].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)
    );
    for (const t of sorted) {
      // Cash earns nothing — it is tracked for spending totals only.
      if (isCash(t)) { t._cb = 0; t._rate = 0; t._capped = false; t._ruleId = null; t._pending = false; continue; }
      const card = getCard(t.cardId);
      if (!card) { t._cb = 0; t._rate = 0; t._capped = false; t._ruleId = null; t._pending = false; continue; }
      const base = card.baseRate || 0;
      const { rule, rate } = matchRule(card, t.mcc);
      t._ruleId = rule ? rule.id : null;
      t._rate = rate;
      t._capped = false;
      t._pending = false;
      t._shortfall = 0;

      // Rule-level minimum-spend gate (MB JCB Platinum: needs 2tr on Shopee this
      // cycle before the 10% pays out). Uses the pre-pass total for the whole
      // cycle, same "qualifies or doesn't" semantics as the card-wide gate below.
      let ruleGated = false, ruleShortfall = 0;
      if (rule && rule.minSpend > 0) {
        const period = (rule.cap && rule.cap.period) || "monthly";
        const k = `${card.id}|${rule.id}|${periodKey(t.date, period)}`;
        if ((ruleSpendAcc[k] || 0) < rule.minSpend) {
          ruleGated = true;
          ruleShortfall = rule.minSpend - (ruleSpendAcc[k] || 0);
        }
      }

      let cb, bonusPart = 0, acc4rule = null, eligibleSpend = 0;
      if (ruleGated) {
        // Doesn't qualify yet — earns nothing, and doesn't burn the rule's own
        // cashback cap since it never actually got the bonus rate.
        cb = 0;
        t._pending = true;
        t._shortfall = ruleShortfall;
        t._cbPotential = (t.amount * rate) / 100;
      } else if (!rule || !rule.cap || !(rule.cap.amount > 0)) {
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
    ruleSpendCache = ruleSpendAcc;
  }
  let capUsageCache = {};
  let cardCapCache = {};
  let cardSpendCache = {};
  let ruleSpendCache = {};

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

  /* How much has already been spent on a rule's own category this cycle —
     the running total that must clear rule.minSpend before its bonus pays out. */
  function ruleSpendUsage(card, rule, dateStr) {
    if (!rule || !(rule.minSpend > 0)) return 0;
    const period = (rule.cap && rule.cap.period) || "monthly";
    const pk = periodKey(dateStr || todayStr(), period);
    const k = `${card.id}|${rule.id}|${pk}`;
    return ruleSpendCache[k] != null
      ? ruleSpendCache[k]
      : state.transactions
          .filter((t) => !isCash(t) && t.cardId === card.id && matchRule(card, t.mcc).rule === rule && periodKey(t.date, period) === pk)
          .reduce((s, t) => s + t.amount, 0);
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
    let pending = false, shortfall = 0, cardRemaining = null, gateKind = null;
    const potential = cashback;
    if (card.cardCap) {
      const u = cardCapUsage(card, dateStr) || { used: 0, spend: 0 };
      if (card.cardCap.minSpend > 0 && u.spend + amount < card.cardCap.minSpend) {
        // Nothing pays out until the cycle qualifies — show 0, keep the potential.
        pending = true;
        shortfall = card.cardCap.minSpend - (u.spend + amount);
        gateKind = "card";
        cashback = 0;
      } else if (card.cardCap.amount > 0) {
        cardRemaining = Math.max(0, card.cardCap.amount - u.used);
        if (cashback > cardRemaining) { cashback = cardRemaining; capped = true; }
      }
    }

    // Rule-level minimum-spend gate (e.g. MB JCB Platinum's 2tr Shopee threshold).
    if (!pending && rule && rule.minSpend > 0) {
      const used = ruleSpendUsage(card, rule, dateStr);
      if (used + amount < rule.minSpend) {
        pending = true;
        shortfall = rule.minSpend - (used + amount);
        gateKind = "rule";
        cashback = 0;
      }
    }

    return { cashback, potential, rate, rule, capped, remaining, baseRate: base, txnLimited, pending, shortfall, cardRemaining, gateKind };
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
  const TITLES = {
    home: "Overview", log: "Card Purchase", cash: "Cash Spending",
    cards: "My Cards", history: "Activity", stats: "Statistics", more: "Settings"
  };
  let tab = "home";
  let histFilter = "all";
  // Reorder mode is tracked separately per screen since Home and Cards render
  // the card list differently, but both write to the same state.cards order.
  let reorderHome = false;
  let reorderCards = false;

  /* Move a card straight to a destination index in state.cards — the single
     order both the Overview and Cards tabs read from. */
  function reorderCardTo(id, targetIndex) {
    const idx = state.cards.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const clamped = Math.max(0, Math.min(state.cards.length - 1, targetIndex));
    if (clamped === idx) return;
    const [moved] = state.cards.splice(idx, 1);
    state.cards.splice(clamped, 0, moved);
    save();
    render();
  }

  const DRAG_HANDLE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
    <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
    <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
  </svg>`;

  /* Press-and-drag reordering for a vertical list of items, each carrying a
     [data-drag-id] and a .drag-handle child. One continuous pointer gesture —
     press the handle, drag to the destination, release — drops the item there
     directly, rather than needing repeated taps to walk it into place.
     Siblings animate out of the way live so the drop slot is obvious mid-drag;
     the actual state.cards mutation only happens once, on release. */
  function wireDragReorder(container, onDrop) {
    if (!container) return;
    let dragEl = null, items = [], startY = 0, rowH = 0, originalIndex = 0, targetIndex = 0;
    let handle = null;

    function itemsOf() {
      return [...container.children].filter((el) => el.dataset && el.dataset.dragId);
    }

    function onMove(e) {
      if (!dragEl) return;
      e.preventDefault();
      const deltaY = e.clientY - startY;
      dragEl.style.transform = `translateY(${deltaY}px)`;
      const centerY = dragStartCenter + deltaY;
      let slot = Math.round((centerY - listFirstCenter) / rowH);
      slot = Math.max(0, Math.min(items.length - 1, slot));
      if (slot !== targetIndex) {
        targetIndex = slot;
        items.forEach((it, idx) => {
          if (it === dragEl) return;
          let shift = 0;
          if (idx > originalIndex && idx <= targetIndex) shift = -rowH;
          else if (idx < originalIndex && idx >= targetIndex) shift = rowH;
          it.style.transform = shift ? `translateY(${shift}px)` : "";
        });
      }
    }

    let dragStartCenter = 0, listFirstCenter = 0;

    function endDrag(e) {
      if (!dragEl) return;
      if (handle) {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", endDrag);
        handle.removeEventListener("pointercancel", endDrag);
      }
      const el = dragEl, finalIndex = targetIndex, id = dragEl.dataset.dragId;
      el.classList.remove("dragging");
      el.style.transform = "";
      container.classList.remove("reordering");
      items.forEach((it) => { if (it !== el) it.style.transform = ""; });
      dragEl = null;
      if (finalIndex !== originalIndex) onDrop(id, finalIndex);
    }

    container.addEventListener("pointerdown", (e) => {
      const h = e.target.closest(".drag-handle");
      if (!h || !container.contains(h)) return;
      const item = h.closest("[data-drag-id]");
      if (!item) return;
      e.preventDefault();
      items = itemsOf();
      originalIndex = items.indexOf(item);
      if (originalIndex < 0) return;
      dragEl = item;
      handle = h;
      const rect = item.getBoundingClientRect();
      // Spacing between items (gap/margin included) beats bare offsetHeight,
      // which would ignore the gap between rows/cards.
      rowH = items.length > 1
        ? (items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top)
        : rect.height;
      dragStartCenter = rect.top + rect.height / 2;
      listFirstCenter = items[0].getBoundingClientRect().top + rowH / 2;
      startY = e.clientY;
      targetIndex = originalIndex;
      item.classList.add("dragging");
      container.classList.add("reordering");
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      h.addEventListener("pointermove", onMove);
      h.addEventListener("pointerup", endDrag);
      h.addEventListener("pointercancel", endDrag);
    });
  }

  function go(t) {
    // Leaving a screen exits its reorder mode so it doesn't linger next visit.
    if (t !== "home") reorderHome = false;
    if (t !== "cards") reorderCards = false;
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
    ({
      home: renderHome, log: renderLog, cash: renderCash, cards: renderCards,
      history: renderHistory, stats: renderStats, more: renderMore
    }[tab])();
  }

  // ================= HOME =================
  function renderHome() {
    if (!state.cards.length) {
      view.innerHTML = `<div class="empty"><div class="ico">💳</div>
        No cards yet.<br>Open <b>Cards</b> → <b>Add Card</b> and pick your bank<br>to load its cash back categories automatically.</div>`;
      return;
    }
    const total = state.transactions.reduce((s, t) => s + t._cb, 0);
    const totalSpent = state.transactions.reduce((s, t) => s + t.amount, 0);
    const mk = todayStr().slice(0, 7);
    const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === mk);
    const mCb = mTx.reduce((s, t) => s + t._cb, 0);
    const mSp = mTx.reduce((s, t) => s + t.amount, 0);
    const mCash = mTx.filter(isCash).reduce((s, t) => s + t.amount, 0);
    const mCard = mSp - mCash;
    // Effective rate only makes sense against spending that could earn anything.
    const effective = mCard > 0 ? (mCb / mCard) * 100 : 0;

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
          <div class="ic">${alertIcon(a.kind)}</div>
          <div class="body">
            <div class="t1">${esc(a.card.name)}</div>
            <div class="t2">${a.kind === "due" ? "Payment due" : "Statement closes"} · ${a.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
          </div>
          <div class="cnt"><div class="n num">${a.n === 0 ? "today" : a.n}</div>${a.n === 0 ? "" : `<div class="u">day${a.n === 1 ? "" : "s"}</div>`}</div>
        </div>`).join("")
      : "";

    // Compact rows, not full card art — with many cards this needs to scan in a
    // glance, not scroll through a stack of full-size faces (that's what Cards is for).
    // Reordering pins the list to your own order; otherwise it's sorted by this
    // month's cash back so the card doing the most work floats to the top.
    const orderedCards = reorderHome
      ? state.cards
      : [...state.cards].sort((a, b) => cardTotals(b.id).monthCashback - cardTotals(a.id).monthCashback);
    const cardsHtml = orderedCards.map((c) => {
        const t = cardTotals(c.id);
        if (reorderHome) {
          return `<div class="row card-mini reorder-row" data-drag-id="${c.id}">
            <div class="cm-swatch" style="background:${gradCss(c.gradient)}"><span class="cm-chip"></span></div>
            <div class="body">
              <div class="t1">${esc(c.name)}</div>
              <div class="t2">${c.issuer ? esc(c.issuer) + " · " : ""}${t.count} purchase${t.count === 1 ? "" : "s"}</div>
            </div>
            <div class="drag-handle">${DRAG_HANDLE_SVG}</div>
          </div>`;
        }
        return `<div class="row card-mini" data-action="open-card" data-id="${c.id}">
          <div class="cm-swatch" style="background:${gradCss(c.gradient)}"><span class="cm-chip"></span></div>
          <div class="body">
            <div class="t1">${esc(c.name)}</div>
            <div class="t2">${c.issuer ? esc(c.issuer) + " · " : ""}${t.count} purchase${t.count === 1 ? "" : "s"}${c.last4 ? " · •• " + esc(c.last4) : ""}</div>
          </div>
          <div class="tail">
            <div class="a1 num" style="color:var(--mint)">+${money(t.monthCashback)}</div>
            <div class="a2 num">${money(t.monthSpent)} spent</div>
          </div>
        </div>`;
      }).join("");

    view.innerHTML = `
      <div class="hero">
        <div class="hero-duo">
          <div>
            <div class="label">Total cash back</div>
            <div class="big num">${money(total)}</div>
          </div>
          <div class="hero-right">
            <div class="label">Total spent</div>
            <div class="big alt num">${moneyShort(totalSpent)}</div>
          </div>
        </div>
        <div class="sub">
          <div class="item"><div class="k">Month back</div><div class="v num">${money(mCb)}</div></div>
          <div class="item"><div class="k">Month spend</div><div class="v num">${moneyShort(mSp)}</div></div>
          <div class="item"><div class="k">Effective</div><div class="v num">${effective.toFixed(2).replace(".", ",")}%</div></div>
        </div>
      </div>
      <div class="stat-2" style="margin-bottom:13px;">
        <div class="stat"><div class="k">Card spend · month</div><div class="v num">${money(mCard)}</div></div>
        <div class="stat"><div class="k">Cash spend · month</div><div class="v num">${money(mCash)}</div></div>
      </div>
      ${alertsHtml}
      <div class="section-title">Cards
        <span class="title-links">
          ${state.cards.length > 1 ? `<span class="link" data-action="toggle-reorder-home">${reorderHome ? "Done" : "Reorder"}</span>` : ""}
          ${reorderHome ? "" : `<span class="link" data-action="goto-cards">See all ›</span>`}
        </span>
      </div>
      ${reorderHome ? `<div class="hint" style="margin:-2px 4px 10px;">Press and drag a handle to move a card.</div>` : ""}
      <div class="reorder-list" id="homeCardsList">${cardsHtml}</div>
    `;
    if (reorderHome) wireDragReorder(document.getElementById("homeCardsList"), reorderCardTo);
  }

  // ================= STATISTICS =================
  let statsRange = "month";   // month | last | all
  let statsView = "pie";      // pie | bars

  function statsWindow() {
    const today = todayStr();
    if (statsRange === "all") return { txns: state.transactions.slice(), label: "All time" };
    if (statsRange === "last") {
      const d = parseDate(today);
      d.setDate(1); d.setMonth(d.getMonth() - 1);
      const mk = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      return { txns: state.transactions.filter((t) => t.date.slice(0, 7) === mk), label: monthLabel(mk) };
    }
    const mk = today.slice(0, 7);
    return { txns: state.transactions.filter((t) => t.date.slice(0, 7) === mk), label: monthLabel(mk) };
  }

  /* Donut for part-to-whole. Capped at 6 slices plus "Other" so the validated
     categorical palette is never cycled, with a 2px surface gap between slices
     and every slice directly labelled in the legend below. */
  function donut(slices, centerTop, centerBottom) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total <= 0) return "";
    const R = 78, SW = 26, C = 100;
    const circ = 2 * Math.PI * R;
    const GAP = 2;
    let offset = 0;
    const arcs = slices.map((s) => {
      const frac = s.value / total;
      const len = Math.max(0, frac * circ - GAP);
      const el = '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" stroke="' + s.color +
        '" stroke-width="' + SW + '" stroke-dasharray="' + len + ' ' + (circ - len) +
        '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + C + ' ' + C + ')" />';
      offset += frac * circ;
      return el;
    }).join("");
    return '<div class="donut-wrap">' +
      '<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Spending share">' +
        '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="' + SW + '" />' +
        arcs +
      '</svg>' +
      '<div class="donut-mid"><div class="dm-1 num">' + esc(centerTop) + '</div>' +
      '<div class="dm-2">' + esc(centerBottom) + '</div></div>' +
    '</div>';
  }

  /* Roll a ranked list down to at most `keep` slices, folding the tail into Other. */
  function foldToSlices(rows, keep) {
    const head = rows.slice(0, keep);
    const tail = rows.slice(keep);
    const out = head.map((r, i) => Object.assign({}, r, { color: PIE_COLORS[i] }));
    if (tail.length) {
      out.push({
        // "Everything Else" is a real MCC group, so the fold bucket needs its own name.
        key: "__other", name: "Smaller categories (" + tail.length + ")", icon: "▪",
        value: tail.reduce((s, r) => s + r.value, 0),
        cb: tail.reduce((s, r) => s + (r.cb || 0), 0),
        n: tail.reduce((s, r) => s + (r.n || 0), 0),
        color: PIE_OTHER
      });
    }
    return out;
  }

  function legendRows(slices, total) {
    return slices.map((s) => {
      const p = total > 0 ? (s.value / total) * 100 : 0;
      return '<div class="lg-row">' +
        '<span class="lg-dot" style="background:' + s.color + '"></span>' +
        '<span class="lg-ic">' + (s.icon || "") + '</span>' +
        '<span class="lg-name">' + esc(s.name) + '</span>' +
        '<span class="lg-pct num">' + p.toFixed(1).replace(".", ",") + '%</span>' +
        '<span class="lg-val num">' + money(s.value) + '</span>' +
      '</div>';
    }).join("");
  }

  function barRows(rows, total, maxVal, colorOf) {
    return rows.map((r) => {
      const pctTxt = (total > 0 ? (r.value / total) * 100 : 0).toFixed(1).replace(".", ",");
      const lead = r.icon
        ? '<span class="brk-ic">' + r.icon + '</span>'
        : '<span class="brk-swatch" style="background:' + colorOf(r) + '"></span>';
      const back = r.cb > 0
        ? '<span class="brk-cb num">' + money(r.cb) + ' back</span>'
        : '<span class="brk-cb" style="color:var(--text-3)">no cash back</span>';
      return '<div class="brk">' +
        '<div class="brk-head">' + lead +
          '<span class="brk-name">' + esc(r.name) + '</span>' +
          '<span class="brk-val num">' + money(r.value) + '</span>' +
        '</div>' +
        '<div class="brk-bar"><i style="width:' + ((r.value / maxVal) * 100) + '%;background:' + colorOf(r) + '"></i></div>' +
        '<div class="brk-foot"><span>' + pctTxt + '% · ' + r.n + ' purchase' + (r.n === 1 ? "" : "s") + '</span>' + back + '</div>' +
      '</div>';
    }).join("");
  }

  function renderStats() {
    const win = statsWindow();
    const txns = win.txns, label = win.label;
    const totalSpend = txns.reduce((s, t) => s + t.amount, 0);
    const totalCb = txns.reduce((s, t) => s + t._cb, 0);
    const cashSpend = txns.filter(isCash).reduce((s, t) => s + t.amount, 0);
    const cardSpend = totalSpend - cashSpend;

    const controls =
      '<div class="chips">' +
        '<button class="chip ' + (statsRange === "month" ? "active" : "") + '" data-action="stats-range" data-v="month">This month</button>' +
        '<button class="chip ' + (statsRange === "last" ? "active" : "") + '" data-action="stats-range" data-v="last">Last month</button>' +
        '<button class="chip ' + (statsRange === "all" ? "active" : "") + '" data-action="stats-range" data-v="all">All time</button>' +
      '</div>' +
      '<div class="seg">' +
        '<button class="seg-btn ' + (statsView === "pie" ? "on" : "") + '" data-action="stats-view" data-v="pie">Pie</button>' +
        '<button class="seg-btn ' + (statsView === "bars" ? "on" : "") + '" data-action="stats-view" data-v="bars">Bars</button>' +
      '</div>';

    if (!txns.length) {
      view.innerHTML = controls + '<div class="empty"><div class="ico">📊</div>Nothing logged in ' + esc(label) + '.</div>';
      return;
    }

    // Category rows — cash and card unified into the same MCC groups.
    const byGroup = {};
    for (const t of txns) {
      const g = txnGroup(t);
      const e = byGroup[g] || (byGroup[g] = { value: 0, cb: 0, n: 0 });
      e.value += t.amount; e.cb += t._cb; e.n++;
    }
    const catRows = Object.keys(byGroup)
      .map((g) => Object.assign({ key: g, name: groupName(g), icon: groupIcon(g) }, byGroup[g]))
      .sort((a, b) => b.value - a.value);
    const catSlices = foldToSlices(catRows, PIE_COLORS.length);

    // Payment sources — every card plus cash.
    const srcRows = state.cards.map((c) => {
      const tx = txns.filter((t) => !isCash(t) && t.cardId === c.id);
      return {
        key: c.id, name: (c.issuer ? c.issuer + " " : "") + c.name, card: c,
        value: tx.reduce((s, t) => s + t.amount, 0),
        cb: tx.reduce((s, t) => s + t._cb, 0), n: tx.length
      };
    }).filter((r) => r.value > 0);
    if (cashSpend > 0) {
      srcRows.push({ key: "__cash", name: "Cash", icon: "💵", value: cashSpend, cb: 0, n: txns.filter(isCash).length });
    }
    srcRows.sort((a, b) => b.value - a.value);
    const srcColor = (r) => (r.card ? gradCss(r.card.gradient) : "#4a5566");

    let body;
    if (statsView === "pie") {
      const srcSlices = srcRows.map((r) => Object.assign({}, r, { color: r.card ? grad(r.card.gradient)[0] : PIE_OTHER }));
      body =
        '<div class="section-title">Spending by Category<span class="link num">' + money(totalSpend) + '</span></div>' +
        donut(catSlices, moneyShort(totalSpend), label) +
        '<div class="legend">' + legendRows(catSlices, totalSpend) + '</div>' +
        '<div class="section-title">Where It Was Paid From</div>' +
        donut(srcSlices, moneyShort(totalSpend), "total spend") +
        '<div class="legend">' + legendRows(srcSlices, totalSpend) + '</div>';
    } else {
      const maxCat = catRows[0].value || 1;
      const maxSrc = srcRows.length ? srcRows[0].value : 1;
      const shareBar = srcRows.length > 1
        ? '<div class="share-bar">' + srcRows.map((r) => '<i style="flex:' + r.value + ';background:' + srcColor(r) + '"></i>').join("") + '</div>'
        : "";
      body =
        '<div class="section-title">Spending by Category<span class="link num">' + money(totalSpend) + '</span></div>' +
        barRows(catRows, totalSpend, maxCat, () => "linear-gradient(90deg, var(--gold), #e8cf9e)") +
        '<div class="section-title">Where It Was Paid From</div>' + shareBar +
        barRows(srcRows, totalSpend, maxSrc, srcColor);
    }

    view.innerHTML = controls +
      '<div class="stat-2" style="margin-bottom:6px;">' +
        '<div class="stat"><div class="k">Total spent</div><div class="v num">' + money(totalSpend) + '</div></div>' +
        '<div class="stat"><div class="k">Cash back</div><div class="v mint num">' + money(totalCb) + '</div></div>' +
      '</div>' +
      '<div class="stat-2" style="margin-bottom:6px;">' +
        '<div class="stat"><div class="k">On cards</div><div class="v num">' + money(cardSpend) + '</div></div>' +
        '<div class="stat"><div class="k">In cash</div><div class="v num">' + money(cashSpend) + '</div></div>' +
      '</div>' +
      body;
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
      if (q.pending && q.gateKind === "rule") {
        note = `<b>${esc(ruleLabel(q.rule))}</b> needs ${money(q.rule.minSpend)} spent on this category per cycle before its ${q.rate}% pays out. ` +
          `<b>${money(q.shortfall)}</b> more to go — this purchase would then be worth ${money(q.potential)}.`;
      } else if (q.pending) {
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
          <div class="glyph" style="background:${gradCss(r.card.gradient)};border:none;font-size:13px;font-weight:700;color:${isLightGradient(r.card.gradient) ? "#201f1c" : "#fff"};">${i === 0 ? "★" : i + 1}</div>
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
      <div class="section-title">Your Cards
        ${state.cards.length > 1 ? `<span class="link" data-action="toggle-reorder-cards">${reorderCards ? "Done" : "Reorder"}</span>` : ""}
      </div>
      ${reorderCards ? `<div class="hint" style="margin:-2px 4px 10px;">Press and drag a handle to move a card.</div>` : ""}
      <div class="card-stack ${reorderCards ? "reorder" : ""}" id="cardsStack">${state.cards.map((c) => {
      const t = cardTotals(c.id);
      const best = c.rules.length ? Math.max(...c.rules.map((r) => r.rate)) : c.baseRate;
      return `<div class="${ccClass(c.gradient)}" style="${gradStyle(c.gradient)}" ${reorderCards ? `data-drag-id="${c.id}"` : `data-action="open-card" data-id="${c.id}"`}>
        ${reorderCards ? `<div class="cc-drag-handle drag-handle">${DRAG_HANDLE_SVG}</div>` : ""}
        <div class="cc-holo"></div>
        <div class="cc-head">
          <div>
            ${c.issuer ? `<div class="cc-issuer">${esc(c.issuer)}</div>` : ""}
            <div class="cc-name">${esc(c.name)}</div>
          </div>
          <div class="cc-chip"></div>
        </div>
        <div class="cc-badge">up to ${best}%</div>
        <div class="cc-number num">${cardNumberDisplay(c.last4)}</div>
        <div class="cc-foot">
          <div class="cc-stats">
            <div class="cc-stat">
              <div class="cc-k">Spent this month</div>
              <div class="cc-v num">${money(t.monthSpent)}</div>
            </div>
            <div class="cc-stat">
              <div class="cc-k">Cash back</div>
              <div class="cc-v num accent">${money(t.monthCashback)}</div>
            </div>
          </div>
          <div class="cc-tail">
            <div class="cc-sub num">Lifetime ${money(t.cashback)} back · ${money(t.spent)} spent</div>
          </div>
        </div>
      </div>`;
    }).join("")}</div>`;
    if (reorderCards) wireDragReorder(document.getElementById("cardsStack"), reorderCardTo);
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
            <div class="t2">${esc(scope)}${r.cap ? " · cap " + money(r.cap[0]) + "/" + PERIOD_LABEL[r.cap[2]] : ""}${r.minSpend ? " · needs " + money(r.minSpend) + " spend to unlock" : ""}</div></div>
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
          let minHtml = "";
          if (r.minSpend > 0) {
            const spent = ruleSpendUsage(card, r, todayStr());
            const met = spent >= r.minSpend;
            const pct = Math.min(100, (spent / r.minSpend) * 100);
            minHtml = `<div class="cap-meta" style="color:${met ? "var(--mint)" : "var(--amber)"}">
                ${met ? "Minimum spend met" : `${money(r.minSpend - spent)} more to unlock`} — ${money(spent)} of ${money(r.minSpend)} this cycle</div>
              <div class="bar ${met ? "" : "warn"}"><i style="width:${pct}%"></i></div>`;
          }
          return `<div class="cap-item" data-action="edit-rule" data-cardid="${card.id}" data-ruleid="${r.id}">
            <div class="cap-head"><span class="cap-name">${esc(ruleLabel(r))}</span><span class="cap-rate num">${r.rate}%</span></div>
            <div class="cap-meta">${esc(scope)}</div>
            <div class="cap-meta">${meta}</div>
            ${barHtml}
            ${minHtml}
          </div>`;
        }).join("")
      : `<div class="empty" style="padding:26px 12px;">No bonus rules yet.<br>Everything earns the ${card.baseRate}% base rate.</div>`;

    openSheet(`
      <div class="${ccClass(card.gradient)}" style="${gradStyle(card.gradient)};margin-bottom:18px;">
        <div class="cc-holo"></div>
        <div class="cc-head">
          <div>${card.issuer ? `<div class="cc-issuer">${esc(card.issuer)}</div>` : ""}
          <div class="cc-name">${esc(card.name)}</div></div>
          <div class="cc-chip"></div>
        </div>
        <div class="cc-number num">${cardNumberDisplay(card.last4)}</div>
        <div class="cc-foot">
          <div><div class="cc-k">Cash back earned</div><div class="cc-v num">${money(t.cashback)}</div></div>
        </div>
      </div>

      <div class="stat-2">
        <div class="stat"><div class="k">Total spent</div><div class="v num">${money(t.spent)}</div></div>
        <div class="stat"><div class="k">This month</div><div class="v mint num">${money(t.monthCashback)}</div></div>
      </div>

      ${(stmt || due) ? `<div class="section-title">Billing Cycle</div>
        ${stmt ? `<div class="alert"><div class="ic">${ICON_STATEMENT}</div><div class="body"><div class="t1">Statement closes</div>
          <div class="t2">${stmt.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })}</div></div>
          <div class="cnt"><div class="n num">${daysUntil(stmt)}</div><div class="u">days</div></div></div>` : ""}
        ${due ? `<div class="alert ${daysUntil(due) <= 5 ? "due-soon" : ""}"><div class="ic">${ICON_DUE}</div><div class="body"><div class="t1">Payment due</div>
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
    let minEnabled = !!(draftRule.minSpend > 0);

    function paint() {
      const capOn = capEnabled;
      const minOn = minEnabled;
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

        <div class="field">
          <label>Minimum Spend To Unlock</label>
          <select id="r_minOn">
            <option value="0" ${!minOn ? "selected" : ""}>No threshold — pays from the first purchase</option>
            <option value="1" ${minOn ? "selected" : ""}>Requires a minimum spend on this category this cycle</option>
          </select>
        </div>
        ${minOn ? `
          <div class="field"><label>Minimum Spend (₫)</label><input id="r_minAmt" type="text" inputmode="numeric" value="${formatVnd(draftRule.minSpend || 2000000)}" /></div>
          <div class="hint">E.g. MB JCB Platinum needs 2.000.000 ₫ spent on Shopee this cycle before its 10% pays out — below that, this category earns nothing extra for the cycle.</div>
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
        minEnabled = document.getElementById("r_minOn").value === "1";
        const minAmtEl = document.getElementById("r_minAmt");
        draftRule.minSpend = minEnabled ? parseVnd(minAmtEl ? minAmtEl.value : "") || 0 : 0;
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
      document.getElementById("r_minOn").addEventListener("change", () => {
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
      const minAmtInput = document.getElementById("r_minAmt");
      if (minAmtInput) wireMoneyInput(minAmtInput);
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
      view.innerHTML = '<div class="empty"><div class="ico">🧾</div>Nothing logged yet.<br>Add a purchase from <b>Log</b> or <b>Cash</b>.</div>';
      return;
    }
    // Wraps to as many rows as needed — every card stays reachable in one glance,
    // no horizontal swipe required to find the right filter.
    const chips = '<div class="chips chips-wrap">' +
      '<button class="chip ' + (histFilter === "all" ? "active" : "") + '" data-action="filter" data-id="all">All</button>' +
      state.cards.map((c) => '<button class="chip ' + (histFilter === c.id ? "active" : "") + '" data-action="filter" data-id="' + c.id + '">' + esc(c.name) + '</button>').join("") +
      '<button class="chip ' + (histFilter === "cash" ? "active" : "") + '" data-action="filter" data-id="cash">💵 Cash</button>' +
      '</div>';

    const list = state.transactions
      .filter((t) => histFilter === "all" || (histFilter === "cash" ? isCash(t) : t.cardId === histFilter))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));

    if (!list.length) return void (view.innerHTML = chips + '<div class="empty">Nothing logged here yet.</div>');

    // Grouped month → day, each header carrying its own totals.
    let html = chips, lastMonth = null, lastDay = null;
    for (const t of list) {
      const mk = t.date.slice(0, 7);
      if (mk !== lastMonth) {
        const mTx = list.filter((x) => x.date.slice(0, 7) === mk);
        const mSpend = mTx.reduce((s, x) => s + x.amount, 0);
        const mBack = mTx.reduce((s, x) => s + x._cb, 0);
        html += '<div class="month-bar">' +
          '<div class="mb-name">' + monthLabel(mk) + '</div>' +
          '<div class="mb-nums"><span class="num">' + money(mSpend) + '</span>' +
          '<span class="mb-cb num">+' + money(mBack) + '</span></div>' +
        '</div>';
        lastMonth = mk;
        lastDay = null;
      }
      if (t.date !== lastDay) {
        const dTx = list.filter((x) => x.date === t.date);
        const dSpend = dTx.reduce((s, x) => s + x.amount, 0);
        const dBack = dTx.reduce((s, x) => s + x._cb, 0);
        html += '<div class="day-bar">' +
          '<div class="db-left">' +
            '<span class="db-day">' + dayLabel(t.date) + '</span>' +
            '<span class="db-count">' + dTx.length + ' item' + (dTx.length === 1 ? "" : "s") + '</span>' +
          '</div>' +
          '<div class="db-right"><span class="num">' + money(dSpend) + '</span>' +
          (dBack > 0 ? '<span class="db-cb num">+' + money(dBack) + '</span>' : "") +
          '</div>' +
        '</div>';
        lastDay = t.date;
      }

      if (isCash(t)) {
        const c = cashCat(t.cashCat);
        html += '<div class="row txn" data-action="open-cash" data-id="' + t.id + '">' +
          '<div class="glyph">' + c.icon + '</div>' +
          '<div class="body">' +
            '<div class="t1">' + esc(t.note || c.name) + '<span class="tag cash">CASH</span></div>' +
            '<div class="t2">' + esc(c.name) + '</div>' +
          '</div>' +
          '<div class="tail"><div class="a1 num">' + money(t.amount) + '</div>' +
          '<div class="a2" style="color:var(--text-3)">no cash back</div></div>' +
        '</div>';
      } else {
        const card = getCard(t.cardId);
        const info = mccInfo(t.mcc);
        const badge = t._pending ? '<span class="tag pend">PENDING</span>' : t._capped ? '<span class="tag cap">CAP</span>' : "";
        html += '<div class="row txn" data-action="open-txn" data-id="' + t.id + '">' +
          '<div class="glyph">' + info.icon + '</div>' +
          '<div class="body">' +
            '<div class="t1">' + esc(t.note || info.name) + badge + '</div>' +
            '<div class="t2">' + (card ? esc(card.name) : "Deleted card") + ' <span class="tag mcc">' + esc(t.mcc) + '</span></div>' +
          '</div>' +
          '<div class="tail"><div class="a1 num">' + money(t.amount) + '</div>' +
          '<div class="a2 num"' + (t._pending ? ' style="color:var(--amber)"' : "") + '>' +
            (t._pending ? "min spend not met" : "+" + money(t._cb) + " · " + t._rate + "%") +
          '</div></div>' +
        '</div>';
      }
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

  // ================= CASH SPENDING =================
  const cashDraft = { cat: null, amount: "", date: null, note: "" };

  function renderCash() {
    if (!cashDraft.cat) cashDraft.cat = state.settings.recentCash && state.settings.recentCash[0] || "food";
    if (!cashDraft.date) cashDraft.date = todayStr();

    const mk = todayStr().slice(0, 7);
    const monthCash = state.transactions
      .filter((t) => isCash(t) && t.date.slice(0, 7) === mk)
      .reduce((s, t) => s + t.amount, 0);

    const tiles = CASH_CATEGORIES.map((c) =>
      '<button type="button" class="cat-tile ' + (c.id === cashDraft.cat ? "sel" : "") + '" data-pickcash="' + c.id + '">' +
        '<span class="ci">' + c.icon + '</span>' +
        '<span class="cn">' + esc(c.name) + '</span>' +
      '</button>').join("");

    view.innerHTML =
      '<div class="stat" style="margin-bottom:13px;">' +
        '<div class="k">Cash spent this month</div>' +
        '<div class="v num">' + money(monthCash) + '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="field">' +
          '<label>Amount</label>' +
          '<div class="amount-input">' +
            '<input id="k_amount" type="text" inputmode="numeric" placeholder="0" value="' + esc(cashDraft.amount) + '" />' +
            '<span class="cur">₫</span>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label>Category</label>' +
          '<div class="cat-grid cash-grid">' + tiles + '</div>' +
        '</div>' +
        '<div class="row-2">' +
          '<div class="field"><label>Date</label><input id="k_date" type="date" value="' + cashDraft.date + '" /></div>' +
          '<div class="field"><label>Note</label><input id="k_note" type="text" placeholder="Optional" value="' + esc(cashDraft.note) + '" /></div>' +
        '</div>' +
      '</div>' +
      '<div class="hint" style="margin:-4px 4px 14px;">Cash earns no cash back — these entries are tracked so your spending statistics are complete.</div>' +
      '<button class="btn btn-primary" id="saveCash">Add Cash Spending</button>';

    const amtEl = document.getElementById("k_amount");
    const dateEl = document.getElementById("k_date");
    const noteEl = document.getElementById("k_note");
    wireMoneyInput(amtEl);

    view.querySelectorAll("[data-pickcash]").forEach((b) => {
      b.addEventListener("click", () => {
        cashDraft.amount = amtEl.value;
        cashDraft.note = noteEl.value;
        cashDraft.date = dateEl.value || todayStr();
        cashDraft.cat = b.dataset.pickcash;
        renderCash();
      });
    });

    document.getElementById("saveCash").addEventListener("click", () => {
      const amt = parseVnd(amtEl.value);
      if (!(amt > 0)) { toast("Enter an amount first"); return; }
      state.transactions.push({
        id: uid(), type: "cash", cardId: null, cashCat: cashDraft.cat,
        amount: amt, date: dateEl.value || todayStr(), note: noteEl.value.trim()
      });
      if (!state.settings.recentCash) state.settings.recentCash = [];
      const rec = state.settings.recentCash.filter((c) => c !== cashDraft.cat);
      rec.unshift(cashDraft.cat);
      state.settings.recentCash = rec.slice(0, 6);
      save(); recompute(); runDailyBackup();
      toast(money(amt) + " cash logged");
      cashDraft.amount = ""; cashDraft.note = "";
      renderCash();
    });
  }

  function openCashTxn(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return;
    let cat = t.cashCat;
    function paint() {
      const tiles = CASH_CATEGORIES.map((c) =>
        '<button type="button" class="cat-tile ' + (c.id === cat ? "sel" : "") + '" data-editcash="' + c.id + '">' +
          '<span class="ci">' + c.icon + '</span><span class="cn">' + esc(c.name) + '</span>' +
        '</button>').join("");
      openSheet(
        '<h2>Edit Cash Spending</h2>' +
        '<div class="sheet-sub">Cash earns no cash back</div>' +
        '<div class="field"><label>Amount</label>' +
          '<div class="amount-input"><input id="ke_amount" type="text" inputmode="numeric" value="' + formatVnd(t.amount) + '" /><span class="cur">₫</span></div>' +
        '</div>' +
        '<div class="field"><label>Category</label><div class="cat-grid cash-grid">' + tiles + '</div></div>' +
        '<div class="row-2">' +
          '<div class="field"><label>Date</label><input id="ke_date" type="date" value="' + t.date + '" /></div>' +
          '<div class="field"><label>Note</label><input id="ke_note" type="text" value="' + esc(t.note || "") + '" /></div>' +
        '</div>' +
        '<button class="btn btn-primary" id="ke_save">Save Changes</button>' +
        '<button class="btn btn-danger" id="ke_del">Delete</button>' +
        '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>'
      );
      wireMoneyInput(document.getElementById("ke_amount"));
      sheetEl.querySelectorAll("[data-editcash]").forEach((b) => {
        b.addEventListener("click", () => {
          t.amount = parseVnd(document.getElementById("ke_amount").value) || t.amount;
          cat = b.dataset.editcash;
          paint();
        });
      });
      document.getElementById("ke_save").addEventListener("click", () => {
        const amt = parseVnd(document.getElementById("ke_amount").value);
        if (!(amt > 0)) { toast("Enter a valid amount"); return; }
        t.amount = amt;
        t.cashCat = cat;
        t.date = document.getElementById("ke_date").value || t.date;
        t.note = document.getElementById("ke_note").value.trim();
        save(); closeSheet(); toast("Updated"); render();
      });
      document.getElementById("ke_del").addEventListener("click", () => {
        if (!confirm("Delete this cash entry?")) return;
        state.transactions = state.transactions.filter((x) => x.id !== t.id);
        save(); closeSheet(); toast("Deleted"); render();
      });
    }
    paint();
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
    } else if (a === "open-cash") {
      openCashTxn(el.dataset.id);
    } else if (a === "goto-stats") {
      go("stats");
    } else if (a === "goto-cards") {
      go("cards");
    } else if (a === "toggle-reorder-home") {
      reorderHome = !reorderHome;
      render();
    } else if (a === "toggle-reorder-cards") {
      reorderCards = !reorderCards;
      render();
    } else if (a === "stats-range") {
      statsRange = el.dataset.v;
      renderStats();
    } else if (a === "stats-view") {
      statsView = el.dataset.v;
      renderStats();
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
