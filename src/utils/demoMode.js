// Demo restrictions apply only to visitors without an authenticated account.
export const DEMO_GAME_SLUG = "memory";
export const DEMO_SESSION_LIMIT = 3;
const DEMO_SESSIONS_KEY = "sharper:demoMemorySessions";

export function isGameLocked(gameSlug, user) {
    return !user && gameSlug !== DEMO_GAME_SLUG;
}

export function getDemoSessions() {
    const value = Number(localStorage.getItem(DEMO_SESSIONS_KEY) ?? 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function hasReachedDemoLimit() {
    return getDemoSessions() >= DEMO_SESSION_LIMIT;
}

// Call once, *after* a guest Memory session has been saved.
export function recordDemoSession() {
    const next = Math.min(DEMO_SESSION_LIMIT, getDemoSessions() + 1);
    localStorage.setItem(DEMO_SESSIONS_KEY, String(next));
    return next;
}