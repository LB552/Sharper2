import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "../firebase.js";
import { stockholmDate } from "./dailyTimer.js";

function countOrZero(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function isUnlocked(daysPlayed, unlockRequirement) {
    return Number.isSafeInteger(daysPlayed) && daysPlayed >= 0 &&
        Number.isInteger(unlockRequirement) && unlockRequirement >= 0 &&
        daysPlayed >= unlockRequirement;
}

// A missing gameSaves document (or newly introduced field) starts at zero.
export async function loadDaysPlayed(user) {
    if (!user) return 0;
    const snapshot = await getDoc(doc(db, "gameSaves", user.uid));
    return countOrZero(snapshot.data()?.daysPlayed);
}

// Call only when a round has genuinely finished and its difficulty has been saved.
// The completion timestamp is captured at the moment gameplay finishes, not after
// Firestore writes/retries, so slow writes cannot turn an early finish into credit.
// The date belongs to the ROUND'S START, not its completion (even at midnight).
export async function completeTrainingDay(user, roundWindow, roundStartedAt, completedAt) {
    if (!user || !roundWindow) return { credited: false };
    if (![roundStartedAt, completedAt, roundWindow.startedAt, roundWindow.expiresAt]
        .every(Number.isFinite)) throw new Error("Invalid round timing");

    if (roundStartedAt < roundWindow.startedAt ||
        roundStartedAt >= roundWindow.expiresAt ||
        completedAt < roundStartedAt ||
        completedAt < roundWindow.expiresAt) {
        return { credited: false };
    }

    const date = stockholmDate(roundStartedAt);
    if (date !== roundWindow.date) return { credited: false };

    const reference = doc(db, "gameSaves", user.uid);
    return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        const data = snapshot.data() ?? {};
        const days = countOrZero(data.daysPlayed);
        // A per-date record also handles out-of-order completions across midnight.
        if (data.creditedDays?.[date] === true || data.lastDayPlayed === date) {
            return { credited: false, daysPlayed: days };
        }
        const next = days + 1;
        transaction.set(reference, {
            daysPlayed: next,
            lastDayPlayed: !data.lastDayPlayed || date > data.lastDayPlayed
                ? date : data.lastDayPlayed,
            creditedDays: { [date]: true },
        }, { merge: true });
        return { credited: true, daysPlayed: next };
    });
}