// =============================================================================
// API Helpers
// =============================================================================
// fetchJson is the main wrapper around fetch. It handles auth errors globally:
// any 401 response automatically transitions the UI to the guest state.
async function fetchJson(url, method = "GET", body) {
    const headers = { "Content-Type": "application/json" };
    const options = { method, headers, credentials: "include" };
    if (body !== undefined)
        options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    if (response.status === 401) {
        isLoggedIn = false;
        showGuestState();
        throw new Error("Not authenticated");
    }
    if (!response.ok)
        throw new Error(`Request failed: ${response.status}`);
    if (response.status === 204)
        return null;
    return response.json();
}
// Auth API calls use plain fetch (not fetchJson) so a wrong password doesn't
// trigger the guest-state transition that fetchJson does on 401.
async function getErrorDetail(response) {
    const data = await response.json().catch(() => ({}));
    const detail = data.detail;
    if (typeof detail === "string")
        return detail;
    // Pydantic validation errors return detail as an array of error objects.
    if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        const msg = first.ctx?.error ?? first.msg ?? "";
        return msg.replace(/^Value error,\s*/, "") || undefined;
    }
    return undefined;
}
async function apiLogin(email, password) {
    const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
    });
    if (!response.ok) {
        throw new Error(await getErrorDetail(response) ?? "Login failed — check your email and password");
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
        throw new Error(await getErrorDetail(response) ?? "Registration failed");
    }
}
async function apiCreateSession(durationMinutes, tags) {
    return fetchJson("/sessions", "POST", {
        duration_minutes: durationMinutes,
        tags: tags,
    });
}
// Build a URL with an optional ?tag= query string for filtered API requests.
function filteredUrl(path, filterTag) {
    return filterTag ? `${path}?tag=${encodeURIComponent(filterTag)}` : path;
}
async function apiListSessions(filterTag) {
    return fetchJson(filteredUrl("/sessions", filterTag));
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
    return fetchJson(filteredUrl("/statistics", filterTag));
}
// =============================================================================
// State
// =============================================================================
let isLoggedIn = false;
let activeSession = null; // the session currently running, or null
let timerIntervalId = null; // ID returned by setInterval, used to cancel the tick
let remainingSeconds = 0;
let totalSeconds = 0;
let pendingTags = []; // tags typed into the tag input, not yet saved to the server
let activeTagFilter = ""; // the tag filter currently selected in the history section
// Circumference of the SVG ring (radius = 80). Used to compute strokeDashoffset.
const RING_CIRCUMFERENCE = 2 * Math.PI * 80;
// =============================================================================
// DOM Elements
// =============================================================================
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
const btnLoginHeader = document.getElementById("btn-login-header");
const headerGuest = document.getElementById("header-guest");
const savePromptEl = document.getElementById("save-prompt");
const savePromptLogin = document.getElementById("save-prompt-login");
const btnDemoLogin = document.getElementById("btn-demo-login");
const passwordHint = document.getElementById("password-hint");
// =============================================================================
// Auth Modal
// =============================================================================
// The username is saved in localStorage just for display (not a secret).
// The auth token lives in an httpOnly cookie managed by the server.
function getSavedUsername() {
    return localStorage.getItem("username") ?? "";
}
function saveUsername(username) {
    localStorage.setItem("username", username);
}
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
    headerGuest.hidden = true;
    headerUser.hidden = false;
    headerUname.textContent = username;
}
// Called when the user is not logged in. Hides all user-specific content.
function showGuestState() {
    headerGuest.hidden = false;
    headerUser.hidden = true;
    authError.textContent = "";
    authUserInput.value = "";
    authPassInput.value = "";
    if (activeSession !== null)
        resetTimerUI();
    showHistoryPlaceholder();
}
// Clears the history and stats sections when there is no logged-in user.
function showHistoryPlaceholder() {
    sessionsEl.innerHTML = `<p class="empty">Log in to see your session history.</p>`;
    filtersEl.innerHTML = "";
    document.getElementById("stat-total-minutes").textContent = "—";
    document.getElementById("stat-total-sessions").textContent = "—";
    document.getElementById("stat-avg-minutes").textContent = "—";
    document.getElementById("stats-chart").innerHTML = "";
}
// Shows the "save your session" prompt that appears after a guest user finishes a timer.
function showSavePrompt() {
    savePromptEl.hidden = false;
}
btnLoginHeader.addEventListener("click", () => showAuthModal());
savePromptLogin.addEventListener("click", () => showAuthModal());
tabLogin.addEventListener("click", () => {
    authMode = "login";
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    authSubmit.textContent = "Log In";
    authError.textContent = "";
    passwordHint.hidden = true;
});
tabRegister.addEventListener("click", () => {
    authMode = "register";
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    authSubmit.textContent = "Register";
    authError.textContent = "";
    passwordHint.hidden = false;
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
        isLoggedIn = true;
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
    if (activeSession !== null)
        resetTimerUI();
    showGuestState();
});
btnDemoLogin.addEventListener("click", async () => {
    authMode = "login";
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    authSubmit.textContent = "Log In";
    authError.textContent = "";
    btnDemoLogin.disabled = true;
    authSubmit.disabled = true;
    try {
        await apiLogin("demo@example.com", "demo1234");
        isLoggedIn = true;
        saveUsername("demo@example.com");
        hideAuthModal("demo@example.com");
        await reloadHistory();
    }
    catch (err) {
        authError.textContent = err.message ?? "Demo login failed";
    }
    finally {
        btnDemoLogin.disabled = false;
        authSubmit.disabled = false;
    }
});
// =============================================================================
// Timer
// =============================================================================
// Show or hide the correct buttons depending on whether a timer is running.
function setTimerActive(active) {
    durationSel.disabled = active;
    tagInput.disabled = active;
    btnStart.hidden = active;
    btnPause.hidden = !active;
    btnDone.hidden = !active;
}
// The server stores datetimes in UTC without a timezone suffix.
// Without 'Z', browsers parse them as local time, which breaks remaining-time
// calculations for users in a different timezone than the server.
function parseServerTime(isoString) {
    const s = (isoString.endsWith('Z') || isoString.includes('+')) ? isoString : isoString + 'Z';
    return new Date(s).getTime();
}
// Calculate how many seconds are left on the timer based on wall-clock time.
// This is used to resync the display after the tab was hidden or the page was refreshed.
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
// On page load, check if the user already has an active session and resume it.
async function restoreActiveSession() {
    const sessions = await apiListSessions();
    const active = sessions.find(s => s.status === "in_progress" || s.status === "paused");
    if (!active)
        return;
    activeSession = active;
    totalSeconds = active.duration_minutes * 60;
    remainingSeconds = computeRemainingSeconds(active);
    ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    updateRing(remainingSeconds, totalSeconds);
    timerTimeEl.textContent = formatTime(remainingSeconds);
    setTimerActive(true);
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
    // offset 0 means full ring, offset CIRCUMFERENCE means empty ring
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
            const wasGuestSession = activeSession === null;
            try {
                if (!wasGuestSession) {
                    await apiUpdateSession(activeSession.id, "completed");
                    await reloadHistory();
                }
                notify();
            }
            finally {
                resetTimerUI();
            }
            // Prompt guests to log in so they can save future sessions.
            if (wasGuestSession)
                showSavePrompt();
        }
    }, 1000);
}
function notify() {
    if (Notification.permission === "granted") {
        new Notification("Session complete!", { body: "Time to take a break." });
    }
}
// Stop the timer and reset all state and UI back to the initial state.
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
    setTimerActive(false);
    chipsEl.innerHTML = "";
    btnPause.textContent = "Pause";
    savePromptEl.hidden = true;
}
// =============================================================================
// Tag Chip UI
// =============================================================================
// Re-render the tag chips from the pendingTags array.
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
// Press Enter or comma to confirm a tag. Backspace on empty input removes the last tag.
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
// Clicking anywhere in the tag box should focus the hidden input.
document.getElementById("tags-wrap").addEventListener("click", () => tagInput.focus());
// =============================================================================
// Timer Buttons
// =============================================================================
btnStart.addEventListener("click", async () => {
    btnStart.disabled = true;
    try {
        const durationMinutes = Number(durationSel.value);
        totalSeconds = durationMinutes * 60;
        remainingSeconds = totalSeconds;
        if (isLoggedIn) {
            // Create a session on the server. The server echoes back the confirmed duration.
            activeSession = await apiCreateSession(durationMinutes, pendingTags);
            totalSeconds = activeSession.duration_minutes * 60;
            remainingSeconds = totalSeconds;
        }
        ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
        ringEl.style.strokeDashoffset = "0";
        ringEl.classList.remove("paused");
        timerTimeEl.textContent = formatTime(remainingSeconds);
        startTicking();
        setTimerActive(true);
        if (isLoggedIn)
            await reloadHistory();
    }
    catch (error) {
        console.error(error);
    }
    finally {
        btnStart.disabled = false;
    }
});
btnPause.addEventListener("click", async () => {
    if (timerIntervalId !== null) {
        // Timer is running, pause it.
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        ringEl.classList.add("paused");
        btnPause.textContent = "Resume";
        if (activeSession !== null) {
            await apiUpdateSession(activeSession.id, "paused");
            await reloadHistory();
        }
    }
    else {
        // Timer is paused, resume it.
        ringEl.classList.remove("paused");
        btnPause.textContent = "Pause";
        startTicking();
        if (activeSession !== null) {
            await apiUpdateSession(activeSession.id, "in_progress");
            await reloadHistory();
        }
    }
});
btnDone.addEventListener("click", async () => {
    if (timerIntervalId !== null) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    if (activeSession !== null) {
        await apiUpdateSession(activeSession.id, "completed");
        await reloadHistory();
    }
    resetTimerUI();
});
// Update the timer display when the user picks a new duration while no session is active.
durationSel.addEventListener("change", () => {
    if (activeSession === null) {
        timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);
    }
});
// When the tab becomes visible again, resync remaining time from the server timestamps
// in case the timer ticked down while the tab was hidden or asleep.
document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && activeSession !== null) {
        remainingSeconds = computeRemainingSeconds(activeSession);
        if (remainingSeconds <= 0) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
            try {
                await apiUpdateSession(activeSession.id, "completed");
                notify();
                await reloadHistory();
            }
            finally {
                resetTimerUI();
            }
            return;
        }
        timerTimeEl.textContent = formatTime(remainingSeconds);
        updateRing(remainingSeconds, totalSeconds);
    }
});
// =============================================================================
// Session History
// =============================================================================
// Prevent user-supplied tag names from being interpreted as HTML.
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
        sessionsEl.innerHTML = `<p class="empty">No sessions yet — start your first session!</p>`;
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
// Round up to the next "nice" value for the chart's Y axis max.
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
    const baseY = topPad + chartH; // 68, the chart baseline
    const labelY = baseY + 14; // 82, where date labels go
    const maxMins = Math.max(...stats.daily.map(d => d.minutes), 1);
    const scaleMax = niceMax(maxMins);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Draw gridlines and Y axis labels at 50% and 100% of the scale.
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
    const baseline = document.createElementNS(svgNS, "line");
    baseline.setAttribute("x1", String(leftMargin));
    baseline.setAttribute("x2", String(svgWidth));
    baseline.setAttribute("y1", String(baseY));
    baseline.setAttribute("y2", String(baseY));
    baseline.setAttribute("class", "grid-line");
    svg.appendChild(baseline);
    // Draw one bar per day. Days with no sessions get a zero-height bar.
    stats.daily.forEach((day, i) => {
        const x = leftMargin + i * (barW + gap);
        const barH = Math.round((day.minutes / scaleMax) * chartH);
        const y = baseY - barH;
        if (barH > 0) {
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", String(x));
            rect.setAttribute("y", String(y));
            rect.setAttribute("width", String(barW));
            rect.setAttribute("height", String(barH));
            rect.setAttribute("class", day.date === todayStr ? "bar today" : "bar");
            svg.appendChild(rect);
        }
        // Only show a date label on the 1st of each month and today.
        const d = new Date(day.date + "T00:00:00");
        const isFirstOfMonth = d.getDate() === 1;
        const isToday = day.date === todayStr;
        if (isFirstOfMonth || isToday) {
            const lbl = document.createElementNS(svgNS, "text");
            lbl.setAttribute("x", String(x + barW / 2));
            lbl.setAttribute("y", String(labelY));
            lbl.setAttribute("text-anchor", "middle");
            lbl.setAttribute("class", isToday ? "chart-label today-label" : "chart-label");
            lbl.textContent = isToday ? "today" : d.toLocaleString(undefined, { month: "short", day: "numeric" });
            svg.appendChild(lbl);
        }
    });
}
// =============================================================================
// History Reload
// =============================================================================
// Fetch fresh sessions, tags, and statistics from the server and re-render everything.
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
// =============================================================================
// Startup
// =============================================================================
Notification.requestPermission();
ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
ringEl.style.strokeDashoffset = "0";
timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);
(async () => {
    try {
        await reloadHistory();
        isLoggedIn = true;
        headerGuest.hidden = true;
        headerUser.hidden = false;
        headerUname.textContent = getSavedUsername();
        await restoreActiveSession();
    }
    catch {
        // fetchJson already called showGuestState() on 401
    }
})();
export {};
