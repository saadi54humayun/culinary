import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatClock, scaledIngredient, secondsRemaining, suggestedStepSeconds } from "../utils/cooking";
import "./CookingMode.css";
import {
  getOfflineRecipe, getOfflineProgress, freshOfflineProgress,
  downloadOfflineRecipe, storeOfflineProgress, syncOfflineProgress
} from "../offline/storage";

async function responseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function blankTimer() {
  return { stepIndex: null, remainingSeconds: 0, running: false, endsAt: null };
}

export default function CookingMode({ user, offlineOnly = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const userId = user?.id || user?._id;
  const offlineEnabledRef = useRef(false);
  const [recipe, setRecipe] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [resetting, setResetting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const progressRef = useRef(null);
  const recipeRevisionRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const pendingRef = useRef(0);
  const soundRef = useRef(null);
  const timerAlertedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSaveError("");
    setRecipe(null);
    setProgress(null);
    progressRef.current = null;
    recipeRevisionRef.current = null;
    queueRef.current = Promise.resolve();
    pendingRef.current = 0;
    offlineEnabledRef.current = false;

    async function load() {
      let localRecipe = null;
      let localProgress = null;
      try {
        localRecipe = await getOfflineRecipe(userId, id);
        localProgress = localRecipe ? await getOfflineProgress(userId, id) : null;
        offlineEnabledRef.current = Boolean(localRecipe);
      } catch (storageError) {
        // Normal online cooking still works if the browser blocks IndexedDB.
        if (offlineOnly) {
          setError(storageError.message);
          setLoading(false);
          return;
        }
      }
      const useOffline = () => {
        if (!localRecipe?.recipe?.steps?.length) throw new Error("This recipe isn't downloaded. Connect to the internet, open it, and choose Save for offline cooking.");
        const state = localProgress?.progress || freshOfflineProgress(localRecipe.recipe);
        recipeRevisionRef.current = localProgress?.recipeVersion || localRecipe.recipeVersion;
        progressRef.current = state;
        setRecipe(localRecipe.recipe);
        setProgress(state);
        setSaveState(localProgress?.dirty ? "Saved on this device · sync pending" : "Offline copy ready");
      };
      try {
        if (offlineOnly || !navigator.onLine) {
          useOffline();
          return;
        }
        let recipeData, savedData;
        try {
          [recipeData, savedData] = await Promise.all([
            fetch(`/api/recipes/${id}`, { credentials: "include", signal: controller.signal }).then(responseJson),
            fetch(`/api/recipes/${id}/cook-progress`, { credentials: "include", signal: controller.signal }).then(responseJson)
          ]);
        } catch (err) {
          if (err.status === 401 || err.status === 403 || err.status === 404) throw err;
          if (!controller.signal.aborted && localRecipe) { useOffline(); return; }
          throw err;
        }
        if (controller.signal.aborted) return;
        if (!recipeData.recipe.steps?.length) throw new Error("This recipe has no cooking steps yet.");
        let state = savedData.progress;
        if (localRecipe) {
          if (localProgress?.dirty && localProgress.recipeVersion === savedData.recipeVersion) {
            // Offline edits take precedence; the next network save uses their recipe version.
            state = localProgress.progress;
            try {
              const result = await syncOfflineProgress(userId, id);
              if (result.status === "synced") setSaveState("Offline progress synchronized");
              else setSaveError("Offline changes need attention before they can sync.");
            } catch { setSaveState("Offline changes saved locally · sync pending"); }
          } else if (localProgress?.dirty && localProgress.recipeVersion !== savedData.recipeVersion) {
            setSaveError("The recipe changed while you were offline. Your old progress remains on this device; download the updated recipe to start fresh.");
            // Do not overwrite the old snapshot or unsynced progress.
            offlineEnabledRef.current = false;
          } else {
            // Keep an explicitly downloaded recipe up-to-date when online.
            if (localRecipe.recipeVersion !== savedData.recipeVersion) {
              await downloadOfflineRecipe(userId, recipeData.recipe, savedData.recipeVersion, state, savedData.updatedAt);
            }
            await storeOfflineProgress(userId, id, savedData.recipeVersion, state, false, savedData.updatedAt);
          }
        }
        recipeRevisionRef.current = savedData.recipeVersion;
        progressRef.current = state;
        setRecipe(recipeData.recipe);
        setProgress(state);
        if (savedData.resetForRecipeEdit) setSaveState("Recipe updated — cooking progress has been reset.");
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [id, userId, offlineOnly]);

  // Countdown derives from the saved deadline, not the number of interval ticks.
  // It remains correct after tab suspension, refresh, or opening another device.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const queueSave = useCallback((next) => {
    pendingRef.current++;
    setSaveState("Saving…");
    setSaveError("");
    // Serialize local snapshots and network writes. A newer offline edit is never
    // silently replaced by the result of an older request.
    queueRef.current = queueRef.current.catch(() => {}).then(async () => {
      if (offlineEnabledRef.current) {
        const locallySaved = await storeOfflineProgress(userId, id, recipeRevisionRef.current, next, true);
        if (!locallySaved) throw new Error("Offline download was removed. Save this recipe again.");
        if (offlineOnly || !navigator.onLine) {
          setSaveState("Saved on this device · sync pending");
          return;
        }
        try {
          const result = await syncOfflineProgress(userId, id);
          if (result.status === "conflict") {
            setSaveError("This recipe was edited online. Your local progress is safe, but can't sync until you resolve the conflict.");
          } else if (result.status !== "synced") {
            setSaveError("Session expired or recipe unavailable. Reconnect and sign in to sync progress.");
          } else {
            setSaveState("Progress synced");
          }
        } catch { setSaveState("Saved on this device · sync pending"); }
        return;
      }
      if (offlineOnly || !navigator.onLine) throw new Error("Download the recipe while online to enable offline progress.");
      const response = await fetch(`/api/recipes/${id}/cook-progress`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, recipeVersion: recipeRevisionRef.current })
      });
      await responseJson(response);
      setSaveState("Progress saved");
    }).catch((err) => {
      setSaveError(`${err.message} This change could not be saved.`);
      setSaveState("");
    }).finally(() => {
      pendingRef.current--;
    });
  }, [id, userId, offlineOnly]);

  useEffect(() => {
    const onReconnect = () => {
      if (offlineOnly || !offlineEnabledRef.current) return;
      queueRef.current = queueRef.current.catch(() => {}).then(async () => {
        const result = await syncOfflineProgress(userId, id);
        if (result.status === "synced") setSaveState("Progress synced");
        else if (result.status === "conflict") setSaveError("Recipe edited online. Review the changes before syncing.");
      }).catch(() => {});
    };
    window.addEventListener("online", onReconnect);
    return () => window.removeEventListener("online", onReconnect);
  }, [id, userId, offlineOnly]);

  const changeProgress = useCallback((change) => {
    if (!progressRef.current) return;
    const next = change(progressRef.current);
    progressRef.current = next;
    setProgress(next);
    queueSave(next);
  }, [queueSave]);

  const currentStep = progress?.stepIndex ?? 0;
  const stepText = recipe?.steps?.[currentStep] || "";
  const timer = progress?.timer;
  const remaining = secondsRemaining(timer, now);
  const timerActive = Boolean(timer?.running || timer?.remainingSeconds > 0);
  const displayedSeconds = timerActive ? remaining : timer?.stepIndex == null
    ? (Number(durationMinutes) * 60 + Number(durationSeconds) || 0) : 0;

  useEffect(() => {
    if (!recipe || !progress || timerActive) return;
    const seconds = suggestedStepSeconds(stepText);
    setDurationMinutes(Math.floor(seconds / 60));
    setDurationSeconds(seconds % 60);
  }, [recipe, currentStep, stepText, timerActive]);

  useEffect(() => {
    if (!progress?.timer?.running || remaining > 0) return;
    if (!timerAlertedRef.current) {
      timerAlertedRef.current = true;
      try {
        const context = soundRef.current;
        if (context?.state === "running") {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = 720;
          gain.gain.value = 0.08;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.45);
        }
      } catch { /* Visual notification still works when audio is unavailable. */ }
    }
    changeProgress((old) => ({ ...old, timer: { ...old.timer, running: false, remainingSeconds: 0, endsAt: null } }));
  }, [progress?.timer?.running, remaining, changeProgress]);

  function moveStep(index) {
    if (!recipe) return;
    changeProgress((old) => ({ ...old, completed: false, stepIndex: Math.max(0, Math.min(recipe.steps.length - 1, index)) }));
  }

  function toggleIngredient(index) {
    changeProgress((old) => ({
      ...old,
      checkedIngredients: old.checkedIngredients.includes(index)
        ? old.checkedIngredients.filter((value) => value !== index)
        : [...old.checkedIngredients, index].sort((a, b) => a - b)
    }));
  }

  function updateServings(raw) {
    const count = Number(raw);
    if (!Number.isInteger(count) || count < 1 || count > 100) return;
    changeProgress((old) => ({ ...old, servings: count }));
  }

  function startTimer() {
    const paused = timer && !timer.running && timer.remainingSeconds > 0;
    const seconds = paused ? timer.remainingSeconds : Number(durationMinutes) * 60 + Number(durationSeconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 21600) return;
    // Resume the AudioContext inside a user gesture; browsers may mute it otherwise.
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context && !soundRef.current) soundRef.current = new Context();
      soundRef.current?.resume?.().catch(() => {});
    } catch { /* Audio is optional. */ }
    timerAlertedRef.current = false;
    const deadline = new Date(Date.now() + seconds * 1000).toISOString();
    changeProgress((old) => ({ ...old, timer: {
      stepIndex: paused ? old.timer.stepIndex : old.stepIndex,
      remainingSeconds: seconds, running: true, endsAt: deadline
    } }));
  }

  function pauseTimer() {
    changeProgress((old) => ({ ...old, timer: {
      ...old.timer, running: false,
      remainingSeconds: secondsRemaining(old.timer), endsAt: null
    } }));
  }

  function clearTimer() {
    timerAlertedRef.current = false;
    changeProgress((old) => ({ ...old, timer: blankTimer() }));
  }

  async function resetProgress() {
    if (!window.confirm("Restart this recipe? This clears your checklist, timer, and saved progress.")) return;
    setResetting(true);
    setSaveError("");
    try {
      await queueRef.current.catch(() => {});
      if (offlineEnabledRef.current) {
        const next = freshOfflineProgress(recipe);
        progressRef.current = next;
        setProgress(next);
        const locallySaved = await storeOfflineProgress(userId, id, recipeRevisionRef.current, next, true);
        if (!locallySaved) throw new Error("Offline download was removed. Save this recipe again.");
        if (!offlineOnly && navigator.onLine) {
          const result = await syncOfflineProgress(userId, id).catch(() => ({ status: "offline" }));
          setSaveState(result.status === "synced" ? "Cooking progress restarted" : "Restarted locally · sync pending");
        } else setSaveState("Restarted locally · sync pending");
      } else {
        if (offlineOnly || !navigator.onLine) throw new Error("Download the recipe first to restart offline.");
        const response = await fetch(`/api/recipes/${id}/cook-progress`, { method: "DELETE", credentials: "include" });
        const data = await responseJson(response);
        progressRef.current = data.progress;
        setProgress(data.progress);
        setSaveState("Cooking progress restarted");
      }
      timerAlertedRef.current = false;
    } catch (err) { setSaveError(err.message); }
    finally { setResetting(false); }
  }

  async function leaveCookingMode() {
    try { await queueRef.current; } catch { /* The error is already displayed; don't trap the user. */ }
    navigate(offlineOnly || !navigator.onLine ? `/offline-recipes/${id}` : `/recipes/${id}`);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.getElementById("culinary-cook-mode")?.requestFullscreen?.();
    } catch { /* CSS mode still fills the screen when the API is unavailable. */ }
  }

  useEffect(() => () => { soundRef.current?.close?.().catch(() => {}); }, []);

  return (
    <main className="cook-mode" id="culinary-cook-mode">
      <header className="cook-header">
        <div className="cook-brand">Culinary <span>· Cooking mode</span></div>
        <div className="cook-header-actions">
          <button type="button" className="cook-outline" onClick={toggleFullscreen}>{fullscreen ? "Exit fullscreen" : "Browser fullscreen"}</button>
          <button type="button" className="cook-outline" onClick={leaveCookingMode}>✕ Exit cooking</button>
        </div>
      </header>
      {offlineOnly && <div className="cook-offline-banner" role="status">Offline cooking · Your changes are stored on this device and will sync after reconnecting.</div>}
      {loading && <div className="cook-message">Loading cooking mode…</div>}
      {error && <div className="cook-message" role="alert">{error} <Link to={`/recipes/${id}`}>Back to recipe</Link></div>}
      {!loading && !error && recipe && progress && (
        <div className="cook-layout">
          <section className="cook-main" aria-label="Cooking instructions">
            <div className="cook-topline">
              <div><p className="cook-eyebrow">Let's get cooking</p><h1>{recipe.title}</h1></div>
              <div className="cook-save-status" role="status" aria-live="polite">{saveError || saveState}</div>
            </div>
            {progress.completed ? (
              <div className="cook-finished" role="status">
                <span className="cook-celebrate">✓</span>
                <h2>You're done!</h2>
                <p>Enjoy your {recipe.title}. Your cooking session is saved.</p>
                <button className="primary-button" type="button" onClick={resetProgress} disabled={resetting}>{resetting ? "Restarting…" : "Cook it again"}</button>
                <button type="button" onClick={leaveCookingMode}>Back to recipe</button>
              </div>
            ) : (
              <>
                <div className="cook-progress-meta"><strong>Step {currentStep + 1} of {recipe.steps.length}</strong><span>{Math.round((currentStep + 1) / recipe.steps.length * 100)}% through the instructions</span></div>
                <div className="cook-step-track" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={0} aria-valuemax={recipe.steps.length} aria-label="Cooking step progress"><span style={{ width: `${(currentStep + 1) / recipe.steps.length * 100}%` }} /></div>
                <article className="cook-step-card">
                  <p className="cook-eyebrow">Step {String(currentStep + 1).padStart(2, "0")}</p>
                  <p className="cook-instruction">{stepText}</p>
                </article>
                <div className="cook-step-navigation">
                  <button type="button" disabled={currentStep === 0} onClick={() => moveStep(currentStep - 1)}>← Previous step</button>
                  {currentStep + 1 === recipe.steps.length ? (
                    <button type="button" className="primary-button" onClick={() => changeProgress((old) => ({ ...old, completed: true }))}>✓ Finish cooking</button>
                  ) : (
                    <button type="button" className="primary-button" onClick={() => moveStep(currentStep + 1)}>Next step →</button>
                  )}
                </div>
                <nav className="cook-step-dots" aria-label="Choose cooking step">
                  {recipe.steps.map((_, index) => (
                    <button key={index} type="button" className={index === currentStep ? "cook-dot active" : "cook-dot"} aria-label={`Go to step ${index + 1}`} aria-current={index === currentStep ? "step" : undefined} onClick={() => moveStep(index)}>{index + 1}</button>
                  ))}
                </nav>
              </>
            )}
          </section>
          <aside className="cook-sidebar" aria-label="Cooking tools">
            <section className="cook-panel">
              <div className="cook-panel-heading"><h2>Ingredients</h2><small>{progress.checkedIngredients.length}/{recipe.ingredients.length} checked</small></div>
              <div className="cook-servings">
                <label htmlFor="cook-servings">Servings</label>
                <div><button type="button" aria-label="Decrease servings" disabled={progress.servings <= 1} onClick={() => updateServings(progress.servings - 1)}>−</button>
                  <input id="cook-servings" type="number" min="1" max="100" value={progress.servings} onChange={(event) => updateServings(event.target.value)} />
                  <button type="button" aria-label="Increase servings" disabled={progress.servings >= 100} onClick={() => updateServings(progress.servings + 1)}>+</button></div>
              </div>
              <ul className="cook-ingredients">
                {recipe.ingredients.map((ingredient, index) => {
                  const scaled = scaledIngredient(ingredient, recipe.servings, progress.servings);
                  return <li key={index}>
                    <label className={progress.checkedIngredients.includes(index) ? "cook-ingredient-checked" : ""}>
                      <input type="checkbox" checked={progress.checkedIngredients.includes(index)} onChange={() => toggleIngredient(index)} />
                      <span>{scaled.text}{scaled.approximate && <small title="This quantity cannot be scaled automatically."> (amount not scaled)</small>}</span>
                    </label>
                  </li>;
                })}
              </ul>
            </section>
            <section className="cook-panel">
              <div className="cook-panel-heading"><h2>Cooking timer</h2><span aria-hidden="true">◷</span></div>
              {timerActive && timer.stepIndex != null && <p className="cook-timer-context">Timer for step {timer.stepIndex + 1}</p>}
              <div className="cook-clock" role="timer" aria-label="Time remaining">{formatClock(displayedSeconds)}</div>
              {!timerActive && !timer?.running && timer?.stepIndex != null && timer?.remainingSeconds === 0 && (
                <p className="cook-timer-done" role="status">Time is up!</p>
              )}
              <div className="cook-timer-inputs">
                <label>Minutes <input type="number" min="0" max="360" step="1" disabled={timerActive} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} /></label>
                <label>Seconds <input type="number" min="0" max="59" step="1" disabled={timerActive} value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} /></label>
              </div>
              <div className="cook-timer-actions">
                {timer?.running ? <button type="button" className="primary-button" onClick={pauseTimer}>Pause timer</button> : <button type="button" className="primary-button" disabled={!timerActive && !(Number(durationMinutes) * 60 + Number(durationSeconds) > 0 && Number(durationMinutes) * 60 + Number(durationSeconds) <= 21600)} onClick={startTimer}>{timerActive ? "Resume timer" : "Start timer"}</button>}
                <button type="button" onClick={clearTimer} disabled={!timerActive && timer?.stepIndex == null}>Clear</button>
              </div>
              <p className="cook-timer-tip">Runs using real time even when the tab is in the background. Alerts are only shown while Culinary is open.</p>
            </section>
            <button type="button" className="cook-restart" onClick={resetProgress} disabled={resetting}>↻ {resetting ? "Restarting…" : "Restart cooking progress"}</button>
          </aside>
        </div>
      )}
    </main>
  );
}
