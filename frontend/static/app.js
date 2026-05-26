"use strict";
// Types
// Token storage
// The JWT is kept in localStorage so it survives page refreshes.
// The username is stored separately because decoding the JWT would need a library.
function getToken() {
    return localStorage.getItem("token");
}
function setToken(token) {
    localStorage.setItem("token", token);
}
function clearToken() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
}
function getSavedUsername() {
    return localStorage.getItem("username") ?? "";
}
function saveUsername(username) {
    localStorage.setItem("username", username);
}
// API helpers
async function fetchJson(url, method = "GET", body) {
    const headers = { "Content-Type": "application/json" };
    // Attach the JWT to every request so the backend knows who is calling.
    const token = getToken();
    if (token)
        headers["Authorization"] = `Bearer ${token}`;
    const options = { method, headers };
    if (body !== undefined)
        options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    // 401 means the token is expired — send the user back to the login screen.
    if (response.status === 401) {
        clearToken();
        showAuthModal();
        throw new Error("Session expired — please log in again");
    }
    if (!response.ok)
        throw new Error(`Request failed: ${response.status}`);
    if (response.status === 204)
        return null; // 204 = No Content (e.g. DELETE)
    return response.json();
}
// Auth API calls use plain fetch (not fetchJson) so a wrong password doesn't
// trigger the "session expired" redirect that fetchJson does on 401.
async function apiLogin(email, password) {
    const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail ?? "Login failed — check your email and password");
    }
    const data = await response.json();
    return data.access_token;
}
async function apiRegister(email, password) {
    const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail ?? "Registration failed");
    }
    const data = await response.json();
    return data.access_token;
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
    return fetchJson(`/sessions/${id}`, "PATCH", { status: status });
}
async function apiDeleteSession(id) {
    await fetchJson(`/sessions/${id}`, "DELETE");
}
async function apiListTags() {
    return fetchJson("/tags");
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
            if (activeSession !== null) {
                await apiUpdateSession(activeSession.id, "completed");
            }
            playBeep();
            await reloadHistory();
            resetTimerUI();
        }
    }, 1000);
}
function playBeep() {
    try {
        const audio = new AudioContext();
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.8);
        osc.start();
        osc.stop(audio.currentTime + 0.8);
    }
    catch (_) { }
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
        const token = authMode === "login"
            ? await apiLogin(email, password)
            : await apiRegister(email, password);
        setToken(token);
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
btnLogout.addEventListener("click", () => {
    clearToken();
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
// Session history
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function formatDate(isoString) {
    return new Date(isoString).toLocaleString(undefined, {
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
                    <span class="sbadge s-${session.status}">${STATUS_LABELS[session.status] ?? session.status}</span>
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
async function reloadHistory() {
    const filterArg = activeTagFilter !== "" ? activeTagFilter : undefined;
    const [sessions, tags] = await Promise.all([
        apiListSessions(filterArg),
        apiListTags(),
    ]);
    renderSessions(sessions);
    renderFilters(tags);
}
// Startup
ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
ringEl.style.strokeDashoffset = "0";
timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);
(async () => {
    if (!getToken()) {
        showAuthModal();
        return;
    }
    hideAuthModal(getSavedUsername());
    try {
        await reloadHistory();
    }
    catch {
        // 401 is already handled inside fetchJson
    }
})();
