const state = { contacts: [], batchSize: 500 };
const $ = (id) => document.getElementById(id);
const toast = (message) => {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
};
async function loadTemplates() {
  try {
    const response = await fetch("/api/templates");
    const data = await response.json();
    ["templateSelect", "testTemplate"].forEach((id) => {
      const select = $(id);
      select.innerHTML =
        '<option value="">Select approved SID</option>' +
        data.templates
          .map((t) => `<option value="${t.sid}">${t.name} · ${t.sid}</option>`)
          .join("");
    });
    const list = $("templateList");
    if (list) list.innerHTML = data.templates.length ? data.templates.map((template) => `<div class="template-row"><div><strong>${template.name}</strong><small>${template.sid}</small></div><button type="button" class="remove-template" data-sid="${template.sid}" ${template.sid === data.templates[0].sid ? "" : ""}>Remove</button></div>`).join("") : '<p class="empty-list">No templates added yet.</p>';
    list?.querySelectorAll(".remove-template").forEach((button) => button.addEventListener("click", async () => {
      const response = await fetch(`/api/templates/${button.dataset.sid}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) return toast(result.error);
      toast("Template removed");
      loadTemplates();
    }));
  } catch {
    toast("Could not load approved templates");
  }
}
function updateSummary() {
  const count = state.contacts.length;
  $("contactCount").textContent = count;
  $("previewCount").textContent = `${count} contact${count === 1 ? "" : "s"}`;
  $("batchCount").textContent = count ? Math.ceil(count / state.batchSize) : 0;
  $("metricContacts").textContent = count;
  $("metricBatches").textContent = count ? Math.ceil(count / state.batchSize) : 0;
  $("sendCampaign").disabled = !count || !$("templateSelect").value;
  $("campaignStatus").textContent = count
    ? `${count} contacts are ready for review.`
    : "No contacts imported yet.";
}
function renderPreview() {
  const body = $("previewBody");
  if (!state.contacts.length) {
    body.innerHTML =
      '<tr><td colspan="4" class="empty">Import a CSV to preview contacts here.</td></tr>';
    updateSummary();
    return;
  }
  body.innerHTML = state.contacts
    .slice(0, 1000)
    .map(
      (contact, index) =>
        `<tr><td>${index + 1}</td><td>${contact.number}</td><td class="${contact.valid ? "valid" : "invalid"}">${contact.valid ? "Ready" : "Invalid number"}</td><td><button class="remove-contact" data-index="${index}" title="Remove contact">Remove</button></td></tr>`,
    )
    .join("");
  body.querySelectorAll(".remove-contact").forEach((button) =>
    button.addEventListener("click", () => {
      state.contacts.splice(Number(button.dataset.index), 1);
      renderPreview();
    }),
  );
  updateSummary();
}
$("csvFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $("fileName").textContent = file.name;
  const form = new FormData();
  form.append("contacts", file);
  try {
    const response = await fetch("/api/contacts/preview", {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    state.contacts = data.contacts;
    $("clearContacts").hidden = false;
    renderPreview();
    toast(`Imported ${data.validCount} valid contacts`);
  } catch (error) {
    toast(error.message);
  }
});
$("clearContacts").addEventListener("click", () => {
  state.contacts = [];
  $("csvFile").value = "";
  $("fileName").textContent = "CSV up to 25 MB";
  $("clearContacts").hidden = true;
  renderPreview();
});
$("templateSelect").addEventListener("change", updateSummary);
$("manageTemplates").addEventListener("click", () => { $("templateDialog").hidden = false; loadTemplates(); });
$("closeTemplateDialog").addEventListener("click", () => { $("templateDialog").hidden = true; });
$("templateDialog").addEventListener("click", (event) => { if (event.target === $("templateDialog")) $("templateDialog").hidden = true; });
$("templateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("templateStatus");
  const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid: $("newTemplateSid").value, name: $("newTemplateName").value }) });
  const data = await response.json();
  if (!response.ok) { status.textContent = data.error; status.className = "form-status error"; return; }
  status.textContent = "Template added.";
  status.className = "form-status";
  $("templateForm").reset();
  loadTemplates();
});
document.querySelectorAll(".segmented button").forEach((button) =>
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".segmented button")
      .forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    const customWrap = document.querySelector(".custom-wrap");
    if (button.dataset.size === "custom") {
      customWrap.hidden = false;
      state.batchSize = Number($("customBatch").value);
    } else {
      customWrap.hidden = true;
      state.batchSize = Number(button.dataset.size);
    }
    updateSummary();
  }),
);
$("customBatch").addEventListener("input", () => {
  state.batchSize = Math.max(1, Number($("customBatch").value) || 1);
  updateSummary();
});
$("sendCampaign").addEventListener("click", async () => {
  const button = $("sendCampaign");
  button.disabled = true;
  button.firstChild.textContent = "Starting... ";
  try {
    const response = await fetch("/api/campaigns/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contacts: state.contacts.filter((c) => c.valid).map((c) => c.number),
        templateSid: $("templateSelect").value,
        batchSize: state.batchSize,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    $("campaignStatus").textContent =
      `Campaign ${data.campaignId} started: ${data.total} contacts in ${data.batches} batches.`;
    toast("Campaign queued successfully");
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  } finally {
    button.firstChild.textContent = "Send campaign ";
  }
});
async function loadLogs() {
  const response = await fetch("/api/logs");
  if (!response.ok) return;
  const data = await response.json();
  $("logsBody").innerHTML = data.logs.length
    ? data.logs
        .map(
          (log) =>
            `<tr><td>${new Date(log.timestamp).toLocaleString()}</td><td>${log.type}</td><td>${log.contact || "-"}</td><td>${log.campaignId || log.templateSid || log.sid || "-"}</td><td>${log.status || log.error || "-"}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="empty">No activity recorded yet.</td></tr>';
}
async function checkAuth() {
  try {
  const response = await fetch("/api/auth/me", { credentials: "same-origin" });
  const data = await response.json();
  $("loginGate").hidden = data.authenticated;
  if (data.authenticated) {
    loadTemplates();
    loadLogs();
    updateSummary();
  }
  } catch (error) {
    $("loginStatus").textContent = "Cannot connect to the server. Start it with npm start.";
  }
}
$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("loginStatus");
  status.textContent = "Signing in...";
  try {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: $("loginEmail").value,
      password: $("loginPassword").value,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    status.textContent = data.error || "Sign-in failed.";
    return;
  }
  $("loginGate").hidden = true;
  loadTemplates();
  loadLogs();
  } catch (error) {
    status.textContent = "Cannot connect to the server. Start it with npm start.";
  }
});
$("logoutButton").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.reload();
});
$("refreshLogs").addEventListener("click", loadLogs);
$("clearLogs").addEventListener("click", async () => {
  if (!window.confirm("Clear every activity log? This cannot be undone.")) return;
  const response = await fetch("/api/logs", { method: "DELETE", credentials: "same-origin" });
  if (!response.ok) return toast("Could not clear logs");
  await loadLogs();
  toast("Activity logs cleared");
});
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((item) => item.classList.toggle("active", item === tab));
    $("campaignPanel").hidden = tab.dataset.tab !== "campaign";
    $("testPanel").hidden = tab.dataset.tab !== "test";
    $("logsPanel").hidden = tab.dataset.tab !== "logs";
    if (tab.dataset.tab === "logs") loadLogs();
    $("modeLabel").textContent =
      tab.dataset.tab === "test"
        ? "Test mode"
        : tab.dataset.tab === "logs"
          ? "Activity logs"
          : "Ready to send";
  }),
);
$("testForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("testStatus");
  status.textContent = "Sending...";
  status.className = "form-status";
  let variables = {};
  try {
    variables = $("testVariables").value
      ? JSON.parse($("testVariables").value)
      : {};
  } catch {
    status.textContent = "Variables must be valid JSON.";
    status.className = "form-status error";
    return;
  }
  try {
    const response = await fetch("/api/messages/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: $("testNumber").value,
        templateSid: $("testTemplate").value,
        variables,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    status.textContent = `Message sent. SID: ${data.messageSid}`;
    toast("Test message sent");
    loadLogs();
  } catch (error) {
    status.textContent = error.message;
    status.className = "form-status error";
  }
});
checkAuth();
