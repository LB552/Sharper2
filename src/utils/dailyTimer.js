import { doc, runTransaction, Timestamp, FieldPath } from "firebase/firestore";
import { db } from "../firebase.js";

export const DAILY_LIMIT_MS = 5 * 60 * 1000;
export const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const GUEST_TIMERS_KEY = "sharper:guestDailyTimers";

// sv-SE uses the Gregorian calendar, with YYYY-MM-DD as the format.
const stockholmFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function stockholmDate(time = Date.now()) {
    const pieces = Object.fromEntries(
        stockholmFormatter.formatToParts(new Date(time))
            .filter((part) => ["year", "month", "day"].includes(part.type))
            .map((part) => [part.type, part.value])
    );
    return `${pieces.year}-${pieces.month}-${pieces.day}`;
}

function loadGuestTimers() {
    const value = JSON.parse(localStorage.getItem(GUEST_TIMERS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function validTimer(record, date) {
    return record?.date === date &&
        Number.isFinite(record.startedAt) &&
        Number.isFinite(record.expiresAt) &&
        record.expiresAt === record.startedAt + DAILY_LIMIT_MS;
}

// Run once per game visit, and again only when Stockholm's date changes.
// A Firestore transaction makes concurrent first visits use the same deadline.
export async function getOrCreateDailyWindow(gameSlug, user, now = Date.now()) {
    if (!gameSlug || gameSlug.includes(".")) throw new Error("Invalid game slug");
    const date = stockholmDate(now);

    if (!user) {
        const timers = loadGuestTimers();
        const stored = timers[gameSlug];
        if (validTimer(stored, date)) return stored;
        const fresh = { date, startedAt: now, expiresAt: now + DAILY_LIMIT_MS };
        timers[gameSlug] = fresh;
        localStorage.setItem(GUEST_TIMERS_KEY, JSON.stringify(timers));
        return fresh;
    }

    const reference = doc(db, "gameTimeLimits", user.uid);
    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference);
        const stored = snapshot.data()?.games?.[gameSlug];
        const normalized = stored && {
            date: stored.date,
            startedAt: stored.startedAt?.toMillis?.(),
            expiresAt: stored.expiresAt?.toMillis?.(),
        };
        if (validTimer(normalized, date)) return normalized;

        const fresh = { date, startedAt: now, expiresAt: now + DAILY_LIMIT_MS };
        transaction.set(reference, {
            games: {
                [gameSlug]: {
                    date,
                    startedAt: Timestamp.fromMillis(fresh.startedAt),
                    expiresAt: Timestamp.fromMillis(fresh.expiresAt),
                },
            },
        }, { mergeFields: [new FieldPath("games", gameSlug)] });
        return fresh;
    });
}

export function formatRemaining(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// One controller instance belongs to one open game page.
export function createDailyTimer({ gameSlug, user, onTick, onNewDay, onError }) {
    let windowData = null;
    let intervalId = null;
    let refreshPromise = null;
    let disposed = false;
    let initialized = false;

    async function refresh() {
        if (refreshPromise) return refreshPromise;
        refreshPromise = (async () => {
            const previousDate = windowData?.date;
            const fresh = await getOrCreateDailyWindow(gameSlug, user);
            if (disposed) return;
            windowData = fresh;
            onTick(Math.max(0, fresh.expiresAt - Date.now()));
            if (initialized && previousDate && fresh.date !== previousDate) {
                onNewDay?.();
            }
            initialized = true;
        })().finally(() => { refreshPromise = null; });
        return refreshPromise;
    }

    function tick() {
        if (disposed) return;
        if (!windowData || windowData.date !== stockholmDate()) {
            void refresh().catch((error) => onError?.(error));
            return;
        }
        onTick(Math.max(0, windowData.expiresAt - Date.now()));
    }

    return {
        getWindow() {
            return windowData ? { ...windowData } : null;
        },

        async start() {
            await refresh();
            if (!disposed) intervalId = setInterval(tick, 250);
        },
        async canStartRound() {
            if (!windowData || windowData.date !== stockholmDate()) {
                await refresh();
            }
            return !disposed && windowData !== null &&
                windowData.expiresAt > Date.now();
        },
        stop() {
            disposed = true;
            if (intervalId !== null) clearInterval(intervalId);
        },
    };
}