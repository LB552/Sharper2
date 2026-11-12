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

const ROUND_DELAY_MS = 1000;
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
    const status = root.querySelector("#game-status");
    const retryButton = root.querySelector("#retry-button");
    const timerLabel = root.querySelector("#daily-timer");
    const dailyMessage = root.querySelector("#daily-limit-message");
    const lockedMessage = root.querySelector("#locked-game");
    const lockedTitle = root.querySelector("#locked-title");
    const lockedDescription = root.querySelector("#locked-description");
    const lockedSignup = root.querySelector("#locked-signup");

    const { gameTitle = "this game", gameType = "", gameSlug = "" } = root.dataset;
    const unlockRequirement = Number(root.dataset.unlockRequirement ?? 0);

    let user = null;
    let difficulty = DEFAULT_DIFFICULTY;
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
            pendingResult = null;
            progressSaved = false;
            dailyLocked = false;
            board.hidden = false;
            dailyMessage.hidden = true;
            lockedMessage.hidden = true;
            timerLabel.hidden = false;
            retryButton.hidden = true;
            status.textContent = "";

            const token = roundToken;
            const cleanup = startRound({
                board,
                difficulty,
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
        pendingResult = null;
        cleanupRound();
        status.textContent = `Round complete. Difficulty: ${difficulty}.`;
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

    async function initialize() {
        if (disposed) return;
        retryButton.hidden = true;
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
            await dailyTimer.start();
            difficulty = await loadDifficulty(gameSlug, user);
            if (disposed) return;
            await startNextRound();
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
        retryButton.removeEventListener("click", retry);
        window.removeEventListener("pagehide", dispose);
    };

    retryButton.addEventListener("click", retry);
    window.addEventListener("pagehide", dispose);
    void initialize();
    return { dispose };
}