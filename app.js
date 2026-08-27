(() => {
  "use strict";

  /* App version. Bump this together with version.json and sw.js on every release. */
  const APP_VERSION = "1.18.0";

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
  /* Translation lookup. Keyed on the English source string so a missing entry
     simply renders English instead of breaking. */
  function tr(str) {
    const dict = LOCALES[state.settings && state.settings.lang] || null;
    return (dict && dict[str]) || str;
  }
  const isCash = (t2) => t2.type === "cash";
  /* A top-up moves money card -> wallet. It is charged to the card (so it earns
     cash back and lands on the statement) but it is NOT consumption — the real
     spend happens later when the wallet is used. Counting both would double it. */
  const isTopup = (t2) => t2.type === "topup";
  const isWalletSpend = (t2) => t2.type === "wallet";
  /* What belongs in "how much did I spend" analysis. */
  const countsAsSpend = (t2) => !isTopup(t2);
  /* What the bank actually bills to a card. */
  const onCardStatement = (t2) => !isCash(t2) && !isWalletSpend(t2) && !!t2.cardId;

  const getWallet = (id) => (state.wallets || []).find((w) => w.id === id);

  /* Wallet balance = everything topped up minus everything spent from it. */
  function walletBalance(walletId) {
    let bal = 0;
    for (const t of state.transactions) {
      if (t.walletId !== walletId) continue;
      if (isTopup(t)) bal += t.amount;
      else if (isWalletSpend(t)) bal -= t.amount;
    }
    return bal;
  }

  /* Unified category for any transaction, so cash and card share buckets in stats. */
  function txnGroup(tx) {
    if (isCash(tx) || isWalletSpend(tx)) return cashCat(tx.cashCat).group;
    return mccInfo(tx.mcc).groupId;
  }
  function txnLabel(tx) {
    if (isCash(tx) || isWalletSpend(tx)) return tr(cashCat(tx.cashCat).name);
    return mccInfo(tx.mcc).name;
  }
  function txnIcon(tx) {
    if (isCash(tx) || isWalletSpend(tx)) return cashCat(tx.cashCat).icon;
    return mccInfo(tx.mcc).icon;
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

  /* Grouped like a real embossed card number — only the last 4 digits are ever
     known, everything before them stays masked. */
  /* Bank + product, e.g. "Sacombank UniQ" — a bare product name is ambiguous
     once you hold several cards with names like "Cash Back". */
  const cardFullName = (c) => (c ? ((c.issuer ? c.issuer + " " : "") + c.name) : "");

  const cardNumberDisplay = (last4) => (last4 ? `•••• •••• •••• ${esc(last4)}` : "•••• •••• •••• ••••");

  /* The contactless mark every modern card carries — a strong "this is a real
     card" signal that costs nothing but a few arcs. */
  const CONTACTLESS_SVG =
    '<svg class="cc-wave" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">' +
    '<path d="M8.5 8.2a5.4 5.4 0 0 1 0 7.6"/><path d="M12 5.4a9.4 9.4 0 0 1 0 13.2"/><path d="M5.2 10.8a2 2 0 0 1 0 2.4"/></svg>';

  const shortMonth = (mk) => {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
  };
  const GRADIENT_KEYS = Object.keys(GRADIENTS);

  // ---------------- state ----------------
  function blank() {
    return {
      cards: [], transactions: [], wallets: [],
      /* payouts: cash back the bank still owes you. Keyed "cardId|YYYY-MM" and
         only written once you tick it as received — the pending list itself is
         derived from transactions, so it can never drift out of sync. */
      payouts: {},
      /* payments: which statements you've actually settled. Keyed "cardId|YYYY-MM"
         (the cycle the statement closes in) so the record is permanent — unlike the
         old single paidThroughDue flag, which erased itself each billing cycle and
         left no history. */
      payments: {},
      subscriptions: [],
      refunds: [],
      settings: {
        recentMccs: [], notify: false, notifyDays: 3, autoBackup: true, lang: "en",
        lastSnapshotDate: null, lastSavedDate: null,
        defaultCashbackDelay: 45
      }
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
        if (Array.isArray(d.wallets)) s.wallets = d.wallets;
        if (Array.isArray(d.transactions)) s.transactions = d.transactions;
        // Added in 1.9 — older saves simply won't have them.
        if (d.payouts && typeof d.payouts === "object") s.payouts = d.payouts;
        if (d.payments && typeof d.payments === "object") s.payments = d.payments;
        if (Array.isArray(d.subscriptions)) s.subscriptions = d.subscriptions;
        if (Array.isArray(d.refunds)) s.refunds = d.refunds;
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

  const daysInMonth = (y, m1) => new Date(y, m1, 0).getDate();   // m1 is 1-based

  /* Which statement cycle a date belongs to, named by the month it CLOSES in.
     With a close day of 20: 21 Jul–20 Aug is cycle "2026-08". Spending after the
     20th rolls into the next cycle, which is what resets the caps. */
  function cycleAnchor(card, dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const closeDay = Math.min(card.statementDay, daysInMonth(y, m));
    if (d <= closeDay) return { y, m };
    return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  }

  /* Cap accounting key. Caps reset on the statement close day when the card has
     one; otherwise they fall back to plain calendar periods. */
  function capPeriodKey(card, dateStr, period) {
    if (!card || !card.statementDay) return periodKey(dateStr, period);
    const a = cycleAnchor(card, dateStr);
    if (period === "yearly") return String(a.y);
    if (period === "quarterly") return `${a.y}-Q${Math.floor((a.m - 1) / 3) + 1}`;
    return `${a.y}-${String(a.m).padStart(2, "0")}`;
  }

  /* Start/end dates of the monthly cycle that closes in the given YYYY-MM. */
  function cycleRange(card, cycleKey) {
    const [y, m] = cycleKey.split("-").map(Number);
    const closeDay = Math.min(card.statementDay, daysInMonth(y, m));
    const end = new Date(y, m - 1, closeDay);
    const start = new Date(end.getTime());
    start.setDate(start.getDate() + 1);
    start.setMonth(start.getMonth() - 1);
    return { start, end };
  }
  function cycleLabel(card, cycleKey) {
    const { start, end } = cycleRange(card, cycleKey);
    const f = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${f(start)} – ${f(end)}`;
  }
  /* Shift a cycle key by n months. */
  function shiftCycleKey(cycleKey, n) {
    const [y, m] = cycleKey.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(mk) {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const dateLabel = (s) => parseDate(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  /* Spelled-out day used by the Activity day picker, e.g. "Mon, 25 August 2026". */
  function fullDayLabel(s2) {
    const today = todayStr();
    const d = parseDate(s2);
    const nice = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
    if (s2 === today) return "Today \u00b7 " + nice;
    return nice;
  }

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
  const isoDate = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  /* Payment is recorded per statement cycle, so every settled statement stays on
     record instead of the flag being wiped when the next cycle starts. */
  const paymentKey = (card, cycleKey) => card.id + "|" + cycleKey;

  /* Due date for the statement closing in cycleKey: the first dueDay that falls
     after the close date. A due day earlier in the month lands the next month. */
  function statementDueDate(card, cycleKey) {
    if (!card.dueDay) return null;
    const end = cycleRange(card, cycleKey).end;
    const at = (y, m) => new Date(y, m, Math.min(card.dueDay, new Date(y, m + 1, 0).getDate()));
    let d = at(end.getFullYear(), end.getMonth());
    if (d <= end) {
      const ny = end.getMonth() === 11 ? end.getFullYear() + 1 : end.getFullYear();
      const nm = end.getMonth() === 11 ? 0 : end.getMonth() + 1;
      d = at(ny, nm);
    }
    return d;
  }

  /* The newest closed statement that actually carried a balance — the one you'd
     be paying now. Cycles that billed nothing are skipped so the card badge and
     the Statements list never disagree about what's outstanding. */
  function latestClosedCycle(card) {
    if (!card.statementDay) return null;
    const today = todayStr();
    let k = capPeriodKey(card, today, "monthly");
    if (isoDate(cycleRange(card, k).end) >= today) k = shiftCycleKey(k, -1);
    for (let i = 0; i < 24; i++) {
      const billed = state.transactions.some((t) =>
        !isCash(t) && t.cardId === card.id && capPeriodKey(card, t.date, "monthly") === k);
      if (billed) return k;
      k = shiftCycleKey(k, -1);
    }
    return null;
  }

  function isCardPaid(card) {
    const k = latestClosedCycle(card);
    return !!(k && state.payments[paymentKey(card, k)]);
  }
  function togglePaid(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    const k = latestClosedCycle(card);
    if (!k) return;
    toggleStatementPaid(paymentKey(card, k));
  }
  function toggleStatementPaid(key, amount) {
    if (state.payments[key]) delete state.payments[key];
    else state.payments[key] = amount != null ? { date: todayStr(), amount } : { date: todayStr() };
    save();
  }

  /* Every statement worth showing: closed cycles that carried a balance, plus the
     cycle currently open. Derived from transactions, so it can't drift. */
  function buildStatements() {
    const today = todayStr();
    const rows = [];
    for (const card of state.cards) {
      if (!card.statementDay) continue;
      const keys = new Set();
      for (const t of state.transactions) {
        if (isCash(t) || t.cardId !== card.id) continue;
        keys.add(capPeriodKey(card, t.date, "monthly"));
      }
      keys.add(capPeriodKey(card, today, "monthly"));
      for (const k of keys) {
        const range = cycleRange(card, k);
        const closed = isoDate(range.end) < today;
        const tx = state.transactions.filter((t) =>
          onCardStatement(t) && t.cardId === card.id && capPeriodKey(card, t.date, "monthly") === k);
        // Statement balance intentionally INCLUDES top-ups — the bank charged them.
        const balance = tx.reduce((sum, t) => sum + t.amount, 0);
        if (!closed && balance <= 0) continue;      // nothing to show yet
        if (closed && balance <= 0) continue;       // nothing was billed
        const due = statementDueDate(card, k);
        const key = paymentKey(card, k);
        const rec = state.payments[key] || null;
        rows.push({
          key, card, cycleKey: k, start: range.start, end: range.end, closed,
          balance, n: tx.length, due,
          paid: !!rec, paidDate: rec ? rec.date : null,
          paidAmount: rec && rec.amount != null ? rec.amount : null,
          overdue: !!(!rec && closed && due && isoDate(due) < today)
        });
      }
    }
    // Soonest due first among the ones still owed; paid ones drop to the bottom.
    rows.sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      const ad = a.due ? isoDate(a.due) : "9999";
      const bd = b.due ? isoDate(b.due) : "9999";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
    return rows;
  }
  /* Small status pill shown on the Cards tab — confirms a marked-paid card at
     a glance, or flags one whose due date is inside the 5-day reminder window. */
  function dueBadgeHtml(card) {
    if (!card.dueDay) return "";
    if (isCardPaid(card)) return `<span class="due-badge paid">✓ Paid</span>`;
    const n = daysUntil(nextOccurrence(card.dueDay));
    if (n > 5) return "";
    return `<span class="due-badge ${n <= 1 ? "urgent" : "warn"}">Due ${n <= 0 ? "today" : "in " + n + "d"}</span>`;
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
      if (isCash(t) || isWalletSpend(t)) continue;
      const card = getCard(t.cardId);
      if (!card) continue;
      if (card.cardCap && card.cardCap.minSpend > 0) {
        const k = `${card.id}|${capPeriodKey(card, t.date, card.cardCap.period || "monthly")}`;
        spendAcc[k] = (spendAcc[k] || 0) + t.amount;
      }
      const { rule } = matchRule(card, t.mcc);
      if (rule && rule.minSpend > 0) {
        const period = (rule.cap && rule.cap.period) || "monthly";
        const k = `${card.id}|${rule.id}|${capPeriodKey(card, t.date, period)}`;
        ruleSpendAcc[k] = (ruleSpendAcc[k] || 0) + t.amount;
      }
    }

    const sorted = [...state.transactions].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)
    );
    for (const t of sorted) {
      // Cash earns nothing — it is tracked for spending totals only.
      // Wallet spends earned their cash back at top-up time, so they earn none here.
      if (isCash(t) || isWalletSpend(t)) { t._cb = 0; t._rate = 0; t._capped = false; t._ruleId = null; t._belowMin = false; continue; }
      const card = getCard(t.cardId);
      if (!card) { t._cb = 0; t._rate = 0; t._capped = false; t._ruleId = null; t._belowMin = false; continue; }
      const base = card.baseRate || 0;
      const { rule, rate } = matchRule(card, t.mcc);
      t._ruleId = rule ? rule.id : null;
      t._rate = rate;
      t._capped = false;
      t._belowMin = false;
      t._shortfall = 0;

      // Rule-level minimum-spend gate (MB JCB Platinum: needs 2tr on Shopee this
      // cycle before the 10% pays out). Uses the pre-pass total for the whole
      // cycle, same "qualifies or doesn't" semantics as the card-wide gate below.
      let ruleGated = false, ruleShortfall = 0;
      if (rule && rule.minSpend > 0) {
        const period = (rule.cap && rule.cap.period) || "monthly";
        const k = `${card.id}|${rule.id}|${capPeriodKey(card, t.date, period)}`;
        if ((ruleSpendAcc[k] || 0) < rule.minSpend) {
          ruleGated = true;
          ruleShortfall = rule.minSpend - (ruleSpendAcc[k] || 0);
        }
      }

      // A minimum-spend requirement is a note, not a block: every transaction still
      // earns and counts its cash back. The shortfall is surfaced as a warning so
      // you know the cycle hasn't cleared the bar yet.
      if (ruleGated) {
        t._belowMin = true;
        t._shortfall = ruleShortfall;
      }

      let cb, bonusPart = 0, acc4rule = null, eligibleSpend = 0;
      if (!rule || !rule.cap || !(rule.cap.amount > 0)) {
        cb = (t.amount * rate) / 100;
        bonusPart = cb;
      } else {
        const k = `${card.id}|${rule.id}|${capPeriodKey(card, t.date, rule.cap.period)}`;
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
        const pk = capPeriodKey(card, t.date, card.cardCap.period || "monthly");
        const k = `${card.id}|${pk}`;
        if (card.cardCap.minSpend > 0 && (spendAcc[k] || 0) < card.cardCap.minSpend) {
          // Flag the shortfall but still pay out — the bar is informational.
          t._belowMin = true;
          t._shortfall = card.cardCap.minSpend - (spendAcc[k] || 0);
        }
        if (card.cardCap.amount > 0) {
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
    const pk = capPeriodKey(card, dateStr || todayStr(), card.cardCap.period || "monthly");
    const k = `${card.id}|${pk}`;
    return {
      used: cardCapCache[k] || 0,
      spend: cardSpendCache[k] || state.transactions
        .filter((t) => t.cardId === card.id && capPeriodKey(card, t.date, card.cardCap.period || "monthly") === pk)
        .reduce((s, t) => s + t.amount, 0)
    };
  }

  function capUsage(card, rule, dateStr) {
    const k = `${card.id}|${rule.id}|${capPeriodKey(card, dateStr || todayStr(), rule.cap.period)}`;
    return capUsageCache[k] || { cashback: 0, spend: 0 };
  }

  /* How much has already been spent on a rule's own category this cycle —
     the running total that must clear rule.minSpend before its bonus pays out. */
  function ruleSpendUsage(card, rule, dateStr) {
    if (!rule || !(rule.minSpend > 0)) return 0;
    const period = (rule.cap && rule.cap.period) || "monthly";
    const pk = capPeriodKey(card, dateStr || todayStr(), period);
    const k = `${card.id}|${rule.id}|${pk}`;
    return ruleSpendCache[k] != null
      ? ruleSpendCache[k]
      : state.transactions
          .filter((t) => !isCash(t) && t.cardId === card.id && matchRule(card, t.mcc).rule === rule && capPeriodKey(card, t.date, period) === pk)
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

    /* Minimum-spend requirements are reported, never deducted. The transaction
       keeps its full cash back; the shortfall is shown so you know the cycle
       still has to clear the bar for the bank to actually pay. */
    let belowMin = false, shortfall = 0, cardRemaining = null, gateKind = null;
    const potential = cashback;
    if (card.cardCap) {
      const u = cardCapUsage(card, dateStr) || { used: 0, spend: 0 };
      if (card.cardCap.minSpend > 0 && u.spend + amount < card.cardCap.minSpend) {
        belowMin = true;
        shortfall = card.cardCap.minSpend - (u.spend + amount);
        gateKind = "card";
      }
      if (card.cardCap.amount > 0) {
        cardRemaining = Math.max(0, card.cardCap.amount - u.used);
        if (cashback > cardRemaining) { cashback = cardRemaining; capped = true; }
      }
    }

    // Rule-level minimum (e.g. MB JCB Platinum's Shopee threshold) — same treatment.
    if (!belowMin && rule && rule.minSpend > 0) {
      const used = ruleSpendUsage(card, rule, dateStr);
      if (used + amount < rule.minSpend) {
        belowMin = true;
        shortfall = rule.minSpend - (used + amount);
        gateKind = "rule";
      }
    }

    return { cashback, potential, rate, rule, capped, remaining, baseRate: base, txnLimited, belowMin, shortfall, cardRemaining, gateKind };
  }

  function cardTotals(cardId) {
    const card = getCard(cardId);
    const txns = state.transactions.filter((t) => t.cardId === cardId);
    const mk = todayStr().slice(0, 7);
    const m = txns.filter((t) => t.date.slice(0, 7) === mk);
    const out = {
      cashback: txns.reduce((s, t) => s + t._cb, 0),
      spent: txns.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0),
      monthCashback: m.reduce((s, t) => s + t._cb, 0),
      monthSpent: m.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0),
      count: txns.length,
      hasCycle: false
    };
    // Statement cycles run alongside the calendar month, not instead of it —
    // caps reset on the cycle, but the month figures stay meaningful.
    if (card && card.statementDay) {
      const curKey = capPeriodKey(card, todayStr(), "monthly");
      const prevKey = shiftCycleKey(curKey, -1);
      const inCycle = (k) => txns.filter((t) => capPeriodKey(card, t.date, "monthly") === k);
      const cur = inCycle(curKey), prev = inCycle(prevKey);
      out.hasCycle = true;
      out.cycleKey = curKey;
      out.cycleLabel = cycleLabel(card, curKey);
      out.cycleCashback = cur.reduce((s, t) => s + t._cb, 0);
      out.cycleSpent = cur.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
      out.prevCycleKey = prevKey;
      out.prevCycleLabel = cycleLabel(card, prevKey);
      out.prevCycleCashback = prev.reduce((s, t) => s + t._cb, 0);
      out.prevCycleSpent = prev.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
    }
    return out;
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
  const settingsBtn = document.getElementById("settingsBtn");
  const tabbar = document.getElementById("tabbar");
  const TITLES = {
    home: "Overview", log: "Add Spending",
    cards: "My Cards", history: "Activity", track: "Track", stats: "Statistics", more: "Settings"
  };
  /* Re-label the static tab bar whenever the language changes. */
  function applyTabLabels() {
    const map = { home: "Overview", log: "Add", cards: "Cards", history: "Activity", track: "Track", stats: "Stats" };
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const lab = b.querySelector(".tb-lab");
      if (lab && map[b.dataset.tab]) lab.textContent = tr(map[b.dataset.tab]);
    });
  }
  let tab = "home";
  let histFilter = "all";
  // "all" shows the full timeline (unchanged default); a "YYYY-MM" key narrows
  // Activity to one billing month, stepped through with the Prev/Next arrows.
  /* Activity date range. mode drives everything; month/from/to hold the detail
     for the two modes that need it. */
  let histRange = { mode: "all", month: null, from: null, to: null };
  // Reorder mode is tracked separately per screen since Home and Cards render
  // the card list differently, but both write to the same state.cards order.
  let reorderHome = false;
  let reorderCards = false;

  const HIST_PRESETS = [
    ["all", "All"], ["today", "Today"], ["week", "7 days"],
    ["month30", "30 days"], ["month", "Month"], ["custom", "Custom"]
  ];

  /* Resolve the active range to concrete from/to dates (inclusive), or null for
     "everything". One place decides the dates, so filtering and the summary label
     can never disagree. */
  function histBounds() {
    const r = histRange;
    const today = todayStr();
    if (r.mode === "all") return null;
    if (r.mode === "today") return { from: today, to: today };
    if (r.mode === "week" || r.mode === "month30") {
      const back = r.mode === "week" ? 6 : 29;
      const d = parseDate(today);
      d.setDate(d.getDate() - back);
      return { from: isoDate(d), to: today };
    }
    if (r.mode === "month" && r.month) {
      const [y, m] = r.month.split("-").map(Number);
      return { from: r.month + "-01", to: isoDate(new Date(y, m, 0)) };
    }
    if (r.mode === "custom") {
      // Either end may be blank — an open-ended range is still useful.
      let from = r.from || null, to = r.to || null;
      if (from && to && from > to) { const sw = from; from = to; to = sw; }
      if (!from && !to) return null;
      return { from: from || "0000-01-01", to: to || "9999-12-31" };
    }
    return null;
  }
  const inHistRange = (dateStr) => {
    const b = histBounds();
    return !b || (dateStr >= b.from && dateStr <= b.to);
  };

  function histRangeLabel() {
    const r = histRange, b = histBounds();
    if (!b) return "All time";
    if (r.mode === "today") return "Today";
    if (r.mode === "week") return "Last 7 days";
    if (r.mode === "month30") return "Last 30 days";
    if (r.mode === "month") return monthLabel(r.month);
    if (b.from === b.to) return fullDayLabel(b.from);
    const f = b.from === "0000-01-01" ? "Everything" : dateLabel(b.from);
    const t = b.to === "9999-12-31" ? "now" : dateLabel(b.to);
    return f + " \u2013 " + t;
  }

  /* Step the month window. Only visits months that actually have a transaction
     under the current source filter, so it never lands on an empty screen. */
  function histMonthStep(dir) {
    const scoped = state.transactions.filter((t) => histFilter === "all" || (histFilter === "cash" ? isCash(t) : t.cardId === histFilter));
    const monthKeys = [...new Set(scoped.map((t) => t.date.slice(0, 7)))].sort().reverse();
    if (!monthKeys.length) return;
    let idx = monthKeys.indexOf(histRange.month);
    if (idx === -1) idx = 0;
    idx = Math.max(0, Math.min(monthKeys.length - 1, idx + dir));
    histRange = { mode: "month", month: monthKeys[idx], from: null, to: null };
    renderHistory();
  }

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

  function go(tabName) {
    // Leaving a screen exits its reorder mode so it doesn't linger next visit.
    if (tabName !== "home") reorderHome = false;
    if (tabName !== "cards") reorderCards = false;
    tab = tabName;
    titleEl.textContent = tr(TITLES[tabName]);
    [...tabbar.children].forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
    applyTabLabels();
    render();
  }
  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest(".tab-btn");
    if (b) go(b.dataset.tab);
  });

  function render() {
    recompute();
    actionEl.hidden = tab !== "cards";
    settingsBtn.classList.toggle("on", tab === "more");
    ({
      home: renderHome, log: renderLog, cards: renderCards,
      history: renderHistory, track: renderTrack, stats: renderStats, more: renderMore
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
    const totalSpent = state.transactions.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
    const mk = todayStr().slice(0, 7);
    const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === mk);
    const mCb = mTx.reduce((s, t) => s + t._cb, 0);
    const mSp = mTx.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
    const mCash = mTx.filter(isCash).reduce((s, t) => s + t.amount, 0);
    const mCard = mSp - mCash;
    // Effective rate only makes sense against spending that could earn anything.
    const effective = mCard > 0 ? (mCb / mCard) * 100 : 0;

    // Billing reminders — only payments due within 5 days, and only while
    // still unpaid (mark a card paid in its detail sheet to clear it here).
    const alerts = [];
    for (const c of state.cards) {
      if (!c.dueDay || isCardPaid(c)) continue;
      const d = nextOccurrence(c.dueDay), n = daysUntil(d);
      if (n <= 5) alerts.push({ n, card: c, date: d });
    }
    alerts.sort((a, b) => a.n - b.n);

    const alertsHtml = alerts.length
      ? `<div class="section-title">${tr("Upcoming")}</div>` + alerts.map((a) => `
        <div class="alert ${a.n <= 1 ? "due-soon" : ""}" data-action="open-card" data-id="${a.card.id}">
          <div class="ic">${ICON_DUE}</div>
          <div class="body">
            <div class="t1">${esc(a.card.name)}</div>
            <div class="t2">Payment due · ${a.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
          </div>
          <div class="cnt"><div class="n num">${a.n <= 0 ? "today" : a.n}</div>${a.n <= 0 ? "" : `<div class="u">day${a.n === 1 ? "" : "s"}</div>`}</div>
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
        return `<div class="card-mini" data-action="open-card" data-id="${c.id}">
          <div class="cm-face ${isLightGradient(c.gradient) ? "light" : ""}" style="background:${gradCss(c.gradient)}">
            <span class="cm-chip"></span>
            <span class="cm-dots">••••</span>
            <span class="cm-l4">${c.last4 ? esc(c.last4) : "••••"}</span>
          </div>
          <div class="cm-body">
            <div class="cm-name">${esc(c.name)}</div>
            <div class="cm-meta">${c.issuer ? esc(c.issuer) : "Card"}${dueBadgeHtml(c) ? " " + dueBadgeHtml(c) : ""}</div>
          </div>
          <div class="cm-tail">
            <div class="cm-cb num">${money(t.monthCashback)}</div>
            <div class="cm-sp num">${moneyShort(t.monthSpent)} spent</div>
          </div>
        </div>`;
      }).join("");

    view.innerHTML = `
      <div class="hero">
        <div class="hero-duo">
          <div>
            <div class="label">${tr("Total cash back")}</div>
            <div class="big num">${money(total)}</div>
          </div>
          <div class="hero-right">
            <div class="label">${tr("Total spent")}</div>
            <div class="big alt num">${moneyShort(totalSpent)}</div>
          </div>
        </div>
        <div class="sub">
          <div class="item"><div class="k">${tr("Month back")}</div><div class="v num">${money(mCb)}</div></div>
          <div class="item"><div class="k">${tr("Month spend")}</div><div class="v num">${moneyShort(mSp)}</div></div>
          <div class="item"><div class="k">${tr("Effective")}</div><div class="v num">${effective.toFixed(2).replace(".", ",")}%</div></div>
        </div>
      </div>
      <div class="stat-2" style="margin-bottom:13px;">
        <div class="stat"><div class="k">${tr("Card spend · month")}</div><div class="v num">${money(mCard)}</div></div>
        <div class="stat"><div class="k">${tr("Cash spend · month")}</div><div class="v num">${money(mCash)}</div></div>
      </div>
      ${alertsHtml}
      <div class="section-title">Cards
        <span class="title-links">
          ${state.cards.length > 1 ? `<span class="link" data-action="toggle-reorder-home">${reorderHome ? "Done" : "Reorder"}</span>` : ""}
          ${reorderHome ? "" : `<span class="link" data-action="goto-cards">${tr("See all ›")}</span>`}
        </span>
      </div>
      ${reorderHome ? `<div class="hint" style="margin:-2px 4px 10px;">Press and drag a handle to move a card.</div>` : ""}
      <div class="reorder-list" id="homeCardsList">${cardsHtml}</div>
    `;
    if (reorderHome) wireDragReorder(document.getElementById("homeCardsList"), reorderCardTo);
  }

  // ================= E-WALLETS =================
  /* A wallet is funded from a credit card (the top-up earns the card's cash back)
     and then spent at merchants. Keeping the two events separate is what lets the
     app credit cash back once, at top-up, while still categorising the real spend. */
  const walletDraft = { walletId: null, mode: "spend", cat: null, amount: "", date: null, note: "", cardId: null };

  function renderWalletForm() {
    if (!state.wallets.length) {
      view.innerHTML =
        '<div class="empty"><div class="ico">\ud83d\udc5b</div>' + tr("No e-wallet yet.") + '<br>' +
        tr("Add one to track money you load from a card and spend later.") + '</div>' +
        '<button class="btn btn-primary" data-action="add-wallet">' + tr("Add E-Wallet") + '</button>';
      return;
    }
    if (!walletDraft.walletId || !getWallet(walletDraft.walletId)) walletDraft.walletId = state.wallets[0].id;
    if (!walletDraft.date) walletDraft.date = todayStr();
    const w = getWallet(walletDraft.walletId);
    if (!walletDraft.cardId || !getCard(walletDraft.cardId)) {
      walletDraft.cardId = w.cardId && getCard(w.cardId) ? w.cardId : (state.cards[0] ? state.cards[0].id : null);
    }
    if (!walletDraft.cat) walletDraft.cat = w.defaultCat || "transport";
    const bal = walletBalance(w.id);
    const topping = walletDraft.mode === "topup";

    const cats = CASH_CATEGORIES.map((c) =>
      '<button type="button" class="cat-tile ' + (c.id === walletDraft.cat ? "sel" : "") + '" data-pickwcat="' + c.id + '">' +
        '<span class="ci">' + c.icon + '</span><span class="cn">' + esc(tr(c.name)) + '</span>' +
      '</button>').join("");

    const preview = (() => {
      if (!topping) return "";
      const card = getCard(walletDraft.cardId);
      const amt = parseVnd(walletDraft.amount);
      if (!card || amt <= 0) return "";
      const q = quote(card, w.topupMcc || "4121", amt, walletDraft.date);
      return '<div class="preview ' + (q.capped ? "capped" : q.rule ? "" : "base") + '">' +
        '<div class="pv-top"><span class="pv-amt num">' + money(q.cashback) + '</span>' +
        '<span class="pv-rate">' + q.rate + '%</span></div>' +
        '<div class="pv-note">' + tr("Top-up is charged to the card as MCC") + ' ' + esc(w.topupMcc || "4121") +
        ' \u00b7 ' + esc(mccInfo(w.topupMcc || "4121").name) + '. ' +
        tr("Cash back is earned here, not when you spend from the wallet.") + '</div></div>';
    })();

    view.innerHTML =
      '<div class="wal-head">' +
        '<div class="wal-pick">' +
          '<select id="w_wallet">' +
            state.wallets.map((x) => '<option value="' + x.id + '" ' + (x.id === w.id ? "selected" : "") + '>' + esc(x.name) + '</option>').join("") +
          '</select>' +
          '<div class="wh-name">' + esc(w.name) + '</div>' +
        '</div>' +
        '<div class="wh-bal ' + (bal < 0 ? "neg" : "") + '">' +
          '<div class="wh-k">' + tr("Balance") + '</div>' +
          '<div class="wh-v num">' + money(bal) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="seg" style="margin-bottom:13px;">' +
        '<button class="seg-btn ' + (!topping ? "on" : "") + '" data-action="wallet-mode" data-v="spend">' + tr("Spend from wallet") + '</button>' +
        '<button class="seg-btn ' + (topping ? "on" : "") + '" data-action="wallet-mode" data-v="topup">' + tr("Top up") + '</button>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="field"><label>' + tr("Amount") + '</label>' +
          '<div class="amount-input"><input id="w_amount" type="text" inputmode="numeric" placeholder="0" value="' + esc(walletDraft.amount) + '" /><span class="cur">\u20ab</span></div>' +
        '</div>' +
        (topping
          ? '<div class="field"><label>' + tr("Funded by card") + '</label><select id="w_card">' +
              state.cards.map((c) => '<option value="' + c.id + '" ' + (c.id === walletDraft.cardId ? "selected" : "") + '>' + esc(cardFullName(c)) + '</option>').join("") +
            '</select></div>'
          : '<div class="field"><label>' + tr("Category") + '</label><div class="cat-grid cash-grid">' + cats + '</div></div>') +
        '<div class="row-2">' +
          '<div class="field"><label>' + tr("Date") + '</label><input id="w_date" type="date" value="' + walletDraft.date + '" /></div>' +
          '<div class="field"><label>' + tr("Note") + '</label><input id="w_note" type="text" placeholder="' + tr("Optional") + '" value="' + esc(walletDraft.note) + '" /></div>' +
        '</div>' +
      '</div>' +
      preview +
      (!topping && bal <= 0
        ? '<div class="hint" style="margin:-4px 4px 12px;">' + tr("This wallet has no balance. Top it up first, or log anyway to record the spend.") + '</div>'
        : "") +
      '<button class="btn btn-primary" id="w_save">' + (topping ? tr("Add Top-Up") : tr("Add Wallet Spending")) + '</button>' +
      '<button class="btn btn-ghost" data-action="manage-wallets">' + tr("Manage e-wallets") + '</button>';

    const amtEl = document.getElementById("w_amount");
    const dateEl = document.getElementById("w_date");
    const noteEl = document.getElementById("w_note");
    wireMoneyInput(amtEl);
    const stash = () => {
      walletDraft.amount = amtEl.value;
      walletDraft.note = noteEl.value;
      walletDraft.date = dateEl.value || todayStr();
      const cEl = document.getElementById("w_card");
      if (cEl) walletDraft.cardId = cEl.value;
    };
    amtEl.addEventListener("input", () => { stash(); if (topping) renderLog(); });
    document.getElementById("w_wallet").addEventListener("change", (e) => {
      stash(); walletDraft.walletId = e.target.value; walletDraft.cardId = null; walletDraft.cat = null; renderLog();
    });
    const cardEl = document.getElementById("w_card");
    if (cardEl) cardEl.addEventListener("change", () => { stash(); renderLog(); });
    view.querySelectorAll("[data-pickwcat]").forEach((b) =>
      b.addEventListener("click", () => { stash(); walletDraft.cat = b.dataset.pickwcat; renderLog(); }));

    document.getElementById("w_save").addEventListener("click", () => {
      stash();
      const amt = parseVnd(amtEl.value);
      if (!(amt > 0)) { toast(tr("Enter an amount first")); return; }
      if (topping) {
        const card = getCard(walletDraft.cardId);
        if (!card) { toast(tr("Add a card first")); return; }
        state.transactions.push({
          id: uid(), type: "topup", cardId: card.id, walletId: w.id,
          mcc: w.topupMcc || "4121", amount: amt,
          date: walletDraft.date, note: walletDraft.note.trim() || tr("Wallet top-up")
        });
      } else {
        state.transactions.push({
          id: uid(), type: "wallet", cardId: null, walletId: w.id,
          cashCat: walletDraft.cat, amount: amt,
          date: walletDraft.date, note: walletDraft.note.trim()
        });
      }
      save(); recompute(); runDailyBackup();
      const last = state.transactions[state.transactions.length - 1];
      toast(topping ? "+" + money(last._cb) + " " + tr("cash back") : money(amt) + " " + tr("logged"));
      walletDraft.amount = ""; walletDraft.note = "";
      renderLog();
    });
  }

  function openWalletSheet(id) {
    const existing = id ? getWallet(id) : null;
    const d = existing || {
      name: "", topupMcc: "4121", defaultCat: "transport",
      cardId: state.cards[0] ? state.cards[0].id : null, gradient: "violet"
    };
    openSheet(
      '<h2>' + (existing ? tr("Edit E-Wallet") : tr("New E-Wallet")) + '</h2>' +
      '<div class="sheet-sub">' + tr("Money you load from a card and spend later, like a ride-hailing wallet.") + '</div>' +
      '<div class="field"><label>' + tr("Name") + '</label><input id="wl_name" type="text" placeholder="Grab / Be / MoMo" value="' + esc(d.name) + '" /></div>' +
      '<div class="field"><label>' + tr("Top-up is charged as") + '</label>' +
        '<button class="picker-btn" id="wl_mcc" type="button">' +
          '<span class="glyph">' + mccInfo(d.topupMcc).icon + '</span>' +
          '<span class="body"><span class="t1">' + esc(mccInfo(d.topupMcc).name) + '</span>' +
          '<span class="t2">MCC ' + esc(d.topupMcc) + '</span></span><span class="chev">\u203a</span>' +
        '</button>' +
      '</div>' +
      '<div class="hint" style="margin:-6px 0 14px;">' + tr("The MCC your bank sees when you load the wallet — this decides the cash back rate.") + '</div>' +
      '<div class="field"><label>' + tr("Usual funding card") + '</label><select id="wl_card">' +
        '<option value="">' + tr("None") + '</option>' +
        state.cards.map((c) => '<option value="' + c.id + '" ' + (d.cardId === c.id ? "selected" : "") + '>' + esc(cardFullName(c)) + '</option>').join("") +
      '</select></div>' +
      '<div class="field"><label>' + tr("Usual spending category") + '</label><select id="wl_cat">' +
        CASH_CATEGORIES.map((c) => '<option value="' + c.id + '" ' + (d.defaultCat === c.id ? "selected" : "") + '>' + esc(tr(c.name)) + '</option>').join("") +
      '</select></div>' +
      '<div class="field"><label>' + tr("Colour") + '</label>' + swatchesHtml(d.gradient) + '</div>' +
      '<button class="btn btn-primary" id="wl_save">' + (existing ? tr("Save") : tr("Add E-Wallet")) + '</button>' +
      (existing ? '<button class="btn btn-danger" id="wl_del">' + tr("Delete") + '</button>' : "") +
      '<button class="btn btn-ghost" data-action="close-sheet">' + tr("Cancel") + '</button>'
    );
    wireSwatches();
    let pickedMcc = d.topupMcc;
    document.getElementById("wl_mcc").addEventListener("click", () => {
      openMccPicker((code) => { pickedMcc = code; d.topupMcc = code; openWalletSheet(id); },
        { onCancel: () => openWalletSheet(id) });
    });
    document.getElementById("wl_save").addEventListener("click", () => {
      const name = document.getElementById("wl_name").value.trim();
      if (!name) { toast(tr("Give it a name")); return; }
      const rec = {
        id: existing ? existing.id : uid(),
        name, topupMcc: pickedMcc,
        cardId: document.getElementById("wl_card").value || null,
        defaultCat: document.getElementById("wl_cat").value,
        gradient: pickedGrad()
      };
      if (existing) Object.assign(existing, rec);
      else state.wallets.push(rec);
      save(); closeSheet(); toast(tr("Saved")); render();
    });
    const del = document.getElementById("wl_del");
    if (del) del.addEventListener("click", () => {
      const used = state.transactions.filter((x) => x.walletId === existing.id).length;
      if (!confirm(used
        ? tr("Delete this wallet? Its") + " " + used + " " + tr("entries stay in Activity but lose their wallet link.")
        : tr("Delete this wallet?"))) return;
      state.wallets = state.wallets.filter((x) => x.id !== existing.id);
      save(); closeSheet(); toast(tr("Deleted")); render();
    });
  }

  function openWalletManager() {
    openSheet(
      '<h2>' + tr("E-Wallets") + '</h2>' +
      '<div class="sheet-sub">' + tr("Loaded from a card, spent at merchants.") + '</div>' +
      (state.wallets.length
        ? state.wallets.map((w) => {
            const bal = walletBalance(w.id);
            return '<div class="trk" data-action="edit-wallet" data-id="' + w.id + '">' +
              '<div class="trk-swatch" style="background:' + gradCss(w.gradient) + '"></div>' +
              '<div class="trk-body"><div class="trk-t1">' + esc(w.name) + '</div>' +
              '<div class="trk-t2">MCC ' + esc(w.topupMcc) + ' \u00b7 ' + esc(mccInfo(w.topupMcc).name) + '</div></div>' +
              '<div class="trk-amt num">' + money(bal) + '</div></div>';
          }).join("")
        : '<div class="empty" style="padding:24px 12px;">' + tr("No e-wallet yet.") + '</div>') +
      '<button class="btn btn-primary" data-action="add-wallet">' + tr("Add E-Wallet") + '</button>' +
      '<button class="btn btn-ghost" data-action="close-sheet">' + tr("Close") + '</button>'
    );
  }

  // ================= TRACK: payouts, subscriptions, fees, refunds =================
  let trackView = "incoming";   // incoming | recurring

  const MONTH_NAMES = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];
  const SUB_CYCLES = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

  const cardDelay = (c) =>
    (c && c.cashbackDelay != null) ? c.cashbackDelay : (state.settings.defaultCashbackDelay || 45);

  function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0);

  /* When a month's cash back should land: the statement close for that month
     (or month end when no statement day is set) plus the bank's processing delay. */
  function expectedPayoutDate(card, monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    const base = card.statementDay
      ? new Date(y, m - 1, Math.min(card.statementDay, lastDayOfMonth(y, m - 1).getDate()))
      : lastDayOfMonth(y, m - 1);
    return addDays(base, cardDelay(card));
  }

  /* Pending payouts are DERIVED from transactions, so they always match reality.
     Only the "received" tick is stored. */
  function buildPayouts() {
    const byKey = {};
    for (const t of state.transactions) {
      if (isCash(t) || !t.cardId || !(t._cb > 0)) continue;
      const c = getCard(t.cardId);
      if (!c) continue;
      // Group by the statement cycle that will actually pay it out.
      const k = t.cardId + "|" + capPeriodKey(c, t.date, "monthly");
      byKey[k] = (byKey[k] || 0) + t._cb;
    }
    const today = todayStr();
    const rows = [];
    for (const k in byKey) {
      const [cardId, monthKey] = k.split("|");
      const card = getCard(cardId);
      if (!card) continue;
      const rec = state.payouts[k] || null;
      const due = expectedPayoutDate(card, monthKey);
      rows.push({
        key: k, card, monthKey, amount: byKey[k],
        expected: due, expectedStr: ymd(due),
        received: !!rec,
        receivedDate: rec ? rec.date : null,
        receivedAmount: rec && rec.amount != null ? rec.amount : null,
        overdue: !rec && ymd(due) < today
      });
    }
    rows.sort((a, b) => (a.expectedStr < b.expectedStr ? 1 : -1));
    return rows;
  }

  /* Next date a subscription will be charged, rolled forward from its start. */
  function nextChargeDate(sub) {
    if (!sub.startDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let d = parseDate(sub.startDate);
    const step = sub.cycle === "yearly" ? 12 : sub.cycle === "quarterly" ? 3 : 1;
    let guard = 0;
    while (d < today && guard++ < 600) {
      const day = d.getDate();
      d.setMonth(d.getMonth() + step);
      // Clamp so the 31st doesn't skip a short month.
      if (d.getDate() < day) d.setDate(0);
    }
    return d;
  }

  const subMonthlyCost = (sub) =>
    sub.cycle === "yearly" ? sub.amount / 12 : sub.cycle === "quarterly" ? sub.amount / 3 : sub.amount;

  /* Next time the annual fee is charged, based on the configured month. */
  function nextAnnualFee(card) {
    if (!card.annualFee || !card.annualFeeMonth) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const y = today.getFullYear();
    let d = new Date(y, card.annualFeeMonth - 1, 1);
    if (d < today) d = new Date(y + 1, card.annualFeeMonth - 1, 1);
    return d;
  }

  function renderTrack() {
    const seg =
      '<div class="seg">' +
        '<button class="seg-btn ' + (trackView === "incoming" ? "on" : "") + '" data-action="track-view" data-v="incoming">' + tr("Incoming") + '</button>' +
        '<button class="seg-btn ' + (trackView === "bills" ? "on" : "") + '" data-action="track-view" data-v="bills">' + tr("Statements") + '</button>' +
        '<button class="seg-btn ' + (trackView === "recurring" ? "on" : "") + '" data-action="track-view" data-v="recurring">' + tr("Recurring") + '</button>' +
      '</div>';
    view.innerHTML = seg +
      (trackView === "incoming" ? trackIncoming()
       : trackView === "bills" ? trackBills()
       : trackRecurring());
  }

  // ---- incoming: cash back payouts + cancelled-order refunds ----
  function trackIncoming() {
    const payouts = buildPayouts();
    const pending = payouts.filter((p) => !p.received);
    const done = payouts.filter((p) => p.received);
    const owed = pending.reduce((s, p) => s + p.amount, 0);

    const openRefunds = state.refunds.filter((r) => !r.receivedDate);
    const doneRefunds = state.refunds.filter((r) => r.receivedDate);
    const refundOwed = openRefunds.reduce((s, r) => s + r.amount, 0);

    let html =
      '<div class="stat-2" style="margin-bottom:6px;">' +
        '<div class="stat"><div class="k">' + tr("Cash back owed") + '</div><div class="v mint num">' + money(owed) + '</div></div>' +
        '<div class="stat"><div class="k">' + tr("Refunds owed") + '</div><div class="v num">' + money(refundOwed) + '</div></div>' +
      '</div>';

    html += '<div class="section-title">' + tr("Cash Back Payouts") + '</div>';
    if (!pending.length && !done.length) {
      html += '<div class="empty" style="padding:26px 14px;">No cash back earned yet.<br>Log a card purchase and it will appear here.</div>';
    } else {
      if (!pending.length) html += '<div class="empty" style="padding:20px 14px;">Everything has been received.</div>';
      html += pending.map(payoutRow).join("");
      if (done.length) {
        html += '<div class="sub-head">Received (' + done.length + ')</div>' +
          done.slice(0, 6).map(payoutRow).join("");
      }
    }

    html += '<div class="section-title">Cancelled Order Refunds' +
      '<span class="link" data-action="add-refund">+ Add</span></div>';
    if (!openRefunds.length && !doneRefunds.length) {
      html += '<div class="empty" style="padding:26px 14px;">Nothing waiting.<br>Add a cancelled order and tick it once the money is back.</div>';
    } else {
      html += openRefunds.map(refundRow).join("");
      if (doneRefunds.length) {
        html += '<div class="sub-head">Refunded (' + doneRefunds.length + ')</div>' +
          doneRefunds.slice(0, 6).map(refundRow).join("");
      }
    }
    return html;
  }

  function payoutRow(p) {
    const cls = p.received ? "done" : p.overdue ? "late" : "";
    const days = p.received ? null : daysUntil(p.expected);
    const when = p.received
      ? "Received " + dateLabel(p.receivedDate)
      : days === 0 ? "Expected today"
      : days > 0 ? "Expected " + dateLabel(p.expectedStr) + " · in " + days + " day" + (days === 1 ? "" : "s")
      : "Expected " + dateLabel(p.expectedStr) + " · " + Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s") + " late";
    const adj = p.receivedAmount != null && Math.abs(p.receivedAmount - p.amount) > 0.5;
    return '<div class="trk ' + cls + '" data-action="edit-payout" data-key="' + esc(p.key) + '">' +
      '<button class="trk-tick ' + (p.received ? "on" : "") + '" data-action="toggle-payout" data-key="' + esc(p.key) + '" aria-label="Mark received">' +
        (p.received ? "✓" : "") +
      '</button>' +
      '<div class="trk-body">' +
        '<div class="trk-t1">' + esc(p.card.name) + ' · ' +
          (p.card.statementDay ? cycleLabel(p.card, p.monthKey) : monthLabel(p.monthKey)) + '</div>' +
        '<div class="trk-t2">' + when +
          (adj ? ' · adjusted from ' + money(p.amount) : "") + '</div>' +
      '</div>' +
      '<div class="trk-amt num">' + money(p.receivedAmount != null ? p.receivedAmount : p.amount) +
        (adj ? '<span class="trk-adj">edited</span>' : "") + '</div>' +
    '</div>';
  }

  /* Lets you replace the calculated figure with what the bank actually paid,
     or add an extra adjustment on top of it. */
  function openPayoutSheet(key) {
    const row = buildPayouts().find((p) => p.key === key);
    if (!row) return;
    const current = row.receivedAmount != null ? row.receivedAmount : row.amount;
    openSheet(
      '<h2>Cash Back Payout</h2>' +
      '<div class="sheet-sub">' + esc(row.card.name) + ' · ' +
        (row.card.statementDay ? cycleLabel(row.card, row.monthKey) : monthLabel(row.monthKey)) + '</div>' +
      '<div class="stat-2" style="margin-bottom:14px;">' +
        '<div class="stat"><div class="k">Calculated</div><div class="v num">' + money(row.amount) + '</div></div>' +
        '<div class="stat"><div class="k">Expected</div><div class="v num" style="font-size:16px;">' + dateLabel(row.expectedStr) + '</div></div>' +
      '</div>' +
      '<div class="field"><label>Amount actually paid</label>' +
        '<div class="amount-input"><input id="po_amount" type="text" inputmode="numeric" value="' + formatVnd(Math.round(current)) + '" /><span class="cur">₫</span></div>' +
      '</div>' +
      '<div class="field"><label>Add / subtract an adjustment</label>' +
        '<div class="amount-input"><input id="po_adj" type="text" inputmode="numeric" placeholder="0" /><span class="cur">₫</span></div>' +
      '</div>' +
      '<div class="hint" style="margin:-6px 0 14px;">Type a number and tap Add to bump the amount above, or edit the amount directly. Prefix with a minus to subtract.</div>' +
      '<div class="inline-actions" style="margin-bottom:12px;">' +
        '<button class="btn btn-secondary" id="po_add">Add to amount</button>' +
      '</div>' +
      '<div class="field"><label>Received on</label>' +
        '<input id="po_date" type="date" value="' + (row.receivedDate || todayStr()) + '" />' +
      '</div>' +
      '<button class="btn btn-primary" id="po_save">' + (row.received ? "Save" : "Mark received") + '</button>' +
      (row.received ? '<button class="btn btn-secondary" id="po_unmark">Mark as not received</button>' : "") +
      (row.receivedAmount != null ? '<button class="btn btn-ghost" id="po_reset">Reset to calculated amount</button>' : "") +
      '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>'
    );
    const amtEl = document.getElementById("po_amount");
    const adjEl = document.getElementById("po_adj");
    wireMoneyInput(amtEl);
    // Allow a leading minus so an adjustment can subtract.
    adjEl.addEventListener("input", () => {
      const neg = adjEl.value.trim().startsWith("-");
      const v = formatVnd(adjEl.value);
      adjEl.value = v ? (neg ? "-" + v : v) : (neg ? "-" : "");
    });
    document.getElementById("po_add").addEventListener("click", () => {
      const neg = adjEl.value.trim().startsWith("-");
      const delta = parseVnd(adjEl.value) * (neg ? -1 : 1);
      if (!delta) { toast("Enter an adjustment first"); return; }
      amtEl.value = formatVnd(Math.max(0, parseVnd(amtEl.value) + delta));
      adjEl.value = "";
      toast(delta > 0 ? "Added " + money(delta) : "Subtracted " + money(-delta));
    });
    document.getElementById("po_save").addEventListener("click", () => {
      state.payouts[key] = {
        date: document.getElementById("po_date").value || todayStr(),
        amount: parseVnd(amtEl.value)
      };
      save(); closeSheet(); toast("Payout saved"); renderTrack();
    });
    const un = document.getElementById("po_unmark");
    if (un) un.addEventListener("click", () => {
      delete state.payouts[key];
      save(); closeSheet(); toast("Marked as not received"); renderTrack();
    });
    const rst = document.getElementById("po_reset");
    if (rst) rst.addEventListener("click", () => {
      amtEl.value = formatVnd(Math.round(row.amount));
      toast("Reset to " + money(row.amount));
    });
  }

  function refundRow(r) {
    const card = r.cardId ? getCard(r.cardId) : null;
    const doneCls = r.receivedDate ? "done" : "";
    const meta = r.receivedDate
      ? "Refunded " + dateLabel(r.receivedDate)
      : "Cancelled " + dateLabel(r.date) + (card ? " · " + esc(card.name) : "") + " · waiting";
    return '<div class="trk ' + doneCls + '" data-action="edit-refund" data-id="' + r.id + '">' +
      '<button class="trk-tick ' + (r.receivedDate ? "on" : "") + '" data-action="toggle-refund" data-id="' + r.id + '" aria-label="Mark refunded">' +
        (r.receivedDate ? "✓" : "") +
      '</button>' +
      '<div class="trk-body">' +
        '<div class="trk-t1">' + esc(r.merchant || "Cancelled order") + '</div>' +
        '<div class="trk-t2">' + meta + '</div>' +
      '</div>' +
      '<div class="trk-amt num">' + money(r.amount) + '</div>' +
    '</div>';
  }

  // ---- statements: which card bills are settled ----
  function trackBills() {
    const rows = buildStatements();
    const noSetup = state.cards.filter((c) => !c.statementDay).length;

    if (!rows.length) {
      return '<div class="empty"><div class="ico">\ud83e\uddfe</div>No statements yet.' +
        (noSetup ? '<br>Set a statement close day on your cards to track bills here.' : '') + '</div>';
    }

    const open = rows.filter((r) => r.closed && !r.paid);
    const owed = open.reduce((s, r) => s + r.balance, 0);
    const overdue = open.filter((r) => r.overdue).length;

    let html =
      '<div class="stat-2" style="margin-bottom:6px;">' +
        '<div class="stat"><div class="k">' + tr("Unpaid statements") + '</div><div class="v num">' + money(owed) + '</div></div>' +
        '<div class="stat"><div class="k">' + tr("Overdue") + '</div><div class="v num"' +
          (overdue ? ' style="color:var(--rose)"' : '') + '>' + overdue + '</div></div>' +
      '</div>';

    const current = rows.filter((r) => !r.closed);
    const paid = rows.filter((r) => r.closed && r.paid);

    html += '<div class="section-title">' + tr("To Pay") + '</div>';
    html += open.length
      ? open.map(statementRow).join("")
      : '<div class="empty" style="padding:22px 14px;">Every closed statement is settled.</div>';

    if (current.length) {
      html += '<div class="section-title">' + tr("Still Open") + '</div>' + current.map(statementRow).join("");
    }
    if (paid.length) {
      html += '<div class="sub-head">Paid (' + paid.length + ')</div>' +
        paid.slice(0, 8).map(statementRow).join("");
    }
    if (noSetup) {
      html += '<div class="hint" style="margin-top:14px;">' + noSetup +
        ' card' + (noSetup === 1 ? " has" : "s have") +
        ' no statement close day set, so they can\u2019t be tracked here.</div>';
    }
    return html;
  }

  function statementRow(r) {
    const cls = r.paid ? "done" : r.overdue ? "late" : "";
    const period = cycleLabel(r.card, r.cycleKey);
    let meta;
    if (!r.closed) {
      const days = daysUntil(r.end);
      meta = period + " \u00b7 closes " + (days === 0 ? "today" : "in " + days + "d");
    } else if (r.paid) {
      meta = period + " \u00b7 paid " + dateLabel(r.paidDate);
    } else if (r.due) {
      const days = daysUntil(r.due);
      meta = period + " \u00b7 due " + dateLabel(isoDate(r.due)) +
        (days === 0 ? " \u00b7 today" : days > 0 ? " \u00b7 in " + days + "d"
          : " \u00b7 " + Math.abs(days) + "d late");
    } else {
      meta = period + " \u00b7 no due day set";
    }
    // The open cycle isn't billed yet, so it gets no tick.
    const control = r.closed
      ? '<button class="trk-tick ' + (r.paid ? "on" : "") + '" data-action="toggle-statement" data-key="' +
        esc(r.key) + '" aria-label="Mark paid">' + (r.paid ? "\u2713" : "") + '</button>'
      : '<div class="trk-swatch" style="background:' + gradCss(r.card.gradient) + '"></div>';
    return '<div class="trk ' + cls + '">' +
      control +
      '<div class="trk-body">' +
        '<div class="trk-t1">' + esc(cardFullName(r.card)) + '</div>' +
        '<div class="trk-t2">' + meta + '</div>' +
      '</div>' +
      '<div class="trk-amt num">' + money(r.paidAmount != null ? r.paidAmount : r.balance) +
        '<span class="trk-sub">' + r.n + " txn" + (r.n === 1 ? "" : "s") + '</span>' +
      '</div>' +
    '</div>';
  }

  // ---- recurring: subscriptions + annual fees ----
  function trackRecurring() {
    const subs = state.subscriptions.filter((s) => s.active !== false);
    const paused = state.subscriptions.filter((s) => s.active === false);
    const perMonth = subs.reduce((s, x) => s + subMonthlyCost(x), 0);

    const feeCards = state.cards.filter((c) => c.annualFee > 0);
    const feeTotal = feeCards.reduce((s, c) => s + c.annualFee, 0);

    let html =
      '<div class="stat-2" style="margin-bottom:6px;">' +
        '<div class="stat"><div class="k">' + tr("Subscriptions / month") + '</div><div class="v num">' + money(perMonth) + '</div></div>' +
        '<div class="stat"><div class="k">' + tr("Annual fees / year") + '</div><div class="v num">' + money(feeTotal) + '</div></div>' +
      '</div>' +
      '<div class="hint" style="margin:2px 4px 10px;">Subscriptions cost ' + money(perMonth * 12) + ' a year, plus ' + money(feeTotal) + ' in card fees.</div>';

    html += '<div class="section-title">Subscriptions<span class="link" data-action="add-sub">+ Add</span></div>';
    if (!subs.length && !paused.length) {
      html += '<div class="empty" style="padding:26px 14px;">No subscriptions tracked.<br>Add Netflix, Spotify, iCloud and the rest to see what they really cost.</div>';
    } else {
      html += subs.map(subRow).join("");
      if (paused.length) {
        html += '<div class="sub-head">Paused (' + paused.length + ')</div>' + paused.map(subRow).join("");
      }
    }

    html += '<div class="section-title">Card Annual Fees</div>';
    if (!feeCards.length) {
      html += '<div class="empty" style="padding:26px 14px;">No annual fees set.<br>Open a card in <b>Cards</b> and fill in its yearly fee.</div>';
    } else {
      html += feeCards.map((c) => {
        const next = nextAnnualFee(c);
        const when = next
          ? dateLabel(ymd(next)) + " · in " + daysUntil(next) + " days"
          : "Month not set";
        return '<div class="trk" data-action="open-card" data-id="' + c.id + '">' +
          '<div class="trk-swatch" style="background:' + gradCss(c.gradient) + '"></div>' +
          '<div class="trk-body">' +
            '<div class="trk-t1">' + esc(c.name) + '</div>' +
            '<div class="trk-t2">' + when + '</div>' +
          '</div>' +
          '<div class="trk-amt num">' + money(c.annualFee) + '</div>' +
        '</div>';
      }).join("");
    }
    return html;
  }

  function subRow(sub) {
    const card = sub.cardId ? getCard(sub.cardId) : null;
    const next = nextChargeDate(sub);
    const paused = sub.active === false;
    const when = paused ? "Paused"
      : next ? "Next " + dateLabel(ymd(next)) + " · in " + daysUntil(next) + " day" + (daysUntil(next) === 1 ? "" : "s")
      : "No start date";
    return '<div class="trk ' + (paused ? "done" : "") + '" data-action="edit-sub" data-id="' + sub.id + '">' +
      '<div class="trk-swatch" style="background:' + (card ? gradCss(card.gradient) : "#3a4150") + '"></div>' +
      '<div class="trk-body">' +
        '<div class="trk-t1">' + esc(sub.name) + '<span class="tag mcc">' + esc(SUB_CYCLES[sub.cycle] || "Monthly") + '</span></div>' +
        '<div class="trk-t2">' + (card ? esc(card.name) + " · " : "No card · ") + when + '</div>' +
      '</div>' +
      '<div class="trk-amt num">' + money(sub.amount) + '</div>' +
    '</div>';
  }

  // ---- editors ----
  function openSubSheet(id) {
    const existing = id ? state.subscriptions.find((s) => s.id === id) : null;
    const d = existing || { name: "", cardId: state.cards.length ? state.cards[0].id : null,
                            amount: 0, cycle: "monthly", startDate: todayStr(), active: true };
    openSheet(
      '<h2>' + (existing ? "Edit Subscription" : "New Subscription") + '</h2>' +
      '<div class="field"><label>Service</label><input id="sb_name" type="text" placeholder="Netflix" value="' + esc(d.name) + '" /></div>' +
      '<div class="field"><label>' + tr("Amount") + '</label>' +
        '<div class="amount-input"><input id="sb_amount" type="text" inputmode="numeric" value="' + (d.amount ? formatVnd(d.amount) : "") + '" /><span class="cur">₫</span></div>' +
      '</div>' +
      '<div class="row-2">' +
        '<div class="field"><label>Billing cycle</label><select id="sb_cycle">' +
          Object.keys(SUB_CYCLES).map((k) => '<option value="' + k + '" ' + (d.cycle === k ? "selected" : "") + '>' + SUB_CYCLES[k] + '</option>').join("") +
        '</select></div>' +
        '<div class="field"><label>First charged</label><input id="sb_start" type="date" value="' + (d.startDate || todayStr()) + '" /></div>' +
      '</div>' +
      '<div class="field"><label>Paid with</label><select id="sb_card">' +
        '<option value="">No card / cash</option>' +
        state.cards.map((c) => '<option value="' + c.id + '" ' + (d.cardId === c.id ? "selected" : "") + '>' + esc(cardFullName(c)) + '</option>').join("") +
      '</select></div>' +
      (existing ? '<label class="toggle-row" style="margin:4px 0 14px;">' +
        '<span><span class="tr-t1">Active</span><span class="tr-t2">Turn off to keep it listed but stop counting the cost</span></span>' +
        '<input type="checkbox" id="sb_active" ' + (d.active !== false ? "checked" : "") + ' /></label>' : "") +
      '<button class="btn btn-primary" id="sb_save">' + (existing ? "Save" : "Add Subscription") + '</button>' +
      (existing ? '<button class="btn btn-danger" id="sb_del">Delete</button>' : "") +
      '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>'
    );
    wireMoneyInput(document.getElementById("sb_amount"));
    document.getElementById("sb_save").addEventListener("click", () => {
      const name = document.getElementById("sb_name").value.trim();
      const amount = parseVnd(document.getElementById("sb_amount").value);
      if (!name) { toast("Give it a name"); return; }
      if (!(amount > 0)) { toast("Enter an amount"); return; }
      const activeEl = document.getElementById("sb_active");
      const rec = {
        id: existing ? existing.id : uid(),
        name, amount,
        cycle: document.getElementById("sb_cycle").value,
        startDate: document.getElementById("sb_start").value || todayStr(),
        cardId: document.getElementById("sb_card").value || null,
        active: activeEl ? activeEl.checked : true
      };
      if (existing) Object.assign(existing, rec);
      else state.subscriptions.push(rec);
      save(); closeSheet(); toast("Saved"); render();
    });
    const del = document.getElementById("sb_del");
    if (del) del.addEventListener("click", () => {
      if (!confirm("Delete this subscription?")) return;
      state.subscriptions = state.subscriptions.filter((x) => x.id !== existing.id);
      save(); closeSheet(); toast("Deleted"); render();
    });
  }

  function openRefundSheet(id) {
    const existing = id ? state.refunds.find((r) => r.id === id) : null;
    const d = existing || { merchant: "", cardId: state.cards.length ? state.cards[0].id : null,
                            amount: 0, date: todayStr(), note: "", receivedDate: null };
    openSheet(
      '<h2>' + (existing ? "Edit Refund" : "Track a Refund") + '</h2>' +
      '<div class="sheet-sub">For orders you cancelled. Tick it once the money is back.</div>' +
      '<div class="field"><label>Merchant / order</label><input id="rf_merchant" type="text" placeholder="Shopee order" value="' + esc(d.merchant) + '" /></div>' +
      '<div class="field"><label>' + tr("Amount") + '</label>' +
        '<div class="amount-input"><input id="rf_amount" type="text" inputmode="numeric" value="' + (d.amount ? formatVnd(d.amount) : "") + '" /><span class="cur">₫</span></div>' +
      '</div>' +
      '<div class="row-2">' +
        '<div class="field"><label>Cancelled on</label><input id="rf_date" type="date" value="' + (d.date || todayStr()) + '" /></div>' +
        '<div class="field"><label>Paid with</label><select id="rf_card">' +
          '<option value="">No card / cash</option>' +
          state.cards.map((c) => '<option value="' + c.id + '" ' + (d.cardId === c.id ? "selected" : "") + '>' + esc(cardFullName(c)) + '</option>').join("") +
        '</select></div>' +
      '</div>' +
      '<div class="field"><label>' + tr("Note") + '</label><input id="rf_note" type="text" placeholder="' + tr("Optional") + '" value="' + esc(d.note || "") + '" /></div>' +
      '<button class="btn btn-primary" id="rf_save">' + (existing ? "Save" : "Add") + '</button>' +
      (existing ? '<button class="btn btn-danger" id="rf_del">Delete</button>' : "") +
      '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>'
    );
    wireMoneyInput(document.getElementById("rf_amount"));
    document.getElementById("rf_save").addEventListener("click", () => {
      const merchant = document.getElementById("rf_merchant").value.trim();
      const amount = parseVnd(document.getElementById("rf_amount").value);
      if (!merchant) { toast("Name the order"); return; }
      if (!(amount > 0)) { toast("Enter an amount"); return; }
      const rec = {
        id: existing ? existing.id : uid(),
        merchant, amount,
        date: document.getElementById("rf_date").value || todayStr(),
        cardId: document.getElementById("rf_card").value || null,
        note: document.getElementById("rf_note").value.trim(),
        receivedDate: existing ? existing.receivedDate : null
      };
      if (existing) Object.assign(existing, rec);
      else state.refunds.push(rec);
      save(); closeSheet(); toast("Saved"); render();
    });
    const del = document.getElementById("rf_del");
    if (del) del.addEventListener("click", () => {
      if (!confirm("Delete this refund?")) return;
      state.refunds = state.refunds.filter((x) => x.id !== existing.id);
      save(); closeSheet(); toast("Deleted"); render();
    });
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
    const totalSpend = txns.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
    const totalCb = txns.reduce((s, t) => s + t._cb, 0);
    const cashSpend = txns.filter(isCash).reduce((s, t) => s + t.amount, 0);
    const cardSpend = totalSpend - cashSpend;

    const controls =
      '<div class="chips">' +
        '<button class="chip ' + (statsRange === "month" ? "active" : "") + '" data-action="stats-range" data-v="month">' + tr("This month") + '</button>' +
        '<button class="chip ' + (statsRange === "last" ? "active" : "") + '" data-action="stats-range" data-v="last">' + tr("Last month") + '</button>' +
        '<button class="chip ' + (statsRange === "all" ? "active" : "") + '" data-action="stats-range" data-v="all">' + tr("All time") + '</button>' +
      '</div>' +
      '<div class="seg">' +
        '<button class="seg-btn ' + (statsView === "pie" ? "on" : "") + '" data-action="stats-view" data-v="pie">' + tr("Pie") + '</button>' +
        '<button class="seg-btn ' + (statsView === "bars" ? "on" : "") + '" data-action="stats-view" data-v="bars">' + tr("Bars") + '</button>' +
      '</div>' +
      '<button class="btn btn-secondary" data-action="open-report" style="margin-bottom:13px;">' + tr("Export Monthly Report") + '</button>';

    if (!txns.length) {
      view.innerHTML = controls + '<div class="empty"><div class="ico">📊</div>Nothing logged in ' + esc(label) + '.</div>';
      return;
    }

    // Category rows — cash and card unified into the same MCC groups.
    const byGroup = {};
    for (const t of txns) {
      // Top-ups carry their cash back but no category — the wallet spend has it.
      const g = txnGroup(t);
      const e = byGroup[g] || (byGroup[g] = { value: 0, cb: 0, n: 0 });
      if (countsAsSpend(t)) { e.value += t.amount; e.n++; }
      e.cb += t._cb;
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
        value: tx.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0),
        cb: tx.reduce((s, t) => s + t._cb, 0), n: tx.filter(countsAsSpend).length
      };
    }).filter((r) => r.value > 0);
    if (cashSpend > 0) {
      srcRows.push({ key: "__cash", name: "Cash", icon: "💵", value: cashSpend, cb: 0, n: txns.filter(isCash).length });
    }
    srcRows.sort((a, b) => b.value - a.value);
    /* Chart colour must separate the series, and users pick card finishes that
       are often near-identical (two navies, two golds). So the payment-source
       chart uses the validated categorical palette in fixed rank order instead
       of the card's own finish — the card colour stays on the Cards tab where it
       identifies the physical card. Cash always takes the neutral slot. */
    const srcPalette = {};
    srcRows.forEach((r, i) => {
      srcPalette[r.key] = r.key === "__cash" ? PIE_OTHER : PIE_COLORS[i % PIE_COLORS.length];
    });
    const srcColor = (r) => srcPalette[r.key];

    let body;
    if (statsView === "pie") {
      const srcSlices = srcRows.map((r) => Object.assign({}, r, { color: srcColor(r) }));
      body =
        '<div class="section-title">' + tr("Spending by Category") + '<span class="link num">' + money(totalSpend) + '</span></div>' +
        donut(catSlices, moneyShort(totalSpend), label) +
        '<div class="legend">' + legendRows(catSlices, totalSpend) + '</div>' +
        '<div class="section-title">' + tr("Where It Was Paid From") + '</div>' +
        donut(srcSlices, moneyShort(totalSpend), "total spend") +
        '<div class="legend">' + legendRows(srcSlices, totalSpend) + '</div>';
    } else {
      const maxCat = catRows[0].value || 1;
      const maxSrc = srcRows.length ? srcRows[0].value : 1;
      const shareBar = srcRows.length > 1
        ? '<div class="share-bar">' + srcRows.map((r) => '<i style="flex:' + r.value + ';background:' + srcColor(r) + '"></i>').join("") + '</div>'
        : "";
      body =
        '<div class="section-title">' + tr("Spending by Category") + '<span class="link num">' + money(totalSpend) + '</span></div>' +
        barRows(catRows, totalSpend, maxCat, () => "linear-gradient(90deg, var(--gold), #e8cf9e)") +
        '<div class="section-title">' + tr("Where It Was Paid From") + '</div>' + shareBar +
        barRows(srcRows, totalSpend, maxSrc, srcColor);
    }

    view.innerHTML = controls +
      '<div class="stat-2" style="margin-bottom:6px;">' +
        '<div class="stat"><div class="k">' + tr("Total spent") + '</div><div class="v num">' + money(totalSpend) + '</div></div>' +
        '<div class="stat"><div class="k">' + tr("Cash back") + '</div><div class="v mint num">' + money(totalCb) + '</div></div>' +
      '</div>' +
      '<div class="stat-2" style="margin-bottom:6px;">' +
        '<div class="stat"><div class="k">' + tr("On cards") + '</div><div class="v num">' + money(cardSpend) + '</div></div>' +
        '<div class="stat"><div class="k">' + tr("In cash") + '</div><div class="v num">' + money(cashSpend) + '</div></div>' +
      '</div>' +
      body;
  }

  // ================= LOG =================
  const draft = { cardId: null, mcc: null, amount: "", date: null, note: "" };

  /* One "Add" tab for both payment methods — a segmented control beats two
     near-identical tabs competing for space in the bar. */
  let logMode = "card";   // card | cash | wallet

  function renderLog() {
    const seg =
      '<div class="seg seg-lg">' +
        '<button class="seg-btn ' + (logMode === "card" ? "on" : "") + '" data-action="log-mode" data-v="card">' + tr("Card") + '</button>' +
        '<button class="seg-btn ' + (logMode === "cash" ? "on" : "") + '" data-action="log-mode" data-v="cash">' + tr("Cash") + '</button>' +
        '<button class="seg-btn ' + (logMode === "wallet" ? "on" : "") + '" data-action="log-mode" data-v="wallet">' + tr("Wallet") + '</button>' +
      '</div>';
    if (logMode === "cash") renderCashForm();
    else if (logMode === "wallet") renderWalletForm();
    else renderLogCard();
    view.insertAdjacentHTML("afterbegin", seg);
  }

  function renderLogCard() {
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
          <label>${tr("Amount")}</label>
          <div class="amount-input">
            <input id="f_amount" type="text" inputmode="numeric" placeholder="0" value="${esc(draft.amount)}" />
            <span class="cur">₫</span>
          </div>
        </div>
        <div class="field">
          <label>${tr("Card")}</label>
          <select id="f_card">
            ${state.cards.map((c) => `<option value="${c.id}" ${c.id === draft.cardId ? "selected" : ""}>${esc(cardFullName(c))}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>${tr("Category")}</label>
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
          <div class="field"><label>${tr("Date")}</label><input id="f_date" type="date" value="${draft.date}" /></div>
          <div class="field"><label>${tr("Note")}</label><input id="f_note" type="text" placeholder="${tr("Optional")}" value="${esc(draft.note)}" /></div>
        </div>
        <button type="button" class="btn btn-ghost" id="mccPick" style="margin-top:2px;font-size:13px;">${tr("Pick an exact MCC instead ›")}</button>
      </div>
      <div id="pv"></div>
      <button class="btn btn-primary" id="saveTxn">${tr("Add Purchase")}</button>
      <button class="btn btn-ghost" id="bestCard">${tr("Which card is best for this?")}</button>
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
      const cls = q.capped ? "capped" : q.rule ? "" : "base";
      let note;
      if (!q.rule) {
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
      // The minimum-spend shortfall rides along as a separate warning line rather
      // than replacing the earned figure.
      const minNote = q.belowMin
        ? `<div class="pv-warn">Cycle is ${money(q.shortfall)} short of the ` +
          `${money(q.gateKind === "rule" ? q.rule.minSpend : card.cardCap.minSpend)} minimum ` +
          `${q.gateKind === "rule" ? "on this category" : "on this card"} — the bank may hold payout until it's met.</div>`
        : "";
      pv.innerHTML = `<div class="preview ${cls}">
        <div class="pv-top">
          <span class="pv-amt num">${money(q.cashback)}</span>
          <span class="pv-rate">${q.rate}%${q.capped ? " (capped)" : ""}</span>
        </div>
        <div class="pv-note">${note}</div>
        ${minNote}
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
  /* Gallery shows full card art (one card fills most of the screen); List keeps
     every card visible at once so you don't scroll to the end to find one. */
  let cardsView = "gallery";   // gallery | list

  function cardListRow(c) {
    const t = cardTotals(c.id);
    const best = c.rules.length ? Math.max(...c.rules.map((r) => r.rate)) : c.baseRate;
    return `<div class="clist" data-action="open-card" data-id="${c.id}">
      <div class="cl-face ${isLightGradient(c.gradient) ? "light" : ""}" style="background:${gradCss(c.gradient)}">
        <span class="cm-chip"></span>
        <span class="cm-l4">${c.last4 ? esc(c.last4) : "••••"}</span>
      </div>
      <div class="cl-body">
        <div class="cl-name">${esc(c.name)}</div>
        <div class="cl-meta">${c.issuer ? esc(c.issuer) : "Card"} · up to ${best}%${dueBadgeHtml(c) ? " " + dueBadgeHtml(c) : ""}</div>
      </div>
      <div class="cl-tail">
        <div class="cl-cb num">${money(t.monthCashback)}</div>
        <div class="cl-sp num">${moneyShort(t.monthSpent)} spent</div>
      </div>
    </div>`;
  }

  function renderCards() {
    if (!state.cards.length) {
      view.innerHTML = `<div class="empty"><div class="ico">💳</div>No cards yet.<br>Tap <b>Add</b> in the top right.</div>`;
      return;
    }
    const mk = todayStr().slice(0, 7);
    const mTx = state.transactions.filter((t) => t.date.slice(0, 7) === mk);
    const monthCb = mTx.reduce((s, t) => s + t._cb, 0);
    const monthSp = mTx.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
    const lifetimeCb = state.transactions.reduce((s, t) => s + t._cb, 0);

    view.innerHTML = `
      <div class="hero" style="padding:20px;">
        <div class="label">All cards · ${monthLabel(mk)}</div>
        <div class="big num">${money(monthCb)}</div>
        <div class="sub">
          <div class="item"><div class="k">${tr("Spent")}</div><div class="v num">${moneyShort(monthSp)}</div></div>
          <div class="item"><div class="k">${tr("Purchases")}</div><div class="v num">${mTx.length}</div></div>
          <div class="item"><div class="k">${tr("Lifetime")}</div><div class="v num">${moneyShort(lifetimeCb)}</div></div>
        </div>
      </div>
      ${state.cards.length > 1 ? `<div class="seg">
        <button class="seg-btn ${cardsView === "gallery" ? "on" : ""}" data-action="cards-view" data-v="gallery">${tr("Gallery")}</button>
        <button class="seg-btn ${cardsView === "list" ? "on" : ""}" data-action="cards-view" data-v="list">${tr("List")}</button>
      </div>` : ""}
      <div class="section-title">${tr("Your Cards")}
        ${state.cards.length > 1 ? `<span class="link" data-action="toggle-reorder-cards">${reorderCards ? "Done" : "Reorder"}</span>` : ""}
      </div>
      ${reorderCards ? `<div class="hint" style="margin:-2px 4px 10px;">Press and drag a handle to move a card.</div>` : ""}
      ${cardsView === "list" && !reorderCards
        ? `<div class="clist-wrap">${state.cards.map(cardListRow).join("")}</div>`
        : `<div class="card-stack ${reorderCards ? "reorder" : ""}" id="cardsStack">${state.cards.map((c) => {
      const t = cardTotals(c.id);
      const best = c.rules.length ? Math.max(...c.rules.map((r) => r.rate)) : c.baseRate;
      return `<div class="${ccClass(c.gradient)}" style="${gradStyle(c.gradient)}" ${reorderCards ? `data-drag-id="${c.id}"` : `data-action="open-card" data-id="${c.id}"`}>
        ${reorderCards ? `<div class="cc-drag-handle drag-handle">${DRAG_HANDLE_SVG}</div>` : ""}
        <div class="cc-sheen"></div>
        <div class="cc-top">
          <div class="cc-brand">
            ${c.issuer ? `<div class="cc-issuer">${esc(c.issuer)}</div>` : ""}
            <div class="cc-name">${esc(c.name)}</div>
          </div>
          <div class="cc-rate">${best}<span>%</span></div>
        </div>
        <div class="cc-mid">
          <div class="cc-chip"></div>
          ${CONTACTLESS_SVG}
        </div>
        <div class="cc-number num">${cardNumberDisplay(c.last4)}</div>
        <div class="cc-base">${dueBadgeHtml(c) || ""}</div>
      </div>
      ${reorderCards ? "" : `<div class="cstat">
        <div class="cstat-row">
          <div class="cs">
            <div class="cs-k">${tr("Spent")} · ${esc(shortMonth(mk))}</div>
            <div class="cs-v num">${money(t.monthSpent)}</div>
          </div>
          <div class="cs">
            <div class="cs-k">${tr("Cash back")} · ${esc(shortMonth(mk))}</div>
            <div class="cs-v num mint">${money(t.monthCashback)}</div>
          </div>
        </div>
        ${t.hasCycle ? `<div class="cstat-div"></div>
        <div class="cstat-row">
          <div class="cs">
            <div class="cs-k">${tr("This statement")}<em>${esc(t.cycleLabel)}</em></div>
            <div class="cs-v num">${money(t.cycleCashback)}</div>
          </div>
          <div class="cs">
            <div class="cs-k">${tr("Last statement")}<em>${esc(t.prevCycleLabel)}</em></div>
            <div class="cs-v num muted">${money(t.prevCycleCashback)}</div>
          </div>
        </div>` : `<div class="cstat-div"></div>
        <div class="cstat-note">Set a statement close day to track cash back by statement cycle.</div>`}
      </div>`}`;
    }).join("")}</div>`}`;
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
      <div class="row-2">
        <div class="field">
          <label>Cash Back Paid After (days)</label>
          <input id="c_cbdelay" type="number" min="0" max="180" placeholder="45" value="${c.cashbackDelay != null ? c.cashbackDelay : ""}" />
        </div>
        <div class="field">
          <label>Annual Fee (₫)</label>
          <input id="c_fee" type="text" inputmode="numeric" placeholder="0" value="${c.annualFee ? formatVnd(c.annualFee) : ""}" />
        </div>
      </div>
      <div class="field">
        <label>Annual Fee Charged (month)</label>
        <select id="c_feemonth">
          <option value="">Not set</option>
          ${MONTH_NAMES.map((m, i) => `<option value="${i + 1}" ${c.annualFeeMonth === i + 1 ? "selected" : ""}>${m}</option>`).join("")}
        </select>
      </div>
      <div class="hint">How long your bank takes to credit cash back, and when the yearly fee hits. Both show up on the Track tab.</div>
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
    const delayEl = document.getElementById("c_cbdelay");
    const feeEl = document.getElementById("c_fee");
    const feeMonthEl = document.getElementById("c_feemonth");
    return {
      name: document.getElementById("c_name").value.trim(),
      issuer: document.getElementById("c_issuer").value.trim(),
      last4: document.getElementById("c_last4").value.trim().slice(0, 4),
      baseRate: baseEl ? (parseFloat(baseEl.value) || 0) : ((existing && existing.baseRate) || 0),
      statementDay: parseInt(document.getElementById("c_stmt").value, 10) || null,
      dueDay: parseInt(document.getElementById("c_due").value, 10) || null,
      // Blank means "use the global default", so keep null rather than coercing to 0.
      cashbackDelay: delayEl && delayEl.value !== "" ? Math.max(0, parseInt(delayEl.value, 10) || 0) : null,
      annualFee: feeEl ? parseVnd(feeEl.value) : ((existing && existing.annualFee) || 0),
      annualFeeMonth: feeMonthEl && feeMonthEl.value ? parseInt(feeMonthEl.value, 10) : null,
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
      <button class="btn btn-primary" id="doAdd">${tr("Add Card")}</button>
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
            const unitTxt = (card.statementDay && r.cap.period === "monthly")
              ? "statement" : PERIOD_LABEL[r.cap.period];
            meta = `${r.cap.type === "spend" ? "Spend" : "Cash back"} cap ${money(r.cap.amount)} / ${unitTxt} · ${money(cur)} used`;
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
        <div class="cc-sheen"></div>
        <div class="cc-top">
          <div class="cc-brand">
            ${card.issuer ? `<div class="cc-issuer">${esc(card.issuer)}</div>` : ""}
            <div class="cc-name">${esc(card.name)}</div>
          </div>
          <div class="cc-rate">${card.rules.length ? Math.max(...card.rules.map((r) => r.rate)) : card.baseRate}<span>%</span></div>
        </div>
        <div class="cc-mid">
          <div class="cc-chip"></div>
          ${CONTACTLESS_SVG}
        </div>
        <div class="cc-number num">${cardNumberDisplay(card.last4)}</div>
        <div class="cc-base">${dueBadgeHtml(card) || ""}</div>
      </div>

      <div class="stat-2">
        <div class="stat"><div class="k">Total spent</div><div class="v num">${money(t.spent)}</div></div>
        <div class="stat"><div class="k">This month</div><div class="v mint num">${money(t.monthCashback)}</div></div>
      </div>

      ${(stmt || due) ? `<div class="section-title">Billing Cycle</div>
        ${stmt ? `<div class="alert"><div class="ic">${ICON_STATEMENT}</div><div class="body"><div class="t1">${tr("Statement closes")}</div>
          <div class="t2">${stmt.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })}</div></div>
          <div class="cnt"><div class="n num">${daysUntil(stmt)}</div><div class="u">days</div></div></div>` : ""}
        ${due ? `<div class="alert ${isCardPaid(card) ? "" : daysUntil(due) <= 5 ? "due-soon" : ""}"><div class="ic">${ICON_DUE}</div><div class="body"><div class="t1">${tr("Payment due")}</div>
          <div class="t2">${due.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })}${isCardPaid(card) ? " · <span style=\"color:var(--mint)\">paid</span>" : ""}</div></div>
          <div class="cnt"><div class="n num">${daysUntil(due)}</div><div class="u">days</div></div></div>
          <button class="btn ${isCardPaid(card) ? "btn-ghost" : "btn-primary"}" data-action="toggle-paid" data-id="${card.id}" style="margin:-4px 0 4px;">
            ${isCardPaid(card) ? "✓ Paid this cycle — tap to undo" : "Mark as Paid"}
          </button>` : ""}` : ""}

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
    /* A dropdown rather than a chip row: with several cards the chips wrapped
       into a block of buttons that dominated the screen. One line, any number
       of cards. */
    const filterName = histFilter === "all" ? "All sources"
      : histFilter === "cash" ? "Cash only"
      : cardFullName(getCard(histFilter)) || "All sources";
    const chips = '<div class="act-filter">' +
      '<span class="af-k">' + tr("Showing") + '</span>' +
      '<div class="af-sel">' +
        '<select id="histFilterSel">' +
          '<option value="all" ' + (histFilter === "all" ? "selected" : "") + '>' + tr("All sources") + '</option>' +
          state.cards.map((c) => '<option value="' + c.id + '" ' + (histFilter === c.id ? "selected" : "") + '>' + esc(cardFullName(c)) + '</option>').join("") +
          '<option value="cash" ' + (histFilter === "cash" ? "selected" : "") + '>' + tr("Cash only") + '</option>' +
        '</select>' +
        '<span class="af-val">' + esc(filterName) + '</span>' +
      '</div>' +
    '</div>';

    const scoped = state.transactions.filter((t) => histFilter === "all" || (histFilter === "cash" ? isCash(t) : t.cardId === histFilter));
    const monthKeys = [...new Set(scoped.map((t) => t.date.slice(0, 7)))].sort().reverse();
    if (histRange.mode === "month" && !monthKeys.includes(histRange.month)) {
      histRange.month = monthKeys[0] || todayStr().slice(0, 7);
    }

    const presets = '<div class="chips range-chips">' +
      HIST_PRESETS.map(([m, lbl]) =>
        '<button class="chip ' + (histRange.mode === m ? "active" : "") + '" data-action="hist-range" data-m="' + m + '">' + tr(lbl) + '</button>'
      ).join("") + '</div>';

    let detail = "";
    if (histRange.mode === "month") {
      const idx = monthKeys.indexOf(histRange.month);
      detail = `<div class="month-nav">
        <button class="month-nav-btn" data-action="hist-month" data-dir="1" ${idx < monthKeys.length - 1 ? "" : "disabled"} aria-label="Older month">‹</button>
        <div class="month-nav-label">${monthLabel(histRange.month)}</div>
        <button class="month-nav-btn" data-action="hist-month" data-dir="-1" ${idx > 0 ? "" : "disabled"} aria-label="Newer month">›</button>
      </div>`;
    } else if (histRange.mode === "custom") {
      detail = `<div class="range-custom">
        <label class="rc-field"><span>${tr("From")}</span><input type="date" id="histFrom" value="${histRange.from || ""}" /></label>
        <label class="rc-field"><span>${tr("To")}</span><input type="date" id="histTo" value="${histRange.to || ""}" /></label>
      </div>`;
    }

    const list = scoped.filter((t) => inHistRange(t.date))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));

    // Range summary doubles as confirmation of what's on screen.
    const rSpend = list.filter(countsAsSpend).reduce((sum, t) => sum + t.amount, 0);
    const rBack = list.reduce((sum, t) => sum + t._cb, 0);
    const summary = '<div class="range-sum">' +
      '<div class="rs-label">' + esc(histRangeLabel()) + '</div>' +
      '<div class="rs-nums"><span class="num">' + money(rSpend) + '</span>' +
      (rBack > 0 ? '<span class="rs-cb num">+' + money(rBack) + '</span>' : "") + '</div>' +
    '</div>';

    const header = chips + presets + detail + (list.length ? summary : "");

    if (!list.length) {
      return void (view.innerHTML = header +
        '<div class="empty">Nothing logged in ' + esc(histRangeLabel().toLowerCase()) + '.' +
        (histRange.mode === "custom" ? '<br>Try widening the dates.' : '<br>Pick another range above.') + '</div>');
    }

    // Grouped month → day, each header carrying its own totals.
    let html = header, lastMonth = null, lastDay = null;
    for (const t of list) {
      const mk = t.date.slice(0, 7);
      if (mk !== lastMonth) {
        const mTx = list.filter((x) => x.date.slice(0, 7) === mk);
        const mSpend = mTx.filter(countsAsSpend).reduce((s, x) => s + x.amount, 0);
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
        const dSpend = dTx.filter(countsAsSpend).reduce((s, x) => s + x.amount, 0);
        const dBack = dTx.reduce((s, x) => s + x._cb, 0);
        html += '<div class="day-bar">' +
          '<div class="db-left">' +
            '<div class="db-day">' + dayLabel(t.date) + '</div>' +
            '<div class="db-count">' + dTx.length + ' item' + (dTx.length === 1 ? "" : "s") + '</div>' +
          '</div>' +
          '<div class="db-right">' +
            '<div class="db-spend num">' + money(dSpend) + '</div>' +
            (dBack > 0 ? '<div class="db-cb num">+' + money(dBack) + ' back</div>' : "") +
          '</div>' +
        '</div>';
        lastDay = t.date;
      }

      if (isWalletSpend(t)) {
        // Spent from a wallet: already-earned cash back, so none shown here.
        const c = cashCat(t.cashCat);
        const w = getWallet(t.walletId);
        html += '<div class="row txn" data-action="open-wallet-txn" data-id="' + t.id + '">' +
          '<div class="glyph">' + c.icon + '</div>' +
          '<div class="body">' +
            '<div class="t1">' + esc(t.note || tr(c.name)) + '<span class="tag wal">' + tr("Wallet") + '</span></div>' +
            '<div class="t2">' + esc(w ? w.name : tr("Wallet")) + ' · ' + esc(tr(c.name)) + '</div>' +
          '</div>' +
          '<div class="tail"><div class="a1 num">' + money(t.amount) + '</div>' +
          '<div class="a2" style="color:var(--text-3)">' + tr("paid from wallet") + '</div></div>' +
        '</div>';
      } else if (isCash(t)) {
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
        const badge = (isTopup(t) ? '<span class="tag top">' + tr("TOP-UP") + '</span>' : "") +
          (t._capped ? '<span class="tag cap">CAP</span>' : t._belowMin ? '<span class="tag pend">MIN</span>' : "");
        html += '<div class="row txn" data-action="open-txn" data-id="' + t.id + '">' +
          '<div class="glyph">' + info.icon + '</div>' +
          '<div class="body">' +
            '<div class="t1">' + esc(t.note || info.name) + badge + '</div>' +
            '<div class="t2">' + (card ? esc(card.name) : "Deleted card") + ' <span class="tag mcc">' + esc(t.mcc) + '</span></div>' +
          '</div>' +
          '<div class="tail"><div class="a1 num">' + money(t.amount) + '</div>' +
          '<div class="a2 num">' + "+" + money(t._cb) + " · " + t._rate + "%" +
          '</div></div>' +
        '</div>';
      }
    }
    view.innerHTML = html;
    const fromEl = document.getElementById("histFrom");
    const toEl = document.getElementById("histTo");
    if (fromEl) fromEl.addEventListener("change", () => { histRange.from = fromEl.value || null; renderHistory(); });
    if (toEl) toEl.addEventListener("change", () => { histRange.to = toEl.value || null; renderHistory(); });
    const fsel = document.getElementById("histFilterSel");
    if (fsel) fsel.addEventListener("change", () => {
      histFilter = fsel.value;
      renderHistory();
    });
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
          <label>${tr("Amount")}</label>
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
        <div class="field"><label>${tr("Card")}</label>
          <select id="e_card">${state.cards.map((c) => `<option value="${c.id}" ${c.id === t.cardId ? "selected" : ""}>${esc(cardFullName(c))}</option>`).join("")}</select>
        </div>
        <div class="row-2">
          <div class="field"><label>${tr("Date")}</label><input id="e_date" type="date" value="${t.date}" /></div>
          <div class="field"><label>${tr("Note")}</label><input id="e_note" type="text" value="${esc(t.note || "")}" /></div>
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

  function renderCashForm() {
    if (!cashDraft.cat) cashDraft.cat = state.settings.recentCash && state.settings.recentCash[0] || "food";
    if (!cashDraft.date) cashDraft.date = todayStr();

    const mk = todayStr().slice(0, 7);
    const monthCash = state.transactions
      .filter((t) => isCash(t) && t.date.slice(0, 7) === mk)
      .reduce((s, t) => s + t.amount, 0);

    const tiles = CASH_CATEGORIES.map((c) =>
      '<button type="button" class="cat-tile ' + (c.id === cashDraft.cat ? "sel" : "") + '" data-pickcash="' + c.id + '">' +
        '<span class="ci">' + c.icon + '</span>' +
        '<span class="cn">' + esc(tr(c.name)) + '</span>' +
      '</button>').join("");

    view.innerHTML =
      '<div class="stat" style="margin-bottom:13px;">' +
        '<div class="k">' + tr("Cash spent this month") + '</div>' +
        '<div class="v num">' + money(monthCash) + '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="field">' +
          '<label>' + tr("Amount") + '</label>' +
          '<div class="amount-input">' +
            '<input id="k_amount" type="text" inputmode="numeric" placeholder="0" value="' + esc(cashDraft.amount) + '" />' +
            '<span class="cur">₫</span>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label>' + tr("Category") + '</label>' +
          '<div class="cat-grid cash-grid">' + tiles + '</div>' +
        '</div>' +
        '<div class="row-2">' +
          '<div class="field"><label>' + tr("Date") + '</label><input id="k_date" type="date" value="' + cashDraft.date + '" /></div>' +
          '<div class="field"><label>' + tr("Note") + '</label><input id="k_note" type="text" placeholder="' + tr("Optional") + '" value="' + esc(cashDraft.note) + '" /></div>' +
        '</div>' +
      '</div>' +
      '<div class="hint" style="margin:-4px 4px 14px;">Cash earns no cash back — these entries are tracked so your spending statistics are complete.</div>' +
      '<button class="btn btn-primary" id="saveCash">' + tr("Add Cash Spending") + '</button>';

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
        renderLog();
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
      renderLog();
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
        '<div class="field"><label>' + tr("Amount") + '</label>' +
          '<div class="amount-input"><input id="ke_amount" type="text" inputmode="numeric" value="' + formatVnd(t.amount) + '" /><span class="cur">₫</span></div>' +
        '</div>' +
        '<div class="field"><label>' + tr("Category") + '</label><div class="cat-grid cash-grid">' + tiles + '</div></div>' +
        '<div class="row-2">' +
          '<div class="field"><label>' + tr("Date") + '</label><input id="ke_date" type="date" value="' + t.date + '" /></div>' +
          '<div class="field"><label>' + tr("Note") + '</label><input id="ke_note" type="text" value="' + esc(t.note || "") + '" /></div>' +
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

  // ================= MONTHLY REPORT EXPORT =================
  /* Drawn straight onto a canvas so it needs no external library and works
     offline. Canvas -> PNG -> share sheet, which is the reliable route on iOS. */
  let reportMonth = null;      // YYYY-MM
  let reportThreshold = 1000000;

  function reportMonths() {
    const set = {};
    for (const t of state.transactions) set[t.date.slice(0, 7)] = true;
    const keys = Object.keys(set).sort().reverse();
    if (!keys.length) keys.push(todayStr().slice(0, 7));
    return keys;
  }

  function buildReport(monthKey, threshold) {
    const txns = state.transactions.filter((t) => t.date.slice(0, 7) === monthKey);
    const spend = txns.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
    const cb = txns.reduce((s, t) => s + t._cb, 0);
    const cash = txns.filter(isCash).reduce((s, t) => s + t.amount, 0);

    const byGroup = {};
    for (const t of txns) {
      const g = txnGroup(t);
      const e = byGroup[g] || (byGroup[g] = { value: 0, cb: 0, n: 0 });
      if (countsAsSpend(t)) { e.value += t.amount; e.n++; }
      e.cb += t._cb;
    }
    const cats = Object.keys(byGroup)
      .map((g) => Object.assign({ key: g, name: groupName(g) }, byGroup[g]))
      .sort((a, b) => b.value - a.value);

    const big = txns.filter((t) => t.amount >= threshold)
      .sort((a, b) => b.amount - a.amount);

    return { monthKey, txns, spend, cb, cash, card: spend - cash, cats, big, threshold };
  }

  function drawReport(rep) {
    const W = 1080;
    const S = 2;                       // supersample for a crisp export
    // Row heights must clear: title baseline, bar, and the sub-line beneath it.
    const rowH = 78, catH = 104;
    const headH = 300;
    const catsH = 70 + rep.cats.length * catH;
    const bigH = 70 + Math.max(1, rep.big.length) * rowH + 24;
    const H = headH + catsH + bigH + 90;

    const cv = document.createElement("canvas");
    cv.width = W * S; cv.height = H * S;
    const x = cv.getContext("2d");
    x.scale(S, S);

    const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const t1 = "#f4f6fb", t2 = "#a3adc2", t3 = "#6b7488", gold = "#d9b779", mint = "#4fd1a5";

    // background
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0d1119"); bg.addColorStop(1, "#07090f");
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    const glow = x.createRadialGradient(150, 0, 0, 150, 0, 700);
    glow.addColorStop(0, "rgba(217,183,121,0.13)"); glow.addColorStop(1, "rgba(217,183,121,0)");
    x.fillStyle = glow; x.fillRect(0, 0, W, 420);

    const M = 60;
    let y = 0;

    // header
    x.fillStyle = t3; x.font = "600 22px " + FONT;
    x.fillText("SPENDING REPORT", M, 78);
    x.fillStyle = t1; x.font = "700 52px " + FONT;
    x.fillText(monthLabel(rep.monthKey), M, 136);

    // headline stats
    y = 190;
    const stat = (label, val, color, cx) => {
      x.fillStyle = t3; x.font = "600 19px " + FONT;
      x.fillText(label, cx, y);
      x.fillStyle = color; x.font = "700 38px " + FONT;
      x.fillText(val, cx, y + 46);
    };
    stat("TOTAL SPENT", money(rep.spend), t1, M);
    stat("CASH BACK", money(rep.cb), mint, M + 380);
    stat("PURCHASES", String(rep.txns.length), t1, M + 760);

    y = 300;
    x.strokeStyle = "rgba(255,255,255,0.10)"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(M, y); x.lineTo(W - M, y); x.stroke();

    // category breakdown
    y += 52;
    x.fillStyle = t3; x.font = "600 21px " + FONT;
    x.fillText("WHERE THE MONEY WENT", M, y);
    y += 34;

    const maxCat = rep.cats.length ? rep.cats[0].value : 1;
    const barW = W - M * 2;
    for (let i = 0; i < rep.cats.length; i++) {
      const c = rep.cats[i];
      const pct = rep.spend > 0 ? (c.value / rep.spend) * 100 : 0;
      x.fillStyle = t1; x.font = "650 26px " + FONT;
      x.fillText(c.name, M, y + 26);
      x.fillStyle = t1; x.font = "700 26px " + FONT;
      x.textAlign = "right";
      x.fillText(money(c.value), W - M, y + 26);
      x.textAlign = "left";

      // bar
      const by = y + 46;
      x.fillStyle = "rgba(255,255,255,0.07)";
      roundRect(x, M, by, barW, 10, 5); x.fill();
      const g2 = x.createLinearGradient(M, 0, M + barW, 0);
      g2.addColorStop(0, gold); g2.addColorStop(1, "#e8cf9e");
      x.fillStyle = g2;
      roundRect(x, M, by, Math.max(6, (c.value / maxCat) * barW), 10, 5); x.fill();

      x.fillStyle = t3; x.font = "500 20px " + FONT;
      x.fillText(pct.toFixed(1).replace(".", ",") + "%  ·  " + c.n + (c.n === 1 ? " purchase" : " purchases"), M, by + 38);
      if (c.cb > 0) {
        x.fillStyle = mint; x.textAlign = "right";
        x.fillText(money(c.cb) + " back", W - M, by + 38);
        x.textAlign = "left";
      }
      y += catH;
    }

    // large transactions
    y += 18;
    x.strokeStyle = "rgba(255,255,255,0.10)";
    x.beginPath(); x.moveTo(M, y); x.lineTo(W - M, y); x.stroke();
    y += 50;
    x.fillStyle = t3; x.font = "600 21px " + FONT;
    x.fillText("LARGE PURCHASES  ·  OVER " + money(rep.threshold).toUpperCase(), M, y);
    y += 40;

    if (!rep.big.length) {
      x.fillStyle = t3; x.font = "500 24px " + FONT;
      x.fillText("Nothing above this amount.", M, y + 26);
    } else {
      for (const t of rep.big) {
        const card = t.cardId ? getCard(t.cardId) : null;
        x.fillStyle = t1; x.font = "620 26px " + FONT;
        const label = t.note || txnLabel(t);
        x.fillText(clip(x, label, 620), M, y + 24);
        x.fillStyle = t3; x.font = "500 20px " + FONT;
        const src = isCash(t) ? "Cash" : (card ? card.name : "Card");
        x.fillText(dateLabel(t.date) + "  ·  " + src, M, y + 54);
        x.fillStyle = t1; x.font = "700 27px " + FONT;
        x.textAlign = "right";
        x.fillText(money(t.amount), W - M, y + 24);
        if (t._cb > 0) {
          x.fillStyle = mint; x.font = "600 20px " + FONT;
          x.fillText("+" + money(t._cb), W - M, y + 54);
        }
        x.textAlign = "left";
        y += rowH;
      }
    }

    // footer
    x.fillStyle = t3; x.font = "500 18px " + FONT;
    x.fillText("Card " + money(rep.card) + "   ·   Cash " + money(rep.cash) +
               "   ·   Generated " + todayStr(), M, H - 40);

    return cv;
  }

  function roundRect(x, rx, ry, w, h, r) {
    x.beginPath();
    x.moveTo(rx + r, ry);
    x.arcTo(rx + w, ry, rx + w, ry + h, r);
    x.arcTo(rx + w, ry + h, rx, ry + h, r);
    x.arcTo(rx, ry + h, rx, ry, r);
    x.arcTo(rx, ry, rx + w, ry, r);
    x.closePath();
  }
  function clip(x, str, maxW) {
    if (x.measureText(str).width <= maxW) return str;
    let s2 = str;
    while (s2.length > 1 && x.measureText(s2 + "…").width > maxW) s2 = s2.slice(0, -1);
    return s2 + "…";
  }

  function openReportSheet() {
    const months = reportMonths();
    if (!reportMonth || months.indexOf(reportMonth) === -1) reportMonth = months[0];
    openSheet(
      '<h2>Export Report</h2>' +
      '<div class="sheet-sub">A shareable image of one month\u2019s spending.</div>' +
      '<div class="field"><label>Month</label><select id="rp_month">' +
        months.map((m) => '<option value="' + m + '" ' + (m === reportMonth ? "selected" : "") + '>' + monthLabel(m) + '</option>').join("") +
      '</select></div>' +
      '<div class="field"><label>List purchases above</label>' +
        '<div class="amount-input"><input id="rp_thresh" type="text" inputmode="numeric" value="' + formatVnd(reportThreshold) + '" /><span class="cur">₫</span></div>' +
      '</div>' +
      '<div class="hint" style="margin:-6px 0 14px;">Anything at or above this amount is listed individually in the report.</div>' +
      '<div id="rp_preview" class="rp-preview"></div>' +
      '<button class="btn btn-primary" id="rp_share">Save / Share Image</button>' +
      '<button class="btn btn-secondary" id="rp_print">Print / Save as PDF</button>' +
      '<button class="btn btn-ghost" data-action="close-sheet">Close</button>'
    );
    const threshEl = document.getElementById("rp_thresh");
    wireMoneyInput(threshEl);

    function refresh() {
      reportMonth = document.getElementById("rp_month").value;
      reportThreshold = parseVnd(threshEl.value);
      const rep = buildReport(reportMonth, reportThreshold);
      const cv = drawReport(rep);
      const box = document.getElementById("rp_preview");
      box.innerHTML = "";
      cv.style.width = "100%";
      cv.style.height = "auto";
      cv.style.borderRadius = "12px";
      box.appendChild(cv);
      return rep;
    }
    document.getElementById("rp_month").addEventListener("change", refresh);
    threshEl.addEventListener("input", refresh);
    refresh();

    document.getElementById("rp_share").addEventListener("click", async () => {
      const rep = buildReport(reportMonth, reportThreshold);
      const cv = drawReport(rep);
      const name = "spending-" + reportMonth + ".png";
      cv.toBlob(async (blob) => {
        if (!blob) { toast("Couldn't build the image"); return; }
        try {
          const file = new File([blob], name, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: "Spending " + monthLabel(reportMonth) });
            return;
          }
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        toast("Image saved");
      }, "image/png");
    });

    document.getElementById("rp_print").addEventListener("click", () => {
      const rep = buildReport(reportMonth, reportThreshold);
      const cv = drawReport(rep);
      const w = window.open("", "_blank");
      if (!w) { toast("Allow pop-ups to print"); return; }
      w.document.write(
        '<!doctype html><title>Spending ' + monthLabel(reportMonth) + '</title>' +
        '<style>@page{margin:12mm}body{margin:0}img{width:100%}</style>' +
        '<img src="' + cv.toDataURL("image/png") + '" onload="window.focus();window.print()">'
      );
      w.document.close();
    });
  }

  // ================= MORE / SETTINGS =================
  function renderMore() {
    const totalCb = state.transactions.reduce((s, t) => s + t._cb, 0);
    const snaps = loadSnapshots();
    view.innerHTML = `
      <div class="panel">
        <div class="stat-2">
          <div class="stat"><div class="k">Cards</div><div class="v num">${state.cards.length}</div></div>
          <div class="stat"><div class="k">${tr("Purchases")}</div><div class="v num">${state.transactions.length}</div></div>
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

      <div class="section-title">${tr("Language")}</div>
      <div class="panel">
        <div class="seg">
          <button class="seg-btn ${(state.settings.lang || "en") === "en" ? "on" : ""}" data-action="set-lang" data-v="en">English</button>
          <button class="seg-btn ${state.settings.lang === "vi" ? "on" : ""}" data-action="set-lang" data-v="vi">Tiếng Việt</button>
        </div>
      </div>

      <div class="section-title">${tr("Cash Back Payouts")}</div>
      <div class="panel">
        <div class="field" style="margin-bottom:8px;">
          <label>Default wait before cash back lands (days)</label>
          <input id="cbDelayDefault" type="number" min="0" max="180" value="${state.settings.defaultCashbackDelay || 45}" />
        </div>
        <div class="hint" style="margin:0;">Used on the Track tab to work out when each month's cash back is due. Any card can override this in its own settings.</div>
      </div>

      <div class="section-title">${tr("Version")}</div>
      <div class="panel">
        <div class="toggle-row" style="margin-bottom:14px;">
          <span>
            <span class="tr-t1">Cashback Tracker v${APP_VERSION}</span>
            <span class="tr-t2" id="persistState">Checking storage protection…</span>
          </span>
        </div>
        <button class="btn btn-secondary" data-action="check-update">${tr("Check for Updates")}</button>
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

      <div class="section-title">${tr("Danger Zone")}</div>
      <button class="btn btn-danger" data-action="wipe">${tr("Erase All Data")}</button>
      <div class="hint" style="text-align:center;margin-top:20px;">Cashback Tracker v${APP_VERSION} · data stored locally on this device</div>
    `;
    document.getElementById("importFile").addEventListener("change", onImport);
    const cbDelayEl = document.getElementById("cbDelayDefault");
    if (cbDelayEl) cbDelayEl.addEventListener("change", () => {
      state.settings.defaultCashbackDelay = Math.max(0, parseInt(cbDelayEl.value, 10) || 45);
      save();
      toast("Default set to " + state.settings.defaultCashbackDelay + " days");
    });
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
    else if (a === "toggle-paid") {
      togglePaid(el.dataset.id);
      toast(isCardPaid(getCard(el.dataset.id)) ? "Marked as paid" : "Marked as unpaid");
      render();
      openCardDetail(el.dataset.id);
    }
    else if (a === "filter") { histFilter = el.dataset.id; render(); }
    else if (a === "hist-range") {
      const m = el.dataset.m;
      if (m === "month" && !histRange.month) histRange.month = todayStr().slice(0, 7);
      if (m === "custom" && !histRange.from && !histRange.to) {
        // Seed a sensible window so Custom isn't blank on first open.
        const d = parseDate(todayStr()); d.setDate(d.getDate() - 29);
        histRange.from = isoDate(d); histRange.to = todayStr();
      }
      histRange.mode = m;
      renderHistory();
    }
    else if (a === "hist-month") histMonthStep(Number(el.dataset.dir));
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
    } else if (a === "open-wallet-txn") {
      openCashTxn(el.dataset.id);
    } else if (a === "open-cash") {
      openCashTxn(el.dataset.id);
    } else if (a === "goto-stats") {
      go("stats");
    } else if (a === "goto-cards") {
      go("cards");
    } else if (a === "track-view") {
      trackView = el.dataset.v;
      renderTrack();
    } else if (a === "toggle-payout") {
      const k = el.dataset.key;
      if (state.payouts[k]) delete state.payouts[k];
      else state.payouts[k] = { date: todayStr() };
      save(); renderTrack();
    } else if (a === "cards-view") {
      cardsView = el.dataset.v;
      renderCards();
    } else if (a === "set-lang") {
      state.settings.lang = el.dataset.v;
      save();
      applyTabLabels();
      titleEl.textContent = tr(TITLES[tab]);
      render();
      toast(el.dataset.v === "vi" ? "Đã chuyển sang Tiếng Việt" : "Switched to English");
    } else if (a === "wallet-mode") {
      walletDraft.mode = el.dataset.v;
      renderLog();
    } else if (a === "add-wallet") {
      openWalletSheet(null);
    } else if (a === "edit-wallet") {
      openWalletSheet(el.dataset.id);
    } else if (a === "manage-wallets") {
      openWalletManager();
    } else if (a === "log-mode") {
      logMode = el.dataset.v;
      renderLog();
    } else if (a === "open-report") {
      openReportSheet();
    } else if (a === "toggle-statement") {
      toggleStatementPaid(el.dataset.key);
      renderTrack();
    } else if (a === "edit-payout") {
      openPayoutSheet(el.dataset.key);
    } else if (a === "add-sub") {
      openSubSheet(null);
    } else if (a === "edit-sub") {
      openSubSheet(el.dataset.id);
    } else if (a === "add-refund") {
      openRefundSheet(null);
    } else if (a === "edit-refund") {
      openRefundSheet(el.dataset.id);
    } else if (a === "toggle-refund") {
      const r = state.refunds.find((x) => x.id === el.dataset.id);
      if (r) { r.receivedDate = r.receivedDate ? null : todayStr(); save(); renderTrack(); }
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
  // Settings moved out of the tab bar; the gear toggles in and out of it.
  settingsBtn.addEventListener("click", () => go(tab === "more" ? "home" : "more"));

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
