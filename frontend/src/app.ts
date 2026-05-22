// Types

interface Tag {
    id: number;
    name: string;
}

interface Session {
    id: number;
    task_label: string;
    duration_minutes: number;
    started_at: string;
    status: string;  // "in_progress", "completed", or "paused"
    tags: Tag[];
}

// API helpers

async function fetchJson(url: string, method = "GET", body?: object): Promise<any> {
    const options: RequestInit = {
        method: method,
        headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    if (response.status === 204) return null;  // 204 = No Content (e.g. DELETE)
    return response.json();
}

async function apiCreateSession(taskLabel: string, durationMinutes: number, tags: string[]): Promise<Session> {
    return fetchJson("/sessions", "POST", {
        task_label: taskLabel,
        duration_minutes: durationMinutes,
        tags: tags,
    });
}

async function apiListSessions(filterTag?: string): Promise<Session[]> {
    const url = filterTag ? `/sessions?tag=${encodeURIComponent(filterTag)}` : "/sessions";
    return fetchJson(url);
}

async function apiUpdateSession(id: number, status: string): Promise<Session> {
    return fetchJson(`/sessions/${id}`, "PATCH", { status: status });
}

async function apiDeleteSession(id: number): Promise<void> {
    await fetchJson(`/sessions/${id}`, "DELETE");
}

async function apiListTags(): Promise<Tag[]> {
    return fetchJson("/tags");
}

// State

let activeSession: Session | null = null;
let timerIntervalId: number | null = null;
let remainingSeconds = 0;
let totalSeconds = 0;
let isBreak = false;
let pendingTags: string[] = [];    // tags typed into the tag input, not yet saved
let activeTagFilter = "";          // the tag filter currently selected in history

// Circumference of the SVG ring (radius = 80)
const RING_CIRCUMFERENCE = 2 * Math.PI * 80;

// DOM elements

const taskInput        = document.getElementById("task-input")      as HTMLInputElement;
const durationSel      = document.getElementById("duration")        as HTMLSelectElement;
const breakDurationSel = document.getElementById("break-duration")  as HTMLSelectElement;
const timerModeEl      = document.getElementById("timer-mode")      as HTMLSpanElement;
const tagInput         = document.getElementById("tag-input")       as HTMLInputElement;
const chipsEl          = document.getElementById("chips")           as HTMLDivElement;
const timerTimeEl      = document.getElementById("timer-time")      as HTMLSpanElement;
const ringEl           = document.getElementById("ring-progress")   as HTMLElement;
const btnStart         = document.getElementById("btn-start")       as HTMLButtonElement;
const btnPause         = document.getElementById("btn-pause")       as HTMLButtonElement;
const btnDone          = document.getElementById("btn-done")        as HTMLButtonElement;
const sessionsEl       = document.getElementById("sessions")        as HTMLDivElement;
const filtersEl        = document.getElementById("filters")         as HTMLDivElement;

// Timer

function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function updateRing(remaining: number, total: number): void {
    // offset 0 = full ring, offset CIRCUMFERENCE = empty ring
    const offset = RING_CIRCUMFERENCE * (1 - remaining / total);
    ringEl.style.strokeDashoffset = String(offset);
}

function startTicking(): void {
    if (timerIntervalId !== null) clearInterval(timerIntervalId);

    timerIntervalId = window.setInterval(async () => {
        remainingSeconds--;
        timerTimeEl.textContent = formatTime(remainingSeconds);
        updateRing(remainingSeconds, totalSeconds);

        if (remainingSeconds <= 0) {
            clearInterval(timerIntervalId!);
            timerIntervalId = null;
            if (isBreak) {
                playBeep();
                resetTimerUI();
            } else {
                if (activeSession !== null) {
                    await apiUpdateSession(activeSession.id, "completed");
                }
                playBeep();
                await reloadHistory();
                startBreak();
            }
        }
    }, 1000);
}

function playBeep(): void {
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
    } catch (_) {}
}

function startBreak(): void {
    isBreak = true;
    activeSession = null;
    const breakMins = Number(breakDurationSel.value);
    totalSeconds = breakMins * 60;
    remainingSeconds = totalSeconds;

    ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    ringEl.style.strokeDashoffset = "0";
    ringEl.classList.remove("paused");
    ringEl.classList.add("break");

    timerTimeEl.textContent = formatTime(remainingSeconds);
    timerModeEl.textContent = "Break";
    timerModeEl.classList.add("break-mode");

    btnPause.hidden = true;
    btnDone.hidden = false;
    btnDone.textContent = "Skip Break";

    startTicking();
}

