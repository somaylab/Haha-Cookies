/**
 * Haha Get — Main Application Logic (Neo-Brutalism Stealth Edition)
 * High-performance state inspection, export, import, and manipulation
 */
(function () {
  "use strict";

  /* ═══════════════════════════════
     State
     ═══════════════════════════════ */
  let currentEntries = [];
  let filteredEntries = [];
  let currentUrl = "";
  let currentDomain = "";
  let editingEntryIndex = -1; // -1 = adding new, >=0 = editing existing
  let currentExportFormat = "json";

  /* ═══════════════════════════════
     DOM References
     ═══════════════════════════════ */
  const $ = (id) => document.getElementById(id);

  const domainBadge = $("domainBadge");
  const entryCount = $("entryCount");
  const searchInput = $("searchInput");
  const entryTable = $("entryTable");
  const entryTableBody = $("entryTableBody");
  const emptyState = $("emptyState");
  const emptyStateTitle = $("emptyStateTitle");
  const emptyStateHint = $("emptyStateHint");
  const loadingState = $("loadingState");
  const toastContainer = $("toastContainer");

  // Modals
  const exportModal = $("exportModal");
  const importModal = $("importModal");
  const editModal = $("editModal");
  const confirmModal = $("confirmModal");

  // Export
  const exportOutput = $("exportOutput");
  const btnCopyExport = $("btnCopyExport");
  const btnDownloadExport = $("btnDownloadExport");

  // Import
  const importInput = $("importInput");
  const importStatus = $("importStatus");
  const importFileInput = $("importFileInput");
  const btnImportFile = $("btnImportFile");
  const btnImportSubmit = $("btnImportSubmit");

  // Edit form
  const editModalTitle = $("editModalTitle");
  const editForm = $("editForm");
  const editName = $("editName");
  const editValue = $("editValue");
  const editDomain = $("editDomain");
  const editPath = $("editPath");
  const editExpiry = $("editExpiry");
  const editSecure = $("editSecure");
  const editHttpOnly = $("editHttpOnly");
  const editSameSite = $("editSameSite");
  const editError = $("editError");

  // Confirm
  const confirmMessage = $("confirmMessage");
  const btnConfirmYes = $("btnConfirmYes");

  /* ═══════════════════════════════
     Initialization
     ═══════════════════════════════ */
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    showLoading(true);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && tab.url) {
        currentUrl = tab.url;
        try {
          const url = new URL(tab.url);
          currentDomain = url.hostname;
          if (!currentUrl.startsWith("http")) {
            domainBadge.textContent = "SYSTEM";
            domainBadge.title = currentUrl;
          } else {
            domainBadge.textContent = currentDomain.toUpperCase();
            domainBadge.title = currentUrl;
          }
        } catch {
          domainBadge.textContent = "N/A";
        }
      }

      await loadEntries();
    } catch (e) {
      showToast("INIT ERROR: " + e.message, "error");
    } finally {
      showLoading(false);
    }

    bindEvents();
  }

  /* ═══════════════════════════════
     Data Loading
     ═══════════════════════════════ */
  function loadEntries() {
    return new Promise((resolve) => {
      if (!currentUrl || !currentUrl.startsWith("http")) {
        currentEntries = [];
        renderEntries();
        resolve();
        return;
      }

      chrome.runtime.sendMessage(
        { action: "syncRead", url: currentUrl, domain: currentDomain },
        (response) => {
          if (chrome.runtime.lastError) {
            showToast("LOAD ERROR: " + chrome.runtime.lastError.message, "error");
            currentEntries = [];
          } else if (response && response.error) {
            showToast("READ ERROR: " + response.error, "error");
            currentEntries = [];
          } else {
            currentEntries = (response && response.entries) || [];
          }
          // Sort alphabetically by name
          currentEntries.sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          );
          renderEntries();
          resolve();
        }
      );
    });
  }

  /* ═══════════════════════════════
     Rendering
     ═══════════════════════════════ */
  function renderEntries() {
    const query = searchInput.value.toLowerCase().trim();

    if (query) {
      filteredEntries = currentEntries.filter(
        (it) =>
          it.name.toLowerCase().includes(query) ||
          it.value.toLowerCase().includes(query) ||
          it.domain.toLowerCase().includes(query)
      );
    } else {
      filteredEntries = [...currentEntries];
    }

    // Update count indicator
    if (query) {
      entryCount.textContent = `${filteredEntries.length} / ${currentEntries.length} ENTRIES`;
    } else {
      entryCount.textContent = `${currentEntries.length} ENTRIES`;
    }

    // Handle empty state
    if (filteredEntries.length === 0) {
      entryTableBody.innerHTML = "";
      if (entryTable) entryTable.style.display = "none";
      emptyState.style.display = "flex";

      if (query) {
        if (emptyStateTitle) emptyStateTitle.textContent = "// NO MATCHING ENTRIES";
        if (emptyStateHint) emptyStateHint.textContent = `No stored items match keyword "${query}".`;
      } else if (!currentUrl || !currentUrl.startsWith("http")) {
        if (emptyStateTitle) emptyStateTitle.textContent = "// SYSTEM BROWSER PAGE";
        if (emptyStateHint) emptyStateHint.textContent = "Internal browser pages do not store session data. Switch to any normal website (e.g. google.com) to view entries.";
      } else {
        if (emptyStateTitle) emptyStateTitle.textContent = "// NO ENTRIES FOUND";
        if (emptyStateHint) emptyStateHint.textContent = `Target domain (${currentDomain}) has no active session entries. Click '+' to add one.`;
      }
      return;
    }

    if (entryTable) entryTable.style.display = "table";
    emptyState.style.display = "none";

    entryTableBody.innerHTML = filteredEntries
      .map((it, i) => {
        const expires = it.expirationDate
          ? formatDate(it.expirationDate)
          : '<span style="color:var(--ink-muted);font-weight:700;">[SESSION]</span>';

        const flags = buildFlags(it);
        const truncValue =
          it.value.length > 34
            ? escapeHtml(it.value.substring(0, 34)) + "…"
            : escapeHtml(it.value);

        return `<tr data-index="${i}">
          <td class="cell-name" title="${escapeAttr(it.name)}">${escapeHtml(it.name)}</td>
          <td class="cell-value" title="${escapeAttr(it.value)}">${truncValue}</td>
          <td class="cell-domain" title="${escapeAttr(it.domain)}">${escapeHtml(it.domain)}</td>
          <td class="cell-path" title="${escapeAttr(it.path)}">${escapeHtml(it.path)}</td>
          <td class="cell-expires">${expires}</td>
          <td class="cell-flags">${flags}</td>
          <td class="cell-actions">
            <button class="btn-action btn-copy" data-action="copy" data-index="${i}" title="Copy value">CPY</button>
            <button class="btn-action btn-edit" data-action="edit" data-index="${i}" title="Edit">EDT</button>
            <button class="btn-action btn-delete" data-action="delete" data-index="${i}" title="Delete">DEL</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function buildFlags(item) {
    const flags = [];
    if (item.secure) {
      flags.push('<span class="b-badge b-sec" title="Secure">SEC</span>');
    }
    if (item.httpOnly) {
      flags.push('<span class="b-badge b-http" title="HttpOnly">HTTP</span>');
    }
    if (item.sameSite && item.sameSite !== "unspecified") {
      const label = item.sameSite === "no_restriction" ? "NONE" : item.sameSite.toUpperCase();
      flags.push(
        `<span class="b-badge b-same" title="SameSite: ${escapeAttr(item.sameSite)}">${label}</span>`
      );
    }
    return flags.join("");
  }

  /* ═══════════════════════════════
     Event Binding
     ═══════════════════════════════ */
  function bindEvents() {
    // Search
    searchInput.addEventListener("input", debounce(renderEntries, 150));

    // Toolbar buttons
    $("btnRefresh").addEventListener("click", handleRefresh);
    $("btnAddEntry").addEventListener("click", handleAddEntry);
    $("btnExport").addEventListener("click", handleExportOpen);
    $("btnImport").addEventListener("click", handleImportOpen);
    $("btnClearAll").addEventListener("click", handleClearAll);

    // Table actions (delegated)
    entryTableBody.addEventListener("click", handleTableAction);

    // Export modal
    document.querySelectorAll(".format-tab").forEach((tab) => {
      tab.addEventListener("click", handleExportFormatChange);
    });
    btnCopyExport.addEventListener("click", handleCopyExport);
    btnDownloadExport.addEventListener("click", handleDownloadExport);

    // Import modal
    btnImportFile.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", handleImportFileSelect);
    btnImportSubmit.addEventListener("click", handleImportSubmit);

    // Edit modal
    $("btnEditSave").addEventListener("click", handleEditSave);

    // Modal close buttons
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeModal($(btn.dataset.close));
      });
    });

    // Close modals on overlay click
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal(overlay);
      });
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.active").forEach(closeModal);
      }
    });
  }

  /* ═══════════════════════════════
     Handlers — Toolbar
     ═══════════════════════════════ */
  async function handleRefresh() {
    showLoading(true);
    await loadEntries();
    showLoading(false);
    showToast("DATA REFRESHED", "success");
  }

  function handleAddEntry() {
    editingEntryIndex = -1;
    editModalTitle.textContent = "// ADD_ENTRY";
    editForm.reset();
    editPath.value = "/";
    const isWeb = currentDomain && !currentDomain.includes("/") && currentUrl.startsWith("http");
    editDomain.value = isWeb ? `.${currentDomain}` : "";
    editError.classList.remove("visible");
    openModal(editModal);
  }

  /* ═══════════════════════════════
     Handlers — Export
     ═══════════════════════════════ */
  function handleExportOpen() {
    if (currentEntries.length === 0) {
      showToast("NO DATA TO EXPORT", "info");
      return;
    }
    currentExportFormat = "json";
    document.querySelectorAll(".format-tab").forEach((t) => t.classList.remove("active"));
    document.querySelector('[data-format="json"]').classList.add("active");
    updateExportOutput();
    openModal(exportModal);
  }

  function handleExportFormatChange(e) {
    document.querySelectorAll(".format-tab").forEach((t) => t.classList.remove("active"));
    e.target.classList.add("active");
    currentExportFormat = e.target.dataset.format;
    updateExportOutput();
  }

  function updateExportOutput() {
    const entries = currentEntries;
    let output = "";

    switch (currentExportFormat) {
      case "json":
        output = DataFormatter.toJSON(entries);
        break;
      case "netscape":
        output = DataFormatter.toNetscape(entries);
        break;
      case "header":
        output = DataFormatter.toHeaderString(entries);
        break;
      case "base64":
        output = DataFormatter.toBase64(entries);
        break;
    }

    exportOutput.value = output;
  }

  async function handleCopyExport() {
    try {
      await navigator.clipboard.writeText(exportOutput.value);
      showToast("COPIED TO CLIPBOARD", "success");
    } catch {
      exportOutput.select();
      document.execCommand("copy");
      showToast("COPIED TO CLIPBOARD", "success");
    }
  }

  function handleDownloadExport() {
    const content = exportOutput.value;
    const ext = DataFormatter.getFileExtension(currentExportFormat);
    const mime = DataFormatter.getMimeType(currentExportFormat);
    const filename = `hahaget_${currentDomain}_${Date.now()}${ext}`;

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`SAVED: ${filename}`, "success");
  }

  /* ═══════════════════════════════
     Handlers — Import
     ═══════════════════════════════ */
  function handleImportOpen() {
    importInput.value = "";
    setImportStatus("", "");
    openModal(importModal);
  }

  function handleImportFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      importInput.value = ev.target.result;
      setImportStatus(`FILE LOADED: ${file.name.toUpperCase()}`, "info");
    };
    reader.onerror = () => {
      setImportStatus("FAILED TO READ FILE", "error");
    };
    reader.readAsText(file);

    e.target.value = "";
  }

  async function handleImportSubmit() {
    const text = importInput.value.trim();
    if (!text) {
      setImportStatus("INPUT CANNOT BE EMPTY", "error");
      return;
    }

    // Pass currentDomain so header string format can use it
    const result = DataParser.autoDetect(text, currentDomain);

    if (!result.success) {
      // Check if header format needs domain but we're on a system page
      if (result.needsDomain) {
        setImportStatus(
          "HEADER STRING DETECTED — NAVIGATE TO A WEBSITE TAB FIRST TO SET TARGET DOMAIN.",
          "error"
        );
      } else {
        setImportStatus(result.error.toUpperCase(), "error");
      }
      return;
    }

    setImportStatus(
      `DETECTED: ${result.format.toUpperCase()}. INJECTING ${result.entries.length} ENTRIES...`,
      "info"
    );

    let successCount = 0;
    const errors = [];

    for (const entry of result.entries) {
      try {
        const response = await sendMessage({ action: "syncWrite", entry });
        if (response && response.success) {
          successCount++;
        } else {
          errors.push(`${entry.name}: ${(response && response.error) || "Write failed"}`);
        }
      } catch (e) {
        errors.push(`${entry.name}: ${e.message}`);
      }
    }

    if (errors.length > 0) {
      setImportStatus(
        `INJECTED ${successCount}/${result.entries.length}. ERRORS:\n${errors.join("\n")}`,
        "error"
      );
    } else {
      setImportStatus(
        `SUCCESS: INJECTED ${successCount} ENTRIES`,
        "success"
      );
      showToast(`INJECTED ${successCount} ENTRIES`, "success");
    }

    await loadEntries();
  }

  function setImportStatus(message, type) {
    importStatus.textContent = message;
    importStatus.className = "import-status";
    if (type && message) {
      importStatus.classList.add(`status-${type}`);
    }
  }

  /* ═══════════════════════════════
     Handlers — Clear All
     ═══════════════════════════════ */
  function handleClearAll() {
    if (currentEntries.length === 0) {
      showToast("NOTHING TO CLEAR", "info");
      return;
    }

    confirmMessage.textContent = `CLEAR ALL ${currentEntries.length} ENTRIES FOR ${currentDomain.toUpperCase()}?`;

    btnConfirmYes.onclick = async () => {
      closeModal(confirmModal);
      showLoading(true);

      try {
        const response = await sendMessage({
          action: "syncClear",
          url: currentUrl,
        });

        if (response && (response.success || response.count > 0)) {
          showToast(`CLEARED ${response.count} ENTRIES`, "success");
        } else if (response && response.errors && response.errors.length > 0) {
          showToast(`ERRORS ON CLEAR: ${response.errors.length}`, "error");
        }
      } catch (e) {
        showToast("CLEAR FAILED: " + e.message, "error");
      }

      await loadEntries();
      showLoading(false);
    };

    openModal(confirmModal);
  }

  /* ═══════════════════════════════
     Handlers — Table Actions
     ═══════════════════════════════ */
  function handleTableAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index, 10);
    const item = filteredEntries[index];
    if (!item) return;

    switch (action) {
      case "copy":
        handleCopyValue(item);
        break;
      case "edit":
        handleEditEntry(item, index);
        break;
      case "delete":
        handleDeleteEntry(item);
        break;
    }
  }

  async function handleCopyValue(item) {
    try {
      await navigator.clipboard.writeText(item.value);
      showToast(`COPIED: ${item.name}`, "success");
    } catch {
      showToast("COPY FAILED", "error");
    }
  }

  function handleEditEntry(item, index) {
    editingEntryIndex = index;
    editModalTitle.textContent = "// EDIT_ENTRY";
    editError.classList.remove("visible");

    // Populate form
    editName.value = item.name;
    editValue.value = item.value;
    editDomain.value = item.domain;
    editPath.value = item.path || "/";
    editSecure.checked = item.secure;
    editHttpOnly.checked = item.httpOnly;
    editSameSite.value = item.sameSite || "unspecified";

    if (item.expirationDate) {
      const date = new Date(item.expirationDate * 1000);
      editExpiry.value = toLocalDatetimeString(date);
    } else {
      editExpiry.value = "";
    }

    openModal(editModal);
  }

  async function handleDeleteEntry(item) {
    try {
      const response = await sendMessage({
        action: "syncDelete",
        name: item.name,
        domain: item.domain,
        path: item.path,
        secure: item.secure,
      });

      if (response && response.success) {
        showToast(`DELETED: ${item.name}`, "success");
        await loadEntries();
      } else {
        showToast(`DELETE FAILED: ${(response && response.error) || "Unknown error"}`, "error");
      }
    } catch (e) {
      showToast("DELETE FAILED: " + e.message, "error");
    }
  }

  /* ═══════════════════════════════
     Handlers — Edit/Add Save
     ═══════════════════════════════ */
  async function handleEditSave() {
    editError.classList.remove("visible");

    const name = editName.value.trim();
    const value = editValue.value;
    const domain = editDomain.value.trim();
    const path = editPath.value.trim() || "/";

    if (!name) {
      showEditError("NAME FIELD IS REQUIRED.");
      return;
    }
    if (!domain) {
      showEditError("DOMAIN FIELD IS REQUIRED.");
      return;
    }

    const payload = {
      name: name,
      value: value,
      domain: domain,
      path: path,
      secure: editSecure.checked,
      httpOnly: editHttpOnly.checked,
      sameSite: editSameSite.value,
    };

    if (editExpiry.value) {
      const ts = new Date(editExpiry.value).getTime() / 1000;
      if (isNaN(ts) || ts <= 0) {
        showEditError("INVALID EXPIRATION TIMESTAMP.");
        return;
      }
      payload.expirationDate = ts;
    }

    if (payload.sameSite === "no_restriction") {
      payload.secure = true;
    }

    if (editingEntryIndex >= 0) {
      const oldItem = filteredEntries[editingEntryIndex];
      if (oldItem) {
        await sendMessage({
          action: "syncDelete",
          name: oldItem.name,
          domain: oldItem.domain,
          path: oldItem.path,
          secure: oldItem.secure,
        });
      }
    }

    try {
      const response = await sendMessage({ action: "syncWrite", entry: payload });
      if (response && response.success) {
        closeModal(editModal);
        showToast(
          editingEntryIndex >= 0
            ? `UPDATED: ${name}`
            : `ADDED: ${name}`,
          "success"
        );
        await loadEntries();
      } else {
        showEditError((response && response.error) || "FAILED TO SAVE ENTRY.");
      }
    } catch (e) {
      showEditError("SAVE FAILED: " + e.message);
    }
  }

  function showEditError(msg) {
    editError.textContent = msg;
    editError.classList.add("visible");
  }

  /* ═══════════════════════════════
     Modal Helpers
     ═══════════════════════════════ */
  function openModal(overlay) {
    overlay.classList.add("active");
  }

  function closeModal(overlay) {
    overlay.classList.remove("active");
  }

  /* ═══════════════════════════════
     Toast Notifications
     ═══════════════════════════════ */
  function showToast(message, type = "info") {
    const icons = {
      success: "[OK]",
      error: "[ERR]",
      info: "[INFO]",
    };

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.15s, transform 0.15s";
      toast.style.opacity = "0";
      toast.style.transform = "translate(10px, 0)";
      setTimeout(() => toast.remove(), 150);
    }, 2800);
  }

  /* ═══════════════════════════════
     Loading State
     ═══════════════════════════════ */
  function showLoading(show) {
    loadingState.style.display = show ? "flex" : "none";
    if (show) {
      emptyState.style.display = "none";
    }
  }

  /* ═══════════════════════════════
     Utilities
     ═══════════════════════════════ */
  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function escapeHtml(str) {
    const el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatDate(unixTimestamp) {
    try {
      const date = new Date(unixTimestamp * 1000);
      const now = new Date();

      if (date < now) {
        return `<span style="color:var(--brutal-red);font-weight:800;">[EXP] ${date.toLocaleDateString()}</span>`;
      }

      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return String(unixTimestamp);
    }
  }

  function toLocalDatetimeString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d}T${h}:${min}`;
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
})();
