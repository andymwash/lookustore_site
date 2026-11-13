// ═══════════════════════════════════════════════════
//  LOOKU STORE — app.js
// ═══════════════════════════════════════════════════

// ────────────────────────────────────────────────────
//  NOTIFICATIONS (in-app bell system)
// ────────────────────────────────────────────────────
function pushNotification(role, msg, type = "info") {
  const key = "looku_notif_" + role;
  let notifs = [];
  try { notifs = JSON.parse(localStorage.getItem(key)) || []; } catch(e){}
  notifs.unshift({ id: Date.now(), msg, type, time: new Date().toLocaleTimeString(), read: false });
  if (notifs.length > 50) notifs = notifs.slice(0, 50);
  localStorage.setItem(key, JSON.stringify(notifs));
}

function getNotifications(role) {
  try { return JSON.parse(localStorage.getItem("looku_notif_" + role)) || []; } catch(e){ return []; }
}

function markAllRead(role) {
  let notifs = getNotifications(role);
  notifs = notifs.map(n => ({ ...n, read: true }));
  localStorage.setItem("looku_notif_" + role, JSON.stringify(notifs));
}

function clearNotifications(role) {
  localStorage.removeItem("looku_notif_" + role);
}

function unreadCount(role) {
  return getNotifications(role).filter(n => !n.read).length;
}

