const MIN_DIFFICULTY = -2;
const MAX_DIFFICULTY = 100;
const DEFAULT_DIFFICULTY = 0;
let difficulty = DEFAULT_DIFFICULTY;

if (gameType === "percentage") {
    if (percentage >= 85) {
        // Level up
    }

    if (percentage < 65) {
        // Level down
    }

    return /*Same level*/;
}

if (gameType === "two-round") {
    if (wins === 2) {
        // Level up
    }

    if (wins === 0) {
        // Level down
    }

    return /*Same level*/;
}