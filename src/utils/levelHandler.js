export const MIN_DIFFICULTY = -2;
export const MAX_DIFFICULTY = 100;
export const DEFAULT_DIFFICULTY = 0;

export function handleLevel(gameType, difficulty, result) {
    let levelChange = "same";

    if (gameType === "percentage") {
        if (result.percentage >= 85) {
            levelChange = "increase";
        } else if (result.percentage < 65) {
            levelChange = "decrease";
        }
    }

    if (gameType === "two-phase") {
        if (result.wins === 2) {
            levelChange = "increase";
        } else if (result.wins === 0) {
            levelChange = "decrease";
        }
    }

    let nextDifficulty = difficulty;

    if (levelChange === "increase") {
        nextDifficulty++;
    } else if (levelChange === "decrease") {
        nextDifficulty--;
    }

    // Enforce difficulty boundaries.
    nextDifficulty = Math.max(
        MIN_DIFFICULTY,
        Math.min(MAX_DIFFICULTY, nextDifficulty)
    );

    // Reflect whether the difficulty actually changed.
    if (nextDifficulty === difficulty) {
        levelChange = "same";
    }

    return {
        levelChange,
        difficulty: nextDifficulty,
    };
}