// ────────────────────────────────────────────────────
//  APP — routing & shared utilities
// ────────────────────────────────────────────────────
const App = {
  currentPage: "landing",

  goTo(pageId) {
    if (pageId === "manager-login") this.checkSetup();
    if (["landing", "manager-login", "attendant-login", "setup"].includes(pageId)) { Deliveries.stopPolling(); Data.stopPolling(); }
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const target = document.getElementById("page-" + pageId);
    if (target) target.classList.add("active");
    this.currentPage = pageId;
    if (pageId === "manager")   Manager.init();
    if (pageId === "customer")  Customer.init();
    if (pageId === "attendant") Attendant.init();
  },

  selectRole(role) {
    const u = Auth.user();                                   // already logged in on this device? go straight in
    if (role === "manager-login" && u && u.role === "manager") { Data.loadStaff().then(() => this.goTo("manager")); return; }
    if (role === "attendant-login" && u && u.role === "attendant") {
      loggedInAttendant = u; const el = document.getElementById("att-sidebar-role"); if (el) el.textContent = u.name;
      Data.loadStaff().then(() => this.goTo("attendant")); return;
    }
    this.goTo(role);
  },

  async managerLogin() {
    const u = document.getElementById("login-user").value.trim(), p = document.getElementById("login-pass").value;
    const errBox = document.getElementById("login-error"), btn = document.getElementById("login-btn");
    const show = m => { errBox.style.display = "flex"; errBox.textContent = "⚠ " + m; };
    if (!u || !p) return show("Please enter your username and password.");
    if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
    const r = await Api.call("POST", "/staff/login", { username: u, password: p }, { auth: false });
    if (btn) { btn.disabled = false; btn.textContent = "Login as Manager"; }
    if (!r.ok) return show(Api.msg(r));
    if (r.data.user.role !== "manager") return show("This is the manager login. Please use the Shop Attendant login.");
    Auth.set(r.data.token, r.data.user);
    errBox.style.display = "none"; document.getElementById("login-user").value = ""; document.getElementById("login-pass").value = "";
    await Data.loadStaff();
    this.goTo("manager");
  },

  async attendantLogin() {
    const u = document.getElementById("att-login-user").value.trim(), p = document.getElementById("att-login-pass").value;
    const errBox = document.getElementById("attendant-login-error"), btn = document.getElementById("att-login-btn");
    const show = m => { errBox.style.display = "flex"; errBox.textContent = "⚠ " + m; };
    if (!u || !p) return show("Please enter your username and password.");
    if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
    const r = await Api.call("POST", "/staff/login", { username: u, password: p }, { auth: false });
    if (btn) { btn.disabled = false; btn.textContent = "Login as Attendant"; }
    if (!r.ok) return show(Api.msg(r));
    if (r.data.user.role !== "attendant") return show("This is the attendant login. Managers please use the Manager login.");
    Auth.set(r.data.token, r.data.user);
    loggedInAttendant = r.data.user;
    errBox.style.display = "none"; document.getElementById("att-login-user").value = ""; document.getElementById("att-login-pass").value = "";
    const roleEl = document.getElementById("att-sidebar-role"); if (roleEl) roleEl.textContent = r.data.user.name;
    await Data.loadStaff();
    this.goTo("attendant");
  },

  attendantLogout() { this.logout(); },

  logout() {
    Auth.clear(); Data.stopPolling(); Deliveries.stopPolling(); Data.reset(); loggedInAttendant = null;
    this.goTo("landing");
  },

  sessionExpired() {                                          // token ran out, or this account was removed
    if (this._expiring) return; this._expiring = true;
    Auth.clear(); Data.stopPolling(); Deliveries.stopPolling(); Data.reset(); loggedInAttendant = null;
    this.goTo("landing"); alert("Your session has ended. Please log in again.");
    setTimeout(() => { this._expiring = false; }, 800);
  },

  // First time ever: no manager exists yet, so offer to create it (needs the setup key from the server settings)
  async checkSetup() {
    const r = await Api.call("GET", "/staff/status", null, { auth: false });
    if (r.ok && r.data.needsSetup && this.currentPage === "manager-login") this.goTo("setup");
  },
  async createManager() {
    const g = id => (document.getElementById(id) || {}).value || "";
    const err = document.getElementById("setup-error"), show = m => { err.style.display = "flex"; err.textContent = "⚠ " + m; };
    if (g("setup-pass") !== g("setup-pass2")) return show("The two passwords do not match.");
    const r = await Api.call("POST", "/staff/setup", { setupKey: g("setup-key").trim(), name: g("setup-name").trim(), username: g("setup-user").trim(), password: g("setup-pass") }, { auth: false });
    if (!r.ok) return show(Api.msg(r));
    Auth.set(r.data.token, r.data.user); err.style.display = "none";
    await Data.loadStaff(); this.goTo("manager");
  },

  showSuccess(containerId, msg, duration = 4000) {            // a pop-up, so the screen redraw that follows cannot wipe it
    const el = document.createElement("div");
    el.className = "toast-success";
    el.textContent = "✓ " + msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  },

  salesTable(salesArr, showAttendant = false) {
    if (!salesArr.length) return '<div class="empty-state">No records found.</div>';
    const attH = showAttendant ? "<th>Attendant/Customer</th>" : "";
    const rows = salesArr.map(s => {
      const itemsStr = s.items.map(i => `${i.name} ×${i.qty}`).join(", ");
      const attTd = showAttendant ? `<td>${s.attendant || "—"}</td>` : "";
      const payBadge = s.paymentMethod
        ? `<span class="pay-badge pay-${(s.paymentMethod||'').toLowerCase().replace(/\s/g,'-')}">${s.paymentMethod}</span>`
        : "";
      const statusBadge = `<span class="status-badge status-${(s.paymentStatus||'pending').toLowerCase()}">${s.paymentStatus||'Pending'}</span>`;
      const customer = s.customerName ? `<br><small style="color:#6b7280">👤 ${s.customerName} · 📞 ${s.customerPhone||'—'}</small>` : "";
      return `<tr>
        <td>${s.date}</td>
        <td>${itemsStr}${customer}</td>
        ${attTd}
        <td>${payBadge} ${statusBadge}</td>
        <td style="font-weight:700;color:#10b981">${fmt(s.total)}</td>
      </tr>`;
    }).join("");
    return `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Items</th>${attH}<th>Payment</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  },

  // ── CSV Download ──────────────────────────────────
  downloadSalesCSV() {
    const header = ["Date","Customer Name","Phone","Location","Items","Qty","Unit Price","Total","Payment Method","Payment Status","Attendant"];
    const rows = [];
    sales.forEach(s => {
      s.items.forEach(item => {
        rows.push([
          s.date,
          s.customerName || "Walk-in",
          s.customerPhone || "",
          s.customerLocation || "",
          item.name,
          item.qty,
          item.price,
          s.total,
          s.paymentMethod || "Cash",
          s.paymentStatus || "Paid",
          s.attendant || ""
        ]);
      });
    });
    const csvContent = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `looku-sales-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Restock Download ─────────────────────────────
  downloadRestockCSV() {
    // Summarise sold quantities per product
    const soldMap = {};
    sales.forEach(s => s.items.forEach(i => {
      soldMap[i.name] = (soldMap[i.name] || 0) + i.qty;
    }));
    const header = ["Product","Brand","Category","Unit","Current Stock","Total Sold","Suggested Reorder Qty"];
    const rows = products.map(p => [
      p.name, p.brand || "", p.category, p.unit || "",
      p.stock,
      soldMap[p.name] || 0,
      Math.max(0, (soldMap[p.name] || 0) - p.stock + 20)
    ]);
    const csvContent = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `looku-restock-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

// ────────────────────────────────────────────────────
//  MANAGER
// ────────────────────────────────────────────────────
const Manager = {
  currentTab: "overview",

  init() {
    this.showTab("overview", document.querySelector("#page-manager .nav-btn"));
    Deliveries.startPolling();
    Data.startPolling();
    this.updateRequestBadge();
    this.updateNotifBadge();
  },

  updateRequestBadge() {
    const btn = document.getElementById("req-nav-btn");
    if (btn) btn.textContent = deleteRequests.length ? `⚠️ Requests (${deleteRequests.length})` : "⚠️ Requests";
    const srBtn = document.getElementById("mgr-sr-btn");
    const unread = stockReports.filter(r => r.status === "Submitted").length;
    if (srBtn) srBtn.textContent = unread > 0 ? `📋 Stock Reports (${unread})` : "📋 Stock Reports";
  },

  updateNotifBadge() {
    const btn = document.getElementById("mgr-notif-btn");
    const count = unreadCount("manager");
    if (btn) btn.textContent = count > 0 ? `🔔 Notifications (${count})` : "🔔 Notifications";
  },

  showTab(tab, btn) {
    this.currentTab = tab;
    document.querySelectorAll("#page-manager .nav-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    if (tab === "notifications") markAllRead("manager");
    if (tab === "deliveries") setTimeout(() => Deliveries.load(), 0);
    if (tab === "feedback")   setTimeout(() => Deliveries.loadFeedback(), 0);
    if (tab === "stock-reports") setTimeout(async () => {        // show the NEW badges first, then mark everything reviewed
      if (!stockReports.some(r => r.status === "Submitted")) return;
      const r = await Api.call("POST", "/stock-reports/mark-reviewed");
      if (r.ok) { stockReports.forEach(x => { x.status = "Reviewed"; }); this.updateRequestBadge(); }
    }, 0);
    this.render();
    this.updateNotifBadge();
  },

  render() {
    const el = document.getElementById("manager-main");
    switch (this.currentTab) {
      case "overview":       el.innerHTML = this.renderOverview();      break;
      case "sales":          el.innerHTML = this.renderSales();         break;
      case "finance":        el.innerHTML = this.renderFinance();       break;
      case "stock":          el.innerHTML = this.renderStock();         break;
      case "requests":       el.innerHTML = this.renderRequests();      break;
      case "attendants":     el.innerHTML = this.renderAttendants();    break;
      case "notifications":  el.innerHTML = this.renderNotifications(); break;
      case "stock-reports":  el.innerHTML = this.renderStockReports();  break;
      case "deliveries":     el.innerHTML = Deliveries.render();         break;
      case "feedback":       el.innerHTML = Deliveries.renderFeedback(); break;
    }
  },

  statCard(icon, value, label, color, small = false) {
    return `<div class="stat-card"><div class="stat-accent-bar" style="background:${color}"></div>
      <div class="stat-icon">${icon}</div>
      <div class="stat-value${small?" small":""}">${value}</div>
      <div class="stat-label">${label}</div></div>`;
  },

  renderOverview() {
    const totalRev = sales.reduce((a, s) => a + s.total, 0);
    const topMap = {};
    sales.forEach(s => s.items.forEach(i => { topMap[i.name] = (topMap[i.name]||0)+i.qty; }));
    const top = Object.entries(topMap).sort((a,b)=>b[1]-a[1])[0];
    const pending = sales.filter(s => (s.paymentStatus||"Paid") === "Pending").length;
    return `
      ${this.legacyBanner()}
      <h2 class="page-title">Dashboard Overview</h2>
      <div class="stats-grid">
        ${this.statCard("💰", fmt(totalRev), "Total Revenue", "#f59e0b")}
        ${this.statCard("📊", sales.length, "Total Sales", "#10b981")}
        ${this.statCard("📦", products.length, "Products", "#6366f1")}
        ${this.statCard("⏳", pending, "Pending Payments", "#ef4444")}
        ${this.statCard("🏆", top ? top[0] : "—", "Top Product", "#ec4899", true)}
      </div>
      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
        <button class="btn" style="background:#10b981" onclick="App.downloadRestockCSV()">⬇ Download Restock List (CSV)</button>
        <button class="btn" style="background:#6366f1" onclick="App.downloadSalesCSV()">⬇ Download All Sales (CSV)</button>
      </div>
      <h3 class="section-title">Recent Orders</h3>
      ${App.salesTable([...sales].reverse().slice(0,8), true)}`;
  },

  renderSales() {
    const methods = ["All","Cash","Mobile Money","ATM/Card"];
    const filter = document.getElementById("sale-filter-method")?.value || "All";
    let filtered = [...sales].reverse();
    if (filter !== "All") filtered = filtered.filter(s => s.paymentMethod === filter);
    const optHtml = methods.map(m => `<option${filter===m?" selected":""}>${m}</option>`).join("");

    const rows = filtered.map(s => {
      const itemsStr = s.items.map(i => `${i.name} ×${i.qty}${i.discountPrice ? ` <span style="color:#f59e0b;font-size:11px">(disc. ${fmt(i.discountPrice)})</span>` : ""}`).join(", ");
      const payBadge = s.paymentMethod
        ? `<span class="pay-badge pay-${(s.paymentMethod).toLowerCase().replace(/[\/\s]/g,"-")}">${s.paymentMethod}</span>` : "";
      const statusBadge = `<span class="status-badge status-${(s.paymentStatus||"paid").toLowerCase()}">${s.paymentStatus||"Paid"}</span>`;
      const customer = s.customerName
        ? `<br><small style="color:#6b7280">👤 ${s.customerName} · 📞 ${s.customerPhone||"—"} · 📍 ${s.customerLocation||"—"}</small>` : "";
      return `<tr>
        <td>${s.date}</td>
        <td>${itemsStr}${customer}</td>
        <td>${s.attendant||"—"}</td>
        <td>${payBadge} ${statusBadge}</td>
        <td style="font-weight:700;color:#10b981">${fmt(s.total)}</td>
        <td>
          <button class="sm-btn" style="background:#ef4444" onclick="Manager.deleteSale(${s.id})">🗑 Delete</button>
        </td>
      </tr>`;
    }).join("");

    return `
      <h2 class="page-title">Sales Records</h2>
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <select class="input" style="width:auto" id="sale-filter-method" onchange="Manager.render()">
          ${optHtml}
        </select>
        <button class="btn" style="background:#10b981" onclick="App.downloadRestockCSV()">⬇ Restock List</button>
        <button class="btn" style="background:#6366f1" onclick="App.downloadSalesCSV()">⬇ Sales CSV</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Items</th><th>Attendant</th><th>Payment</th><th>Total</th><th>Action</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px">No sales found.</td></tr>'}</tbody>
      </table></div>`;
  },

  async deleteSale(id) {
    if (id < 0) return alert("This is an online order. Manage or cancel it from the Deliveries tab.");
    const s = sales.find(x => x.id === id); if (!s) return;
    if (!confirm(`Delete this sale of ${fmt(s.total)} (${s.date})? This cannot be undone.`)) return;
    const r = await Api.call("DELETE", "/sales/" + id);
    if (!r.ok) return alert(Api.msg(r));
    await Data.loadStaff(); App.showSuccess("manager-main", "Sale deleted."); this.render();
  },

  renderFinance() {
    const totalRev = sales.reduce((a, s) => a + s.total, 0);
    const byMethod = {};
    sales.forEach(s => {
      const m = s.paymentMethod || "Cash";
      if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
      byMethod[m].count++;
      byMethod[m].total += s.total;
    });
    const byAtt = {};
    sales.forEach(s => {
      const k = s.attendant || "—";
      if (!byAtt[k]) byAtt[k] = { count: 0, revenue: 0 };
      byAtt[k].count++;
      byAtt[k].revenue += s.total;
    });
    const methodRows = Object.entries(byMethod).map(([m,d]) =>
      `<tr><td>${m}</td><td>${d.count}</td><td style="color:#10b981;font-weight:600">${fmt(d.total)}</td></tr>`).join("");
    const attRows = Object.entries(byAtt).map(([a,d]) =>
      `<tr><td>${a}</td><td>${d.count}</td><td style="color:#10b981;font-weight:600">${fmt(d.revenue)}</td></tr>`).join("");
    return `
      <h2 class="page-title">Finance Accounts</h2>
      <div class="stats-grid">
        ${this.statCard("💰", fmt(totalRev), "Gross Revenue", "#f59e0b")}
        ${this.statCard("📉", fmt(totalRev*0.6), "Est. Cost (60%)", "#ef4444")}
        ${this.statCard("📈", fmt(totalRev*0.4), "Est. Profit (40%)", "#10b981")}
        ${this.statCard("🔢", sales.length, "Transactions", "#6366f1")}
      </div>
      <h3 class="section-title">Revenue by Payment Method</h3>
      <div class="table-wrap"><table><thead><tr><th>Method</th><th>Count</th><th>Revenue</th></tr></thead><tbody>${methodRows}</tbody></table></div>
      <h3 class="section-title">Revenue by Attendant</h3>
      <div class="table-wrap"><table><thead><tr><th>Attendant</th><th>Sales</th><th>Revenue</th></tr></thead><tbody>${attRows}</tbody></table></div>`;
  },

  renderStock() {
    const editingId = Manager._editingProductId;
    const ep = editingId ? products.find(p => p.id === editingId) : null;

    const rows = products.map(p => {
      const isEditing = editingId === p.id;
      if (isEditing) {
        // Inline edit row
        return `
          <tr style="background:#fffbeb;border-left:3px solid #f59e0b">
            <td colspan="8">
              <div style="padding:12px">
                <div style="font-weight:700;color:#92400e;margin-bottom:12px;font-size:13px">✏️ Editing: ${p.name}</div>
                <div class="form-grid" style="gap:10px">
                  <div class="field" style="margin:0"><label class="label">Product Name</label>
                    <input class="input" id="edit-name" value="${p.name}"/></div>
                  <div class="field" style="margin:0"><label class="label">Brand</label>
                    <input class="input" id="edit-brand" value="${p.brand||""}"/></div>
                  <div class="field" style="margin:0"><label class="label">Category</label>
                    <input class="input" id="edit-cat" value="${p.category}"/></div>
                  <div class="field" style="margin:0"><label class="label">Unit / Size</label>
                    <input class="input" id="edit-unit" value="${p.unit||""}"/></div>
                  <div class="field" style="margin:0"><label class="label">Price (KES)</label>
                    <input class="input" id="edit-price" type="number" value="${p.price}"/></div>
                  <div class="field" style="margin:0"><label class="label">Stock Qty</label>
                    <input class="input" id="edit-stock" type="number" value="${p.stock}"/></div>
                </div>
                <div class="field" style="margin:10px 0 0"><label class="label">Description</label>
                  <textarea class="input" id="edit-desc" rows="2">${p.description||""}</textarea></div>

                <!-- Image update for edit -->
                <div class="field" style="margin-top:10px">
                  <label class="label">Product Image</label>
                  <div class="img-source-btns" id="edit-img-source-btns">
                    <button type="button" class="img-source-btn"
                      onclick="document.getElementById('edit-image-file').click()">
                      <span style="font-size:20px">🖼️</span><span>Upload from PC</span>
                    </button>
                    <button type="button" class="img-source-btn"
                      onclick="Manager.openCameraEdit()">
                      <span style="font-size:20px">📷</span><span>Take Photo</span>
                    </button>
                    <button type="button" class="img-source-btn"
                      onclick="Manager.pasteFromClipboardEdit()">
                      <span style="font-size:20px">📋</span><span>Paste Image</span>
                    </button>
                  </div>
                  <div class="upload-area" id="edit-upload-area"
                    style="${p.image ? "padding:0;min-height:120px" : ""}"
                    ondragover="event.preventDefault();this.classList.add('drag-over')"
                    ondragleave="this.classList.remove('drag-over')"
                    ondrop="Manager.handleDropEdit(event)"
                    onclick="document.getElementById('edit-image-file').click()">
                    <div id="edit-upload-placeholder" style="display:${p.image?"none":"block"}">
                      <div class="upload-icon">⬆️</div>
                      <div class="upload-text">Click, drag &amp; drop or paste new image</div>
                    </div>
                    <img id="edit-upload-preview" class="upload-preview"
                      src="${p.image||""}" style="display:${p.image?"block":"none"}"/>
                  </div>
                  <input type="file" id="edit-image-file" accept="image/*,.heic,.heif"
                    style="display:none" onchange="Manager.handleFileSelectEdit(this)"/>
                  <div style="display:flex;gap:8px;margin-top:6px">
                    <div id="edit-img-info" style="font-size:11px;color:#9ca3af;flex:1"></div>
                    ${p.image ? `<button type="button" class="sm-btn" style="background:#ef4444"
                      onclick="Manager.clearEditImage()">✕ Remove Image</button>` : ""}
                  </div>
                </div>
                <!-- Camera for edit -->
                <div id="edit-camera-panel" style="display:none;margin-top:10px">
                  <video id="edit-camera-video" autoplay playsinline
                    style="width:100%;max-height:220px;border-radius:10px;background:#000"></video>
                  <div style="display:flex;gap:8px;margin-top:8px">
                    <button type="button" class="btn" style="background:#10b981;flex:1"
                      onclick="Manager.capturePhotoEdit()">📸 Capture</button>
                    <button type="button" class="btn" style="background:#6b7280;flex:1"
                      onclick="Manager.closeCameraEdit()">✕ Cancel</button>
                  </div>
                  <canvas id="edit-camera-canvas" style="display:none"></canvas>
                </div>

                <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
                  <button class="btn" style="background:#10b981;flex:1"
                    onclick="Manager.saveEdit(${p.id})">✓ Save Changes</button>
                  <button class="btn" style="background:#6b7280"
                    onclick="Manager.cancelEdit()">✕ Cancel</button>
                </div>
              </div>
            </td>
          </tr>`;
      }

      return `<tr>
        <td><div class="thumb-wrap">${p.image
          ? `<img src="${p.image}" class="prod-thumb" alt="${p.name}"/>`
          : `<div class="prod-thumb-fallback">${p.icon||"📦"}</div>`}</div></td>
        <td><strong>${p.name}</strong><br><span style="font-size:11px;color:#9ca3af">${p.description ? p.description.slice(0,50)+"…" : ""}</span></td>
        <td>${p.brand||"—"}</td>
        <td>${p.unit||"—"}</td>
        <td>${p.category}</td>
        <td style="font-weight:600">${fmt(p.price)}</td>
        <td><span class="stock-badge ${p.stock>10?"stock-ok":"stock-low"}">${p.stock}</span></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="sm-btn" style="background:#f59e0b"
              onclick="Manager.startEdit(${p.id})">✏️ Edit</button>
            <button class="sm-btn" style="background:#ef4444"
              onclick="Manager.deleteProduct(${p.id})">🗑 Delete</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    return `
      <h2 class="page-title">Stock Management</h2>
      <div style="margin-bottom:16px">
        <button class="btn" style="background:#10b981" onclick="App.downloadRestockCSV()">⬇ Download Restock List (CSV)</button>
      </div>

      <div class="form-card">
        <div class="form-title">Add New Product</div>
        <div class="form-grid">
          <div class="field"><label class="label">Product Name</label>
            <input class="input" id="new-name" placeholder="e.g. Ladies Maxi Dress"/></div>
          <div class="field"><label class="label">Brand</label>
            <input class="input" id="new-brand" placeholder="e.g. Looku Collection"/></div>
          <div class="field"><label class="label">Category</label>
            <input class="input" id="new-cat" placeholder="e.g. Women's Wear"/></div>
          <div class="field"><label class="label">Unit / Size</label>
            <input class="input" id="new-unit" placeholder="e.g. Sizes S/M/L/XL or EU 36-42"/></div>
          <div class="field"><label class="label">Price (KES)</label>
            <input class="input" id="new-price" type="number" placeholder="0"/></div>
          <div class="field"><label class="label">Stock Qty</label>
            <input class="input" id="new-stock" type="number" placeholder="0"/></div>
        </div>

        <div class="field">
          <label class="label">Product Image</label>
          <div class="img-source-btns" id="img-source-btns">
            <button type="button" class="img-source-btn" onclick="document.getElementById('new-image-file').click()">
              <span style="font-size:24px">🖼️</span>
              <span>Upload from PC</span>
              <span style="font-size:11px;color:#9ca3af">JPG, PNG, WEBP, GIF, BMP, SVG</span>
            </button>
            <button type="button" class="img-source-btn" id="camera-btn" onclick="Manager.openCamera()">
              <span style="font-size:24px">📷</span>
              <span>Take Photo</span>
              <span style="font-size:11px;color:#9ca3af">Use device camera</span>
            </button>
            <button type="button" class="img-source-btn" onclick="Manager.pasteFromClipboard()">
              <span style="font-size:24px">📋</span>
              <span>Paste Image</span>
              <span style="font-size:11px;color:#9ca3af">Ctrl+V / Cmd+V</span>
            </button>
          </div>
          <div class="upload-area" id="upload-area"
            ondragover="event.preventDefault();this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="Manager.handleDrop(event)"
            onclick="document.getElementById('new-image-file').click()">
            <div id="upload-placeholder">
              <div class="upload-icon">⬆️</div>
              <div class="upload-text">Drag &amp; drop image here or click to browse</div>
              <div class="upload-hint">Supports JPG · PNG · WEBP · GIF · BMP · SVG · HEIC — any size</div>
            </div>
            <img id="upload-preview" class="upload-preview" style="display:none" alt="Product preview"/>
          </div>
          <input type="file" id="new-image-file" accept="image/*,image/heic,image/heif,.heic,.heif"
            style="display:none" onchange="Manager.handleFileSelect(this)"/>
          <div id="camera-panel" style="display:none;margin-top:12px">
            <video id="camera-video" autoplay playsinline
              style="width:100%;max-height:280px;border-radius:12px;background:#000;display:block"></video>
            <div style="display:flex;gap:10px;margin-top:10px">
              <button type="button" class="btn" style="background:#10b981;flex:1"
                onclick="Manager.capturePhoto()">📸 Capture Photo</button>
              <button type="button" class="btn" style="background:#6b7280;flex:1"
                onclick="Manager.closeCamera()">✕ Cancel</button>
            </div>
            <canvas id="camera-canvas" style="display:none"></canvas>
          </div>
          <div id="img-action-row" style="display:none;gap:10px;align-items:center;flex-wrap:wrap">
            <div id="img-info" style="font-size:12px;color:#6b7280;flex:1"></div>
            <button type="button" class="sm-btn" style="background:#6b7280"
              onclick="Manager.clearImage()">✕ Remove Image</button>
            <button type="button" class="sm-btn" style="background:#6366f1"
              onclick="document.getElementById('new-image-file').click()">🔄 Change</button>
          </div>
        </div>

        <div class="field">
          <label class="label">Description</label>
          <textarea class="input" id="new-desc" rows="2" placeholder="Brief product description..."></textarea>
        </div>
        <button class="btn" style="background:#f59e0b;margin-top:4px;width:100%"
          onclick="Manager.addProduct()">+ Add Product</button>
      </div>

      <h3 class="section-title">All Products</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Image</th><th>Product</th><th>Brand</th><th>Unit</th>
          <th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>

      `;
  },

  // ── Edit product ──────────────────────────────────────
  _editingProductId: null,
  _editImageBase64: null,
  _editCameraStream: null,

  startEdit(productId) {
    Manager._editingProductId = productId;
    Manager._editImageBase64  = null;
    this.render();
    // Scroll to editing row
    setTimeout(() => {
      const row = document.querySelector("tr[style*='fffbeb']");
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  },

  cancelEdit() {
    Manager._editingProductId = null;
    Manager._editImageBase64  = null;
    this.render();
  },

  async saveEdit(productId) {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const name = val("edit-name"), price = +val("edit-price");
    if (!name || !price) return alert("Product name and price are required.");
    const body = { name, brand: val("edit-brand"), category: val("edit-cat") || "General", unit: val("edit-unit"), price, stock: +val("edit-stock") || 0, description: val("edit-desc") };
    if (Manager._editImageBase64) body.image = Manager._editImageBase64;                    // a new picture was chosen
    else { const pv = document.getElementById("edit-upload-preview"); if (pv && (pv.style.display === "none" || !pv.getAttribute("src"))) body.image = ""; }   // picture removed
    const r = await Api.call("PATCH", "/products/" + productId, body);
    if (!r.ok) return alert(Api.msg(r));
    Manager._editingProductId = null; Manager._editImageBase64 = null;
    await Data.loadStaff(); App.showSuccess("manager-main", `"${name}" updated successfully!`); this.render();
  },

  async deleteProduct(productId) {
    const p = products.find(pr => pr.id === productId); if (!p) return;
    if (!confirm(`Delete "${p.name}" from stock?\n\nThis cannot be undone.`)) return;
    const r = await Api.call("DELETE", "/products/" + productId);
    if (!r.ok) return alert(Api.msg(r));
    if (Manager._editingProductId === productId) Manager._editingProductId = null;
    await Data.loadStaff(); App.showSuccess("manager-main", `"${p.name}" deleted from stock.`); this.render();
  },

  // ── Edit image helpers (mirrors add-product image methods) ──
  handleFileSelectEdit(input) {
    const file = input.files[0];
    if (!file) return;
    Manager.processImageFileEdit(file);
  },

  handleDropEdit(event) {
    event.preventDefault();
    document.getElementById("edit-upload-area")?.classList.remove("drag-over");
    const file = event.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) {
      alert("Please drop an image file."); return;
    }
    Manager.processImageFileEdit(file);
  },

  async pasteFromClipboardEdit() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          Manager.processImageFileEdit(new File([blob], "pasted.png", { type: imgType }));
          return;
        }
      }
      alert("No image on clipboard. Copy an image first then click Paste.");
    } catch(e) {
      alert("Press Ctrl+V to paste an image.");
    }
  },

  async openCameraEdit() {
    const panel = document.getElementById("edit-camera-panel");
    const video = document.getElementById("edit-camera-video");
    try {
      Manager._editCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      video.srcObject = Manager._editCameraStream;
      if (panel) panel.style.display = "block";
      const sourceBtns = document.getElementById("edit-img-source-btns");
      if (sourceBtns) sourceBtns.style.display = "none";
    } catch(e) {
      alert("Camera not available. Upload from PC instead.");
    }
  },

  capturePhotoEdit() {
    const video  = document.getElementById("edit-camera-video");
    const canvas = document.getElementById("edit-camera-canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    Manager.closeCameraEdit();
    Manager.applyImageEdit(dataUrl, "Camera photo", video.videoWidth, video.videoHeight);
  },

  closeCameraEdit() {
    if (Manager._editCameraStream) {
      Manager._editCameraStream.getTracks().forEach(t => t.stop());
      Manager._editCameraStream = null;
    }
    const panel = document.getElementById("edit-camera-panel");
    if (panel) panel.style.display = "none";
    const sourceBtns = document.getElementById("edit-img-source-btns");
    if (sourceBtns) sourceBtns.style.display = "grid";
  },

  processImageFileEdit(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (file.size > 1 * 1024 * 1024) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX = 800;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else        { w = Math.round(w * MAX / h); h = MAX; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          Manager.applyImageEdit(canvas.toDataURL("image/jpeg", 0.82), file.name, w, h);
        };
        img.src = dataUrl;
      } else {
        const tmp = new Image();
        tmp.onload = () => Manager.applyImageEdit(dataUrl, file.name, tmp.width, tmp.height);
        tmp.onerror = () => Manager.applyImageEdit(dataUrl, file.name, 0, 0);
        tmp.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  },

  applyImageEdit(dataUrl, filename, w, h) {
    Manager._editImageBase64 = dataUrl;
    const preview     = document.getElementById("edit-upload-preview");
    const placeholder = document.getElementById("edit-upload-placeholder");
    const area        = document.getElementById("edit-upload-area");
    const infoEl      = document.getElementById("edit-img-info");
    const sourceBtns  = document.getElementById("edit-img-source-btns");
    if (preview)     { preview.src = dataUrl; preview.style.display = "block"; }
    if (placeholder) { placeholder.style.display = "none"; }
    if (area)        { area.classList.add("upload-has-image"); }
    if (sourceBtns)  { sourceBtns.style.display = "none"; }
    if (infoEl && w && h) {
      const kb = Math.round(dataUrl.length * 0.75 / 1024);
      infoEl.textContent = `${filename} · ${w}×${h}px · ~${kb} KB`;
    }
  },

  clearEditImage() {
    Manager._editImageBase64 = null;
    const preview     = document.getElementById("edit-upload-preview");
    const placeholder = document.getElementById("edit-upload-placeholder");
    const area        = document.getElementById("edit-upload-area");
    const sourceBtns  = document.getElementById("edit-img-source-btns");
    const fileInput   = document.getElementById("edit-image-file");
    if (preview)     { preview.src = ""; preview.style.display = "none"; }
    if (placeholder) { placeholder.style.display = "block"; }
    if (area)        { area.classList.remove("upload-has-image"); }
    if (sourceBtns)  { sourceBtns.style.display = "grid"; }
    if (fileInput)   { fileInput.value = ""; }
  },

  // ── Handle file selected from input ──────────────────
  handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    Manager.processImageFile(file);
  },

  // ── Handle drag & drop ────────────────────────────────
  handleDrop(event) {
    event.preventDefault();
    document.getElementById("upload-area").classList.remove("drag-over");
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please drop an image file (JPG, PNG, WEBP, GIF, BMP, SVG, etc.).");
      return;
    }
    Manager.processImageFile(file);
  },

  // ── Paste from clipboard ──────────────────────────────
  async pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          Manager.processImageFile(new File([blob], "pasted-image.png", { type: imgType }));
          return;
        }
      }
      alert("No image found on clipboard. Copy an image first, then click Paste.");
    } catch(e) {
      // Fallback: listen for paste event
      alert("Press Ctrl+V (or Cmd+V) anywhere on this page to paste an image from your clipboard.");
      document.addEventListener("paste", Manager._pasteListener = (ev) => {
        const items = Array.from(ev.clipboardData?.items || []);
        const imgItem = items.find(i => i.type.startsWith("image/"));
        if (imgItem) {
          Manager.processImageFile(imgItem.getAsFile());
          document.removeEventListener("paste", Manager._pasteListener);
        }
      }, { once: true });
    }
  },

  // ── Camera: open ──────────────────────────────────────
  async openCamera() {
    const panel = document.getElementById("camera-panel");
    const video = document.getElementById("camera-video");
    try {
      Manager._cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      video.srcObject = Manager._cameraStream;
      panel.style.display = "block";
      document.getElementById("img-source-btns").style.display = "none";
      document.getElementById("upload-area").style.display     = "none";
    } catch(e) {
      alert("Camera not available or permission denied. Please upload an image from your device instead.");
    }
  },

  // ── Camera: capture ───────────────────────────────────
  capturePhoto() {
    const video  = document.getElementById("camera-video");
    const canvas = document.getElementById("camera-canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    Manager.closeCamera();
    Manager.applyImage(dataUrl, "Camera photo", video.videoWidth, video.videoHeight);
  },

  // ── Camera: close ─────────────────────────────────────
  closeCamera() {
    if (Manager._cameraStream) {
      Manager._cameraStream.getTracks().forEach(t => t.stop());
      Manager._cameraStream = null;
    }
    const panel = document.getElementById("camera-panel");
    if (panel) panel.style.display = "none";
    const sourceBtns = document.getElementById("img-source-btns");
    if (sourceBtns) sourceBtns.style.display = "grid";
    const area = document.getElementById("upload-area");
    if (area && !Manager._uploadedImageBase64) area.style.display = "flex";
  },

  // ── Process any image file (compress if needed) ───────
  processImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const originalDataUrl = e.target.result;
      // Compress if > 1MB for storage efficiency
      if (file.size > 1 * 1024 * 1024) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX = 800;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else        { w = Math.round(w * MAX / h); h = MAX; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL("image/jpeg", 0.82);
          Manager.applyImage(compressed, file.name, w, h);
        };
        img.src = originalDataUrl;
      } else {
        // Small file — use as-is (preserves SVG, GIF, PNG transparency, etc.)
        const tempImg = new Image();
        tempImg.onload = () => Manager.applyImage(originalDataUrl, file.name, tempImg.width, tempImg.height);
        tempImg.onerror = () => Manager.applyImage(originalDataUrl, file.name, 0, 0);
        tempImg.src = originalDataUrl;
      }
    };
    reader.readAsDataURL(file);
  },

  // ── Apply image to UI ─────────────────────────────────
  applyImage(dataUrl, filename, w, h) {
    Manager._uploadedImageBase64 = dataUrl;

    const preview     = document.getElementById("upload-preview");
    const placeholder = document.getElementById("upload-placeholder");
    const area        = document.getElementById("upload-area");
    const actionRow   = document.getElementById("img-action-row");
    const infoEl      = document.getElementById("img-info");
    const sourceBtns  = document.getElementById("img-source-btns");

    if (preview)     { preview.src = dataUrl; preview.style.display = "block"; }
    if (placeholder) { placeholder.style.display = "none"; }
    if (area)        { area.classList.add("upload-has-image"); area.style.display = "flex"; }
    if (actionRow)   { actionRow.style.display = "flex"; }
    if (sourceBtns)  { sourceBtns.style.display = "none"; }
    if (infoEl && w && h) {
      const kb = Math.round(dataUrl.length * 0.75 / 1024);
      infoEl.textContent = `${filename} · ${w}×${h}px · ~${kb} KB`;
    }
  },

  // ── Clear image ───────────────────────────────────────
  clearImage() {
    Manager._uploadedImageBase64 = null;
    const preview     = document.getElementById("upload-preview");
    const placeholder = document.getElementById("upload-placeholder");
    const area        = document.getElementById("upload-area");
    const actionRow   = document.getElementById("img-action-row");
    const sourceBtns  = document.getElementById("img-source-btns");
    const fileInput   = document.getElementById("new-image-file");

    if (preview)     { preview.src = ""; preview.style.display = "none"; }
    if (placeholder) { placeholder.style.display = "block"; }
    if (area)        { area.classList.remove("upload-has-image"); area.style.display = "flex"; }
    if (actionRow)   { actionRow.style.display = "none"; }
    if (sourceBtns)  { sourceBtns.style.display = "grid"; }
    if (fileInput)   { fileInput.value = ""; }
  },

  // ── Legacy method (kept for backward compatibility) ───
  previewImage(input) { Manager.handleFileSelect(input); },

  async addProduct() {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const name = val("new-name"), price = +val("new-price");
    if (!name || !price || val("new-stock") === "") return alert("Please fill in the name, price and stock quantity.");
    const body = { name, brand: val("new-brand"), category: val("new-cat") || "General", unit: val("new-unit"), price, stock: +val("new-stock") || 0, description: val("new-desc"), icon: "📦" };
    if (this._uploadedImageBase64) body.image = this._uploadedImageBase64;
    const r = await Api.call("POST", "/products", body);
    if (!r.ok) return alert(Api.msg(r));
    this._uploadedImageBase64 = null;
    await Data.loadStaff(); App.showSuccess("manager-main", "Product added successfully!"); this.render();
  },

  renderRequests() {
    if (!deleteRequests.length) return `<h2 class="page-title">Delete Requests</h2><div class="empty-state">No pending requests.</div>`;
    const rows = deleteRequests.map(r => `<tr>
      <td>${r.productName}</td><td>${r.requestedBy}</td><td>${r.reason}</td>
      <td>
        <button class="sm-btn" style="background:#10b981" onclick="Manager.approveDelete(${r.id})">Approve</button>
        <button class="sm-btn" style="background:#ef4444;margin-left:6px" onclick="Manager.rejectDelete(${r.id})">Reject</button>
      </td></tr>`).join("");
    return `<h2 class="page-title">Delete Authorisation Requests</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Requested By</th><th>Reason</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  },

  async approveDelete(reqId) {
    const req = deleteRequests.find(r => r.id === reqId); if (!req) return;
    const r = await Api.call("POST", `/delete-requests/${reqId}/approve`);
    if (!r.ok) return alert(Api.msg(r));
    await Data.loadStaff(); App.showSuccess("manager-main", `"${req.productName}" deleted successfully.`);
    this.updateRequestBadge(); this.render();
  },

  async rejectDelete(reqId) {
    const r = await Api.call("POST", `/delete-requests/${reqId}/reject`);
    if (!r.ok) return alert(Api.msg(r));
    await Data.loadStaff(); this.updateRequestBadge(); this.render();
  },

  renderAttendants() {
    const rows = ATTENDANT_ACCOUNTS.map(a => `<tr>
      <td>${a.name}</td><td>${a.username}</td>
      <td><span style="letter-spacing:2px;color:#9ca3af">••••••••</span></td>
      <td><button class="sm-btn" style="background:#6366f1" onclick="Manager.resetAttendantPassword(${a.id})">Reset password</button>
          <button class="sm-btn" style="background:#ef4444;margin-left:6px" onclick="Manager.removeAttendant(${a.id})">Remove</button></td>
    </tr>`).join("");
    return `
      <h2 class="page-title">Attendant Accounts</h2>
      <div class="form-card">
        <div class="form-title">Add New Attendant Account</div>
        <div class="form-grid">
          <div class="field"><label class="label">Full Name</label><input class="input" id="new-att-name" placeholder="e.g. Sarah Apio"/></div>
          <div class="field"><label class="label">Username</label><input class="input" id="new-att-user" placeholder="e.g. sarah"/></div>
          <div class="field"><label class="label">Password</label><input class="input" id="new-att-pass" type="password" placeholder="Set a password"/></div>
          <div class="field"><label class="label">Confirm Password</label><input class="input" id="new-att-pass2" type="password" placeholder="Repeat password"/></div>
        </div>
        <div id="new-att-error" class="err-box" style="display:none"></div>
        <button class="btn" style="background:#10b981" onclick="Manager.addAttendant()">+ Add Attendant</button>
      </div>
      <h3 class="section-title">All Attendant Accounts</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Full Name</th><th>Username</th><th>Password</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  },

  async addAttendant() {
    const g = id => (document.getElementById(id) || {}).value || "";
    const name = g("new-att-name").trim(), uname = g("new-att-user").trim().toLowerCase(), pass = g("new-att-pass"), pass2 = g("new-att-pass2");
    const errEl = document.getElementById("new-att-error"), show = m => { errEl.style.display = "flex"; errEl.textContent = "⚠ " + m; };
    if (!name || !uname || !pass) return show("Please fill in all fields.");
    if (pass !== pass2) return show("Passwords do not match.");
    const r = await Api.call("POST", "/staff", { name, username: uname, password: pass });
    if (!r.ok) return show(Api.msg(r));
    errEl.style.display = "none";
    await Data.loadStaff(); App.showSuccess("manager-main", `Attendant "${name}" added successfully!`); this.render();
  },

  async removeAttendant(id) {
    const acc = ATTENDANT_ACCOUNTS.find(a => a.id === id); if (!acc) return;
    if (!confirm(`Remove attendant "${acc.name}"? They will no longer be able to log in.`)) return;
    const r = await Api.call("DELETE", "/staff/" + id);
    if (!r.ok) return alert(Api.msg(r));
    await Data.loadStaff(); App.showSuccess("manager-main", `Attendant "${acc.name}" removed.`); this.render();
  },

  async resetAttendantPassword(id) {
    const acc = ATTENDANT_ACCOUNTS.find(a => a.id === id); if (!acc) return;
    const pw = prompt(`New password for ${acc.name} (at least 8 characters):`);
    if (!pw) return;
    const r = await Api.call("PATCH", `/staff/${id}/password`, { password: pw });
    if (!r.ok) return alert(Api.msg(r));
    App.showSuccess("manager-main", `Password changed for ${acc.name}. Tell them the new password.`);
  },

  // One-time move of what is already saved on THIS device into the database
  legacyCounts() {
    const n = k => { const v = loadFromStorage(k, []); return Array.isArray(v) ? v.length : 0; };
    return { products: n("looku_products"), sales: n("looku_sales"), attendants: n("looku_attendants") };
  },
  legacyBanner() {
    const c = this.legacyCounts();
    if (Data.importDone || !(c.products + c.sales + c.attendants)) return "";
    return `<div class="trk-warn" style="text-align:left;margin:0 0 18px">
      <strong>📥 Found shop data saved on this device</strong><br>${c.products} products, ${c.sales} sales and ${c.attendants} staff logins from before the move to the database.
      <div style="margin-top:8px"><button class="btn" style="background:#6366f1" onclick="Manager.importLegacy()">Import it now (one time only)</button></div></div>`;
  },
  async importLegacy() {
    const prods = loadFromStorage("looku_products", []), sls = loadFromStorage("looku_sales", []), atts = loadFromStorage("looku_attendants", []);
    if (!confirm(`Import ${prods.length} products, ${sls.length} sales and ${atts.length} staff logins from this device into the database?\n\nThis can only be done once.`)) return;
    const payload = { products: prods, sales: sls, attendants: atts };
    if (JSON.stringify(payload).length > 4500000) {
      payload.products = prods.map(p => (p.image && String(p.image).startsWith("data:")) ? { ...p, image: "" } : p);
      if (JSON.stringify(payload).length > 4500000) return alert("There is too much data to import in one go. Please ask for help.");
      alert("Some product pictures were too big to import. You can upload them again afterwards.");
    }
    const r = await Api.call("POST", "/import", payload, { timeout: 60000 });
    if (!r.ok) return alert(Api.msg(r));
    const d = r.data.data;
    alert(`Imported: ${d.products} products, ${d.sales} sales, ${d.attendants} staff logins.` + (d.skipped.length ? "\n\nNot imported:\n" + d.skipped.slice(0, 8).join("\n") : ""));
    await Data.loadStaff(); this.render();
  },

  renderNotifications() {
    const notifs = getNotifications("manager");
    if (!notifs.length) return `<h2 class="page-title">Notifications</h2><div class="empty-state">No notifications yet.</div>`;
    const rows = notifs.map(n => `
      <div class="notif-item notif-${n.type}${n.read?"":" notif-unread"}">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>`).join("");
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 class="page-title" style="margin:0">Notifications</h2>
        <button class="sm-btn" style="background:#6b7280" onclick="clearNotifications('manager');Manager.render()">Clear All</button>
      </div>
      <div class="notif-list">${rows}</div>`;
  },

  // ── STOCK REPORTS ──────────────────────────────────
  renderStockReports() {
    const filterType = document.getElementById("sr-filter-type")?.value || "All";
    const filterUrgency = document.getElementById("sr-filter-urgency")?.value || "All";
    const filterAttendant = document.getElementById("sr-filter-attendant")?.value || "";

    let filtered = [...stockReports];
    if (filterType !== "All") filtered = filtered.filter(r => r.reportType === filterType);
    if (filterUrgency !== "All") filtered = filtered.filter(r => r.reorderUrgency === filterUrgency);
    if (filterAttendant) filtered = filtered.filter(r => r.submittedBy.toLowerCase().includes(filterAttendant.toLowerCase()));

    // Summary stats
    const totalReports    = stockReports.length;
    const newSubmitted    = stockReports.filter(r => r.status === "Submitted").length;
    const criticalUrgency = stockReports.filter(r => r.reorderUrgency === "Critical" || r.reorderUrgency === "High").length;
    const poorQuality     = stockReports.filter(r => r.quality === "Poor" || r.quality === "Rejected").length;
    const totalReceived   = stockReports.reduce((a, r) => a + (r.totalReceived || 0), 0);
    const totalImperfect  = stockReports.reduce((a, r) => a + (r.imperfectQty || 0), 0);

    const urgencyColors = { "Critical":"#ef4444","High":"#f97316","Medium":"#f59e0b","Low":"#3b82f6","Not Needed":"#10b981" };
    const qualityColors = { "Excellent":"#10b981","Good":"#3b82f6","Average":"#f59e0b","Poor":"#f97316","Rejected":"#ef4444" };

    const reportCards = filtered.length === 0
      ? `<div class="empty-state">No stock reports found${filterType !== "All" ? " for this filter" : ""}.</div>`
      : filtered.map(r => {
          const imperfectPct = r.totalReceived > 0 ? Math.round((r.imperfectQty / r.totalReceived) * 100) : 0;
          const perfectPct   = r.totalReceived > 0 ? Math.round((r.perfectQty   / r.totalReceived) * 100) : 0;
          const qColor       = qualityColors[r.quality]  || "#6b7280";
          const uColor       = urgencyColors[r.reorderUrgency] || "#6b7280";
          const isNew        = r.status === "Submitted";
          return `
            <div class="sr-card${isNew ? " sr-card-new" : ""}">
              <div class="sr-card-header">
                <div>
                  <div class="sr-card-title">${r.productName}</div>
                  <div class="sr-card-meta">
                    ${r.productCategory} · ${r.reportType} · ${r.date}
                    ${isNew ? '<span class="sr-new-badge">NEW</span>' : ""}
                  </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                  <div class="sr-card-by">By: ${r.submittedBy}</div>
                  <div class="sr-card-at">${r.submittedAt}</div>
                </div>
              </div>

              <!-- Quantity strip -->
              <div class="sr-qty-strip">
                <div class="sr-qty-box" style="border-color:#10b981">
                  <div class="sr-qty-num" style="color:#10b981">${r.totalReceived}</div>
                  <div class="sr-qty-label">Received</div>
                </div>
                <div class="sr-qty-box" style="border-color:#16a34a">
                  <div class="sr-qty-num" style="color:#16a34a">${r.perfectQty}</div>
                  <div class="sr-qty-label">✅ Perfect</div>
                  <div class="sr-qty-pct">${perfectPct}%</div>
                </div>
                <div class="sr-qty-box" style="border-color:#d97706">
                  <div class="sr-qty-num" style="color:#d97706">${r.imperfectQty}</div>
                  <div class="sr-qty-label">⚠ Imperfect</div>
                  <div class="sr-qty-pct">${imperfectPct}%</div>
                </div>
                <div class="sr-qty-box" style="border-color:#dc2626">
                  <div class="sr-qty-num" style="color:#dc2626">${r.missingQty}</div>
                  <div class="sr-qty-label">❌ Missing</div>
                </div>
                <div class="sr-qty-box" style="border-color:#6b7280">
                  <div class="sr-qty-num" style="color:#6b7280">${r.returnedQty}</div>
                  <div class="sr-qty-label">↩ Returned</div>
                </div>
                <div class="sr-qty-box" style="border-color:#6366f1;background:#ede9fe">
                  <div class="sr-qty-num" style="color:#6366f1">${r.addedToStock}</div>
                  <div class="sr-qty-label">➕ Added</div>
                </div>
              </div>

              <!-- Stock change bar -->
              <div class="sr-stock-change">
                <span>Stock: <strong>${r.previousStock}</strong></span>
                <div class="sr-stock-arrow">→ +${r.addedToStock} →</div>
                <span><strong style="color:#10b981">${r.newStock}</strong></span>
              </div>

              <!-- Quality & Urgency badges -->
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
                <span class="sr-badge" style="background:${qColor}22;color:${qColor};border-color:${qColor}">
                  Quality: ${r.quality}
                </span>
                <span class="sr-badge" style="background:${uColor}22;color:${uColor};border-color:${uColor}">
                  Reorder: ${r.reorderUrgency}
                </span>
                <span class="sr-badge" style="background:#e0e7ff;color:#3730a3;border-color:#a5b4fc">
                  Size: ${r.sizeAccuracy}
                </span>
                <span class="sr-badge" style="background:#f1f5f9;color:#475569;border-color:#cbd5e1">
                  Fabric: ${r.fabricQuality}
                </span>
                <span class="sr-badge" style="background:#fdf4ff;color:#7e22ce;border-color:#d8b4fe">
                  Colours: ${r.colourAccuracy}
                </span>
              </div>

              <!-- Details grid -->
              <div class="sr-details-grid">
                ${r.supplier !== "—" ? `<div><span class="sr-detail-label">Supplier</span><span>${r.supplier}</span></div>` : ""}
                ${r.batchNo  !== "—" ? `<div><span class="sr-detail-label">Batch/Invoice</span><span>${r.batchNo}</span></div>` : ""}
                ${r.costPerUnit > 0   ? `<div><span class="sr-detail-label">Cost/Unit</span><span>${fmt(r.costPerUnit)}</span></div>` : ""}
                ${r.totalCost > 0     ? `<div><span class="sr-detail-label">Total Cost</span><span style="font-weight:700">${fmt(r.totalCost)}</span></div>` : ""}
                ${r.sellingPrice > 0  ? `<div><span class="sr-detail-label">Selling Price</span><span>${fmt(r.sellingPrice)}</span></div>` : ""}
                ${r.suggestedPrice > 0 ? `<div><span class="sr-detail-label">Suggested Price</span><span style="color:#f59e0b;font-weight:600">${fmt(r.suggestedPrice)}</span></div>` : ""}
                ${r.storageLocation !== "—" ? `<div><span class="sr-detail-label">Location</span><span>${r.storageLocation}</span></div>` : ""}
                <div><span class="sr-detail-label">Storage</span><span>${r.storageCondition}</span></div>
              </div>

              ${r.defectsDesc && r.defectsDesc !== "None" ? `
                <div style="background:#fef9ec;border-radius:8px;padding:10px 12px;margin-top:10px;border-left:3px solid #f59e0b">
                  <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">⚠ Defects Noted</div>
                  <div style="font-size:13px;color:#78350f">${r.defectsDesc}</div>
                </div>` : ""}

              ${r.notes && r.notes !== "—" ? `
                <div style="background:#f0f9ff;border-radius:8px;padding:10px 12px;margin-top:8px;border-left:3px solid #38bdf8">
                  <div style="font-size:11px;font-weight:700;color:#075985;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">📝 Notes / Recommendations</div>
                  <div style="font-size:13px;color:#0c4a6e">${r.notes}</div>
                </div>` : ""}
            </div>`;
        }).join("");

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px">
        <h2 class="page-title" style="margin:0">📋 Stock Reports</h2>
        <button class="btn" style="background:#6366f1" onclick="Manager.downloadStockReportsCSV()">⬇ Download CSV</button>
      </div>

      <!-- Summary stats -->
      <div class="stats-grid" style="margin-bottom:20px">
        ${this.statCard("📋", totalReports,   "Total Reports",      "#6366f1")}
        ${this.statCard("🆕", newSubmitted,   "New (Unread)",       "#f59e0b")}
        ${this.statCard("🔴", criticalUrgency,"Urgent Reorders",    "#ef4444")}
        ${this.statCard("⚠",  poorQuality,    "Poor Quality Alerts","#f97316")}
        ${this.statCard("📦", totalReceived,  "Total Items Received","#10b981")}
        ${this.statCard("⚠",  totalImperfect, "Total Imperfect",    "#d97706")}
      </div>

      <!-- Filters -->
      <div class="form-card" style="padding:14px 20px;margin-bottom:20px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0;flex:1;min-width:150px">
            <label class="label">Report Type</label>
            <select class="input" id="sr-filter-type" onchange="Manager.render()">
              <option value="All">All Types</option>
              <option>New Stock In</option>
              <option>Stock Update</option>
              <option>Returned Stock</option>
              <option>Damaged Stock</option>
              <option>Stock Transfer</option>
            </select>
          </div>
          <div class="field" style="margin:0;flex:1;min-width:150px">
            <label class="label">Reorder Urgency</label>
            <select class="input" id="sr-filter-urgency" onchange="Manager.render()">
              <option value="All">All Urgency</option>
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
              <option>Not Needed</option>
            </select>
          </div>
          <div class="field" style="margin:0;flex:1;min-width:150px">
            <label class="label">Attendant Name</label>
            <input class="input" id="sr-filter-attendant" placeholder="Search by name..." oninput="Manager.render()"/>
          </div>
          <button class="sm-btn" style="background:#6b7280;margin-bottom:2px"
            onclick="document.getElementById('sr-filter-type').value='All';document.getElementById('sr-filter-urgency').value='All';document.getElementById('sr-filter-attendant').value='';Manager.render()">
            Clear Filters
          </button>
        </div>
      </div>

      <div style="font-size:13px;color:#6b7280;margin-bottom:12px">
        Showing <strong>${filtered.length}</strong> of ${stockReports.length} reports
      </div>

      <div class="sr-reports-list">${reportCards}</div>`;
  },

  downloadStockReportsCSV() {
    if (!stockReports.length) return alert("No stock reports to download.");
    const headers = [
      "Date","Submitted By","Submitted At","Report Type","Product","Category",
      "Supplier","Batch/Invoice","Total Received","Perfect","Imperfect",
      "Missing","Returned","Added to Stock","Prev Stock","New Stock",
      "Quality","Size Accuracy","Fabric Quality","Colour Accuracy","Defects",
      "Storage Location","Storage Condition","Cost Per Unit (KES)","Total Cost (KES)",
      "Selling Price (KES)","Suggested Price (KES)","Reorder Urgency","Notes","Status"
    ];
    const rows = stockReports.map(r => [
      r.date, r.submittedBy, r.submittedAt, r.reportType,
      r.productName, r.productCategory, r.supplier, r.batchNo,
      r.totalReceived, r.perfectQty, r.imperfectQty, r.missingQty,
      r.returnedQty, r.addedToStock, r.previousStock, r.newStock,
      r.quality, r.sizeAccuracy, r.fabricQuality, r.colourAccuracy,
      r.defectsDesc, r.storageLocation, r.storageCondition,
      r.costPerUnit, r.totalCost, r.sellingPrice, r.suggestedPrice,
      r.reorderUrgency, r.notes, r.status
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `looku-stock-reports-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
};


// ────────────────────────────────────────────────────
//  PAYMENT MODAL  (step-based, fully fixed)
// ────────────────────────────────────────────────────
const PaymentModal = {
  _resolve: null,
  _orderData: null,
  _selectedMethod: "",
  _run: 0,                // bumps whenever a pending prompt should be abandoned
  _mobileMode: "prompt",  // prompt | wait | manual

  show(orderData) {
    this._run++;
    this._orderData = orderData;
    this._selectedMethod = "";
    document.getElementById("pay-modal-total").textContent = fmt(orderData.total);
    ["pay-cash-section","pay-mobile-section","pay-atm-section"].forEach(id =>
      document.getElementById(id).style.display = "none");
    document.getElementById("pay-confirm-btn").style.display = "none";
    document.getElementById("pay-change-display").innerHTML  = "";
    document.getElementById("pay-method-select").value       = "";
    const cp = document.getElementById("pay-cash-paid");    if(cp) cp.value = "";
    const mp = document.getElementById("pay-mobile-phone");  if(mp) mp.value = "";
    const ar = document.getElementById("pay-atm-ref");       if(ar) ar.value = "";
    document.querySelectorAll("#payment-modal .pay-method-btn")
      .forEach(b => b.classList.remove("pay-method-selected"));
    document.getElementById("payment-modal").style.display = "flex";
  },

  hide() { document.getElementById("payment-modal").style.display = "none"; },

  selectMethod2(method) {
    this._run++;                       // stop any payment still being waited on
    this._selectedMethod = method;
    document.querySelectorAll("#payment-modal .pay-method-btn").forEach(b =>
      b.classList.toggle("pay-method-selected", b.getAttribute("data-method") === method));
    document.getElementById("pay-method-select").value = method;

    ["pay-cash-section","pay-mobile-section","pay-atm-section"].forEach(id =>
      document.getElementById(id).style.display = "none");
    document.getElementById("pay-confirm-btn").style.display = "none";
    document.getElementById("pay-change-display").innerHTML  = "";

    if (method === "Cash") {
      document.getElementById("pay-cash-section").style.display = "block";
    } else if (method === "Mobile Money") {
      document.getElementById("pay-mobile-section").style.display = "block";
      this.initMobile();
    } else if (method === "ATM/Card") {
      document.getElementById("pay-atm-section").style.display = "block";
      document.getElementById("pay-confirm-btn").style.display  = "inline-flex";
    }
  },

  // ── Mobile payment: automatic prompt first, manual only if the system fails ──
  _showPanel(mode) {
    this._mobileMode = mode;
    ["prompt","wait","manual"].forEach(m =>
      document.getElementById("pay-" + m + "-panel").style.display = (m === mode ? "block" : "none"));
    document.getElementById("pay-confirm-btn").style.display = (mode === "manual" ? "inline-flex" : "none");
  },

  initMobile() {
    const total = this._orderData ? this._orderData.total : 0;
    const phone = (Customer._checkoutDetails && Customer._checkoutDetails.phone) || "";
    document.getElementById("pay-prompt-amount").textContent = fmt(total);
    document.getElementById("pay-prompt-phone").value = phone;
    document.getElementById("pay-mobile-phone").value = phone;
    document.getElementById("pay-mobile-code").value  = "";
    document.getElementById("pay-prompt-note").style.display = "none";
    this._showPanel("prompt");
    // If the payment server can't be reached or isn't switched on, skip straight to manual.
    const run = this._run;
    LookuAPI.isAvailable().then(ok => {
      if (!ok && run === this._run && this._mobileMode === "prompt" && this._selectedMethod === "Mobile Money") {
        this.showManual("Automatic payment isn't available right now.");
      }
    });
  },

  showManual(reason) {
    this._run++;                                   // abandon any prompt still being waited on
    const total = this._orderData ? this._orderData.total : 0;
    document.getElementById("pay-eq-info").innerHTML = equityInstructionsHTML(total);
    document.getElementById("pay-mobile-phone").value = document.getElementById("pay-prompt-phone").value.trim();
    const note = document.getElementById("pay-manual-note");
    note.textContent = (reason ? reason + " " : "") + "Please pay manually:";
    note.style.display = "block";
    this._showPanel("manual");
  },

  _retry(message) {                                // customer-side outcome (cancelled / wrong PIN / low balance)
    const note = document.getElementById("pay-prompt-note");
    note.textContent = message;
    note.style.display = "block";
    this._showPanel("prompt");
  },

  async startPrompt() {
    const phone = document.getElementById("pay-prompt-phone").value.trim();
    if (!phone) { alert("Please enter your M-Pesa phone number."); return; }
    const total = this._orderData.total;
    const run   = ++this._run;
    const btn   = document.getElementById("pay-prompt-btn");
    btn.disabled = true; btn.textContent = "Sending…";

    const r = await LookuAPI.requestPrompt({ phone, amount: total });
    if (run !== this._run) return;
    btn.disabled = false; btn.textContent = "📲 Send payment prompt";

    if (!r.ok) {
      if (r.code === "BAD_PHONE") { alert(r.message); return; }       // customer can fix this
      this.showManual(r.code === "RATE_LIMIT" ? r.message : "We couldn't send the payment prompt.");
      return;
    }

    document.getElementById("pay-wait-phone").textContent = phone;
    document.getElementById("pay-wait-timer").textContent = "";
    this._showPanel("wait");
    const res = await LookuAPI.waitForPayment(r.checkoutRequestId, {
      shouldStop: () => run !== this._run,
      onTick: s => { const t = document.getElementById("pay-wait-timer"); if (t) t.textContent = "Waiting… " + s + "s"; }
    });
    if (run !== this._run) return;

    if (res.status === "Success") {
      this._run++;
      this.hide();
      if (this._resolve) this._resolve({ method: "Mobile Money", mobilePhone: phone,
        network: "M-Pesa (STK Push)", payCode: res.receipt || "", autoPaid: true, checkoutId: r.checkoutRequestId });
    } else if (res.status === "Cancelled") {
      this._retry("The payment was cancelled. Tap send to try again, or pay manually.");
    } else if (res.status === "Failed") {
      this._retry((res.message ? res.message + ". " : "The payment didn't go through. ") + "Tap send to try again, or pay manually.");
    } else {                                       // Timeout / Error → treat as a system problem
      this.showManual("We didn't get a payment confirmation. If you already approved it on your phone, enter the code from your SMS below.");
    }
  },

  selectMethod() {
    const m = document.getElementById("pay-method-select").value;
    if (m) this.selectMethod2(m);
  },

  calcCashChange() {
    const paid  = +document.getElementById("pay-cash-paid").value;
    const total = this._orderData ? this._orderData.total : 0;
    const change = paid - total;
    const el  = document.getElementById("pay-change-display");
    const btn = document.getElementById("pay-confirm-btn");
    if (!paid) { el.innerHTML = ""; btn.style.display = "none"; return; }
    if (change >= 0) {
      el.innerHTML = `<div class="change-box change-ok" style="margin:10px 0">
        ✓ Change to return to customer: <strong>${fmt(change)}</strong></div>`;
      btn.style.display = "inline-flex";
    } else {
      el.innerHTML = `<div class="change-box change-short" style="margin:10px 0">
        ⚠ Amount short by <strong>${fmt(Math.abs(change))}</strong>. Please enter more.</div>`;
      btn.style.display = "none";
    }
  },

  confirm() {
    const method = this._selectedMethod;
    if (!method) { alert("Please choose a payment method first."); return; }
    let extra = {};
    if (method === "Cash") {
      const paid  = +document.getElementById("pay-cash-paid").value;
      const total = this._orderData.total;
      if (!paid)        { alert("Please enter the amount paid."); return; }
      if (paid < total) { alert(`Amount paid (${fmt(paid)}) is less than total (${fmt(total)}).`); return; }
      extra = { amountPaid: paid, change: paid - total };
    } else if (method === "Mobile Money") {
      const phone   = document.getElementById("pay-mobile-phone").value.trim();
      const payCode = normalizeCode(document.getElementById("pay-mobile-code").value);
      if (!phone) { alert("Please enter your phone number."); return; }
      if (payCode.length < 6) { alert("Please pay first, then enter the confirmation code from your payment SMS."); return; }
      if (codeUsed(payCode)) { alert("This code has already been used for another order."); return; }
      extra = { mobilePhone: phone, network: "M-Pesa / Equity Bank", payCode };
    } else if (method === "ATM/Card") {
      extra = { cardRef: document.getElementById("pay-atm-ref").value.trim() };
    }
    this.hide();
    if (this._resolve) this._resolve({ method, ...extra });
  },

  cancel() {
    this._run++;
    this._selectedMethod = "";
    this.hide();
    if (this._resolve) this._resolve(null);
  }
};

// ────────────────────────────────────────────────────
//  CUSTOMER
// ────────────────────────────────────────────────────
const Customer = {
  currentTab: "browse",
  searchTerm: "",
  selectedCat: "All",
  _checkoutStep: 1,
  _checkoutDetails: {},
  _lastOrder: null,

  init() {
    Data.loadCatalogue().then(() => { if (App.currentPage === "customer" && Customer.currentTab === "browse") Customer.render(); });
    Data.startPolling();
    cart = [];
    this._checkoutStep    = 1;
    this._lastOrder       = null;
    this._checkoutDetails = {};
    this.updateCartNav();
    this.showTab("browse", document.querySelector("#page-customer .nav-btn"));
    this.updateNotifBadge();
  },

  updateCartNav() {
    const btn = document.getElementById("cart-nav-btn");
    if (btn) btn.textContent = `🛒 Cart (${cart.length})`;
  },

  updateNotifBadge() {
    const btn   = document.getElementById("cust-notif-btn");
    const count = unreadCount("customer");
    if (btn) btn.textContent = count > 0 ? `🔔 Notifications (${count})` : "🔔 Notifications";
  },

  showTab(tab, btn) {
    if (tab !== "track") this.stopTrackPoll();
    this.currentTab = tab;
    document.querySelectorAll("#page-customer .nav-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    if (tab === "notifications") markAllRead("customer");
    if (tab === "cart") this._checkoutStep = 1;
    this.render();
    this.updateNotifBadge();
  },

  render() {
    const el = document.getElementById("customer-main");
    switch (this.currentTab) {
      case "browse":        el.innerHTML = this.renderBrowse();        break;
      case "cart":          el.innerHTML = this.renderCart();          break;
      case "enquire":       el.innerHTML = this.renderEnquire();       break;
      case "track":   el.innerHTML = this.renderTrack(); break;
      case "notifications": el.innerHTML = this.renderNotifications(); break;
    }
  },

  // ── STEP INDICATOR ───────────────────────────────
  checkoutSteps(active) {
    const steps = [{n:1,label:"Cart"},{n:2,label:"Details"},{n:3,label:"Payment"}];
    return `<div class="checkout-steps">
      ${steps.map((s,idx) => `
        <div class="checkout-step ${s.n < active ? "step-done" : s.n === active ? "step-active" : "step-pending"}">
          <div class="step-circle">${s.n < active ? "✓" : s.n}</div>
          <div class="step-label">${s.label}</div>
        </div>
        ${idx < steps.length-1 ? '<div class="step-line"></div>' : ""}
      `).join("")}
    </div>`;
  },

  // ── BROWSE ────────────────────────────────────────
  renderBrowse() {
    const categories = ["All", ...new Set(products.map(p => p.category))];
    const catOpts    = categories.map(c =>
      `<option value="${c}" ${this.selectedCat===c?"selected":""}>${c}</option>`).join("");
    const filtered = products.filter(p =>
      (this.selectedCat==="All" || p.category===this.selectedCat) &&
      (p.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
       (p.brand && p.brand.toLowerCase().includes(this.searchTerm.toLowerCase()))));

    const cards = filtered.map(p => {
      const inStock  = p.stock > 0;
      const lowStock = p.stock > 0 && p.stock <= 10;
      const stockLabel = !inStock ? "Out of Stock" : lowStock ? `Only ${p.stock} left!` : `${p.stock} in stock`;
      const stockClass = (!inStock||lowStock) ? "stock-low" : "stock-ok";
      const hasImg = !!p.image;
      const imgHtml = hasImg
        ? `<img src="${p.image}" alt="${p.name}" class="prod-img prod-img-clickable"
             onclick="Customer.openLightbox(${p.id})"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="prod-img-fallback" style="display:none">${p.icon||"👗"}</div>
           <div class="prod-img-zoom-hint">🔍 Tap to view</div>`
        : `<div class="prod-img-fallback" style="cursor:default">${p.icon||"👗"}</div>`;
      return `
        <div class="product-card-v2">
          <div class="prod-img-wrap">${imgHtml}<span class="prod-cat-tag">${p.category}</span></div>
          <div class="prod-body">
            <div class="prod-brand">${p.brand||""}</div>
            <div class="prod-name-v2">${p.name}</div>
            <div class="prod-unit">📐 ${p.unit||""}</div>
            <div class="prod-desc">${p.description||""}</div>
            <div class="prod-footer">
              <div>
                <div class="prod-price-v2">${fmt(p.price)}</div>
                <span class="stock-badge ${stockClass}">${stockLabel}</span>
              </div>
              <button class="btn add-cart-btn" ${!inStock?"disabled":""}
                onclick="Customer.addToCart(${p.id})">${inStock?"🛒 Add":"✕"}</button>
            </div>
          </div>
        </div>`;
    }).join("");

    return `
      <h2 class="page-title">Our Products</h2>
      <div class="filter-bar">
        <input class="input" placeholder="Search by name or brand..." value="${this.searchTerm}"
          oninput="Customer.searchTerm=this.value;Customer.render()"/>
        <select class="input" style="width:auto" onchange="Customer.selectedCat=this.value;Customer.render()">
          ${catOpts}
        </select>
      </div>
      <div class="product-grid-v2">
        ${cards || (Data.catalogueError ? '<p style="color:#b91c1c;padding:20px">We could not load the products. Please check your internet connection and refresh.</p>' : (products.length ? '<p style="color:#9ca3af;padding:20px">No products found.</p>' : '<p style="color:#9ca3af;padding:20px">Loading products…</p>'))}
      </div>`;
  },

  addToCart(productId) {
    const p = products.find(pr => pr.id === productId);
    if (!p) return;
    const ex = cart.find(i => i.id === productId);
    if (ex) ex.qty++; else cart.push({...p, qty:1});
    this.updateCartNav(); this.render();
  },

  // ── LIGHTBOX ──────────────────────────────────────
  openLightbox(productId) {
    const p = products.find(pr => pr.id === productId);
    if (!p || !p.image) return;

    const modal      = document.getElementById("lightbox-modal");
    const img        = document.getElementById("lightbox-img");
    const caption    = document.getElementById("lightbox-caption");
    const meta       = document.getElementById("lightbox-meta");
    const cartBtn    = document.getElementById("lightbox-cart-btn");

    img.src     = p.image;
    img.alt     = p.name;
    caption.textContent = p.name + (p.brand ? ` · ${p.brand}` : "");
    meta.innerHTML = `
      <span class="pay-badge" style="background:#e0e7ff;color:#3730a3">${p.category}</span>
      <span style="margin:0 8px;color:#9ca3af">|</span>
      <span>📦 ${p.unit||""}</span>
      <span style="margin:0 8px;color:#9ca3af">|</span>
      <span style="color:#10b981;font-weight:700">${fmt(p.price)}</span>
      ${p.stock > 0
        ? `<span style="margin:0 8px;color:#9ca3af">|</span><span class="stock-badge stock-ok">${p.stock} in stock</span>`
        : `<span style="margin:0 8px;color:#9ca3af">|</span><span class="stock-badge stock-low">Out of Stock</span>`}
    `;

    if (p.stock > 0) {
      cartBtn.style.display = "inline-flex";
      cartBtn.onclick = () => {
        Customer.addToCart(p.id);
        Customer.closeLightbox();
      };
    } else {
      cartBtn.style.display = "none";
    }

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    // Keyboard close
    document.addEventListener("keydown", Customer._lightboxKeyHandler = (e) => {
      if (e.key === "Escape") Customer.closeLightbox();
    });
  },

  closeLightbox(event) {
    // If clicking backdrop (not the box itself), close
    if (event && event.target.id !== "lightbox-modal") return;
    const modal = document.getElementById("lightbox-modal");
    if (modal) modal.style.display = "none";
    document.body.style.overflow = "";
    if (Customer._lightboxKeyHandler) {
      document.removeEventListener("keydown", Customer._lightboxKeyHandler);
      Customer._lightboxKeyHandler = null;
    }
  },

  _lightboxKeyHandler: null,

  removeFromCart(productId) {
    cart = cart.filter(i => i.id !== productId);
    this.updateCartNav(); this.render();
  },

  updateQty(productId, qty) {
    if (qty < 1) { this.removeFromCart(productId); return; }
    const item = cart.find(i => i.id === productId);
    if (item) item.qty = qty;
    this.updateCartNav(); this.render();
  },

  // ── STEP 1: CART ──────────────────────────────────
  renderCart() {
    if (this._checkoutStep === 3 && this._lastOrder) return this.renderOrderSuccess();
    if (this._checkoutStep === 2) return this.renderDetailsForm();

    if (!cart.length) return `
      <h2 class="page-title">Your Cart</h2>
      <div class="empty-state">🛒 Your cart is empty. Browse products to add items.</div>`;

    const total = cart.reduce((a,i) => a + i.price*i.qty, 0);
    const rows  = cart.map(i => `<tr>
      <td style="font-weight:600">${i.name}</td>
      <td>${fmt(i.price)}</td>
      <td><div class="qty-controls">
        <button class="qty-btn" onclick="Customer.updateQty(${i.id},${i.qty-1})">−</button>
        <span style="min-width:24px;text-align:center">${i.qty}</span>
        <button class="qty-btn" onclick="Customer.updateQty(${i.id},${i.qty+1})">+</button>
      </div></td>
      <td style="font-weight:700;color:#10b981">${fmt(i.price*i.qty)}</td>
      <td><button class="sm-btn" style="background:#ef4444"
        onclick="Customer.removeFromCart(${i.id})">✕</button></td>
    </tr>`).join("");

    return `
      <h2 class="page-title">🛒 Your Cart</h2>
      ${this.checkoutSteps(1)}
      <div class="table-wrap" style="margin-bottom:16px"><table>
        <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="cart-summary">
        <div>
          <div style="font-size:13px;color:#6b7280;margin-bottom:2px">${cart.length} item(s)</div>
          <div class="cart-total">Total: ${fmt(total)}</div>
        </div>
        <button class="btn" style="background:#6366f1;padding:12px 28px;font-size:15px"
          onclick="Customer.goToDetails()">Next: Your Details →</button>
      </div>`;
  },

  goToDetails() {
    if (!cart.length) return;
    this._checkoutStep = 2;
    this.render();
  },

  // ── STEP 2: DETAILS ───────────────────────────────
  renderDetailsForm() {
    const total = cart.reduce((a,i) => a + i.price*i.qty, 0);
    const d     = this._checkoutDetails;
    return `
      <h2 class="page-title">📋 Your Details</h2>
      ${this.checkoutSteps(2)}
      <div class="form-card">
        <div class="form-title">Fill in your details to complete the order</div>
        <div class="form-grid">
          <div class="field">
            <label class="label">Full Name <span style="color:#ef4444">*</span></label>
            <input class="input" id="cust-name" placeholder="e.g. Sarah Nakato" value="${d.name||""}"/>
          </div>
          <div class="field">
            <label class="label">Phone Number <span style="color:#ef4444">*</span></label>
            <input class="input" id="cust-phone" type="tel" placeholder="e.g. 0712 345 678" value="${d.phone||""}"/>
          </div>
        </div>
        <div class="field">
          <label class="label">How would you like to get your order?</label>
          <div class="fulfil-opts">
            <label class="fulfil-opt"><input type="radio" name="fulfil" value="delivery" ${d.fulfilment === "pickup" ? "" : "checked"} onchange="Customer.toggleFulfil()"/> 🚚 Deliver to me</label>
            <label class="fulfil-opt"><input type="radio" name="fulfil" value="pickup" ${d.fulfilment === "pickup" ? "checked" : ""} onchange="Customer.toggleFulfil()"/> 🏬 I'll pick it up at the shop</label>
          </div>
        </div>
        <div class="field" id="cust-location-field" style="display:${d.fulfilment === "pickup" ? "none" : "flex"}">
          <label class="label">Delivery Location <span style="color:#ef4444">*</span></label>
          <input class="input" id="cust-location" placeholder="e.g. Kapsoya, Eldoret" value="${esc(d.location && d.location !== "Pickup at shop" ? d.location : "")}"/>
        </div>
        <div class="trk-info" id="cust-pickup-note" style="display:${d.fulfilment === "pickup" ? "block" : "none"}">🏬 You will collect your order at: <strong>${esc(SHOP_INFO.address)}</strong></div>
        <div class="field">
          <label class="label">Order Notes (optional)</label>
          <textarea class="input" id="cust-notes" rows="2"
            placeholder="Your preferred size, colour, or any special tailoring requests...">${d.notes||""}</textarea>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">
          <button class="btn" style="background:#6b7280"
            onclick="Customer._checkoutStep=1;Customer.render()">← Back to Cart</button>
          <button class="btn" style="background:#6366f1;flex:1"
            onclick="Customer.proceedToPayment()">Next: Choose Payment →</button>
        </div>
      </div>
      <div class="form-card" style="background:#f9fafb">
        <div class="form-title" style="color:#6b7280;font-size:13px">Order Summary</div>
        ${cart.map(i=>`
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;padding:4px 0;border-bottom:1px solid #f3f4f6">
            <span>${i.name} <span style="color:#9ca3af">×${i.qty}</span></span>
            <span style="font-weight:600">${fmt(i.price*i.qty)}</span>
          </div>`).join("")}
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;margin-top:10px;padding-top:10px;border-top:2px solid #10b981">
          <span>Total</span><span style="color:#10b981">${fmt(total)}</span>
        </div>
      </div>`;
  },

  async proceedToPayment() {
    const name     = document.getElementById("cust-name")?.value.trim();
    const phone    = document.getElementById("cust-phone")?.value.trim();
    const location = document.getElementById("cust-location")?.value.trim();
    const notes    = document.getElementById("cust-notes")?.value.trim();
    if (!name)     { alert("Please enter your full name.");         return; }
    if (!phone)    { alert("Please enter your phone number.");      return; }
    const fulfilment = (document.querySelector('input[name="fulfil"]:checked') || {}).value === "pickup" ? "pickup" : "delivery";
    if (fulfilment === "delivery" && !location) { alert("Please enter your delivery location."); return; }
    this._checkoutDetails   = { name, phone, location: fulfilment === "pickup" ? "Pickup at shop" : location, notes, fulfilment };
    // Make sure everything is still in stock (and the prices are current) BEFORE the customer pays
    await Data.loadCatalogue();
    const problems = [];
    cart.forEach(i => {
      const p = products.find(x => x.id === i.id);
      if (!p) problems.push(`${i.name} is no longer available.`);
      else if (i.qty > p.stock) problems.push(p.stock > 0 ? `Only ${p.stock} of ${i.name} left.` : `${i.name} is out of stock.`);
      else if (i.price !== p.price) { problems.push(`The price of ${i.name} changed to ${fmt(p.price)}.`); i.price = p.price; }
    });
    if (problems.length) { alert(problems.join("\n") + "\n\nPlease check your cart."); this._checkoutStep = 1; this.render(); return; }
    PaymentModal._orderData = { total: cart.reduce((a,i)=>a+i.price*i.qty,0) };
    PaymentModal._resolve   = (result) => Customer.finishOrder(result);
    PaymentModal.show(PaymentModal._orderData);
  },

  // ── FINISH ORDER ─────────────────────────────────
  async finishOrder(payResult) {
    if (!payResult) return; // user cancelled
    const total   = cart.reduce((a,i)=>a+i.price*i.qty,0);
    const details = this._checkoutDetails;
    const newSale = {
      fulfilment: details.fulfilment || "delivery",
      id: nextId(sales),
      date: today(),
      items: cart.map(i=>({name:i.name,qty:i.qty,price:i.price})),
      total,
      attendant:        "Customer Order",
      customerName:     details.name,
      customerPhone:    details.phone,
      customerLocation: details.location||"",
      customerNotes:    details.notes||"",
      paymentMethod:    payResult.method,
      paymentStatus:    (payResult.method==="Mobile Money" && !payResult.autoPaid) ? "Pending" : "Paid",
      ...payResult
    };
    // Notifications
    const itemList = newSale.items.map(i=>`${i.name} ×${i.qty}`).join(", ");
    pushNotification("manager",
      `🛒 New order — ${details.name} (${details.phone}) · ${payResult.method} · ${fmt(total)} · ${itemList}`, "order");
    pushNotification("attendant",
      `🛒 New order — ${details.name} (${details.phone}) · ${payResult.method} · ${fmt(total)} · ${itemList}`, "order");

    let custMsg = "";
    if (payResult.method==="Cash")
      custMsg = `✅ Order confirmed! Total: ${fmt(total)}. Cash paid: ${fmt(payResult.amountPaid)}, Change: ${fmt(payResult.change)}.`;
    else if (payResult.method==="Mobile Money") {
      custMsg = payResult.autoPaid
        ? `✅ M-Pesa payment of ${fmt(total)} confirmed${payResult.payCode ? " (receipt " + payResult.payCode + ")" : ""}. Thank you for shopping at Looku Store!`
        : `📲 Payment code ${payResult.payCode} received for ${fmt(total)}. The shop will confirm it shortly.`;
    }
    else
      custMsg = `💳 Order confirmed via ATM/Card! Total: ${fmt(total)}. Delivery to ${details.location}.`;
    pushNotification("customer", custMsg, "success");

    // Tell the shop about this order, so staff can pack & deliver it and the customer can track it
    const cm = document.getElementById("customer-main");
    if (cm) cm.innerHTML = '<div class="empty-state">⏳ Placing your order…</div>';
    const reg = await LookuOrders.create({
      name: details.name, phone: details.phone, notes: details.notes,
      fulfilment: details.fulfilment || "delivery",
      location: details.fulfilment === "pickup" ? "" : details.location,
      items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
      paymentMethod: payResult.method === "Mobile Money" ? "M-Pesa" : payResult.method,
      paymentRef: payResult.payCode || payResult.cardRef || "",
      mpesaCheckoutId: payResult.checkoutId || ""
    });
    newSale.registered = !!reg.ok;
    if (!reg.ok && reg.status === 409 && reg.data) newSale.regError = reg.data.message;
    if (reg.ok) { newSale.trackingCode = reg.data.code; this.rememberOrder(reg.data.code, details.phone, total); }
    this._lastOrder       = { ...newSale };
    cart                  = [];
    this._checkoutDetails = {};
    this._checkoutStep    = 3;
    this.updateCartNav();
    this.updateNotifBadge();
    this.render();
  },

  // ── STEP 3: SUCCESS SCREEN ───────────────────────
  renderOrderSuccess() {
    const o   = this._lastOrder;
    if (!o) return "";
    const pay       = o.paymentMethod;
    const isPending = o.paymentStatus === "Pending";
    const icons     = {"Cash":"💵","Mobile Money":"📲","ATM/Card":"💳"};
    let payDetail   = "";
    if (pay==="Cash")
      payDetail = `<div class="order-success-row"><span>Cash Paid</span><strong>${fmt(o.amountPaid)}</strong></div>
                   <div class="order-success-row"><span>Change</span><strong style="color:#10b981">${fmt(o.change)}</strong></div>`;
    else if (pay==="Mobile Money") {
      payDetail = `<div class="order-success-row"><span>Receipt / code</span><strong>${o.payCode||"—"}</strong></div>
                   <div class="order-success-row"><span>Paid to</span><strong>${o.network}</strong></div>
                   <div style="background:#fef3c7;border-radius:8px;padding:10px;font-size:13px;color:#92400e;margin-top:8px">
                     ${o.paymentStatus==="Pending" ? "⏳ The shop will confirm your payment, then your order is complete." : "✅ Payment confirmed by M-Pesa."}</div>`;
    }
    else
      payDetail = `<div class="order-success-row"><span>Reference</span><strong>${o.cardRef||"—"}</strong></div>`;

    const trackBlock = o.registered ? `
        <div class="trk-code-box">
          <div class="trk-code-label">Your order code</div>
          <div class="trk-code">${esc(o.trackingCode)}</div>
          <div class="trk-code-sub">Keep this code. Use it with your phone number to follow your ${o.fulfilment === "pickup" ? "pickup" : "delivery"} and to rate us when it arrives.</div>
          <button class="btn" style="background:#6366f1;margin-top:10px" onclick="Customer.trackMine(0)">🚚 Track my order</button>
        </div>` : `
        <div class="trk-warn">
          ⚠ ${o.regError ? esc(o.regError) + " " : ""}We couldn't register your order with the shop online. Please send it on WhatsApp so the shop can process it.
          <a class="btn" style="background:#25d366;margin-top:10px;width:100%;text-decoration:none" target="_blank" rel="noopener" href="${this.waOrderLink(o)}">💬 Send this order to the shop on WhatsApp</a>
        </div>`;
    return `
      <div class="order-success-wrap">
        <div class="order-success-icon">${icons[pay]||"✅"}</div>
        <h2 class="order-success-title">${isPending?"Order Placed!":"Order Confirmed! 🎉"}</h2>
        <p class="order-success-sub">${isPending
          ? "Your payment is awaiting confirmation by the shop."
          : "Thank you for shopping at Looku Store! We'll be in touch shortly."}</p>

        <div class="order-success-card">
          <div class="order-success-row"><span>Date</span><strong>${o.date}</strong></div>
          <div class="order-success-row"><span>Customer</span><strong>${o.customerName}</strong></div>
          <div class="order-success-row"><span>Phone</span><strong>${o.customerPhone}</strong></div>
          <div class="order-success-row"><span>Location</span><strong>${o.customerLocation||"—"}</strong></div>
          <div style="border-top:1px solid #e5e7eb;margin:10px 0 8px"></div>
          <div class="order-success-row"><span>Payment</span>
            <span class="pay-badge pay-${pay.toLowerCase().replace(/[\/\s]/g,"-")}">${pay}</span></div>
          <div class="order-success-row"><span>Status</span>
            <span class="status-badge status-${o.paymentStatus.toLowerCase()}">${o.paymentStatus}</span></div>
          ${payDetail}
          <div style="border-top:1px solid #e5e7eb;margin:10px 0 6px"></div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Items Ordered</div>
          ${o.items.map(i=>`
            <div class="order-success-row">
              <span>${i.name} <span style="color:#9ca3af">×${i.qty}</span></span>
              <strong>${fmt(i.price*i.qty)}</strong>
            </div>`).join("")}
          <div class="order-success-row" style="margin-top:10px;padding-top:10px;border-top:2px solid #10b981;font-size:16px">
            <span style="font-weight:800">Total</span>
            <strong style="color:#10b981;font-size:18px">${fmt(o.total)}</strong>
          </div>
        </div>

        ${trackBlock}
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px">
          <button class="btn" style="background:#6366f1"
            onclick="Customer._checkoutStep=1;Customer._lastOrder=null;Customer.showTab('browse',null);document.querySelector('#page-customer .nav-btn').classList.add('active')">
            🛍 Continue Shopping
          </button>
          <button class="btn" style="background:#10b981"
            onclick="Customer.showTab('notifications',null)">
            🔔 My Notifications
          </button>
        </div>
      </div>`;
  },

  // ── TRACK ORDER: delivery progress, confirm receipt, feedback ─────────────
  _track: { code: "", phone: "", data: null, events: [], feedbackGiven: false, error: "", loading: false },
  _trackTimer: null,
  _fb: { overall: 0, delivery: 0, itemOk: null, issues: [], comment: "" },

  myOrders() { return loadFromStorage("looku_my_orders", []); },
  rememberOrder(code, phone, total) {
    const list = this.myOrders().filter(o => o.code !== code);
    list.unshift({ code, phone, total, date: today() });
    saveToStorage("looku_my_orders", list.slice(0, 10));
  },
  fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  },
  stopTrackPoll() { if (this._trackTimer) { clearInterval(this._trackTimer); this._trackTimer = null; } },
  startTrackPoll() {
    this.stopTrackPoll();
    const o = this._track.data;
    if (!o || ["Delivered", "Collected", "Cancelled"].includes(o.status)) return;   // nothing left to wait for
    this._trackTimer = setInterval(() => {
      if (this.currentTab !== "track") return this.stopTrackPoll();
      this.trackOrder(this._track.code, this._track.phone, true);
    }, 20000);
  },
  waOrderLink(o) {
    const items = o.items.map(i => i.name + " x" + i.qty).join(", ");
    const msg = `Hello Looku Store! I'd like to place an order: ${items}. Total ${fmt(o.total)}. ` +
      `${o.fulfilment === "pickup" ? "I will pick it up." : "Deliver to: " + (o.customerLocation || "-") + "."} ` +
      `Name: ${o.customerName}, Phone: ${o.customerPhone}. Payment: ${o.paymentMethod}${o.payCode ? " (code " + o.payCode + ")" : ""}.`;
    return `https://wa.me/${PAYMENT_INFO.whatsapp}?text=${encodeURIComponent(msg)}`;
  },
  trackMine(i) {
    const o = this.myOrders()[i]; if (!o) return;
    this._track = { code: o.code, phone: o.phone, data: null, events: [], feedbackGiven: false, error: "", loading: false };
    this._fb = { overall: 0, delivery: 0, itemOk: null, issues: [], comment: "" };
    this.showTab("track", document.getElementById("track-nav-btn"));
    this.trackOrder(o.code, o.phone);
  },

  async trackOrder(code, phone, silent) {
    const t = this._track;
    code  = String(code  || (document.getElementById("trk-code")  || {}).value || "").trim().toUpperCase();
    phone = String(phone || (document.getElementById("trk-phone") || {}).value || "").trim();
    if (!code || !phone) { t.error = "Please enter your order code and phone number."; this.render(); return; }
    if (!silent) { t.loading = true; t.error = ""; t.code = code; t.phone = phone; this.render(); }
    const r = await LookuOrders.track(code, phone);
    if (this.currentTab !== "track") return;
    t.loading = false;
    if (r.ok) {
      const sig = d => JSON.stringify([d.order.status, d.order.paymentStatus, d.order.receivedAt, d.order.riderName, d.order.etaNote, d.events.length, d.feedbackGiven]);
      const changed = !t.data || sig(r.data) !== t._sig;
      t._sig = sig(r.data);
      t.code = code; t.phone = phone; t.data = r.data.order; t.events = r.data.events;
      t.feedbackGiven = r.data.feedbackGiven; t.error = "";
      this.startTrackPoll();
      if (changed || !silent) this.render();
    } else if (!silent) {
      t.data = null;
      t.error = (r.status === 404 || r.status === 429) && r.data.message ? r.data.message
        : "We couldn't reach the shop's tracking service right now. Please try again in a moment, or message the shop on WhatsApp.";
      this.render();
    }
  },

  renderTrack() {
    const t = this._track, mine = this.myOrders();
    const code  = t.code  || (mine[0] ? mine[0].code  : "");
    const phone = t.phone || (mine[0] ? mine[0].phone : "");
    const mineHtml = mine.length ? `
      <div class="trk-mine"><div class="trk-mine-title">Orders placed on this phone</div>
        ${mine.map((o, i) => `<button class="trk-chip" onclick="Customer.trackMine(${i})">${esc(o.code)} · ${fmt(o.total)} · ${esc(o.date)}</button>`).join("")}
      </div>` : "";
    return `
      <h2 class="page-title">🚚 Track Your Order</h2>
      <div class="form-card" style="max-width:560px">
        <div class="form-grid">
          <div class="field"><label class="label">Order Code</label>
            <input class="input" id="trk-code" placeholder="e.g. LK-7H3K2" value="${esc(code)}" style="text-transform:uppercase"/></div>
          <div class="field"><label class="label">Phone Number Used</label>
            <input class="input" id="trk-phone" type="tel" placeholder="e.g. 0712 345 678" value="${esc(phone)}"/></div>
        </div>
        <button class="btn" style="background:#6366f1;width:100%" onclick="Customer.trackOrder()" ${t.loading ? "disabled" : ""}>${t.loading ? "Looking…" : "🔍 Track Order"}</button>
        ${t.error ? `<div class="err-box" style="margin-top:12px">${esc(t.error)}</div>` : ""}
        ${mineHtml}
      </div>
      ${t.data ? this.renderTrackResult() : ""}`;
  },

  renderTrackResult() {
    const t = this._track, o = t.data, pickup = o.fulfilment === "pickup";
    const flow = pickup
      ? [["Placed", "Order placed"], ["Confirmed", "Order confirmed"], ["Packing", "Being packed"], ["ReadyForPickup", "Ready for pickup"], ["Collected", "Collected"]]
      : [["Placed", "Order placed"], ["Confirmed", "Order confirmed"], ["Packing", "Being packed"], ["OutForDelivery", "Out for delivery"], ["Delivered", "Delivered"]];
    const cancelled = o.status === "Cancelled";
    const idx = flow.findIndex(s => s[0] === o.status);
    const evTime = st => { const e = t.events.filter(x => x.status === st).pop(); return e ? this.fmtTime(e.at) : ""; };
    const steps = flow.map((s, i) => {
      const done = !cancelled && i <= idx, cur = !cancelled && i === idx && !o.receivedAt;
      return `<div class="trk-step ${done ? "done" : ""} ${cur ? "current" : ""}">
        <div class="trk-dot">${done ? "✓" : i + 1}</div>
        <div class="trk-step-body"><div class="trk-step-title">${s[1]}</div><div class="trk-step-time">${evTime(s[0])}</div></div></div>`;
    }).join("") + `<div class="trk-step ${o.receivedAt ? "done current" : ""}">
        <div class="trk-dot">${o.receivedAt ? "✓" : flow.length + 1}</div>
        <div class="trk-step-body"><div class="trk-step-title">Received by you</div><div class="trk-step-time">${o.receivedAt ? this.fmtTime(o.receivedAt) : ""}</div></div></div>`;
    const cancelNote = cancelled ? (t.events.filter(x => x.status === "Cancelled").pop() || {}).note : "";
    const isDone = ["Delivered", "Collected"].includes(o.status);
    const rider = !pickup && o.riderName && ["OutForDelivery", "Delivered"].includes(o.status) ? `
      <div class="trk-info">🛵 <strong>${esc(o.riderName)}</strong>${o.riderPhone ? ` · <a href="tel:${esc(o.riderPhone)}">📞 ${esc(o.riderPhone)}</a>` : ""}${o.etaNote ? ` · ${esc(o.etaNote)}` : ""}</div>` : "";
    const where = o.status === "ReadyForPickup" ? `<div class="trk-info">🏬 Collect at: <strong>${esc(SHOP_INFO.address)}</strong></div>` : "";
    const wa = `https://wa.me/${PAYMENT_INFO.whatsapp}?text=${encodeURIComponent("Hello Looku Store, about my order " + o.code)}`;
    return `
      <div class="form-card trk-card" style="max-width:560px">
        <div class="trk-head"><div><div class="trk-head-code">${esc(o.code)}</div>
          <div class="trk-head-sub">${pickup ? "🏬 Pickup at shop" : "🚚 Delivery" + (o.location ? " to " + esc(o.location) : "")}</div></div>
          <span class="trk-status ${cancelled ? "bad" : (isDone ? "good" : "")}">${cancelled ? "Cancelled" : (flow[idx] ? flow[idx][1] : o.status)}</span></div>
        ${cancelled ? `<div class="err-box" style="margin:12px 0">This order was cancelled${cancelNote ? ": " + esc(cancelNote) : "."}</div>` : `<div class="trk-steps">${steps}</div>`}
        ${rider}${where}
        <div class="trk-pay">Payment: <strong>${esc(o.paymentMethod || "—")}</strong> ·
          <span class="status-badge status-${o.paymentStatus === "Paid" ? "paid" : "pending"}">${esc(o.paymentStatus)}</span>
          ${o.paymentStatus !== "Paid" && !cancelled ? `<div class="trk-hint">If you have already paid, the shop will confirm your payment shortly.</div>` : ""}</div>
        <div class="trk-items">${o.items.map(i => `<div class="order-success-row"><span>${esc(i.name)} <span style="color:#9ca3af">×${i.qty}</span></span><strong>${fmt(i.price * i.qty)}</strong></div>`).join("")}
          <div class="order-success-row" style="border-top:2px solid #10b981;margin-top:8px;padding-top:8px"><span style="font-weight:800">Total</span><strong style="color:#10b981">${fmt(o.total)}</strong></div></div>
        ${isDone && !o.receivedAt ? `<button class="btn" style="background:#10b981;width:100%;margin-top:14px" onclick="Customer.confirmReceived()">✅ I have received my order</button>` : ""}
        <a class="trk-wa" href="${wa}" target="_blank" rel="noopener">💬 Message the shop about this order</a>
      </div>
      ${isDone && !t.feedbackGiven ? this.renderFeedbackForm(o) : ""}
      ${t.feedbackGiven ? `<div class="form-card" style="max-width:560px;text-align:center">⭐ Thank you for your feedback! It helps us serve you better.</div>` : ""}`;
  },

  renderFeedbackForm(o) {
    const f = this._fb, pickup = o.fulfilment === "pickup";
    const stars = kind => [1, 2, 3, 4, 5].map(n => `<button type="button" class="fb-star ${n <= f[kind] ? "on" : ""}" onclick="Customer.setRating('${kind}',${n})" aria-label="${n} stars">★</button>`).join("");
    const ISSUES = [["wrong_item", "Wrong item"], ["wrong_size", "Wrong size"], ["damaged", "Damaged / faulty"], ["late", "Arrived late"], ["poor_quality", "Poor quality"], ["rude_service", "Poor service"], ["other", "Other"]];
    return `
      <div class="form-card" style="max-width:560px">
        <div class="form-title">⭐ How was your order?</div>
        <div class="fb-row"><span>Overall</span><div class="fb-stars">${stars("overall")}</div></div>
        ${pickup ? "" : `<div class="fb-row"><span>Delivery experience</span><div class="fb-stars">${stars("delivery")}</div></div>`}
        <div class="fb-row"><span>Were the items as expected (right item, size and quality)?</span>
          <div><button type="button" class="fb-yn ${f.itemOk === true ? "on" : ""}" onclick="Customer.setItemOk(true)">👍 Yes</button>
               <button type="button" class="fb-yn ${f.itemOk === false ? "on bad" : ""}" onclick="Customer.setItemOk(false)">👎 No</button></div></div>
        <div class="fb-issues"><div class="label" style="margin-bottom:6px">Anything go wrong? (optional)</div>
          ${ISSUES.map(([k, l]) => `<button type="button" class="trk-chip ${f.issues.includes(k) ? "on" : ""}" onclick="Customer.toggleIssue('${k}')">${l}</button>`).join("")}</div>
        <div class="field" style="margin-top:12px"><label class="label">Comments (optional)</label>
          <textarea class="input" id="fb-comment" rows="3" placeholder="Tell us more…">${esc(f.comment)}</textarea></div>
        <button class="btn" style="background:#f59e0b;width:100%" onclick="Customer.submitFeedback()">Send Feedback</button>
      </div>`;
  },
  _keepComment() { const el = document.getElementById("fb-comment"); if (el) this._fb.comment = el.value; },
  setRating(kind, n) { this._keepComment(); this._fb[kind] = n; this.render(); },
  setItemOk(v)       { this._keepComment(); this._fb.itemOk = v; this.render(); },
  toggleIssue(k)     { this._keepComment(); const a = this._fb.issues; const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.push(k); this.render(); },

  async confirmReceived() {
    const t = this._track;
    const r = await LookuOrders.received(t.code, t.phone);
    if (!r.ok) { alert(r.data.message || "Could not confirm right now. Please try again."); return; }
    await this.trackOrder(t.code, t.phone, true);
  },
  async submitFeedback() {
    this._keepComment();
    const t = this._track, f = this._fb;
    if (!f.overall) { alert("Please tap the stars to give an overall rating."); return; }
    const r = await LookuOrders.feedback({ code: t.code, phone: t.phone, overall: f.overall,
      delivery: f.delivery || undefined, itemOk: f.itemOk, issues: f.issues, comment: f.comment });
    if (!r.ok) { alert(r.data.message || "Could not send your feedback right now. Please try again."); return; }
    t.feedbackGiven = true; this._fb = { overall: 0, delivery: 0, itemOk: null, issues: [], comment: "" };
    this.render();
  },

  toggleFulfil() {
    const v = (document.querySelector('input[name="fulfil"]:checked') || {}).value;
    const f = document.getElementById("cust-location-field"), n = document.getElementById("cust-pickup-note");
    if (f) f.style.display = v === "pickup" ? "none" : "flex";
    if (n) n.style.display = v === "pickup" ? "block" : "none";
  },

  // ── ENQUIRE ───────────────────────────────────────
  renderEnquire() {
    return `
      <h2 class="page-title">Send an Enquiry</h2>
      <div class="form-card" style="max-width:520px">
        <div class="field"><label class="label">Your Name</label>
          <input class="input" id="enq-name" placeholder="Your name"/></div>
        <div class="field"><label class="label">Phone Number</label>
          <input class="input" id="enq-phone" placeholder="e.g. 0712 345 678"/></div>
        <div class="field"><label class="label">Message</label>
          <textarea class="input" id="enq-msg" rows="4"
            placeholder="Ask about sizes, colours, custom tailoring, bulk orders and delivery..."></textarea></div>
        <button class="btn" style="background:#6366f1" onclick="Customer.sendEnquiry()">💬 Send Enquiry</button>
      </div>`;
  },

  sendEnquiry() {
    const name  = document.getElementById("enq-name").value.trim();
    const phone = document.getElementById("enq-phone").value.trim();
    const msg   = document.getElementById("enq-msg").value.trim();
    if (!name||!msg) return alert("Please fill in your name and message.");
    pushNotification("manager",   `💬 Enquiry from ${name} (${phone}): "${msg}"`, "info");
    pushNotification("attendant", `💬 Enquiry from ${name} (${phone}): "${msg}"`, "info");
    App.showSuccess("customer-main", "Enquiry sent! We'll get back to you soon.");
    this.render();
  },

  // ── NOTIFICATIONS ─────────────────────────────────
  renderNotifications() {
    const notifs = getNotifications("customer");
    if (!notifs.length) return `<h2 class="page-title">Notifications</h2>
      <div class="empty-state">No notifications yet.</div>`;
    const rows = notifs.map(n => `
      <div class="notif-item notif-${n.type}${n.read?"":" notif-unread"}">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>`).join("");
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 class="page-title" style="margin:0">Notifications</h2>
        <button class="sm-btn" style="background:#6b7280"
          onclick="clearNotifications('customer');Customer.render()">Clear All</button>
      </div>
      <div class="notif-list">${rows}</div>`;
  }
};

//  ATTENDANT
// ────────────────────────────────────────────────────
const Attendant = {
  currentTab: "orders",
  saleItems: [{ productId: "", qty: 1 }],
  pendingDeleteProduct: null,

  init() {
    this.saleItems = [{ productId: "", qty: 1 }];
    this.showTab("orders", document.querySelector("#page-attendant .nav-btn"));
    Deliveries.startPolling();
    Data.startPolling();
    this.updateNotifBadge();
  },

  updateNotifBadge() {
    const btn = document.getElementById("att-notif-btn");
    const count = unreadCount("attendant");
    if (btn) btn.textContent = count > 0 ? `🔔 Notifications (${count})` : "🔔 Notifications";
  },

  showTab(tab, btn) {
    if (tab === "deliveries") setTimeout(() => Deliveries.load(), 0);
    this.currentTab = tab;
    document.querySelectorAll("#page-attendant .nav-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    if (tab === "notifications") markAllRead("attendant");
    this.render();
    this.updateNotifBadge();
  },

  render() {
    const el = document.getElementById("attendant-main");
    switch (this.currentTab) {
      case "orders":        el.innerHTML = this.renderOrders(); break;
      case "deliveries": el.innerHTML = Deliveries.render(); break;
      case "sale":          el.innerHTML = this.renderSale(); break;
      case "stock":         el.innerHTML = this.renderStock(); break;
      case "notifications": el.innerHTML = this.renderNotifications(); break;
    }
  },

  getAttendantName() { return loggedInAttendant ? loggedInAttendant.name : "Attendant"; },

  renderOrders() {
    const todaySales = sales.filter(s => s.date === today());
    // Pending payment actions
    const pendingSales = sales.filter(s => s.paymentStatus === "Pending");
    const pendingHtml = pendingSales.length ? `
      <h3 class="section-title" style="color:#ef4444">⏳ Pending Payments (${pendingSales.length})</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Customer</th><th>Phone</th><th>Code</th><th>Total</th><th>Action</th></tr></thead>
        <tbody>${pendingSales.map(s => `<tr>
          <td>${s.customerName||"Walk-in"}</td>
          <td>${s.customerPhone||"—"}</td>
          <td><strong>${s.payCode||"—"}</strong></td>
          <td style="font-weight:600;color:#10b981">${fmt(s.total)}</td>
          <td>
            <button class="sm-btn" style="background:#10b981" onclick="Attendant.confirmPayment(${s.id})">✓ Confirm Paid</button>
          </td>
        </tr>`).join("")}</tbody>
      </table></div>` : "";

    return `
      <h2 class="page-title">Customer Orders</h2>
      ${pendingHtml}
      <h3 class="section-title">Today's Orders</h3>
      ${todaySales.length ? App.salesTable(todaySales, true) : '<div class="empty-state">No orders today yet.</div>'}
      <h3 class="section-title" style="margin-top:28px">All Orders History</h3>
      ${App.salesTable([...sales].reverse(), true)}`;
  },

  async confirmPayment(saleId) {
    const s = sales.find(sl => sl.id === saleId); if (!s) return;
    if (!confirm(`Confirm ${fmt(s.total)} received?\n\nCode: ${s.payCode||"—"}\n\nOnly confirm after you see this payment in the Equity app or the Equity SMS on the shop phone, not from a screenshot.`)) return;
    const r = saleId < 0 ? await LookuOrders.admin.setPayment(-saleId, { status: "Paid" })      // an online order
                          : await Api.call("PATCH", "/sales/" + saleId + "/payment", { status: "Paid" });
    if (!r.ok) return alert(Api.msg(r));
    pushNotification("customer", `✅ Your payment of ${fmt(s.total)} via ${s.paymentMethod} has been confirmed. Thank you!`, "success");
    pushNotification("manager", `✅ Payment confirmed: ${fmt(s.total)} from ${s.customerName||"customer"} via ${s.paymentMethod}.`, "success");
    await Data.loadStaff();
    App.showSuccess("attendant-main", `Payment confirmed for ${s.customerName||"customer"}.`);
    this.render();
  },

  promptPayment(saleId) {
    const s = sales.find(sl => sl.id === saleId);
    if (!s) return;
    pushNotification("customer", `📲 Payment reminder: Please complete your payment of ${fmt(s.total)} to Looku Store. Thank you!`, "warning");
    App.showSuccess("attendant-main", `Payment reminder sent to ${s.customerName||"customer"}.`);
  },

  renderSale() {
    const itemRows = this.saleItems.map((item, idx) => {
      const p = products.find(pr => pr.id === +item.productId);
      const origPrice  = p ? p.price : 0;
      const salePrice  = item.salePrice !== undefined ? item.salePrice : origPrice;
      const subtotal   = p ? salePrice * item.qty : 0;
      const hasDiscount = p && salePrice < origPrice;
      const discount   = hasDiscount ? origPrice - salePrice : 0;

      return `
        <div class="sale-item-row" style="align-items:flex-end;flex-wrap:wrap;gap:8px;padding:10px;background:#f9fafb;border-radius:10px;margin-bottom:8px">
          <div class="field" style="flex:2;min-width:160px;margin:0">
            ${idx===0?'<label class="label">Product</label>':""}
            <select class="input" onchange="Attendant.updateSaleItem(${idx},'productId',this.value)">
              <option value="">Select product...</option>
              ${products.map(pr=>`<option value="${pr.id}" ${+item.productId===pr.id?"selected":""}>${pr.name} — ${fmt(pr.price)}</option>`).join("")}
            </select>
          </div>
          <div class="field" style="flex:0 0 70px;margin:0">
            ${idx===0?'<label class="label">Qty</label>':""}
            <input class="input" type="number" min="1" value="${item.qty}"
              onchange="Attendant.updateSaleItem(${idx},'qty',+this.value)"/>
          </div>
          <div class="field" style="flex:0 0 130px;margin:0">
            ${idx===0?'<label class="label" title="You can adjust for discount">Unit Price (KSH) ✏️</label>':""}
            <input class="input ${hasDiscount?"input-discounted":""}" type="number" min="0"
              value="${salePrice}"
              ${!p?"disabled":""}
              title="Original price: ${fmt(origPrice)}. Edit to apply discount."
              onchange="Attendant.updateSaleItem(${idx},'salePrice',+this.value)"
              style="border-color:${hasDiscount?"#f59e0b":"#e5e7eb"}"/>
            ${hasDiscount ? `<div style="font-size:11px;color:#f59e0b;margin-top:2px">
              Orig: ${fmt(origPrice)} · Disc: ${fmt(discount)}/unit
            </div>` : (p ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">Orig: ${fmt(origPrice)}</div>` : "")}
          </div>
          <div class="field" style="flex:0 0 120px;margin:0">
            ${idx===0?'<label class="label">Subtotal</label>':""}
            <input class="input" style="background:#f3f4f6;font-weight:700;color:#10b981" readonly
              value="${p ? fmt(subtotal) : "—"}"/>
          </div>
          ${this.saleItems.length>1?`<button class="sm-btn" style="background:#ef4444;margin-bottom:2px" onclick="Attendant.removeSaleItem(${idx})">✕</button>`:""}
        </div>`;
    }).join("");

    const total = this.calcSaleTotal();
    const origTotal = this.calcOrigTotal();
    const totalDiscount = origTotal - total;

    return `
      <h2 class="page-title">Add Sale</h2>
      <div class="form-card">
        <div class="form-title">Customer Details</div>
        <div class="form-grid">
          <div class="field"><label class="label">Customer Name</label>
            <input class="input" id="att-cust-name" placeholder="Customer name (optional)"/></div>
          <div class="field"><label class="label">Phone Number</label>
            <input class="input" id="att-cust-phone" placeholder="e.g. 0712 345 678"/></div>
        </div>
        <div class="field"><label class="label">Location</label>
          <input class="input" id="att-cust-location" placeholder="e.g. Uganda Road, Eldoret"/></div>
      </div>
      <div class="form-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="form-title" style="margin:0">Sale Items</div>
          <div style="font-size:12px;color:#6b7280;background:#f1f5f9;padding:4px 10px;border-radius:20px">
            ✏️ You can edit Unit Price to apply a discount
          </div>
        </div>
        <div class="sale-items-wrap">${itemRows}</div>
        <button class="sm-btn" style="background:#6b7280;margin-top:4px;margin-bottom:16px"
          onclick="Attendant.addSaleItem()">+ Add Item</button>

        <div class="divider"></div>

        ${totalDiscount > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#9ca3af;margin-bottom:6px;padding:0 4px">
          <span>Original Price</span><span style="text-decoration:line-through">${fmt(origTotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#f59e0b;font-weight:600;margin-bottom:6px;padding:0 4px">
          <span>🏷 Total Discount</span><span>− ${fmt(totalDiscount)}</span>
        </div>` : ""}

        <div class="total-row">
          <span style="font-weight:700">Total Amount</span>
          <span style="font-weight:800;color:#1f2937;font-size:18px">${fmt(total)}</span>
        </div>

        <div class="field" style="margin-top:12px">
          <label class="label">Payment Method</label>
          <div class="pay-method-grid">
            <button class="pay-method-btn ${this._selectedPayMethod==="Cash"?"pay-method-selected":""}"
              id="pm-cash" data-method="Cash" onclick="Attendant.selectPayMethod('Cash')">💵 Cash</button>
            <button class="pay-method-btn ${this._selectedPayMethod==="Mobile Money"?"pay-method-selected":""}"
              id="pm-mobile" data-method="Mobile Money" onclick="Attendant.selectPayMethod('Mobile Money')">📲 M-Pesa / Mobile</button>
            <button class="pay-method-btn ${this._selectedPayMethod==="ATM/Card"?"pay-method-selected":""}"
              id="pm-atm" data-method="ATM/Card" onclick="Attendant.selectPayMethod('ATM/Card')">💳 ATM / Card</button>
          </div>
        </div>

        <div id="att-pay-cash-section" style="display:${this._selectedPayMethod==="Cash"?"block":"none"}">
          <div class="field"><label class="label">Amount Paid (KSH)</label>
            <input class="input" id="att-amount-paid" type="number" placeholder="Enter amount paid"
              oninput="Attendant.updateChange()"/>
          </div>
          <div id="att-change-display"></div>
        </div>
        <div id="att-pay-mobile-section" style="display:${this._selectedPayMethod==="Mobile Money"?"block":"none"}">
          ${equityInstructionsHTML(total)}
          <div class="form-grid">
            <div class="field"><label class="label">Customer Phone</label>
              <input class="input" id="att-mobile-phone" placeholder="e.g. 0712 345 678"/></div>
            <div class="field"><label class="label">Confirmation Code</label>
              <input class="input" id="att-mobile-code" placeholder="e.g. UK12ABC3XY" style="text-transform:uppercase"/></div>
          </div>
        </div>
        <div id="att-pay-atm-section" style="display:${this._selectedPayMethod==="ATM/Card"?"block":"none"}">
          <div class="field"><label class="label">Card / ATM Reference (optional)</label>
            <input class="input" id="att-atm-ref" placeholder="Transaction ref"/></div>
          <div class="change-box change-ok" style="margin-top:4px">💳 Confirm customer card transaction is approved.</div>
        </div>

        <input type="hidden" id="att-pay-method" value="${this._selectedPayMethod}"/>
        <button class="btn" style="background:#10b981;margin-top:16px;width:100%;font-size:15px"
          onclick="Attendant.recordSale()">✓ Record Sale</button>
      </div>`;
  },

  _selectedPayMethod: "",

  selectPayMethod(method) {
    this._selectedPayMethod = method;
    document.getElementById("att-pay-method").value = method;
    ["Cash","Mobile Money","ATM/Card"].forEach(m => {
      const id = "pm-" + m.toLowerCase().replace(/[\/\s]/g,"-").replace("--","-");
      const btn = document.getElementById(id);
      if (btn) btn.classList.toggle("pay-method-selected", m === method);
    });
    document.getElementById("att-pay-cash-section").style.display   = method==="Cash" ? "block" : "none";
    document.getElementById("att-pay-mobile-section").style.display = method==="Mobile Money" ? "block" : "none";
    document.getElementById("att-pay-atm-section").style.display    = method==="ATM/Card" ? "block" : "none";
    document.getElementById("att-change-display").innerHTML = "";
  },

  calcSaleTotal() {
    return this.saleItems.reduce((acc, item) => {
      const p = products.find(pr => pr.id === +item.productId);
      if (!p) return acc;
      const price = (item.salePrice !== undefined && item.salePrice !== null) ? item.salePrice : p.price;
      return acc + price * item.qty;
    }, 0);
  },

  calcOrigTotal() {
    return this.saleItems.reduce((acc, item) => {
      const p = products.find(pr => pr.id === +item.productId);
      return acc + (p ? p.price * item.qty : 0);
    }, 0);
  },

  updateSaleItem(idx, field, val) {
    if (field === "productId") {
      // Reset salePrice when product changes so it defaults to new product price
      this.saleItems[idx].salePrice = undefined;
    }
    this.saleItems[idx][field] = val;
    this.render();
  },
  addSaleItem()    { this.saleItems.push({ productId: "", qty: 1 }); this.render(); },
  removeSaleItem(idx) { this.saleItems.splice(idx, 1); this.render(); },

  updateChange() {
    const paid = +document.getElementById("att-amount-paid").value;
    const total = this.calcSaleTotal();
    const change = paid - total;
    const el = document.getElementById("att-change-display");
    if (!paid || !el) return;
    el.innerHTML = change >= 0
      ? `<div class="change-box change-ok">✓ Change to return: ${fmt(change)}</div>`
      : `<div class="change-box change-short">⚠ Short by: ${fmt(Math.abs(change))}</div>`;
  },

  async recordSale() {
    const valid = this.saleItems.filter(i => i.productId && i.qty > 0);
    if (!valid.length) return alert("Please add at least one product.");
    const total = this.calcSaleTotal();
    if (!total) return alert("Total is 0. Select valid products.");
    const method = this._selectedPayMethod;
    if (!method) return alert("Please select a payment method (Cash, Mobile Money, or ATM/Card).");
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const custName = val("att-cust-name"), custPhone = val("att-cust-phone"), custLocation = val("att-cust-location");

    const items = [];
    for (const i of valid) {
      const p = products.find(pr => pr.id === +i.productId);
      if (!p) return alert("One of the products is no longer in the list. Please refresh.");
      items.push({ productId: p.id, qty: +i.qty, price: (i.salePrice !== undefined && i.salePrice !== null) ? +i.salePrice : p.price, name: p.name });
    }
    const body = { paymentMethod: method, customerName: custName, customerPhone: custPhone, customerLocation: custLocation,
                   items: items.map(i => ({ productId: i.productId, qty: i.qty, price: i.price })) };
    if (method === "Cash") {
      const paid = +val("att-amount-paid");
      if (!paid || paid < total) return alert("Please enter a valid amount paid (must be ≥ total).");
      body.amountPaid = paid;
    } else if (method === "Mobile Money") {
      const phone = val("att-mobile-phone") || custPhone, payCode = normalizeCode(val("att-mobile-code"));
      if (!phone) return alert("Please enter the customer's phone number.");
      if (payCode.length < 6) return alert("Enter the confirmation code from the payment SMS.");
      if (codeUsed(payCode)) return alert("This code has already been used for another sale.");
      body.mobilePhone = phone; body.payCode = payCode;
    } else body.cardRef = val("att-atm-ref");

    const r = await Api.call("POST", "/sales", body);                      // the server checks stock and records everything in one step
    if (!r.ok) { alert(Api.msg(r)); await Data.loadStaff(); this.render(); return; }
    const done = r.data.data, payStatus = done.status;

    const itemList = items.map(i => `${i.name} ×${i.qty}`).join(", ");
    pushNotification("manager", `🧾 Sale recorded by ${this.getAttendantName()}: ${fmt(done.total)} via ${method}${custName?" for "+custName:""}. Items: ${itemList}`, "order");
    if (custPhone) {
      pushNotification("customer", payStatus === "Pending"
        ? `📲 Hi ${custName||"Customer"}, please complete your ${method} payment of ${fmt(done.total)} to Looku Store. Items: ${itemList}`
        : `✅ Sale confirmed! ${fmt(done.total)} received via ${method}. Items: ${itemList}. Thank you!`, "success");
    }
    this.saleItems = [{ productId: "", qty: 1 }];
    this._selectedPayMethod = "";
    await Data.loadStaff();
    App.showSuccess("attendant-main",
      method === "Cash" ? `Sale recorded! Change: ${fmt(done.change)}`
      : method === "Mobile Money" ? `Sale recorded! Waiting for the payment to be confirmed.`
      : `Sale recorded! ATM/Card payment confirmed.`);
    this.render();
  },

  renderStock() {
    const productOptions = products.map(p =>
      `<option value="${p.id}">${p.name} — ${p.category} (stock: ${p.stock})</option>`
    ).join("");

    const rows = products.map(p => `<tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.category}</td>
      <td>${fmt(p.price)}</td>
      <td><span class="stock-badge ${p.stock > 10 ? "stock-ok" : "stock-low"}">${p.stock}</span></td>
      <td><button class="sm-btn" style="background:#ef4444" onclick="Attendant.requestDelete(${p.id})">⚠ Request Delete</button></td>
    </tr>`).join("");

    return `
      <h2 class="page-title">Stock Management</h2>
      <p style="color:#6b7280;font-size:13px;margin-bottom:16px">
        Fill in the full stock report below — it is sent directly to the Manager.
      </p>

      <div class="form-card" style="border-top:4px solid #10b981">
        <div class="form-title">📋 Submit Stock Report</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:16px">
          Complete all fields accurately. This report is sent to the Manager immediately upon submission.
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="label">Product <span style="color:#ef4444">*</span></label>
            <select class="input" id="sr-product-id" onchange="Attendant.prefillStockReport()">
              <option value="">Select product...</option>
              ${productOptions}
            </select>
          </div>
          <div class="field">
            <label class="label">Date of Stock Entry <span style="color:#ef4444">*</span></label>
            <input class="input" id="sr-date" type="date" value="${today()}"/>
          </div>
          <div class="field">
            <label class="label">Supplier / Source</label>
            <input class="input" id="sr-supplier" placeholder="e.g. Looku Warehouse, Market"/>
          </div>
          <div class="field">
            <label class="label">Batch / Invoice Number</label>
            <input class="input" id="sr-batch" placeholder="e.g. INV-2026-001"/>
          </div>
        </div>

        <div style="background:#f0fdf4;border-radius:12px;padding:16px;margin-bottom:14px;border:1px solid #bbf7d0">
          <div style="font-weight:700;color:#166534;font-size:13px;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">📦 Quantity Details</div>
          <div class="form-grid">
            <div class="field" style="margin:0">
              <label class="label">Total Items Received <span style="color:#ef4444">*</span></label>
              <input class="input" id="sr-total-qty" type="number" min="1" placeholder="e.g. 50" oninput="Attendant.calcStockTotals()"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">✅ Perfect / Good Condition <span style="color:#ef4444">*</span></label>
              <input class="input" id="sr-perfect-qty" type="number" min="0" placeholder="e.g. 47" oninput="Attendant.calcStockTotals()"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">⚠ Imperfect / Damaged</label>
              <input class="input" id="sr-imperfect-qty" type="number" min="0" placeholder="e.g. 3" oninput="Attendant.calcStockTotals()"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">❌ Missing / Short</label>
              <input class="input" id="sr-missing-qty" type="number" min="0" placeholder="e.g. 0" oninput="Attendant.calcStockTotals()"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">↩ Returned to Supplier</label>
              <input class="input" id="sr-returned-qty" type="number" min="0" placeholder="e.g. 0" oninput="Attendant.calcStockTotals()"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">➕ Items Added to Store Stock</label>
              <input class="input" id="sr-added-qty" type="number" min="0" placeholder="Auto-calculated"
                style="background:#dcfce7;font-weight:700;color:#166534" oninput="Attendant.calcStockTotals()"/>
            </div>
          </div>
          <div id="sr-totals-display" style="display:none;margin-top:12px;padding:10px 14px;background:#fff;border-radius:8px;border:1px solid #bbf7d0;font-size:13px"></div>
        </div>

        <div style="background:#fffbeb;border-radius:12px;padding:16px;margin-bottom:14px;border:1px solid #fde68a">
          <div style="font-weight:700;color:#92400e;font-size:13px;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">🏷 Quality Assessment</div>
          <div class="form-grid">
            <div class="field" style="margin:0">
              <label class="label">Overall Quality <span style="color:#ef4444">*</span></label>
              <select class="input" id="sr-quality">
                <option value="">Select quality grade...</option>
                <option value="Excellent">⭐⭐⭐⭐⭐ Excellent — All items perfect</option>
                <option value="Good">⭐⭐⭐⭐ Good — Minor defects only</option>
                <option value="Average">⭐⭐⭐ Average — Some defects noted</option>
                <option value="Poor">⭐⭐ Poor — Many defects</option>
                <option value="Rejected">⭐ Rejected — Returned to supplier</option>
              </select>
            </div>
            <div class="field" style="margin:0">
              <label class="label">Size / Fit Accuracy</label>
              <select class="input" id="sr-size-accuracy">
                <option value="Accurate">✅ Sizes accurate as labeled</option>
                <option value="Runs Small">⬇ Runs small — size up</option>
                <option value="Runs Large">⬆ Runs large — size down</option>
                <option value="Mixed">🔀 Mixed — varies per item</option>
              </select>
            </div>
            <div class="field" style="margin:0">
              <label class="label">Fabric / Material Quality</label>
              <select class="input" id="sr-fabric">
                <option value="Premium">Premium — matches description</option>
                <option value="Standard">Standard — acceptable</option>
                <option value="Below Standard">Below Standard — issues noted</option>
              </select>
            </div>
            <div class="field" style="margin:0">
              <label class="label">Colours / Prints Accuracy</label>
              <select class="input" id="sr-colours">
                <option value="Accurate">✅ Matches catalogue exactly</option>
                <option value="Slight Variation">🎨 Slight colour variation</option>
                <option value="Different">❌ Different from catalogue</option>
              </select>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="label">Description of Defects / Issues</label>
          <textarea class="input" id="sr-defects" rows="2" placeholder="Torn stitching, colour fading, broken zips, stains, size mislabelling..."></textarea>
        </div>

        <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin-bottom:14px;border:1px solid #bae6fd">
          <div style="font-weight:700;color:#075985;font-size:13px;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">💰 Cost & Pricing</div>
          <div class="form-grid">
            <div class="field" style="margin:0">
              <label class="label">Cost Per Unit (KES)</label>
              <input class="input" id="sr-cost-unit" type="number" min="0" placeholder="e.g. 1200" oninput="Attendant.calcStockCosts()"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">Total Stock Cost (KES)</label>
              <input class="input" id="sr-total-cost" type="number" min="0" placeholder="Auto-calculated" style="background:#f0f9ff"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">Current Selling Price (KES)</label>
              <input class="input" id="sr-selling-price" type="number" min="0" placeholder="Current store price"/>
            </div>
            <div class="field" style="margin:0">
              <label class="label">Suggested Selling Price (KES)</label>
              <input class="input" id="sr-suggested-price" type="number" min="0" placeholder="Your suggestion"/>
            </div>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="label">Storage Location in Store</label>
            <input class="input" id="sr-location" placeholder="e.g. Rack A3, Shelf 2, Store room"/>
          </div>
          <div class="field">
            <label class="label">Storage Condition</label>
            <select class="input" id="sr-storage-condition">
              <option value="Good">✅ Good — proper storage</option>
              <option value="Needs Improvement">⚠ Needs improvement</option>
              <option value="Poor">❌ Poor — at risk of damage</option>
            </select>
          </div>
          <div class="field">
            <label class="label">Reorder Urgency</label>
            <select class="input" id="sr-urgency">
              <option value="Not Needed">🟢 Not needed yet</option>
              <option value="Low">🔵 Low — next month</option>
              <option value="Medium">🟡 Medium — within 2 weeks</option>
              <option value="High">🟠 High — this week</option>
              <option value="Critical">🔴 Critical — immediately</option>
            </select>
          </div>
          <div class="field">
            <label class="label">Report Type</label>
            <select class="input" id="sr-type">
              <option value="New Stock In">📦 New Stock In</option>
              <option value="Stock Update">🔄 Stock Update / Recount</option>
              <option value="Returned Stock">↩ Returned Stock</option>
              <option value="Damaged Stock">⚠ Damaged Stock Report</option>
              <option value="Stock Transfer">🔀 Stock Transfer</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label">Additional Notes / Recommendations to Manager</label>
          <textarea class="input" id="sr-notes" rows="3"
            placeholder="Reorder recommendations, supplier feedback, pricing suggestions, anything the manager should know..."></textarea>
        </div>

        <div id="sr-error" class="err-box" style="display:none"></div>
        <button class="btn" style="background:#10b981;width:100%;margin-top:8px;font-size:15px"
          onclick="Attendant.submitStockReport()">
          📤 Submit Report to Manager
        </button>
      </div>

      <h3 class="section-title">All Products &amp; Stock Levels</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  },

  prefillStockReport() {
    const id = +document.getElementById("sr-product-id")?.value;
    const p  = products.find(pr => pr.id === id);
    if (!p) return;
    const priceEl = document.getElementById("sr-selling-price");
    if (priceEl) priceEl.value = p.price;
  },

  calcStockTotals() {
    const total     = +document.getElementById("sr-total-qty")?.value     || 0;
    const perfect   = +document.getElementById("sr-perfect-qty")?.value   || 0;
    const imperfect = +document.getElementById("sr-imperfect-qty")?.value || 0;
    const missing   = +document.getElementById("sr-missing-qty")?.value   || 0;
    const returned  = +document.getElementById("sr-returned-qty")?.value  || 0;
    const addedEl   = document.getElementById("sr-added-qty");
    const displayEl = document.getElementById("sr-totals-display");
    if (addedEl && perfect > 0 && !addedEl._userEdited) addedEl.value = perfect;
    if (addedEl) addedEl.addEventListener("input", () => { addedEl._userEdited = true; }, { once: true });
    const accounted = perfect + imperfect + missing + returned;
    const variance  = total - accounted;
    if (displayEl && total > 0) {
      displayEl.style.display = "block";
      displayEl.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">
        <span>📦 Received: <strong>${total}</strong></span>
        <span style="color:#16a34a">✅ Perfect: <strong>${perfect}</strong></span>
        <span style="color:#d97706">⚠ Imperfect: <strong>${imperfect}</strong></span>
        <span style="color:#dc2626">❌ Missing: <strong>${missing}</strong></span>
        <span style="color:#6b7280">↩ Returned: <strong>${returned}</strong></span>
        ${variance !== 0 ? `<span style="color:${variance > 0 ? "#7c3aed":"#dc2626"}">⚡ Variance: <strong>${variance > 0 ? "+"+variance : variance}</strong></span>` : '<span style="color:#16a34a">✓ Fully accounted</span>'}
      </div>`;
    }
    Attendant.calcStockCosts();
  },

  calcStockCosts() {
    const unitCost  = +document.getElementById("sr-cost-unit")?.value  || 0;
    const addedQty  = +document.getElementById("sr-added-qty")?.value  || 0;
    const totalCostEl = document.getElementById("sr-total-cost");
    if (totalCostEl && unitCost && addedQty) totalCostEl.value = unitCost * addedQty;
  },

  async submitStockReport() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ""; };
    const productId = +g("sr-product-id"), totalQty = +g("sr-total-qty") || 0, perfectQty = +g("sr-perfect-qty") || 0, quality = g("sr-quality");
    const errEl = document.getElementById("sr-error"), fail = m => { errEl.style.display = "flex"; errEl.textContent = "⚠ " + m; };
    if (!productId) return fail("Please select a product.");
    if (!totalQty) return fail("Total items received is required.");
    if (g("sr-perfect-qty") === "") return fail("Perfect items count is required.");
    if (!quality) return fail("Please select overall quality grade.");
    errEl.style.display = "none";
    const body = {
      productId, date: g("sr-date"), reportType: g("sr-type") || "New Stock In", supplier: g("sr-supplier"), batchNo: g("sr-batch"),
      totalReceived: totalQty, perfectQty, imperfectQty: +g("sr-imperfect-qty") || 0, missingQty: +g("sr-missing-qty") || 0, returnedQty: +g("sr-returned-qty") || 0,
      addedToStock: +g("sr-added-qty") || perfectQty,
      quality, sizeAccuracy: g("sr-size-accuracy"), fabricQuality: g("sr-fabric"), colourAccuracy: g("sr-colours"), defectsDesc: g("sr-defects"),
      storageLocation: g("sr-location"), storageCondition: g("sr-storage-condition"),
      costPerUnit: +g("sr-cost-unit") || 0, totalCost: +g("sr-total-cost") || 0, sellingPrice: +g("sr-selling-price") || 0, suggestedPrice: +g("sr-suggested-price") || 0,
      reorderUrgency: g("sr-urgency") || "Not Needed", notes: g("sr-notes")
    };
    const r = await Api.call("POST", "/stock-reports", body);              // the server adds the stock and files the report in one step
    if (!r.ok) return fail(Api.msg(r));
    const d = r.data.data;
    pushNotification("manager", `📋 NEW STOCK REPORT — ${d.productName} · By: ${this.getAttendantName()} · Received: ${totalQty} | Added: ${body.addedToStock} · Quality: ${quality} · Reorder: ${body.reorderUrgency}`, "stock");
    await Data.loadStaff();
    App.showSuccess("attendant-main", `✅ Stock report submitted! "${d.productName}" stock updated: ${d.previousStock} → ${d.newStock} items.`);
    this.render();
  },

  updateStock() { /* replaced by the full stock report form */ },

  requestDelete(productId) {
    const p = products.find(pr => pr.id === productId);
    if (!p) return;
    this.pendingDeleteProduct = p;
    document.getElementById("modal-product-name").textContent = p.name;
    document.getElementById("modal-reason").value = "";
    document.getElementById("delete-modal").style.display = "flex";
  },

  closeModal() {
    this.pendingDeleteProduct = null;
    document.getElementById("delete-modal").style.display = "none";
  },

  async submitDeleteRequest() {
    const reason = document.getElementById("modal-reason").value.trim();
    if (!reason) return alert("Please enter a reason.");
    const p = this.pendingDeleteProduct; if (!p) return;
    const r = await Api.call("POST", "/delete-requests", { productId: p.id, reason });
    if (!r.ok) return alert(Api.msg(r));
    this.closeModal();
    App.showSuccess("attendant-main", `Delete request for "${p.name}" sent to Manager.`);
  },

  renderNotifications() {
    const notifs = getNotifications("attendant");
    if (!notifs.length) return `<h2 class="page-title">Notifications</h2><div class="empty-state">No notifications yet.</div>`;
    const rows = notifs.map(n => `
      <div class="notif-item notif-${n.type}${n.read?"":" notif-unread"}">
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>`).join("");
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 class="page-title" style="margin:0">Notifications</h2>
        <button class="sm-btn" style="background:#6b7280" onclick="clearNotifications('attendant');Attendant.render()">Clear All</button>
      </div>
      <div class="notif-list">${rows}</div>`;
  }
};


// ────────────────────────────────────────────────────
//  DELIVERIES — staff order desk (attendants + manager) and customer feedback (manager)
// ────────────────────────────────────────────────────
const Deliveries = {
  orders: [], loaded: false, loading: false, error: "", filter: "active", _sig: "", timer: null,
  feedback: null, fbError: "",

  NEXT: {
    delivery: { Placed: ["Confirmed", "✅ Confirm order"], Confirmed: ["Packing", "📦 Start packing"], Packing: ["OutForDelivery", "🚚 Send out for delivery"], OutForDelivery: ["Delivered", "📍 Mark delivered"] },
    pickup:   { Placed: ["Confirmed", "✅ Confirm order"], Confirmed: ["Packing", "📦 Start packing"], Packing: ["ReadyForPickup", "🛍 Ready for pickup"], ReadyForPickup: ["Collected", "✅ Mark collected"] },
  },
  LABEL: { Placed: "New", Confirmed: "Confirmed", Packing: "Packing", OutForDelivery: "Out for delivery", ReadyForPickup: "Ready for pickup", Delivered: "Delivered", Collected: "Collected", Cancelled: "Cancelled" },

  actor() { return App.currentPage === "manager" ? "Manager" : (loggedInAttendant ? loggedInAttendant.name : "Staff"); },
  host()  { return App.currentPage === "manager" ? Manager : Attendant; },
  paint() { const h = this.host(); if (h.currentTab === "deliveries" || h.currentTab === "feedback") h.render(); },
  phoneShow(p) { return p && String(p).startsWith("254") ? "0" + String(p).slice(3) : (p || ""); },

  startPolling() {
    this.stopPolling();
    if (LookuOrders.hasKey()) this.load(true);
    this.timer = setInterval(() => { if (LookuOrders.hasKey()) this.load(true); }, 45000);
  },
  stopPolling() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

  updateBadges() {
    const n = this.orders.filter(o => o.status === "Placed").length;
    const label = n ? `🚚 Deliveries (${n})` : "🚚 Deliveries";
    ["att-deliv-btn", "mgr-deliv-btn"].forEach(id => { const b = document.getElementById(id); if (b) b.textContent = label; });
  },

  async load(silent) {
    if (!LookuOrders.hasKey()) { this.loaded = false; this.paint(); return; }
    if (!silent) { this.loading = true; this.paint(); }
    const r = await LookuOrders.admin.list();
    this.loading = false;
    if (r.ok) { this.orders = r.data.data; this.loaded = true; this.error = ""; }
    else if (r.status === 401) { LookuOrders.clearKey(); this.loaded = false; this.error = "That shop key was not accepted. Please ask the manager for the current key."; }
    else if (r.status === 503) { this.error = "The server is not fully set up yet (it needs its JWT_SECRET setting)."; }
    else if (r.status === 429) { this.error = r.data.message || "Too many attempts. Wait a few minutes."; }
    else if (!silent) { this.error = "Can't reach the shop server right now. Check the internet connection and try again."; }
    this.updateBadges();
    const sig = JSON.stringify(this.orders.map(o => [o.id, o.status, o.paymentStatus, o.updatedAt])) + this.error + this.loaded + this.loading;
    if (!silent || sig !== this._sig) { this._sig = sig; this.paint(); }
  },

  async saveKey() {
    const v = ((document.getElementById("deliv-key") || {}).value || "").trim();
    if (!v) return;
    LookuOrders.setKey(v);
    const r = await LookuOrders.admin.ping();
    if (!r.ok) { LookuOrders.clearKey(); this.error = r.status === 401 ? "That shop key was not accepted." : (r.data.message || "Could not connect to the shop server."); this.paint(); return; }
    this.error = ""; this.startPolling(); this.load();
  },
  forgetKey() { LookuOrders.clearKey(); this.orders = []; this.loaded = false; this.error = ""; this.paint(); },

  setFilter(f) { this.filter = f; this.paint(); },

  // ── actions ──
  async advance(id) {
    const o = this.orders.find(x => x.id === id); if (!o) return;
    const step = (this.NEXT[o.fulfilment] || {})[o.status]; if (!step) return;
    const to = step[0], body = { status: to };
    if (to === "OutForDelivery") {
      const name = prompt("Who is delivering this order? (rider / person's name)");
      if (!name || !name.trim()) return;
      body.riderName = name.trim();
      body.riderPhone = (prompt("Their phone number (optional):") || "").trim();
      body.etaNote = (prompt("Estimated time (optional), e.g. about 45 min:") || "").trim();
    }
    if (["OutForDelivery", "Delivered", "Collected"].includes(to) && o.paymentStatus !== "Paid") {
      const cash = /cash/i.test(o.paymentMethod || "");
      const msg = cash ? `Payment is not marked paid yet. Remember to collect ${fmt(o.total)} in cash. Continue?` : "Payment has not been confirmed yet. Continue anyway?";
      if (!confirm(msg)) return;
    }
    const r = await LookuOrders.admin.setStatus(id, body);
    if (!r.ok) { alert((r.data && r.data.message) || "Could not update the order."); await this.load(true); return; }
    if (r.data && r.data.warnings && r.data.warnings.length) alert(r.data.warnings.join("\n"));
    if (to === "Confirmed") await Data.loadStaff();                          // stock went down on the server
    await this.load(true);
  },

  async cancel(id) {
    const o = this.orders.find(x => x.id === id); if (!o) return;
    const reason = prompt("Reason for cancelling this order (the customer will see it):");
    if (!reason || !reason.trim()) return;
    const r = await LookuOrders.admin.setStatus(id, { status: "Cancelled", note: reason.trim() });
    if (!r.ok) { alert((r.data && r.data.message) || "Could not cancel the order."); await this.load(true); return; }
    await Data.loadStaff();                                                   // cancelled orders go back on the shelf automatically
    await this.load(true);
  },

  async setPaid(id, paid) {
    const o = this.orders.find(x => x.id === id); if (!o) return;
    if (paid && !confirm(`Mark ${fmt(o.total)} from ${o.customerName} as PAID?\n\nOnly do this after you see the money in the Equity app, the M-Pesa SMS on the shop phone, or you hold the cash. Not from a screenshot.`)) return;
    const r = await LookuOrders.admin.setPayment(id, { status: paid ? "Paid" : "Pending" });
    if (!r.ok) { alert((r.data && r.data.message) || "Could not update the payment."); return; }
    await this.load(true);
  },

  waLink(o) {
    const n = o.customerName, c = o.code, rider = o.riderName ? `${o.riderName}${o.riderPhone ? " (" + o.riderPhone + ")" : ""}` : "our rider";
    const m = {
      Placed:         `Hello ${n}, we've received your Looku Store order ${c} (${fmt(o.total)}). We'll confirm it shortly.`,
      Confirmed:      `Hello ${n}, your Looku Store order ${c} is confirmed. We're getting it ready.`,
      Packing:        `Hello ${n}, your order ${c} is being packed.`,
      OutForDelivery: `Hello ${n}, your order ${c} is on its way with ${rider}${o.etaNote ? " — " + o.etaNote : ""}.`,
      ReadyForPickup: `Hello ${n}, your order ${c} is ready for pickup at ${SHOP_INFO.address}.`,
      Delivered:      `Hello ${n}, your order ${c} has been delivered. Please open Looku Store > Track Order, confirm you received it and rate us. Thank you!`,
      Collected:      `Hello ${n}, thank you for collecting your order ${c}. Please open Looku Store > Track Order and rate us.`,
      Cancelled:      `Hello ${n}, we're sorry, your order ${c} was cancelled. Please contact us for details.`,
    }[o.status] || `Hello ${n}, about your Looku Store order ${c}.`;
    return `https://wa.me/${encodeURIComponent(o.customerPhone)}?text=${encodeURIComponent(m)}`;
  },

  // ── screens ──
  renderKeyForm() {
    return `
      <h2 class="page-title">🚚 Deliveries</h2>
      <div class="form-card" style="max-width:480px">
        <div class="form-title">Connect to the shop's order desk</div>
        <p style="font-size:13px;color:#6b7280;margin-bottom:12px">Enter the shop key (ask the manager). You only need to do this once on this phone or computer.</p>
        ${this.error ? `<div class="err-box">${esc(this.error)}</div>` : ""}
        <div class="field"><label class="label">Shop Key</label>
          <input class="input" id="deliv-key" type="password" placeholder="Shop key" onkeydown="if(event.key==='Enter')Deliveries.saveKey()"/></div>
        <button class="btn" style="background:#6366f1;width:100%" onclick="Deliveries.saveKey()">Connect</button>
      </div>`;
  },

  render() {
    if (!LookuOrders.hasKey()) return this.renderKeyForm();
    const O = this.orders, F = this.filter;
    const inProg = o => !["Delivered", "Collected", "Cancelled"].includes(o.status);
    const filters = [
      ["active", "Active", O.filter(inProg).length], ["new", "New", O.filter(o => o.status === "Placed").length],
      ["done", "Completed", O.filter(o => ["Delivered", "Collected"].includes(o.status)).length],
      ["cancelled", "Cancelled", O.filter(o => o.status === "Cancelled").length], ["all", "All", O.length]];
    const shown = O.filter(o => F === "all" ? true : F === "active" ? inProg(o) : F === "new" ? o.status === "Placed" : F === "done" ? ["Delivered", "Collected"].includes(o.status) : o.status === "Cancelled");
    const cards = shown.map(o => this.card(o)).join("");
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
        <h2 class="page-title" style="margin:0">🚚 Deliveries</h2>
        <div><button class="sm-btn" style="background:#6366f1" onclick="Deliveries.load()">↻ Refresh</button></div>
      </div>
      ${this.error ? `<div class="err-box">${esc(this.error)}</div>` : ""}
      ${this.loading ? `<div class="empty-state">Loading orders…</div>` : `
      <div class="dv-chips">${filters.map(([k, l, n]) => `<button class="trk-chip ${F === k ? "on" : ""}" onclick="Deliveries.setFilter('${k}')">${l} (${n})</button>`).join("")}</div>
      ${cards || `<div class="empty-state">No orders here yet.</div>`}`}`;
  },

  card(o) {
    const step = (this.NEXT[o.fulfilment] || {})[o.status];
    const paid = o.paymentStatus === "Paid", fin = ["Delivered", "Collected", "Cancelled"].includes(o.status);
    const where = o.fulfilment === "pickup" ? "🏬 Pickup at shop" : "🚚 " + esc(o.location || "—");
    return `
      <div class="dv-card dv-${o.status}">
        <div class="dv-head"><div><span class="dv-code">${esc(o.code)}</span> <span class="dv-badge dv-b-${o.status}">${this.LABEL[o.status] || esc(o.status)}</span></div>
          <div class="dv-time">${esc(Customer.fmtTime(o.createdAt))}</div></div>
        <div class="dv-cust"><strong>${esc(o.customerName)}</strong> · <a href="tel:+${esc(o.customerPhone)}">📞 ${esc(this.phoneShow(o.customerPhone))}</a><br>${where}</div>
        <div class="dv-items">${o.items.map(i => `${esc(i.name)} ×${i.qty}`).join(", ")} — <strong>${fmt(o.total)}</strong></div>
        ${o.notes ? `<div class="dv-note">📝 ${esc(o.notes)}</div>` : ""}
        ${o.riderName ? `<div class="dv-note">🛵 ${esc(o.riderName)}${o.riderPhone ? " · " + esc(o.riderPhone) : ""}${o.etaNote ? " · " + esc(o.etaNote) : ""}</div>` : ""}
        <div class="dv-pay">Payment: ${esc(o.paymentMethod || "—")} ·
          <span class="status-badge status-${paid ? "paid" : "pending"}">${esc(o.paymentStatus)}</span>${o.paymentRef ? ` · ref ${esc(o.paymentRef)}` : ""}${o.receivedAt ? ` · <span style="color:#059669">✅ customer confirmed receipt</span>` : ""}</div>
        <div class="dv-actions">
          ${step && o.status !== "Cancelled" ? `<button class="btn dv-next" onclick="Deliveries.advance(${o.id})">${step[1]}</button>` : ""}
          ${!paid && o.status !== "Cancelled" ? `<button class="sm-btn" style="background:#10b981" onclick="Deliveries.setPaid(${o.id},true)">💰 Mark paid</button>` : ""}
          ${paid && !fin ? `<button class="sm-btn" style="background:#9ca3af" onclick="Deliveries.setPaid(${o.id},false)">Undo paid</button>` : ""}
          <a class="sm-btn" style="background:#25d366;text-decoration:none;display:inline-block" href="${this.waLink(o)}" target="_blank" rel="noopener">💬 WhatsApp customer</a>
          ${!fin ? `<button class="sm-btn" style="background:#ef4444" onclick="Deliveries.cancel(${o.id})">✕ Cancel</button>` : ""}
        </div>
      </div>`;
  },

  // ── customer feedback (manager) ──
  async loadFeedback() {
    if (!LookuOrders.hasKey()) { this.fbError = "Connect to the order desk first (Deliveries tab)."; this.paint(); return; }
    const r = await LookuOrders.admin.feedback();
    if (r.ok) { this.feedback = r.data; this.fbError = ""; }
    else this.fbError = r.status === 401 ? "The shop key was not accepted." : (r.data && r.data.message) || "Can't reach the shop server right now.";
    this.paint();
  },
  stars(n) { return n ? "★".repeat(n) + "☆".repeat(5 - n) : "—"; },
  ISSUE_LABEL: { wrong_item: "Wrong item", wrong_size: "Wrong size", damaged: "Damaged / faulty", late: "Arrived late", poor_quality: "Poor quality", rude_service: "Poor service", other: "Other" },

  renderFeedback() {
    if (this.fbError) return `<h2 class="page-title">⭐ Customer Feedback</h2><div class="err-box">${esc(this.fbError)}</div>`;
    if (!this.feedback) return `<h2 class="page-title">⭐ Customer Feedback</h2><div class="empty-state">Loading feedback…</div>`;
    const s = this.feedback.summary, list = this.feedback.data;
    const issues = Object.entries(s.issueCounts).sort((a, b) => b[1] - a[1]);
    const card = (icon, val, label, color) => `<div class="stat-card"><div class="stat-accent-bar" style="background:${color}"></div><div class="stat-icon">${icon}</div><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`;
    return `
      <h2 class="page-title">⭐ Customer Feedback</h2>
      <div class="stats-grid">
        ${card("⭐", s.avgOverall === null ? "—" : s.avgOverall + " / 5", "Average rating", "#f59e0b")}
        ${card("🚚", s.avgDelivery === null ? "—" : s.avgDelivery + " / 5", "Delivery rating", "#6366f1")}
        ${card("👍", s.itemOkPct === null ? "—" : s.itemOkPct + "%", "Items as expected", "#10b981")}
        ${card("💬", s.count, "Responses", "#ec4899")}
      </div>
      ${issues.length ? `<div class="form-card"><div class="form-title">Most reported problems</div>${issues.map(([k, n]) => `<span class="trk-chip on">${esc(this.ISSUE_LABEL[k] || k)} · ${n}</span>`).join("")}</div>` : ""}
      ${list.length ? list.map(f => `
        <div class="dv-card ${f.overall <= 2 ? "dv-Cancelled" : ""}">
          <div class="dv-head"><div><span class="dv-code">${esc(f.code)}</span> <span class="fb-show">${this.stars(f.overall)}</span></div><div class="dv-time">${esc(Customer.fmtTime(f.createdAt))}</div></div>
          <div class="dv-cust"><strong>${esc(f.customerName)}</strong> · ${f.fulfilment === "pickup" ? "Pickup" : "Delivery"} · ${fmt(f.total)}${f.delivery ? ` · Delivery ${this.stars(f.delivery)}` : ""}${f.itemOk === null ? "" : f.itemOk ? " · 👍 items OK" : " · 👎 items not as expected"}</div>
          ${f.issues.length ? `<div class="dv-note">⚠ ${f.issues.map(i => esc(this.ISSUE_LABEL[i] || i)).join(", ")}</div>` : ""}
          ${f.comment ? `<div class="dv-note">“${esc(f.comment)}”</div>` : ""}
          ${f.overall <= 3 ? `<div class="dv-actions"><a class="sm-btn" style="background:#25d366;text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="https://wa.me/${encodeURIComponent(f.customerPhone)}?text=${encodeURIComponent("Hello " + f.customerName + ", thank you for your feedback on order " + f.code + ". We're sorry it wasn't perfect and would like to make it right.")}">💬 Follow up on WhatsApp</a></div>` : ""}
        </div>`).join("") : `<div class="empty-state">No feedback yet. It appears here once customers rate their delivered orders.</div>`}`;
  },
};
LookuOrders.actor = () => Deliveries.actor();


// ── Boot ──────────────────────────────────────────────
// Global paste listener — pastes image when on stock page
document.addEventListener("paste", (ev) => {
  if (Manager.currentTab !== "stock") return;
  const items = Array.from(ev.clipboardData?.items || []);
  const imgItem = items.find(i => i.type.startsWith("image/"));
  if (imgItem) {
    ev.preventDefault();
    Manager.processImageFile(imgItem.getAsFile());
  }
});

App.goTo("landing");
