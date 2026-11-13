import { DEFAULT_DIFFICULTY, handleLevel } from "./levelHandler.js";
import { waitForAuth, loadDifficulty, saveDifficulty } from "./gameProgress.js";
import { isGameLocked } from "./demoMode.js";
import { createDailyTimer, formatRemaining } from "./dailyTimer.js";
import {
    loadDaysPlayed,
    completeTrainingDay,
    isUnlocked,
    recordCompletedSession,
} from "./daysPlayed.js";

const ROUND_DELAY_MS = 3000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shared lifecycle for all Sharper games.
 *
 * startRound({board, difficulty, complete}) is the only required game-specific
 * operation. Call complete(result) exactly when gameplay is finished. The
 * result shape depends on gameType (percentage or two-phase); handleLevel
 * remains the single source of truth for difficulty changes.
 *
 * startRound may return a cleanup function. It is called when that round
 * ends/is replaced, so pending animation timeouts cannot affect a new round.
 *
 * demo is an optional Memory-specific adapter:
 * { hasReachedLimit, recordRound, showLimit }
 */
export function mountGame(root, { startRound, demo = null }) {
    if (!root) throw new Error("Game shell was not found");

    const board = root.querySelector("#game-board");
    const startScreen = root.querySelector("#game-start-screen");
    const startButton = root.querySelector("#game-start-button");
    const status = root.querySelector("#game-status");
    const retryButton = root.querySelector("#retry-button");
    const timerLabel = root.querySelector("#daily-timer");
    const dailyMessage = root.querySelector("#daily-limit-message");
    const lockedMessage = root.querySelector("#locked-game");
    const lockedTitle = root.querySelector("#locked-title");
    const lockedDescription = root.querySelector("#locked-description");
    const lockedSignup = root.querySelector("#locked-signup");
    const levelFeedback = root.querySelector("#game-level-feedback");
    const pointSymbols = root.querySelector("#game-point-symbols");
    const levelResult = root.querySelector("#game-level-result");
    const twoPhaseFeedback = root.querySelector("#game-two-phase-feedback");
    const phaseOne = root.querySelector("#game-phase-one");
    const phaseTwo = root.querySelector("#game-phase-two");
    const winsResult = root.querySelector("#game-wins-result");

    const { gameTitle = "this game", gameType = "", gameSlug = "" } = root.dataset;
    const unlockRequirement = Number(root.dataset.unlockRequirement ?? 0);

    let user = null;
    let difficulty = DEFAULT_DIFFICULTY;
    let roundDifficulty = DEFAULT_DIFFICULTY;
    let dailyTimer = null;
    let dailyLocked = false;
    let roundWindow = null;
    let roundStartedAt = null;
    let roundCompletedAt = null;
    let pendingResult = null;
    let progressSaved = false;
    let saving = false;
    let starting = false;
    let roundCleanup = null;
    let roundToken = 0;
    let disposed = false;
    let completedPhases = 0;
    let readyToStart = false;
    let launching = false;

    function resetLevelFeedback() {
        // Percentage games
        pointSymbols.replaceChildren();
        levelResult.textContent = "";
        levelFeedback.hidden = gameType !== "percentage";

        // Two-phase games
        completedPhases = 0;

        phaseOne.textContent = "−";
        phaseTwo.textContent = "−";

        phaseOne.classList.remove("good-phase", "bad-phase");
        phaseTwo.classList.remove("good-phase", "bad-phase");

        winsResult.textContent = "";
        twoPhaseFeedback.hidden = gameType !== "two-phase";
    }

    function addPoint(good) {
        if (gameType !== "percentage") return;

        const symbol = document.createElement("span");

        symbol.textContent = good ? "✓" : "✗";
        symbol.className = good ? "good-point" : "bad-point";

        pointSymbols.appendChild(symbol);
    }

    function completePhase(won) {
        if (gameType !== "two-phase" || completedPhases >= 2) return;

        const element = completedPhases === 0 ? phaseOne : phaseTwo;

        element.textContent = won ? "✓" : "✗";
        element.classList.add(won ? "good-phase" : "bad-phase");

        completedPhases++;
    }

    function showLevelResult(result, previousDifficulty, nextDifficulty) {
        if (gameType !== "percentage") return;

        const percentage = Number(result.percentage);

        if (!Number.isFinite(percentage)) {
            console.error("Percentage game returned an invalid percentage:", result);
            return;
        }

        const outcome =
            nextDifficulty > previousDifficulty
                ? "Increase level"
                : nextDifficulty < previousDifficulty
                    ? "Decrease level"
                    : "Keep level";

        levelResult.textContent = `${Math.round(percentage)}% → ${outcome}`;
    }

    function showTwoPhaseResult(result, previousDifficulty, nextDifficulty) {
        if (gameType !== "two-phase") return;

        const wins = Number(result.wins);

        if (!Number.isInteger(wins) || wins < 0 || wins > 2) {
            console.error("Two-phase game returned invalid wins:", result);
            return;
        }

        const outcome =
            nextDifficulty > previousDifficulty
                ? "Increase level"
                : nextDifficulty < previousDifficulty
                    ? "Decrease level"
                    : "Keep level";

        winsResult.textContent = `Wins: ${wins} → ${outcome}`;
    }

    function cleanupRound() {
        roundToken++;
        const cleanup = roundCleanup;
        roundCleanup = null;
        cleanup?.();
    }

    function showDailyLimit() {
        dailyLocked = true;
        cleanupRound();
        board.hidden = true;
        dailyMessage.hidden = false;
        retryButton.hidden = true;
        status.textContent = "Today's five minutes are complete.";
    }

    function showLocked(title, description, showSignup) {
        cleanupRound();
        board.hidden = true;
        timerLabel.hidden = true;
        lockedMessage.hidden = false;
        lockedTitle.textContent = title;
        lockedDescription.textContent = description;
        lockedSignup.hidden = !showSignup;
        status.textContent = "";
        retryButton.hidden = true;
    }

    function showDemoLimit() {
        cleanupRound();
        board.hidden = true;
        retryButton.hidden = true;
        status.textContent = "Demo complete: create an account to continue.";
        demo?.showLimit();
    }

    function reportTimerError(error) {
        console.error("Daily timer error:", error);
        status.textContent = "Could not load daily playtime. Please retry.";
        retryButton.hidden = false;
    }

    async function startNextRound() {
        if (starting || disposed) return;
        starting = true;
        try {
            if (!dailyTimer || !(await dailyTimer.canStartRound())) {
                showDailyLimit();
                return;
            }
            // A round keeps the ORIGINAL window even if midnight passes.
            const window = dailyTimer.getWindow();
            if (!window) throw new Error("No daily timer window is available");
            cleanupRound();
            roundWindow = window;
            roundStartedAt = Date.now();
            roundCompletedAt = null;
            roundDifficulty = difficulty;
            pendingResult = null;
            progressSaved = false;
            dailyLocked = false;
            board.hidden = false;
            dailyMessage.hidden = true;
            lockedMessage.hidden = true;
            timerLabel.hidden = false;
            retryButton.hidden = true;
            status.textContent = "";
            resetLevelFeedback();

            const token = roundToken;
            const cleanup = startRound({
                board,
                difficulty,
                completePhase(won) {
                    if (
                        disposed ||
                        token !== roundToken ||
                        pendingResult !== null
                    ) return;

                    completePhase(won);
                },
                addPoint(good) {
                    if (
                        disposed ||
                        token !== roundToken ||
                        pendingResult !== null
                    ) return;

                    addPoint(good);
                },
                complete(result) {
                    if (disposed || token !== roundToken || pendingResult !== null) return;
                    roundCompletedAt = Date.now();
                    pendingResult = result;
                    void finishRound();
                },
            });
            if (typeof cleanup === "function") roundCleanup = cleanup;
        } finally {
            starting = false;
        }
    }

    async function finishRound() {
        if (!pendingResult || saving || disposed) return;
        saving = true;
        retryButton.hidden = true;
        status.textContent = "Saving progress...";

        try {
            const previousDifficulty = difficulty;
            const next = handleLevel(gameType, difficulty, pendingResult).difficulty;
            if (!progressSaved) {
                await saveDifficulty(gameSlug, next, user);
                difficulty = next;
                progressSaved = true;
            }
            // The original round's completion timestamp is preserved on
            // retries, ensuring a slow write never earns undeserved credit.
            if (
                user &&
                roundWindow &&
                roundStartedAt !== null &&
                roundCompletedAt !== null
            ) {
                await completeTrainingDay(
                    user,
                    roundWindow,
                    roundStartedAt,
                    roundCompletedAt
                );

                // Only count a session once its five-minute window has expired.
                if (roundCompletedAt >= roundWindow.startedAt + 5 * 60 * 1000) {
                    await recordCompletedSession(
                        user,
                        gameSlug,
                        roundWindow.dateKey
                    );
                }
            }
        } catch (error) {
            console.error(`Could not finalize ${gameTitle} round:`, error);
            status.textContent = "Could not save training progress. Retry to continue.";
            retryButton.hidden = false;
            saving = false;
            return;
        }


        if (!user) demo?.recordRound();

        showLevelResult(
            pendingResult,
            roundDifficulty,
            difficulty
        );

        showTwoPhaseResult(
            pendingResult,
            roundDifficulty,
            difficulty
        );

        pendingResult = null;
        cleanupRound();

        status.textContent = "";
        if (!user && demo?.hasReachedLimit()) {
            saving = false;
            showDemoLimit();
            return;
        }
        await sleep(ROUND_DELAY_MS);
        saving = false;
        try {
            await startNextRound();
        } catch (error) {
            reportTimerError(error);
        }
    }

    function getStartStorageKey() {
        const date = new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Europe/Stockholm",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date());

        return `sharper-start:${user?.uid ?? "guest"}:${gameSlug}:${date}`;
    }

    async function startGame() {
        if (!readyToStart || launching || disposed) return;

        launching = true;
        readyToStart = false;
        startButton.disabled = true;
        startScreen.hidden = true;

        const storageKey = getStartStorageKey();
        const alreadyStarted = localStorage.getItem(storageKey) === "true";

        // Remember the click immediately, even if the player leaves the page.
        localStorage.setItem(storageKey, "true");

        try {
            await dailyTimer.start();

            if (disposed) return;

            await startNextRound();
        } catch (error) {
            // Allow a first attempt to be retried if starting failed.
            if (!alreadyStarted) {
                localStorage.removeItem(storageKey);
            }

            reportTimerError(error);
        } finally {
            launching = false;
            startButton.disabled = false;
        }
    }

    async function initialize() {
        if (disposed) return;
        retryButton.hidden = true;
        startScreen.hidden = true;
        readyToStart = false;
        board.hidden = true;
        timerLabel.hidden = true;
        status.textContent = "Loading progress...";
        try {
            user = await waitForAuth();
            if (disposed) return;
            if (isGameLocked(gameSlug, user)) {
                showLocked(`Unlock ${gameTitle}`,
                    `Create a free account to play ${gameTitle} and all other Sharper games.`, true);
                return;
            }
            if (!user && demo?.hasReachedLimit()) {
                showDemoLimit();
                return;
            }
            if (user) {
                const daysPlayed = await loadDaysPlayed(user);
                if (disposed) return;
                if (!isUnlocked(daysPlayed, unlockRequirement)) {
                    showLocked(`Unlock ${gameTitle}`,
                        `Train on ${unlockRequirement} different days to unlock this game. Your progress: ${daysPlayed}.`, false);
                    return;
                }
            }
            dailyTimer?.stop();
            dailyTimer = createDailyTimer({
                gameSlug,
                user,
                onTick: (remaining) => {
                    timerLabel.textContent = `Daily time: ${formatRemaining(remaining)}`;
                },
                onNewDay: () => {
                    if (dailyLocked && (user || !demo?.hasReachedLimit())) {
                        void startNextRound().catch(reportTimerError);
                    }
                },
                onError: reportTimerError,
            });
            difficulty = await loadDifficulty(gameSlug, user);
            if (disposed) return;

            readyToStart = true;
            status.textContent = "";

            if (localStorage.getItem(getStartStorageKey()) === "true") {
                // Already pressed Start today: resume automatically.
                void startGame();
            } else {
                // First visit today: wait for the player to press Start.
                startScreen.hidden = false;
            }
        } catch (error) {
            console.error(`Could not load ${gameTitle} progress:`, error);
            status.textContent = "Could not load progress. Retry to play.";
            retryButton.hidden = false;
        }
    }

    const retry = () => {
        if (pendingResult) void finishRound();
        else void initialize();
    };
    const dispose = () => {
        disposed = true;
        dailyTimer?.stop();
        cleanupRound();
        startButton.removeEventListener("click", startGame);
        retryButton.removeEventListener("click", retry);
        window.removeEventListener("pagehide", dispose);
    };

    startButton.addEventListener("click", startGame);
    retryButton.addEventListener("click", retry);
    window.addEventListener("pagehide", dispose);
    void initialize();
    return { dispose };
}