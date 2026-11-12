import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, runTransaction } from "firebase/firestore";
import { auth, db } from "../firebase.js";
import {
    DEFAULT_DIFFICULTY,
    MIN_DIFFICULTY,
    MAX_DIFFICULTY,
} from "./levelHandler.js";

const GUEST_SAVE_KEY = "sharper:guestGameSaves";

function validDifficulty(value) {
    return Number.isInteger(value) &&
        value >= MIN_DIFFICULTY &&
        value <= MAX_DIFFICULTY;
}

// Wait for Firebase to establish whether a user is signed in.
export function waitForAuth() {
    return new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                unsubscribe();
                resolve(user);
            },
            reject
        );
    });
}

function readGuestSaves() {
    const raw = localStorage.getItem(GUEST_SAVE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid guest save data");
    }
    return parsed;
}

export async function loadDifficulty(gameSlug, user) {
    let storedLevel;

    if (user) {
        const snapshot = await getDoc(doc(db, "gameSaves", user.uid));
        storedLevel = snapshot.data()?.games?.[gameSlug]?.level;
    } else {
        storedLevel = readGuestSaves()[gameSlug]?.level;
    }

    return validDifficulty(storedLevel)
        ? storedLevel
        : DEFAULT_DIFFICULTY;
}

export async function saveDifficulty(gameSlug, difficulty, user) {
    if (!validDifficulty(difficulty)) {
        throw new Error("Invalid difficulty");
    }

    if (user) {
        const saveRef = doc(db, "gameSaves", user.uid);

        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(saveRef);

            const previousGame = snapshot.exists()
                ? snapshot.data().games?.[gameSlug] ?? {}
                : {};

            const highestLevel = Math.max(
                difficulty,
                previousGame.level ?? difficulty,
                previousGame.highestLevel ?? difficulty
            );

            // Merge this game's entry without deleting other game saves.
            transaction.set(
                saveRef,
                {
                    games: {
                        [gameSlug]: {
                            level: difficulty,
                            highestLevel,
                        },
                    },
                },
                { merge: true }
            );
        });
    } else {
        const saves = readGuestSaves();
        const previousGame = saves[gameSlug] ?? {};

        const highestLevel = Math.max(
            difficulty,
            previousGame.level ?? difficulty,
            previousGame.highestLevel ?? difficulty
        );

        saves[gameSlug] = {
            level: difficulty,
            highestLevel,
        };

        localStorage.setItem(GUEST_SAVE_KEY, JSON.stringify(saves));
    }
}