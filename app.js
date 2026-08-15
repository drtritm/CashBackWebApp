(() => {
  "use strict";

  const KEY = "cashbackTracker_v2";
  const LEGACY_KEY = "cashbackTrackerData_v1";

  // Deep, desaturated finishes — white text must stay legible over the lighter stop.
  const GRADIENTS = {
    obsidian:  ["#262a33", "#0b0e13"],
    midnight:  ["#172c46", "#080f18"],
    sapphire:  ["#20406f", "#0c1526"],
    emerald:   ["#146049", "#06201a"],
    teal:      ["#14555c", "#061e21"],
    amethyst:  ["#553281", "#1b0c30"],
    crimson:   ["#8a2230", "#2a0a10"],
    rose:      ["#8c3563", "#2c0d24"],
    gold:      ["#8a6b34", "#2f2210"],
    bronze:    ["#6f471f", "#241408"],
    slate:     ["#454e60", "#161a22"],
    forest:    ["#2f5430", "#0e180f"]
  };
  const GRADIENT_KEYS = Object.keys(GRADIENTS);

  // ---------------- state ----------------
  function blank() {
    return { cards: [], transactions: [], settings: { recentMccs: [], notify: false, notifyDays: 3 } };
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

  /* Cash back is always DERIVED from raw transactions, never stored as truth.
     Recomputing chronologically keeps caps correct after any edit or delete. */
  function recompute() {
    const acc = {};
    const sorted = [...state.transactions].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)
    );
    for (const t of sorted) {
      const card = getCard(t.cardId);
      if (!card) { t._cb = 0; t._rate = 0; t._capped = false; t._ruleId = null; continue; }
      const base = card.baseRate || 0;
      const { rule, rate } = matchRule(card, t.mcc);
      t._ruleId = rule ? rule.id : null;
      t._rate = rate;

      if (!rule || !rule.cap || !(rule.cap.amount > 0)) {
        t._cb = (t.amount * rate) / 100;
        t._capped = false;
        continue;
      }

      const k = `${card.id}|${rule.id}|${periodKey(t.date, rule.cap.period)}`;
      const a = acc[k] || (acc[k] = { cashback: 0, spend: 0 });

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
      t._cb = (eligible * rate) / 100 + (overflow * base) / 100;
      t._capped = overflow > 0.004;
      a.spend += eligible;
      a.cashback += (eligible * rate) / 100;
    }
    capUsageCache = acc;
  }
  let capUsageCache = {};

  function capUsage(card, rule, dateStr) {
    const k = `${card.id}|${rule.id}|${periodKey(dateStr || todayStr(), rule.cap.period)}`;
    return capUsageCache[k] || { cashback: 0, spend: 0 };
  }

  /* What a hypothetical purchase would earn right now (for the live preview). */
  function quote(card, mcc, amount, dateStr) {
    const base = card.baseRate || 0;
    const { rule, rate } = matchRule(card, mcc);
    if (!rule || !rule.cap || !(rule.cap.amount > 0)) {
      return { cashback: (amount * rate) / 100, rate, rule, capped: false, remaining: null };
    }
    const used = capUsage(card, rule, dateStr);
    let eligible, remaining;
    if (rule.cap.type === "spend") {
      remaining = Math.max(0, rule.cap.amount - used.spend);
      eligible = Math.min(amount, remaining);
    } else {
      remaining = Math.max(0, rule.cap.amount - used.cashback);
      eligible = rate > 0 ? Math.min(amount, (remaining * 100) / rate) : 0;
    }
    const overflow = amount - eligible;
    return {
      cashback: (eligible * rate) / 100 + (overflow * base) / 100,
      rate, rule, capped: overflow > 0.004, remaining, baseRate: base
    };
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
  function openSheet(html) {
    sheetEl.innerHTML = '<div class="sheet-handle"></div>' + html;
    sheetEl.classList.add("open");
    backdropEl.classList.add("open");
    sheetEl.scrollTop = 0;
  }
  function closeSheet() {
    sheetEl.classList.remove("open");
    backdropEl.classList.remove("open");
  }
  backdropEl.addEventListener("click", closeSheet);

  // ---------------- router ----------------
  const view = document.getElementById("view");
  const titleEl = document.getElementById("topbarTitle");
  const actionEl = document.getElementById("topbarAction");
  const tabbar = document.getElementById("tabbar");
  const TITLES = { home: "Overview", log: "New Purchase", cards: "My Cards", history: "Activity", more: "Settings" };
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
    ({ home: renderHome, log: renderLog, cards: renderCards, history: renderHistory, more: renderMore }[tab])();
  }

  // ================= HOME =================
  function renderHome() {
    if (!state.cards.length) {
      view.innerHTML = `<div class="empty"><div class="ico">💳</div>
        No cards yet.<br>Open <b>Cards</b> and add your first credit card,<br>then define its MCC bonus rules.</div>`;
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
    if (!draft.mcc) draft.mcc = state.settings.recentMccs[0] || "5812";
    if (!draft.date) draft.date = todayStr();

    const info = mccInfo(draft.mcc);
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
          <label>Merchant Category (MCC)</label>
          <button class="picker-btn" id="mccPick" type="button">
            <span class="glyph">${info.icon}</span>
            <span class="body">
              <span class="t1">${esc(info.name)}</span>
              <span class="t2">MCC ${esc(info.code)} · ${esc(info.groupName)}</span>
            </span>
            <span class="chev">›</span>
          </button>
        </div>
        <div class="field">
          <label>Card</label>
          <select id="f_card">
            ${state.cards.map((c) => `<option value="${c.id}" ${c.id === draft.cardId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="row-2">
          <div class="field"><label>Date</label><input id="f_date" type="date" value="${draft.date}" /></div>
          <div class="field"><label>Note</label><input id="f_note" type="text" placeholder="Optional" value="${esc(draft.note)}" /></div>
        </div>
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
      const cls = q.capped ? "capped" : q.rule ? "" : "base";
      let note;
      if (!q.rule) {
        note = `No bonus rule matches MCC ${draft.mcc} on this card — earning the ${q.rate}% base rate.`;
      } else if (q.capped) {
        note = `Cap reached on <b>${esc(ruleLabel(q.rule))}</b>. Part of this purchase earns ${q.rate}%, the rest drops to the ${q.baseRate}% base rate.`;
      } else {
        const unit = PERIOD_LABEL[q.rule.cap ? q.rule.cap.period : "monthly"];
        note = `Matched <b>${esc(ruleLabel(q.rule))}</b> at ${q.rate}%.` +
          (q.remaining != null ? ` ${money(Math.max(0, q.remaining - (q.rule.cap.type === "spend" ? amt : q.cashback)))} of cap left this ${unit}.` : "");
      }
      pv.innerHTML = `<div class="preview ${cls}">
        <div class="pv-top"><span class="pv-amt num">${money(q.cashback)}</span><span class="pv-rate">${q.rate}% ${q.capped ? "(capped)" : ""}</span></div>
        <div class="pv-note">${note}</div>
      </div>`;
    }

    wireMoneyInput(amtEl);
    amtEl.addEventListener("input", sync);
    cardEl.addEventListener("change", sync);
    dateEl.addEventListener("change", sync);
    noteEl.addEventListener("input", sync);
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

    openSheet(`
      <h2>${multi ? "Select MCC codes" : "Merchant category"}</h2>
      <div class="sticky-search"><input id="mccSearch" type="search" placeholder="Search name or code (e.g. 5812)" autocomplete="off" /></div>
      <div id="mccList">${body("")}</div>
      ${multi ? `<button class="btn btn-primary" id="mccDone" style="position:sticky;bottom:0;margin-top:14px;">Use ${selected.size} code(s)</button>` : ""}
    `);

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
    view.innerHTML = `<div class="card-stack">${state.cards.map((c) => {
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
          <div><div class="cc-k">${c.rules.length} rule${c.rules.length === 1 ? "" : "s"} · base ${c.baseRate}%</div>
          <div class="cc-v num">${money(t.cashback)}</div></div>
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

  function cardFormFields(c) {
    c = c || {};
    return `
      <div class="field"><label>Card Name</label><input id="c_name" type="text" placeholder="Freedom Unlimited" value="${esc(c.name || "")}" /></div>
      <div class="row-2">
        <div class="field"><label>Issuer</label><input id="c_issuer" type="text" placeholder="Chase" value="${esc(c.issuer || "")}" /></div>
        <div class="field"><label>Last 4</label><input id="c_last4" type="text" inputmode="numeric" maxlength="4" placeholder="4821" value="${esc(c.last4 || "")}" /></div>
      </div>
      <div class="field"><label>Base Rate — everything else (%)</label><input id="c_base" type="number" step="0.01" min="0" value="${c.baseRate != null ? c.baseRate : 1}" /></div>
      <div class="row-2">
        <div class="field"><label>Statement Closes (day)</label><input id="c_stmt" type="number" min="1" max="31" placeholder="e.g. 18" value="${c.statementDay || ""}" /></div>
        <div class="field"><label>Payment Due (day)</label><input id="c_due" type="number" min="1" max="31" placeholder="e.g. 15" value="${c.dueDay || ""}" /></div>
      </div>
      <div class="hint">Day of the month, 1–31. Used for the reminders on your Overview screen.</div>
      <div class="field"><label>Card Finish</label>${swatchesHtml(c.gradient || GRADIENT_KEYS[state.cards.length % GRADIENT_KEYS.length])}</div>
    `;
  }
  function readCardForm() {
    return {
      name: document.getElementById("c_name").value.trim(),
      issuer: document.getElementById("c_issuer").value.trim(),
      last4: document.getElementById("c_last4").value.trim().slice(0, 4),
      baseRate: parseFloat(document.getElementById("c_base").value) || 0,
      statementDay: parseInt(document.getElementById("c_stmt").value, 10) || null,
      dueDay: parseInt(document.getElementById("c_due").value, 10) || null,
      gradient: pickedGrad()
    };
  }

  function openAddCard() {
    openSheet(`<h2>Add Card</h2><div class="sheet-sub">You can add bonus rules right after.</div>
      ${cardFormFields()}
      <button class="btn btn-primary" id="doAdd">Add Card</button>
      <button class="btn btn-ghost" data-action="close-sheet">Cancel</button>`);
    wireSwatches();
    document.getElementById("doAdd").addEventListener("click", () => {
      const f = readCardForm();
      if (!f.name) { toast("Give the card a name"); return; }
      const card = Object.assign({ id: uid(), rules: [] }, f);
      state.cards.push(card);
      save();
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

      <div class="section-title">Bonus Rules <span class="link" data-action="add-rule" data-cardid="${card.id}">+ Add rule</span></div>
      ${rulesHtml}

      <div class="divider"></div>
      <div class="section-title" style="margin-top:0;">Card Settings</div>
      ${cardFormFields(card)}
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
          <div class="hint">Covers every MCC in the group — e.g. Dining includes 5812, 5814, 5813 and more.</div>
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
          <div class="hint">Use this when a card bonuses only certain merchants, not the whole group.</div>
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
      ["r_capType", "r_capPeriod", "r_group"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("change", readInputs);
      });
      wireMoneyInput(document.getElementById("r_capAmt"));
      const mccBtn = document.getElementById("r_mccBtn");
      if (mccBtn) {
        mccBtn.addEventListener("click", () => {
          readInputs();
          openMccPicker((codes) => { draftRule.mccCodes = codes; paint(); }, { multi: true, selected: draftRule.mccCodes });
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
          <div class="t1">${esc(t.note || info.name)}${t._capped ? '<span class="tag cap">CAP</span>' : ""}</div>
          <div class="t2">${card ? esc(card.name) : "Deleted card"} · ${dateLabel(t.date)} <span class="tag mcc">${esc(t.mcc)}</span></div>
        </div>
        <div class="tail">
          <div class="a1 num">${money(t.amount)}</div>
          <div class="a2 num">+${money(t._cb)} · ${t._rate}%</div>
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
        openMccPicker((code) => { mcc = code; paint(); });
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

  // ================= MORE / SETTINGS =================
  function renderMore() {
    const totalCb = state.transactions.reduce((s, t) => s + t._cb, 0);
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

      <div class="section-title">Backup</div>
      <div class="panel">
        <div class="hint" style="margin:0 0 14px;">Everything lives only on this device. Export regularly so you don't lose history if you reinstall.</div>
        <button class="btn btn-secondary" data-action="export">Export Backup (JSON)</button>
        <label class="btn btn-secondary" style="margin-top:10px;">Import Backup
          <input type="file" id="importFile" accept="application/json,.json" hidden />
        </label>
      </div>

      <div class="section-title">Danger Zone</div>
      <button class="btn btn-danger" data-action="wipe">Erase All Data</button>
      <div class="hint" style="text-align:center;margin-top:20px;">Cashback Tracker · data stored locally on this device</div>
    `;
    document.getElementById("importFile").addEventListener("change", onImport);
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
      const f = readCardForm();
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
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminders(false); });

  go("home");
  setTimeout(() => checkReminders(false), 1200);
})();
