"use strict";
// Types
// The username is saved in localStorage just for display (not a secret).
// The auth token lives in an httpOnly cookie managed by the server.
function getSavedUsername() {
    return localStorage.getItem("username") ?? "";
}
function saveUsername(username) {
    localStorage.setItem("username", username);
}
// API helpers
async function fetchJson(url, method = "GET", body) {
    const headers = { "Content-Type": "application/json" };
    const options = { method, headers, credentials: "include" };
    if (body !== undefined)
        options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    if (response.status === 401) {
        showAuthModal();
        throw new Error("Session expired — please log in again");
    }
    if (!response.ok)
        throw new Error(`Request failed: ${response.status}`);
    if (response.status === 204)
        return null;
    return response.json();
}
// Auth API calls use plain fetch (not fetchJson) so a wrong password doesn't
// trigger the "session expired" redirect that fetchJson does on 401.
async function apiLogin(email, password) {
    const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail ?? "Login failed — check your email and password");
    }
}
async function apiRegister(email, password) {
    const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail ?? "Registration failed");
    }
}
async function apiCreateSession(durationMinutes, tags) {
    return fetchJson("/sessions", "POST", {
        duration_minutes: durationMinutes,
        tags: tags,
    });
}
async function apiListSessions(filterTag) {
    const url = filterTag ? `/sessions?tag=${encodeURIComponent(filterTag)}` : "/sessions";
    return fetchJson(url);
}
async function apiUpdateSession(id, status) {
    return fetchJson(`/sessions/${id}`, "PATCH", { status });
}
async function apiDeleteSession(id) {
    await fetchJson(`/sessions/${id}`, "DELETE");
}
async function apiListTags() {
    return fetchJson("/tags");
}
async function apiGetStatistics(filterTag) {
    const url = filterTag ? `/statistics?tag=${encodeURIComponent(filterTag)}` : "/statistics";
    return fetchJson(url);
}
// State
let activeSession = null;
let timerIntervalId = null;
let remainingSeconds = 0;
let totalSeconds = 0;
let pendingTags = []; // tags typed into the tag input, not yet saved
let activeTagFilter = ""; // the tag filter currently selected in history
// Circumference of the SVG ring (radius = 80)
const RING_CIRCUMFERENCE = 2 * Math.PI * 80;
// DOM elements
const durationSel = document.getElementById("duration");
const tagInput = document.getElementById("tag-input");
const chipsEl = document.getElementById("chips");
const timerTimeEl = document.getElementById("timer-time");
const ringEl = document.getElementById("ring-progress");
const btnStart = document.getElementById("btn-start");
const btnPause = document.getElementById("btn-pause");
const btnDone = document.getElementById("btn-done");
const sessionsEl = document.getElementById("sessions");
const filtersEl = document.getElementById("filters");
// Auth modal elements
const authModal = document.getElementById("auth-modal");
const authForm = document.getElementById("auth-form");
const authUserInput = document.getElementById("auth-username");
const authPassInput = document.getElementById("auth-password");
const authError = document.getElementById("auth-error");
const authSubmit = document.getElementById("auth-submit");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const headerUser = document.getElementById("header-user");
const headerUname = document.getElementById("header-username");
const btnLogout = document.getElementById("btn-logout");
// Timer
// The server sends naive UTC datetimes without a timezone suffix.
// Without 'Z', browsers parse them as local time instead of UTC, which breaks
// computeRemainingSeconds for anyone whose browser timezone differs from the server.
function parseServerTime(isoString) {
    const s = (isoString.endsWith('Z') || isoString.includes('+')) ? isoString : isoString + 'Z';
    return new Date(s).getTime();
}
function computeRemainingSeconds(session) {
    const startedMs = parseServerTime(session.started_at);
    const nowMs = Date.now();
    const pausedMs = session.total_paused_seconds * 1000;
    const currentPauseMs = session.paused_at
        ? nowMs - parseServerTime(session.paused_at)
        : 0;
    const activeElapsedMs = nowMs - startedMs - pausedMs - currentPauseMs;
    const targetMs = session.duration_minutes * 60 * 1000;
    return Math.max(0, Math.round((targetMs - activeElapsedMs) / 1000));
}
async function restoreActiveSession() {
    const sessions = await apiListSessions();
    const active = sessions.find(s => s.status === "in_progress" || s.status === "paused");
    if (!active)
        return;
    const remaining = computeRemainingSeconds(active);
    if (remaining <= 0) {
        // Timer expired while the page was closed --> mark it complete on the server
        await apiUpdateSession(active.id, "completed");
        await reloadHistory();
        return;
    }
    activeSession = active;
    totalSeconds = active.duration_minutes * 60;
    remainingSeconds = remaining;
    ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    updateRing(remainingSeconds, totalSeconds);
    timerTimeEl.textContent = formatTime(remainingSeconds);
    durationSel.disabled = true;
    tagInput.disabled = true;
    btnStart.hidden = true;
    btnPause.hidden = false;
    btnDone.hidden = false;
    if (active.status === "in_progress") {
        ringEl.classList.remove("paused");
        btnPause.textContent = "Pause";
        startTicking();
    }
    else {
        ringEl.classList.add("paused");
        btnPause.textContent = "Resume";
    }
}
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
function updateRing(remaining, total) {
    // offset 0 = full ring, offset CIRCUMFERENCE = empty ring
    const offset = RING_CIRCUMFERENCE * (1 - remaining / total);
    ringEl.style.strokeDashoffset = String(offset);
}
function startTicking() {
    if (timerIntervalId !== null)
        clearInterval(timerIntervalId);
    timerIntervalId = window.setInterval(async () => {
        remainingSeconds--;
        timerTimeEl.textContent = formatTime(remainingSeconds);
        updateRing(remainingSeconds, totalSeconds);
        if (remainingSeconds <= 0) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
            try {
                if (activeSession !== null) {
                    await apiUpdateSession(activeSession.id, "completed");
                }
                notify();
                await reloadHistory();
            }
            finally {
                resetTimerUI();
            }
        }
    }, 1000);
}
function notify() {
    if (Notification.permission === "granted") {
        new Notification("Pomodoro complete!", { body: "Time to take a break." });
    }
}
function resetTimerUI() {
    if (timerIntervalId !== null) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    activeSession = null;
    remainingSeconds = 0;
    totalSeconds = 0;
    pendingTags = [];
    timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);
    ringEl.style.strokeDashoffset = "0";
    ringEl.classList.remove("paused");
    durationSel.disabled = false;
    tagInput.disabled = false;
    chipsEl.innerHTML = "";
    btnStart.hidden = false;
    btnPause.hidden = true;
    btnDone.hidden = true;
    btnPause.textContent = "Pause";
}
// Tag chip UI
function renderChips() {
    chipsEl.innerHTML = "";
    for (const tag of pendingTags) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = tag;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => {
            pendingTags = pendingTags.filter(t => t !== tag);
            renderChips();
        });
        chip.appendChild(removeBtn);
        chipsEl.appendChild(chip);
    }
}
// Press Enter or comma to add a tag
tagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        const value = tagInput.value.trim().toLowerCase();
        if (value !== "" && !pendingTags.includes(value)) {
            pendingTags.push(value);
            renderChips();
        }
        tagInput.value = "";
    }
    else if (event.key === "Backspace" && tagInput.value === "" && pendingTags.length > 0) {
        pendingTags.pop();
        renderChips();
    }
});
// Clicking anywhere in the tag box should focus the input
document.getElementById("tags-wrap").addEventListener("click", () => tagInput.focus());
// Auth modal
let authMode = "login";
function showAuthModal() {
    authModal.hidden = false;
    authError.textContent = "";
    authUserInput.value = "";
    authPassInput.value = "";
    headerUser.hidden = true;
}
function hideAuthModal(username) {
    authModal.hidden = true;
    headerUser.hidden = false;
    headerUname.textContent = username;
}
tabLogin.addEventListener("click", () => {
    authMode = "login";
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    authSubmit.textContent = "Log In";
    authError.textContent = "";
});
tabRegister.addEventListener("click", () => {
    authMode = "register";
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    authSubmit.textContent = "Register";
    authError.textContent = "";
});
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = authUserInput.value.trim();
    const password = authPassInput.value;
    if (!email || !password)
        return;
    authSubmit.disabled = true;
    authError.textContent = "";
    try {
        if (authMode === "login") {
            await apiLogin(email, password);
        }
        else {
            await apiRegister(email, password);
        }
        saveUsername(email);
        hideAuthModal(email);
        await reloadHistory();
    }
    catch (err) {
        authError.textContent = err.message ?? "Something went wrong";
    }
    finally {
        authSubmit.disabled = false;
    }
});
btnLogout.addEventListener("click", async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("username");
    showAuthModal();
});
// Timer buttons
btnStart.addEventListener("click", async () => {
    btnStart.disabled = true;
    try {
        activeSession = await apiCreateSession(Number(durationSel.value), pendingTags);
        totalSeconds = activeSession.duration_minutes * 60;
        remainingSeconds = totalSeconds;
        ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
        ringEl.style.strokeDashoffset = "0";
        ringEl.classList.remove("paused");
        timerTimeEl.textContent = formatTime(remainingSeconds);
        startTicking();
        durationSel.disabled = true;
        tagInput.disabled = true;
        btnStart.hidden = true;
        btnPause.hidden = false;
        btnDone.hidden = false;
        await reloadHistory();
    }
    catch (error) {
        console.error(error);
        alert("Could not start session — is the server running?");
    }
    finally {
        btnStart.disabled = false;
    }
});
btnPause.addEventListener("click", async () => {
    if (activeSession === null)
        return;
    if (timerIntervalId !== null) {
        // currently running, pause it
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        ringEl.classList.add("paused");
        btnPause.textContent = "Resume";
        await apiUpdateSession(activeSession.id, "paused");
    }
    else {
        // currently paused, resume it
        ringEl.classList.remove("paused");
        btnPause.textContent = "Pause";
        startTicking();
        await apiUpdateSession(activeSession.id, "in_progress");
    }
    await reloadHistory();
});
btnDone.addEventListener("click", async () => {
    if (timerIntervalId !== null) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    if (activeSession === null)
        return;
    await apiUpdateSession(activeSession.id, "completed");
    resetTimerUI();
    await reloadHistory();
});
durationSel.addEventListener("change", () => {
    if (activeSession === null) {
        timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);
    }
});
document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && activeSession !== null) {
        remainingSeconds = computeRemainingSeconds(activeSession);
        if (remainingSeconds <= 0) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
            await apiUpdateSession(activeSession.id, "completed");
            notify();
            await reloadHistory();
            resetTimerUI();
            return;
        }
        timerTimeEl.textContent = formatTime(remainingSeconds);
        updateRing(remainingSeconds, totalSeconds);
    }
});
// Session history
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function formatDate(isoString) {
    return new Date(parseServerTime(isoString)).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
const STATUS_LABELS = {
    in_progress: "In Progress",
    completed: "Completed",
    paused: "Paused",
};
function renderSessions(sessions) {
    if (sessions.length === 0) {
        sessionsEl.innerHTML = `<p class="empty">No sessions yet — start your first Pomodoro!</p>`;
        return;
    }
    // Sort newest first
    sessions.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    sessionsEl.innerHTML = "";
    for (const session of sessions) {
        const card = document.createElement("div");
        card.className = "session-card";
        const tagsHtml = session.tags
            .map(tag => `<span class="stag">${escapeHtml(tag.name)}</span>`)
            .join("");
        card.innerHTML = `
            <div class="sinfo">
                <div class="smeta">
                    <span class="sbadge s-${escapeHtml(session.status)}">${STATUS_LABELS[session.status] ?? escapeHtml(session.status)}</span>
                    <span class="sdur">${session.duration_minutes} min</span>
                    <span class="sdate">${formatDate(session.started_at)}</span>
                </div>
                ${tagsHtml !== "" ? `<div class="stags">${tagsHtml}</div>` : ""}
            </div>
            <button class="del" title="Delete session">&#x2715;</button>
        `;
        card.querySelector(".del").addEventListener("click", async () => {
            if (!confirm("Delete this session?"))
                return;
            await apiDeleteSession(session.id);
            await reloadHistory();
        });
        sessionsEl.appendChild(card);
    }
}
function renderFilters(tags) {
    filtersEl.innerHTML = "";
    function makeFilterButton(label, tagValue) {
        const btn = document.createElement("button");
        btn.className = activeTagFilter === tagValue ? "fbtn active" : "fbtn";
        btn.textContent = label;
        btn.addEventListener("click", async () => {
            activeTagFilter = tagValue;
            await reloadHistory();
        });
        return btn;
    }
    filtersEl.appendChild(makeFilterButton("All", ""));
    for (const tag of tags) {
        filtersEl.appendChild(makeFilterButton(tag.name, tag.name));
    }
}
function niceMax(n) {
    for (const s of [10, 20, 30, 45, 60, 90, 120, 180, 240, 360]) {
        if (n <= s)
            return s;
    }
    return Math.ceil(n / 60) * 60;
}
function renderStatistics(stats) {
    const svgNS = "http://www.w3.org/2000/svg";
    document.getElementById("stat-total-minutes").textContent = String(stats.total_minutes);
    document.getElementById("stat-total-sessions").textContent = String(stats.total_sessions);
    document.getElementById("stat-avg-minutes").textContent = String(stats.avg_minutes);
    const periodEl = document.getElementById("stats-period");
    periodEl.textContent = activeTagFilter ? `Last 30 days · ${activeTagFilter}` : "Last 30 days";
    const svg = document.getElementById("stats-chart");
    svg.innerHTML = "";
    const topPad = 10;
    const chartH = 58;
    const barW = 18;
    const gap = 2;
    const leftMargin = 38;
    const svgWidth = 638; // must match the viewBox width in index.html
    const baseY = topPad + chartH; // 68 — chart baseline
    const labelY = baseY + 14; // 82 — date text baseline
    const maxMins = Math.max(...stats.daily.map(d => d.minutes), 1);
    const scaleMax = niceMax(maxMins);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Gridlines and Y-axis labels at half and full scale
    for (const tick of [Math.round(scaleMax / 2), scaleMax]) {
        const gy = baseY - Math.round((tick / scaleMax) * chartH);
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", String(leftMargin));
        line.setAttribute("x2", String(svgWidth));
        line.setAttribute("y1", String(gy));
        line.setAttribute("y2", String(gy));
        line.setAttribute("class", "grid-line");
        svg.appendChild(line);
        const lbl = document.createElementNS(svgNS, "text");
        lbl.setAttribute("x", String(leftMargin - 4));
        lbl.setAttribute("y", String(gy + 3));
        lbl.setAttribute("text-anchor", "end");
        lbl.setAttribute("class", "chart-label");
        lbl.textContent = `${tick}m`;
        svg.appendChild(lbl);
    }
    // Baseline
    const baseLine = document.createElementNS(svgNS, "line");
    baseLine.setAttribute("x1", String(leftMargin));
    baseLine.setAttribute("x2", "638");
    baseLine.setAttribute("y1", String(baseY));
    baseLine.setAttribute("y2", String(baseY));
    baseLine.setAttribute("class", "grid-base");
    svg.appendChild(baseLine);
    // Bars
    for (let i = 0; i < stats.daily.length; i++) {
        const day = stats.daily[i];
        const x = leftMargin + i * (barW + gap);
        const isToday = day.date === todayStr;
        const barH = day.minutes > 0 ? Math.max(4, Math.round((day.minutes / scaleMax) * chartH)) : 2;
        const y = baseY - barH;
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(barW));
        rect.setAttribute("height", String(barH));
        rect.setAttribute("rx", "2");
        let cls = "sbar";
        if (day.minutes > 0)
            cls += isToday ? " today" : " active";
        else
            cls += isToday ? " today-empty" : " empty";
        rect.setAttribute("class", cls);
        const title = document.createElementNS(svgNS, "title");
        const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
        title.textContent = day.minutes > 0
            ? `${dateLabel}: ${day.minutes} min (${day.sessions} session${day.sessions !== 1 ? "s" : ""})`
            : `${dateLabel}: no sessions`;
        rect.appendChild(title);
        svg.appendChild(rect);
        // Minute value above bar when tall enough to have room
        if (day.minutes > 0 && barH >= 14) {
            const val = document.createElementNS(svgNS, "text");
            val.setAttribute("x", String(x + barW / 2));
            val.setAttribute("y", String(y - 2));
            val.setAttribute("text-anchor", "middle");
            val.setAttribute("class", "bar-label");
            val.textContent = String(day.minutes);
            svg.appendChild(val);
        }
        // Date labels at start, midpoint, and the actual today bar
        if (i === 0 || i === 14 || isToday) {
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", String(x + barW / 2));
            text.setAttribute("y", String(labelY));
            text.setAttribute("text-anchor", i === 0 ? "start" : isToday ? "end" : "middle");
            text.setAttribute("class", isToday ? "chart-label today-label" : "chart-label");
            text.textContent = isToday
                ? "Today"
                : new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
            svg.appendChild(text);
        }
    }
}
async function reloadHistory() {
    const filterArg = activeTagFilter !== "" ? activeTagFilter : undefined;
    const [sessions, tags, stats] = await Promise.all([
        apiListSessions(filterArg),
        apiListTags(),
        apiGetStatistics(filterArg),
    ]);
    renderSessions(sessions);
    renderFilters(tags);
    renderStatistics(stats);
}
// Startup
Notification.requestPermission();
ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
ringEl.style.strokeDashoffset = "0";
timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);
(async () => {
    try {
        await reloadHistory();
        hideAuthModal(getSavedUsername());
        await restoreActiveSession();
    }
    catch {
        // 401 is already handled inside fetchJson (calls showAuthModal)
    }
})();
