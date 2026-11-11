// Demo restrictions apply only to visitors without an authenticated account.
export const DEMO_GAME_SLUG = "memory";
export const DEMO_ROUND_LIMIT = 3;
const DEMO_ROUNDS_KEY = "sharper:demoMemoryRounds";

export function isGameLocked(gameSlug, user) {
    return !user && gameSlug !== DEMO_GAME_SLUG;
}

export function getDemoRounds() {
    const value = Number(localStorage.getItem(DEMO_ROUNDS_KEY) ?? 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function hasReachedDemoLimit() {
    return getDemoRounds() >= DEMO_ROUND_LIMIT;
}

// Call once, *after* a guest Memory round has been saved.
export function recordDemoRound() {
    const next = Math.min(DEMO_ROUND_LIMIT, getDemoRounds() + 1);
    localStorage.setItem(DEMO_ROUNDS_KEY, String(next));
    return next;
}