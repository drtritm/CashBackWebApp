(() => {
  "use strict";

  const STORAGE_KEY = "cashbackTrackerData_v1";
  const COLORS = ["#17c689", "#3aa0ff", "#ff9f43", "#ff5d8f", "#a58bff", "#ffd93d", "#4ecdc4", "#ff6b6b"];

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { cards: [], transactions: [] };
      const data = JSON.parse(raw);
      if (!Array.isArray(data.cards)) data.cards = [];
      if (!Array.isArray(data.transactions)) data.transactions = [];
      return data;
    } catch (e) {
      console.error("Failed to load data", e);
      return { cards: [], transactions: [] };
    }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = load();

  // ---------- utils ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function todayStr() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function monthKeyOf(dateStr) {
    return dateStr.slice(0, 7);
  }
  function monthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  function dateLabel(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function money(n) {
    return "$" + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function getCard(id) {
    return state.cards.find((c) => c.id === id);
  }
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // ---------- cashback engine ----------
  // Returns { rate, cap, matchedRuleId } for a card+category combo
  function resolveRate(card, category) {
    const rule = card.rules.find((r) => r.category === category);
    if (rule) return { rate: rule.rate, cap: rule.cap, ruleId: rule.id };
    return { rate: card.baseRate, cap: null, ruleId: null };
  }

  function alreadyEarnedThisMonth(cardId, category, monthKey, excludeTxnId) {
    return state.transactions
      .filter((t) => t.cardId === cardId && t.category === category && monthKeyOf(t.date) === monthKey && t.id !== excludeTxnId)
      .reduce((sum, t) => sum + t.cashback, 0);
  }

  // Computes the cashback for a transaction given current other transactions (cap-aware)
  function computeCashback(card, category, amount, dateStr, excludeTxnId) {
    const { rate, cap } = resolveRate(card, category);
    const raw = (amount * rate) / 100;
    if (cap == null) return { cashback: raw, rate, capped: false };
    const mk = monthKeyOf(dateStr);
    const already = alreadyEarnedThisMonth(card.id, category, mk, excludeTxnId);
    const remaining = Math.max(0, cap - already);
    const earned = Math.min(raw, remaining);
    return { cashback: earned, rate, capped: earned < raw - 0.001 };
  }

  function cardCategories(card) {
    const cats = card.rules.map((r) => r.category);
    return [...cats, "Other"];
  }

  function cardTotals(cardId) {
    const txns = state.transactions.filter((t) => t.cardId === cardId);
    const spent = txns.reduce((s, t) => s + t.amount, 0);
    const cashback = txns.reduce((s, t) => s + t.cashback, 0);
    const mk = monthKeyOf(todayStr());
    const monthCashback = txns.filter((t) => monthKeyOf(t.date) === mk).reduce((s, t) => s + t.cashback, 0);
    const monthSpent = txns.filter((t) => monthKeyOf(t.date) === mk).reduce((s, t) => s + t.amount, 0);
    return { spent, cashback, monthCashback, monthSpent, count: txns.length };
  }

  // ---------- sheet (bottom modal) ----------
  const sheetEl = document.getElementById("sheet");
  const backdropEl = document.getElementById("sheetBackdrop");

  function openSheet(html) {
    sheetEl.innerHTML = '<div class="sheet-handle"></div>' + html;
    sheetEl.classList.add("open");
    backdropEl.classList.add("open");
  }
  function closeSheet() {
    sheetEl.classList.remove("open");
    backdropEl.classList.remove("open");
  }
  backdropEl.addEventListener("click", closeSheet);

  // ---------- tabs / router ----------
  const view = document.getElementById("view");
  const topbarTitle = document.getElementById("topbarTitle");
  const tabbar = document.getElementById("tabbar");
  const TAB_TITLES = { dashboard: "Dashboard", log: "Log Purchase", cards: "My Cards", history: "History", settings: "Settings" };
  let currentTab = "dashboard";
  let historyFilterCardId = "all";

  function switchTab(tab) {
    currentTab = tab;
    topbarTitle.textContent = TAB_TITLES[tab];
    [...tabbar.children].forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
    render();
  }
  tabbar.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (btn) switchTab(btn.dataset.tab);
  });

  function render() {
    if (currentTab === "dashboard") renderDashboard();
    else if (currentTab === "log") renderLog();
    else if (currentTab === "cards") renderCards();
    else if (currentTab === "history") renderHistory();
    else if (currentTab === "settings") renderSettings();
  }

  // ================= DASHBOARD =================
  function renderDashboard() {
    const totalCashback = state.transactions.reduce((s, t) => s + t.cashback, 0);
    const mk = monthKeyOf(todayStr());
    const monthCashback = state.transactions.filter((t) => monthKeyOf(t.date) === mk).reduce((s, t) => s + t.cashback, 0);

    let cardsHtml = "";
    if (state.cards.length === 0) {
      cardsHtml = `<div class="empty-state">No cards yet.<br>Head to the <b>Cards</b> tab to add your first credit card and its cash back rules.</div>`;
    } else {
      const sorted = [...state.cards].sort((a, b) => cardTotals(b.id).cashback - cardTotals(a.id).cashback);
      cardsHtml = sorted
        .map((c) => {
          const t = cardTotals(c.id);
          const initials = c.name.trim().slice(0, 2).toUpperCase();
          return `
          <div class="card-row clickable" data-action="open-card" data-id="${c.id}">
            <div class="card-dot" style="background:${c.color}">${esc(initials)}</div>
            <div class="info">
              <div class="name">${esc(c.name)}</div>
              <div class="sub">${money(t.spent)} spent &middot; ${t.count} txns</div>
            </div>
            <div class="amount">
              <div class="cashback">${money(t.cashback)}</div>
              <div class="spent">this mo: ${money(t.monthCashback)}</div>
            </div>
          </div>`;
        })
        .join("");
    }

    view.innerHTML = `
      <div class="stat-grid">
        <div class="stat-tile"><div class="label">Total Cash Back</div><div class="value accent">${money(totalCashback)}</div></div>
        <div class="stat-tile"><div class="label">This Month</div><div class="value accent">${money(monthCashback)}</div></div>
      </div>
      <div class="section-title">By Card</div>
      ${cardsHtml}
    `;
  }

  // ================= LOG =================
  function renderLog() {
    if (state.cards.length === 0) {
      view.innerHTML = `<div class="empty-state">Add a card first in the <b>Cards</b> tab, then come back here to log purchases.</div>`;
      return;
    }
    const selectedCardId = renderLog._lastCardId && getCard(renderLog._lastCardId) ? renderLog._lastCardId : state.cards[0].id;

    view.innerHTML = `
      <div class="panel">
        <form id="logForm">
          <div class="field">
            <label>Card</label>
            <select id="f_card">
              ${state.cards.map((c) => `<option value="${c.id}" ${c.id === selectedCardId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Category</label>
            <select id="f_category"></select>
          </div>
          <div class="row-2">
            <div class="field">
              <label>Amount ($)</label>
              <input id="f_amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required />
            </div>
            <div class="field">
              <label>Date</label>
              <input id="f_date" type="date" value="${todayStr()}" required />
            </div>
          </div>
          <div class="field">
            <label>Note (optional)</label>
            <input id="f_note" type="text" placeholder="e.g. Costco groceries" />
          </div>
          <div id="f_preview" class="field" style="margin-bottom:4px;"></div>
          <button type="submit" class="btn btn-primary">Add Transaction</button>
        </form>
      </div>
    `;

    const cardSelect = document.getElementById("f_card");
    const categorySelect = document.getElementById("f_category");
    const amountInput = document.getElementById("f_amount");
    const dateInput = document.getElementById("f_date");
    const preview = document.getElementById("f_preview");

    function fillCategories() {
      const card = getCard(cardSelect.value);
      categorySelect.innerHTML = cardCategories(card)
        .map((cat) => `<option value="${esc(cat)}">${esc(cat)}${cat === "Other" ? ` (base ${card.baseRate}%)` : ""}</option>`)
        .join("");
      updatePreview();
    }
    function updatePreview() {
      const card = getCard(cardSelect.value);
      const amount = parseFloat(amountInput.value) || 0;
      const category = categorySelect.value;
      const date = dateInput.value || todayStr();
      if (!card || amount <= 0) {
        preview.innerHTML = "";
        return;
      }
      const { cashback, rate, capped } = computeCashback(card, category, amount, date);
      preview.innerHTML = `<div class="sub" style="color:var(--text-dim);font-size:13px;">Earns <span style="color:var(--accent);font-weight:700;">${money(cashback)}</span> cash back at ${rate}%${capped ? ' <span class="capped-badge">CAP HIT</span>' : ""}</div>`;
    }

    cardSelect.addEventListener("change", fillCategories);
    categorySelect.addEventListener("change", updatePreview);
    amountInput.addEventListener("input", updatePreview);
    dateInput.addEventListener("input", updatePreview);
    fillCategories();

    document.getElementById("logForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const card = getCard(cardSelect.value);
      const amount = parseFloat(amountInput.value);
      const category = categorySelect.value;
      const date = dateInput.value || todayStr();
      if (!card || !(amount > 0)) return;
      const { cashback, rate, capped } = computeCashback(card, category, amount, date);
      state.transactions.push({
        id: uid(),
        cardId: card.id,
        category,
        amount,
        date,
        note: document.getElementById("f_note").value.trim(),
        rate,
        cashback,
        capped
      });
      save();
      renderLog._lastCardId = card.id;
      toast(`+${money(cashback)} cash back added`);
      amountInput.value = "";
      document.getElementById("f_note").value = "";
      updatePreview();
    });
  }

  // ================= CARDS =================
  function renderCards() {
    let html = "";
    if (state.cards.length === 0) {
      html += `<div class="empty-state">No cards yet. Add your first credit card below.</div>`;
    } else {
      html += state.cards
        .map((c) => {
          const t = cardTotals(c.id);
          const initials = c.name.trim().slice(0, 2).toUpperCase();
          return `
          <div class="card-row clickable" data-action="open-card" data-id="${c.id}">
            <div class="card-dot" style="background:${c.color}">${esc(initials)}</div>
            <div class="info">
              <div class="name">${esc(c.name)}</div>
              <div class="sub">Base ${c.baseRate}% &middot; ${c.rules.length} rule${c.rules.length === 1 ? "" : "s"}</div>
            </div>
            <div class="amount">
              <div class="cashback">${money(t.cashback)}</div>
              <div class="spent">earned</div>
            </div>
          </div>`;
        })
        .join("");
    }
    html += `<button class="btn btn-secondary" data-action="add-card" style="margin-top:8px;">+ Add Card</button>`;
    view.innerHTML = html;
  }

  function colorPickerHtml(inputId, selected) {
    return `<div class="color-picker" id="${inputId}">
      ${COLORS.map((c) => `<div class="color-swatch ${c === selected ? "selected" : ""}" style="background:${c}" data-color="${c}"></div>`).join("")}
    </div>`;
  }
  function wireColorPicker(id) {
    const wrap = document.getElementById(id);
    wrap.addEventListener("click", (e) => {
      const sw = e.target.closest(".color-swatch");
      if (!sw) return;
      [...wrap.children].forEach((c) => c.classList.remove("selected"));
      sw.classList.add("selected");
    });
  }
  function pickedColor(id) {
    const sel = document.querySelector(`#${id} .color-swatch.selected`);
    return sel ? sel.dataset.color : COLORS[0];
  }

  function openAddCardSheet() {
    openSheet(`
      <h2>Add Card</h2>
      <form id="cardForm">
        <div class="field"><label>Card Name</label><input id="cf_name" type="text" placeholder="e.g. Chase Freedom" required /></div>
        <div class="field"><label>Base Cash Back Rate (%)</label><input id="cf_base" type="number" step="0.01" min="0" value="1" required /></div>
        <div class="field"><label>Color</label>${colorPickerHtml("cf_color", COLORS[state.cards.length % COLORS.length])}</div>
        <button type="submit" class="btn btn-primary">Add Card</button>
        <button type="button" class="btn btn-secondary" data-action="close-sheet">Cancel</button>
      </form>
    `);
    wireColorPicker("cf_color");
    document.getElementById("cardForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("cf_name").value.trim();
      const baseRate = parseFloat(document.getElementById("cf_base").value) || 0;
      if (!name) return;
      state.cards.push({ id: uid(), name, baseRate, color: pickedColor("cf_color"), rules: [] });
      save();
      closeSheet();
      toast("Card added");
      render();
    });
  }

  function openCardDetailSheet(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    const t = cardTotals(card.id);
    openSheet(`
      <h2>${esc(card.name)}</h2>
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Total Cash Back</div><div class="value accent">${money(t.cashback)}</div></div>
        <div class="stat-tile"><div class="label">Total Spent</div><div class="value">${money(t.spent)}</div></div>
      </div>

      <div class="field">
        <label>Card Name</label>
        <input id="ed_name" type="text" value="${esc(card.name)}" />
      </div>
      <div class="row-2">
        <div class="field">
          <label>Base Rate (%)</label>
          <input id="ed_base" type="number" step="0.01" min="0" value="${card.baseRate}" />
        </div>
        <div class="field">
          <label>Color</label>
          ${colorPickerHtml("ed_color", card.color)}
        </div>
      </div>
      <button class="btn btn-secondary" data-action="save-card" data-id="${card.id}">Save Changes</button>

      <div class="section-title" style="margin-top:22px;">Cash Back Rules</div>
      <div id="rulesList">
        ${
          card.rules.length === 0
            ? `<div class="empty-state" style="padding:16px;">No category rules yet — everything earns the base rate.</div>`
            : card.rules
                .map(
                  (r) => `
              <div class="rule-row">
                <div>
                  <div class="rname">${esc(r.category)}</div>
                  <div class="rmeta">${r.cap != null ? `Cap: ${money(r.cap)}/mo` : "No cap"}</div>
                </div>
                <div style="display:flex;align-items:center;">
                  <div class="rrate">${r.rate}%</div>
                  <button data-action="delete-rule" data-cardid="${card.id}" data-ruleid="${r.id}">Delete</button>
                </div>
              </div>`
                )
                .join("")
        }
      </div>

      <div class="section-title">Add Rule</div>
      <form id="ruleForm">
        <div class="field"><label>Category Name</label><input id="rf_cat" type="text" placeholder="e.g. Groceries" required /></div>
        <div class="row-2">
          <div class="field"><label>Rate (%)</label><input id="rf_rate" type="number" step="0.01" min="0" required /></div>
          <div class="field"><label>Monthly Cap ($, optional)</label><input id="rf_cap" type="number" step="0.01" min="0" placeholder="none" /></div>
        </div>
        <button type="submit" class="btn btn-secondary">Add Rule</button>
      </form>

      <div class="section-title">Danger Zone</div>
      <button class="btn btn-danger" data-action="delete-card" data-id="${card.id}">Delete Card</button>
      <button class="btn btn-ghost" data-action="close-sheet">Close</button>
    `);
    wireColorPicker("ed_color");

    document.getElementById("ruleForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const category = document.getElementById("rf_cat").value.trim();
      const rate = parseFloat(document.getElementById("rf_rate").value);
      const capRaw = document.getElementById("rf_cap").value;
      const cap = capRaw === "" ? null : parseFloat(capRaw);
      if (!category || !(rate >= 0)) return;
      const existing = card.rules.find((r) => r.category.toLowerCase() === category.toLowerCase());
      if (existing) {
        existing.rate = rate;
        existing.cap = cap;
      } else {
        card.rules.push({ id: uid(), category, rate, cap });
      }
      save();
      toast("Rule saved");
      openCardDetailSheet(card.id);
    });
  }

  // ================= HISTORY =================
  function renderHistory() {
    if (state.transactions.length === 0) {
      view.innerHTML = `<div class="empty-state">No transactions logged yet.</div>`;
      return;
    }
    const chips = [`<button class="filter-chip ${historyFilterCardId === "all" ? "active" : ""}" data-action="filter-history" data-id="all">All</button>`]
      .concat(
        state.cards.map(
          (c) => `<button class="filter-chip ${historyFilterCardId === c.id ? "active" : ""}" data-action="filter-history" data-id="${c.id}">${esc(c.name)}</button>`
        )
      )
      .join("");

    const filtered = state.transactions
      .filter((t) => historyFilterCardId === "all" || t.cardId === historyFilterCardId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));

    if (filtered.length === 0) {
      view.innerHTML = `<div class="filter-bar">${chips}</div><div class="empty-state">No transactions for this card.</div>`;
      return;
    }

    let lastMonth = null;
    let rowsHtml = "";
    for (const t of filtered) {
      const mk = monthKeyOf(t.date);
      if (mk !== lastMonth) {
        rowsHtml += `<div class="month-header">${monthLabel(mk)}</div>`;
        lastMonth = mk;
      }
      const card = getCard(t.cardId);
      rowsHtml += `
        <div class="txn-row" data-action="open-txn" data-id="${t.id}">
          <div class="card-dot" style="width:32px;height:32px;border-radius:9px;font-size:11px;background:${card ? card.color : "#888"}">${card ? esc(card.name.slice(0, 2).toUpperCase()) : "?"}</div>
          <div class="info">
            <div class="cat">${esc(t.category)}${t.capped ? '<span class="capped-badge">CAP</span>' : ""}</div>
            <div class="meta">${card ? esc(card.name) : "Deleted card"} &middot; ${dateLabel(t.date)}${t.note ? " &middot; " + esc(t.note) : ""}</div>
          </div>
          <div class="amt">
            <div class="spent">${money(t.amount)}</div>
            <div class="cb">+${money(t.cashback)}</div>
          </div>
        </div>`;
    }

    view.innerHTML = `<div class="filter-bar">${chips}</div><div class="panel" style="padding:4px 12px;">${rowsHtml}</div>`;
  }

  function openTxnSheet(txnId) {
    const t = state.transactions.find((x) => x.id === txnId);
    if (!t) return;
    const card = getCard(t.cardId);
    openSheet(`
      <h2>Edit Transaction</h2>
      <form id="txnForm">
        <div class="field">
          <label>Card</label>
          <select id="tf_card">
            ${state.cards.map((c) => `<option value="${c.id}" ${c.id === t.cardId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Category</label>
          <select id="tf_category"></select>
        </div>
        <div class="row-2">
          <div class="field"><label>Amount ($)</label><input id="tf_amount" type="number" step="0.01" min="0" value="${t.amount}" required /></div>
          <div class="field"><label>Date</label><input id="tf_date" type="date" value="${t.date}" required /></div>
        </div>
        <div class="field"><label>Note</label><input id="tf_note" type="text" value="${esc(t.note || "")}" /></div>
        <div class="field" style="color:var(--text-dim);font-size:13px;">Currently earning ${money(t.cashback)} at ${t.rate}%${t.capped ? " (capped)" : ""}</div>
        <button type="submit" class="btn btn-primary">Save Changes</button>
        <button type="button" class="btn btn-danger" data-action="delete-txn" data-id="${t.id}">Delete Transaction</button>
        <button type="button" class="btn btn-ghost" data-action="close-sheet">Cancel</button>
      </form>
    `);
    const cardSelect = document.getElementById("tf_card");
    const categorySelect = document.getElementById("tf_category");
    function fillCategories() {
      const c = getCard(cardSelect.value) || card;
      categorySelect.innerHTML = cardCategories(c)
        .map((cat) => `<option value="${esc(cat)}" ${cat === t.category ? "selected" : ""}>${esc(cat)}</option>`)
        .join("");
    }
    fillCategories();
    cardSelect.addEventListener("change", fillCategories);

    document.getElementById("txnForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const newCard = getCard(cardSelect.value);
      const amount = parseFloat(document.getElementById("tf_amount").value);
      const date = document.getElementById("tf_date").value;
      const category = categorySelect.value;
      if (!newCard || !(amount > 0) || !date) return;
      const { cashback, rate, capped } = computeCashback(newCard, category, amount, date, t.id);
      t.cardId = newCard.id;
      t.category = category;
      t.amount = amount;
      t.date = date;
      t.note = document.getElementById("tf_note").value.trim();
      t.cashback = cashback;
      t.rate = rate;
      t.capped = capped;
      save();
      closeSheet();
      toast("Transaction updated");
      render();
    });
  }

  // ================= SETTINGS =================
  function renderSettings() {
    view.innerHTML = `
      <div class="panel">
        <div class="section-title" style="margin-top:0;">Storage</div>
        <div style="color:var(--text-dim);font-size:14px;line-height:1.6;">
          ${state.cards.length} card${state.cards.length === 1 ? "" : "s"} &middot; ${state.transactions.length} transaction${state.transactions.length === 1 ? "" : "s"}<br>
          All data is stored only on this device (browser local storage). Nothing is sent anywhere.
        </div>
      </div>
      <div class="panel">
        <div class="section-title" style="margin-top:0;">Backup</div>
        <button class="btn btn-secondary" data-action="export-data">Export Backup (JSON)</button>
        <label class="btn btn-secondary" style="display:block;text-align:center;margin-top:10px;">
          Import Backup (JSON)
          <input type="file" id="importFile" accept="application/json" style="display:none;" />
        </label>
      </div>
      <div class="panel">
        <div class="section-title" style="margin-top:0;">Danger Zone</div>
        <button class="btn btn-danger" data-action="clear-data">Erase All Data</button>
      </div>
    `;
    document.getElementById("importFile").addEventListener("change", handleImportFile);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cashback-tracker-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.cards) || !Array.isArray(data.transactions)) throw new Error("bad shape");
        if (!confirm("Import will replace all current data on this device. Continue?")) return;
        state = { cards: data.cards, transactions: data.transactions };
        save();
        toast("Data imported");
        render();
      } catch (err) {
        alert("That file doesn't look like a valid backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ================= global click delegation =================
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    if (action === "close-sheet") closeSheet();
    else if (action === "add-card") openAddCardSheet();
    else if (action === "open-card") openCardDetailSheet(el.dataset.id);
    else if (action === "save-card") {
      const card = getCard(el.dataset.id);
      card.name = document.getElementById("ed_name").value.trim() || card.name;
      card.baseRate = parseFloat(document.getElementById("ed_base").value) || 0;
      card.color = pickedColor("ed_color");
      save();
      toast("Card saved");
      render();
      closeSheet();
    } else if (action === "delete-rule") {
      const card = getCard(el.dataset.cardid);
      card.rules = card.rules.filter((r) => r.id !== el.dataset.ruleid);
      save();
      openCardDetailSheet(card.id);
    } else if (action === "delete-card") {
      if (confirm("Delete this card and all its transactions? This cannot be undone.")) {
        const id = el.dataset.id;
        state.cards = state.cards.filter((c) => c.id !== id);
        state.transactions = state.transactions.filter((t) => t.cardId !== id);
        save();
        closeSheet();
        toast("Card deleted");
        render();
      }
    } else if (action === "open-txn") {
      openTxnSheet(el.dataset.id);
    } else if (action === "delete-txn") {
      if (confirm("Delete this transaction?")) {
        state.transactions = state.transactions.filter((t) => t.id !== el.dataset.id);
        save();
        closeSheet();
        toast("Transaction deleted");
        render();
      }
    } else if (action === "filter-history") {
      historyFilterCardId = el.dataset.id;
      render();
    } else if (action === "export-data") {
      exportData();
    } else if (action === "clear-data") {
      if (confirm("Erase ALL cards and transactions on this device? This cannot be undone.")) {
        state = { cards: [], transactions: [] };
        save();
        toast("All data erased");
        render();
      }
    }
  });

  // ---------- service worker registration ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // ---------- init ----------
  switchTab("dashboard");
})();