function resetTimerUI(): void {
    if (timerIntervalId !== null) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    activeSession = null;
    isBreak = false;
    remainingSeconds = 0;
    totalSeconds = 0;
    pendingTags = [];

    timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);
    timerModeEl.textContent = "";
    timerModeEl.classList.remove("break-mode");
    ringEl.style.strokeDashoffset = "0";
    ringEl.classList.remove("paused");
    ringEl.classList.remove("break");

    taskInput.value = "";
    taskInput.disabled = false;
    durationSel.disabled = false;
    tagInput.disabled = false;
    chipsEl.innerHTML = "";

    btnStart.hidden = false;
    btnPause.hidden = true;
    btnDone.hidden = true;
    btnPause.textContent = "Pause";
    btnDone.textContent = "Done";
}


// Tag chip UI

function renderChips(): void {
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
    } else if (event.key === "Backspace" && tagInput.value === "" && pendingTags.length > 0) {
        pendingTags.pop();
        renderChips();
    }
});

// Clicking anywhere in the tag box should focus the input
document.getElementById("tags-wrap")!.addEventListener("click", () => tagInput.focus());

// Timer buttons

btnStart.addEventListener("click", async () => {
    const label = taskInput.value.trim();
    if (label === "") {
        taskInput.focus();
        return;
    }

    btnStart.disabled = true;
    try {
        activeSession = await apiCreateSession(label, Number(durationSel.value), pendingTags);

        totalSeconds = activeSession.duration_minutes * 60;
        remainingSeconds = totalSeconds;

        ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
        ringEl.style.strokeDashoffset = "0";
        ringEl.classList.remove("paused");
        timerTimeEl.textContent = formatTime(remainingSeconds);

        startTicking();

        taskInput.disabled = true;
        durationSel.disabled = true;
        tagInput.disabled = true;

        btnStart.hidden = true;
        btnPause.hidden = false;
        btnDone.hidden = false;

        await reloadHistory();
    } catch (error) {
        console.error(error);
        alert("Could not start session — is the server running?");
    } finally {
        btnStart.disabled = false;
    }
});

btnPause.addEventListener("click", async () => {
    if (activeSession === null) return;

    if (timerIntervalId !== null) {
        // currently running, pause it
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        ringEl.classList.add("paused");
        btnPause.textContent = "Resume";
        await apiUpdateSession(activeSession.id, "paused");
    } else {
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
    if (isBreak) {
        resetTimerUI();
        return;
    }
    if (activeSession === null) return;
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

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

const STATUS_LABELS: { [key: string]: string } = {
    in_progress: "In Progress",
    completed: "Completed",
    paused: "Paused",
};

function renderSessions(sessions: Session[]): void {
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
                <span class="slabel">${escapeHtml(session.task_label)}</span>
                <div class="smeta">
                    <span class="sbadge s-${session.status}">${STATUS_LABELS[session.status] ?? session.status}</span>
                    <span class="sdur">${session.duration_minutes} min</span>
                    <span class="sdate">${formatDate(session.started_at)}</span>
                </div>
                ${tagsHtml !== "" ? `<div class="stags">${tagsHtml}</div>` : ""}
            </div>
            <button class="del" title="Delete session">✕</button>
        `;

        card.querySelector<HTMLButtonElement>(".del")!.addEventListener("click", async () => {
            if (!confirm("Delete this session?")) return;
            await apiDeleteSession(session.id);
            await reloadHistory();
        });

        sessionsEl.appendChild(card);
    }
}

function renderFilters(tags: Tag[]): void {
    filtersEl.innerHTML = "";

    function makeFilterButton(label: string, tagValue: string): HTMLButtonElement {
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

async function reloadHistory(): Promise<void> {
    const filterArg = activeTagFilter !== "" ? activeTagFilter : undefined;
    const [sessions, tags] = await Promise.all([
        apiListSessions(filterArg),
        apiListTags(),
    ]);
    renderSessions(sessions);
    renderFilters(tags);
}


// Timer restoration on page load

async function restoreTimerIfNeeded(sessions: Session[]): Promise<void> {
    const inProgress = sessions.find(s => s.status === "in_progress");
    if (!inProgress) return;

    const startedAt = new Date(inProgress.started_at).getTime();
    const totalMs = inProgress.duration_minutes * 60 * 1000;
    const remaining = Math.round((startedAt + totalMs - Date.now()) / 1000);

    if (remaining <= 0) {
        // Session finished while the page was closed — mark it completed
        await apiUpdateSession(inProgress.id, "completed");
        return;
    }

    activeSession = inProgress;
    totalSeconds = inProgress.duration_minutes * 60;
    remainingSeconds = remaining;

    ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    updateRing(remainingSeconds, totalSeconds);
    timerTimeEl.textContent = formatTime(remainingSeconds);

    taskInput.value = inProgress.task_label;
    taskInput.disabled = true;
    durationSel.disabled = true;
    tagInput.disabled = true;

    btnStart.hidden = true;
    btnPause.hidden = false;
    btnDone.hidden = false;

    startTicking();
}

// Startup

ringEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
ringEl.style.strokeDashoffset = "0";
timerTimeEl.textContent = formatTime(Number(durationSel.value) * 60);

(async () => {
    const sessions = await apiListSessions();
    await restoreTimerIfNeeded(sessions);
    await reloadHistory();
})();
