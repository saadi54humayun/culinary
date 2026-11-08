import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./MealPlanner.css";
import { downloadGroceryListPdf } from "../utils/groceryPdf";
import { MacroValues } from "../components/NutritionFacts";
import MealRecipePicker from "../components/MealRecipePicker";

const MEAL_TYPES = ["breakfast", "lunch", "dinner"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function dateLabel(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromLabel(label) {
  const [year, month, day] = label.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function mondayOf(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return dateLabel(result);
}

function moveWeek(label, amount) {
  const date = dateFromLabel(label);
  date.setDate(date.getDate() + amount * 7);
  return dateLabel(date);
}

function dayDate(label, day) {
  const result = dateFromLabel(label);
  result.setDate(result.getDate() + day);
  return result;
}

function humanDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function jsonOrThrow(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong. Please try again.");
  return data;
}

export default function MealPlanner({ user }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [mobileDay, setMobileDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [entries, setEntries] = useState([]);
  const [items, setItems] = useState([]);
  const [pantryAdjustedItems, setPantryAdjustedItems] = useState([]);
  const [pantryCovered, setPantryCovered] = useState(0);
  const [pantryPartiallyCovered, setPantryPartiallyCovered] = useState(0);
  const [usePantry, setUsePantry] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState("");
  const [error, setError] = useState("");
  const [groceryError, setGroceryError] = useState("");
  const [checkedItems, setCheckedItems] = useState([]);
  const [copyMessage, setCopyMessage] = useState("");
  const [exportOnlyUnchecked, setExportOnlyUnchecked] = useState(false);
  const [draftServings, setDraftServings] = useState({});
  const [nutrition, setNutrition] = useState(null);
  const [nutritionError, setNutritionError] = useState("");
  const [analyzingNutrition, setAnalyzingNutrition] = useState(false);
  const [picker, setPicker] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [aiGoal, setAiGoal] = useState("balanced");
  const [aiDiet, setAiDiet] = useState("any");
  const [aiMaxMinutes, setAiMaxMinutes] = useState("any");
  const [aiNotes, setAiNotes] = useState("");
  const [aiReplace, setAiReplace] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [proposal, setProposal] = useState(null);
  const checklistKey = `culinary-groceries:${user?._id ?? "unknown"}:${weekStart}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setGroceryError("");
    setEntries([]);
    setItems([]);
    setPantryAdjustedItems([]);
    setNutrition(null);
    setNutritionError("");
    setAnalyzingNutrition(false);
    setProposal(null);
    setPicker(null);
    // Keep shopping progress for this user's week on this device.
    try {
      const saved = JSON.parse(window.localStorage.getItem(checklistKey) || "[]");
      setCheckedItems(Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : []);
    } catch {
      setCheckedItems([]);
    }
    setDraftServings({});
    setCopyMessage("");

    async function loadWeek() {
      try {
        const [weekResult, groceryResult, nutritionResult] = await Promise.allSettled([
          fetch(`/api/meal-plans/${weekStart}`, {
            credentials: "include", signal: controller.signal
          }).then(jsonOrThrow),
          fetch(`/api/meal-plans/${weekStart}/grocery-list`, {
            credentials: "include", signal: controller.signal
          }).then(jsonOrThrow),
          fetch(`/api/meal-plans/${weekStart}/nutrition`, {
            credentials: "include", signal: controller.signal
          }).then(jsonOrThrow)
        ]);

        if (controller.signal.aborted) return;
        if (weekResult.status === "fulfilled") setEntries(weekResult.value.entries);
        else setError(weekResult.reason.message);
        if (groceryResult.status === "fulfilled") {
          setItems(groceryResult.value.items);
          setPantryAdjustedItems(groceryResult.value.pantryAdjustedItems ?? groceryResult.value.items);
          setPantryCovered(groceryResult.value.pantryCovered ?? 0);
          setPantryPartiallyCovered(groceryResult.value.pantryPartiallyCovered ?? 0);
        }
        else setGroceryError(groceryResult.reason.message);
        if (nutritionResult.status === "fulfilled") {
          setNutrition(nutritionResult.value);
          if (nutritionResult.value.uncalculatedRecipeIds?.length) {
            setAnalyzingNutrition(true);
            // Analyze a bounded batch on first visit; cached recipes make later visits fast.
            fetch(`/api/meal-plans/${weekStart}/nutrition/analyze`, {
              method: "POST", credentials: "include", signal: controller.signal
            }).then(jsonOrThrow).then(async (result) => {
              if (controller.signal.aborted) return;
              const latest = await fetch(`/api/meal-plans/${weekStart}/nutrition`, {
                credentials: "include", signal: controller.signal
              }).then(jsonOrThrow);
              if (controller.signal.aborted) return;
              setNutrition(latest);
              if (result.failures?.length) setNutritionError(result.failures[0].message);
            }).catch((err) => {
              if (!controller.signal.aborted) setNutritionError(err.message);
            }).finally(() => {
              if (!controller.signal.aborted) setAnalyzingNutrition(false);
            });
          }
        } else setNutritionError(nutritionResult.reason.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadWeek();
    return () => controller.abort();
  }, [weekStart, checklistKey, reloadKey]);

  useEffect(() => {
    setAiError("");
    setAiStatus("");
  }, [weekStart]);

  async function refreshGroceryList() {
    try {
      const response = await fetch(`/api/meal-plans/${weekStart}/grocery-list`, {
        credentials: "include"
      });
      const result = await jsonOrThrow(response);
      setItems(result.items);
      setPantryAdjustedItems(result.pantryAdjustedItems ?? result.items);
      setPantryCovered(result.pantryCovered ?? 0);
      setPantryPartiallyCovered(result.pantryPartiallyCovered ?? 0);
    } catch (err) {
      setItems([]);
      setPantryAdjustedItems([]);
      setGroceryError(err.message);
    }
  }

  async function refreshNutrition() {
    try {
      const response = await fetch(`/api/meal-plans/${weekStart}/nutrition`, {
        credentials: "include"
      });
      const result = await jsonOrThrow(response);
      setNutrition(result);
      setNutritionError("");
    } catch (err) {
      setNutritionError(err.message);
    }
  }

  async function analyzeWeek() {
    if (analyzingNutrition) return;
    setAnalyzingNutrition(true);
    setNutritionError("");
    try {
      const response = await fetch(`/api/meal-plans/${weekStart}/nutrition/analyze`, {
        method: "POST", credentials: "include"
      });
      const result = await jsonOrThrow(response);
      setNutrition(result);
      if (result.failures?.length) setNutritionError(result.failures[0].message);
    } catch (err) {
      setNutritionError(err.message);
    } finally {
      setAnalyzingNutrition(false);
    }
  }

  async function updateSlot(day, mealType, recipeId) {
    const key = `${day}-${mealType}`;
    if (savingSlot) return;
    setSavingSlot(key);
    setError("");
    setGroceryError("");
    setCopyMessage("");
    try {
      const url = `/api/meal-plans/${weekStart}/${day}/${mealType}`;
      const response = await fetch(url, {
        method: recipeId ? "PUT" : "DELETE",
        credentials: "include",
        headers: recipeId ? { "Content-Type": "application/json" } : undefined,
        body: recipeId ? JSON.stringify({ recipeId }) : undefined
      });
      const result = await jsonOrThrow(response);

      setEntries((previous) => {
        const others = previous.filter((entry) => !(entry.day === day && entry.mealType === mealType));
        return recipeId ? [...others, result.entry] : others;
      });
      setDraftServings((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      await refreshGroceryList();
      await refreshNutrition();
      setProposal(null); // A manual change makes an older AI preview stale.
      if (recipeId) await analyzeWeek();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSavingSlot("");
    }
  }

  async function updateServings(day, mealType, servingsPlanned) {
    const key = `${day}-${mealType}`;
    if (savingSlot) return;
    setSavingSlot(key);
    setError("");
    setGroceryError("");
    try {
      const response = await fetch(`/api/meal-plans/${weekStart}/${day}/${mealType}/servings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servingsPlanned })
      });
      const result = await jsonOrThrow(response);
      setEntries((previous) => previous.map((entry) =>
        entry.day === day && entry.mealType === mealType ? result.entry : entry
      ));
      await refreshGroceryList();
      await refreshNutrition();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSlot("");
    }
  }

  async function generateAiPlan(event) {
    event.preventDefault();
    if (aiBusy || aiSaving || savingSlot) return;
    setAiBusy(true); setAiError(""); setAiStatus(""); setProposal(null);
    try {
      const response = await fetch(`/api/meal-plans/${weekStart}/suggestions`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: aiGoal, diet: aiDiet,
          maxMinutes: aiMaxMinutes === "any" ? "any" : Number(aiMaxMinutes),
          notes: aiNotes, overwriteExisting: aiReplace
        })
      });
      const result = await jsonOrThrow(response);
      setProposal(result);
      setAiStatus(`Generated ${result.suggestions.length} suggestions. Review them before saving.`);
    } catch (err) {
      setAiError(err.message);
    } finally { setAiBusy(false); }
  }

  async function applyAiPlan() {
    if (!proposal || aiSaving || proposal.weekStart !== weekStart) return;
    if (proposal.overwriteExisting && !window.confirm("Replace the currently planned meals with these suggestions?")) return;
    setAiSaving(true); setAiError(""); setAiStatus("");
    try {
      const response = await fetch(`/api/meal-plans/${weekStart}/apply-suggestions`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overwriteExisting: proposal.overwriteExisting,
          meals: proposal.suggestions.map((item) => ({ day: item.day, mealType: item.mealType, recipeId: item.recipe._id }))
        })
      });
      const result = await jsonOrThrow(response);
      setProposal(null);
      setAiStatus(`${result.saved} meals added to your week.`);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setAiError(err.message);
    } finally { setAiSaving(false); }
  }

  async function selectPickedRecipe(recipe) {
    if (!picker) return false;
    if (picker.mode === "preview") {
      setProposal((previous) => ({ ...previous,
        suggestions: previous.suggestions.map((item) => item.day === picker.day && item.mealType === picker.mealType
          ? { ...item, recipe, reason: "Changed manually before saving.", source: "manual" } : item)
      }));
      return true;
    }
    return updateSlot(picker.day, picker.mealType, recipe._id);
  }

  function saveServingDraft(day, mealType, currentServings) {
    const key = `${day}-${mealType}`;
    const input = String(draftServings[key] ?? currentServings).trim();
    setDraftServings((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    if (!/^[1-9]\d*$/.test(input) || Number(input) > 100) {
      setError("Servings must be a whole number between 1 and 100.");
      return;
    }
    const amount = Number(input);
    if (amount !== currentServings) updateServings(day, mealType, amount);
  }

  function setGroceryChecked(id, isChecked) {
    const updated = isChecked
      ? [...checkedItems.filter((checkedId) => checkedId !== id), id]
      : checkedItems.filter((checkedId) => checkedId !== id);
    setCheckedItems(updated);
    try { window.localStorage.setItem(checklistKey, JSON.stringify(updated)); } catch { /* Storage may be disabled. */ }
  }

  function exportPdf() {
    try {
      downloadGroceryListPdf({ weekStart, items: visibleItems, checkedIds: checkedItems, onlyUnchecked: exportOnlyUnchecked });
      setCopyMessage("");
    } catch {
      setCopyMessage("Couldn't create the PDF. Please try again.");
    }
  }

  const visibleItems = usePantry ? pantryAdjustedItems : items;
  const groupedItems = visibleItems.reduce((groups, item) => {
    const category = item.category || "Other";
    if (!groups[category]) groups[category] = [];
    groups[category].push(item);
    return groups;
  }, {});

  const maxDailyCalories = Math.max(1, ...(nutrition?.days || []).map((day) => Number(day?.totals?.calories) || 0));
  const canEdit = !loading && !savingSlot && !aiSaving && !aiBusy;
  const groceryText = visibleItems.map((item) => `- ${item.name}: ${item.amount}`).join("\n");

  async function copyGroceryList() {
    try {
      await navigator.clipboard.writeText(groceryText);
      setCopyMessage("Grocery list copied.");
    } catch {
      setCopyMessage("Unable to copy automatically. You can select the list manually.");
    }
  }

  return (
    <main className="main-content meal-planner">
      <section className="welcome meal-planner-welcome">
        <div>
          <p className="eyebrow">PLAN AHEAD, COOK BETTER</p>
          <h1>Meal Planner</h1>
          <p>Plan breakfast, lunch, and dinner, then build one grocery list for the week.</p>
        </div>
        <Link className="primary-button" to="/saved-recipes">Browse saved recipes</Link>
      </section>

      <details className="meal-planner-ai" aria-label="AI weekly meal suggestions">
        <summary className="meal-planner-ai-toggle">
          <span><strong>✨ Culinary AI meal suggestions</strong><small>Optional · Generate a suggested week using published recipes</small></span>
          <span aria-hidden="true" className="meal-planner-ai-chevron">⌄</span>
        </summary>
        <div className="meal-planner-ai-inner">
        <div className="meal-planner-ai-heading">
          <div><p className="eyebrow">SMART PLANNING</p><h2>Plan your week with Culinary AI</h2>
            <p>Get suggestions from real, published Culinary recipes. Nothing is saved until you approve the plan.</p></div>
        </div>
        <form onSubmit={generateAiPlan} className="meal-planner-ai-form">
          <label>Goal
            <select value={aiGoal} onChange={(event) => setAiGoal(event.target.value)} disabled={aiBusy || aiSaving}>
              <option value="balanced">Balanced variety</option><option value="highprotein">Higher protein</option>
              <option value="variety">Explore different recipes</option>
            </select>
          </label>
          <label>Diet
            <select value={aiDiet} onChange={(event) => setAiDiet(event.target.value)} disabled={aiBusy || aiSaving}>
              <option value="any">No restriction</option><option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>
          </label>
          <label>Maximum cooking time
            <select value={aiMaxMinutes} onChange={(event) => setAiMaxMinutes(event.target.value)} disabled={aiBusy || aiSaving}>
              <option value="any">No limit</option><option value="30">30 min</option><option value="45">45 min</option>
              <option value="60">60 min</option><option value="90">90 min</option><option value="120">120 min</option>
            </select>
          </label>
          <label className="meal-planner-ai-notes">Other preferences (optional)
            <textarea rows={2} maxLength={500} value={aiNotes} onChange={(event) => setAiNotes(event.target.value)}
              disabled={aiBusy || aiSaving} placeholder="e.g., Pakistani dinners, no repeated lunches" />
          </label>
          <label className="meal-planner-ai-checkbox">
            <input type="checkbox" checked={aiReplace} onChange={(event) => setAiReplace(event.target.checked)} disabled={aiBusy || aiSaving} />
            Replace meals already planned for this week
          </label>
          <button type="submit" disabled={aiBusy || aiSaving || Boolean(savingSlot)}>
            {aiBusy ? "Generating suggestions…" : "Suggest my week ✨"}
          </button>
        </form>
        <p className="meal-planner-ai-caution">Diet filters use recipe ingredient names and cannot guarantee allergen safety or nutritional targets. Check every recipe before cooking.</p>
        {aiError && <p role="alert" className="meal-planner-error">{aiError}</p>}
        {aiStatus && <p role="status">{aiStatus}</p>}
        {proposal?.weekStart === weekStart && (
          <div className="meal-planner-ai-preview">
            <div className="meal-planner-ai-preview-heading">
              <h3>Review suggestions ({proposal.suggestions.length} meals)</h3>
              <div className="meal-planner-ai-preview-actions">
                <button type="button" onClick={() => setProposal(null)} disabled={aiSaving}>Discard</button>
                <button type="button" onClick={applyAiPlan} disabled={aiSaving}>
                  {aiSaving ? "Saving…" : `Apply ${proposal.suggestions.length} meals`}
                </button>
              </div>
            </div>
            {proposal.suggestions.some((item) => item.source === "fallback") && <p>{proposal.suggestions.filter((item) => item.source === "fallback").length} slots use catalog fallbacks because the AI omitted a valid choice.</p>}
            <p>{proposal.overwriteExisting ? "Applying will replace the planned slots." : "Your existing meals will stay as they are."}</p>
            <ul className="meal-planner-ai-suggestions">
              {proposal.suggestions.map((suggestion) => (
                <li key={`${suggestion.day}-${suggestion.mealType}`}>
                  <div><strong>{DAY_NAMES[suggestion.day]} · {suggestion.mealType}</strong>
                    <span>{suggestion.recipe.title}</span>
                    {suggestion.reason && <small>{suggestion.reason}</small>}
                  </div>
                  <button type="button" onClick={() => setPicker({ day: suggestion.day, mealType: suggestion.mealType, mode: "preview" })} disabled={aiSaving}>Change</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </details>

      <section aria-label="Weekly meal calendar">
        <div className="meal-planner-toolbar">
          <div>
            <h2>Your week</h2>
            <p>{humanDate(dayDate(weekStart, 0))} – {humanDate(dayDate(weekStart, 6))}, {dayDate(weekStart, 6).getFullYear()}</p>
          </div>
          <div className="meal-planner-week-buttons">
            <button type="button" onClick={() => setWeekStart((value) => moveWeek(value, -1))} disabled={Boolean(savingSlot) || aiBusy || aiSaving} aria-label="Previous week">← Previous</button>
            <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))} disabled={Boolean(savingSlot) || aiBusy || aiSaving}>This week</button>
            <button type="button" onClick={() => setWeekStart((value) => moveWeek(value, 1))} disabled={Boolean(savingSlot) || aiBusy || aiSaving} aria-label="Next week">Next →</button>
          </div>
        </div>

        {loading && <p role="status">Loading meal plan…</p>}
        {error && <p role="alert" className="meal-planner-error">{error}</p>}

        <div className="meal-planner-mobile-day-selector" aria-label="Select a day">
          {DAY_NAMES.map((name, day) => (
            <button key={name} type="button" className={mobileDay === day ? "active" : ""}
              aria-pressed={mobileDay === day} onClick={() => setMobileDay(day)}>
              <span>{name.slice(0, 3)}</span><small>{dayDate(weekStart, day).getDate()}</small>
            </button>
          ))}
        </div>
        <div className="meal-planner-scroll" tabIndex={0} aria-label="Scrollable weekly meal planner">
          <div className="meal-planner-days">
            {DAY_NAMES.map((name, day) => (
              <article className={`meal-planner-day ${mobileDay === day ? "mobile-day-active" : ""}`} key={name}>
                <div className="meal-planner-day-heading">
                  <h3>{name}</h3>
                  <span>{humanDate(dayDate(weekStart, day))}</span>
                </div>
                {MEAL_TYPES.map((mealType) => {
                  const entry = entries.find((item) => item.day === day && item.mealType === mealType);
                  const slotKey = `${day}-${mealType}`;
                  return (
                    <div className="meal-planner-slot" key={mealType}>
                      <span className="meal-planner-slot-label">{mealType}</span>
                      <button type="button" className="meal-planner-pick-button"
                        onClick={() => setPicker({ day, mealType, mode: "planner" })} disabled={!canEdit}>
                        {entry?.recipe?.title || (entry && !entry.recipe ? "Recipe unavailable — choose another" : "+ Choose a recipe")}
                      </button>
                      {entry?.recipe && (
                        <div className="meal-planner-serving-input">
                          <label htmlFor={`planner-servings-${slotKey}`}>Servings to make</label>
                          <input
                            id={`planner-servings-${slotKey}`}
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            inputMode="numeric"
                            value={draftServings[slotKey] ?? String(entry.servingsPlanned ?? entry.recipe.servings ?? 1)}
                            disabled={!canEdit}
                            onChange={(event) => setDraftServings((previous) => ({ ...previous, [slotKey]: event.target.value }))}
                            onBlur={() => saveServingDraft(day, mealType, entry.servingsPlanned ?? entry.recipe.servings ?? 1)}
                            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                          />
                        </div>
                      )}
                      {entry?.recipe && (() => {
                        const mealNutrition = nutrition?.meals?.find((item) => item.day === day && item.mealType === mealType);
                        return mealNutrition?.totals ? (
                          <p className="meal-planner-mini-nutrition">
                            ~{mealNutrition.totals.calories} kcal · {mealNutrition.totals.protein}g protein
                            {mealNutrition.status === "partial" ? " (partial)" : ""}
                          </p>
                        ) : null;
                      })()}
                      {entry && (
                        <div className="meal-planner-slot-actions">
                          {entry.recipe ? <Link to={`/recipes/${entry.recipe._id}`}>View recipe</Link> : <span>Recipe removed or unpublished</span>}
                          <button type="button" onClick={() => updateSlot(day, mealType, "")} disabled={Boolean(savingSlot) || aiBusy || aiSaving}>Remove</button>
                        </div>
                      )}
                      {savingSlot === slotKey && <small role="status">Saving…</small>}
                    </div>
                  );
                })}
                {nutrition?.days?.[day]?.plannedMeals > 0 && (
                  <p className="meal-planner-day-nutrition">
                    Planned: ~{nutrition.days[day].totals.calories} kcal
                    {nutrition.days[day].incompleteMeals ? " (incomplete)" : ""}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="meal-planner-nutrition" aria-label="Weekly nutrition overview">
        <div className="meal-planner-grocery-heading">
          <div>
            <h2>Planned nutrition</h2>
            <p>Estimated calories and macros for meals scheduled this week — not actual food consumed.</p>
          </div>
          {nutrition?.uncalculatedRecipeIds?.length > 0 && (
            <button type="button" onClick={analyzeWeek} disabled={analyzingNutrition}>
              {analyzingNutrition ? "Analyzing…" : "Analyze remaining recipes"}
            </button>
          )}
        </div>
        {analyzingNutrition && <p role="status">Checking recipe ingredients against USDA FoodData Central…</p>}
        {nutritionError && <p className="meal-planner-error" role="alert">Nutrition: {nutritionError}</p>}
        {nutrition && nutrition.plannedMeals === 0 && <p>Schedule meals to see estimated nutrition.</p>}
        {nutrition?.plannedMeals > 0 && (
          <>
            <p className={nutrition.complete ? "nutrition-source" : "meal-planner-error"}>
              {nutrition.analyzedMeals} of {nutrition.plannedMeals} planned meals analyzed.
              {!nutrition.complete && " Totals are incomplete and may understate calories and macros."}
            </p>
            <h3>Week total</h3>
            <MacroValues values={nutrition.totals} />
            <h3>Average per calendar day</h3>
            <p className="nutrition-source">Across all 7 days, including days without scheduled meals; this is not a daily intake target.</p>
            <MacroValues values={nutrition.dailyAverage} />
            <h3>Planned calories by day</h3>
            <p className="nutrition-source">Bar heights show how planned days compare within this week—not a calorie target.</p>
            <div className="meal-planner-calorie-chart" role="img" aria-label={nutrition.days.map((day) => `${DAY_NAMES[day.day]}: ${day.plannedMeals ? `${day.totals.calories} estimated calories` : "no meals planned"}`).join("; ")}>
              {nutrition.days.map((day) => (
                <div className="meal-planner-calorie-day" key={day.day}>
                  <div className="meal-planner-calorie-track">
                    {day.plannedMeals > 0 && <div className="meal-planner-calorie-fill" style={{ height: `${Math.max(4, (Number(day.totals.calories) || 0) / maxDailyCalories * 100)}%` }} />}
                  </div>
                  <span>{DAY_NAMES[day.day].slice(0, 3)}</span>
                  <small>{day.plannedMeals > 0 ? `${Math.round(day.totals.calories)} kcal` : "—"}</small>
                </div>
              ))}
            </div>
            <h3>Day-by-day breakdown</h3>
            <div className="meal-planner-nutrition-scroll">
              <table className="meal-planner-nutrition-table">
                <thead><tr><th>Day</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th></tr></thead>
                <tbody>
                  {nutrition.days.map((dayData) => (
                    <tr key={dayData.day}>
                      <th scope="row">{DAY_NAMES[dayData.day]}{dayData.incompleteMeals ? " *" : ""}</th>
                      {dayData.plannedMeals > 0 ? <>
                        <td>{dayData.totals.calories} kcal</td>
                        <td>{dayData.totals.protein}g</td>
                        <td>{dayData.totals.carbs}g</td>
                        <td>{dayData.totals.fat}g</td>
                        <td>{dayData.totals.fiber}g</td>
                      </> : <td colSpan={5} className="meal-nutrition-unplanned">No meals planned</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nutrition-source">* Incomplete: an ingredient could not be measured or matched, or a meal has not been analyzed. Count and volume conversions are approximate. Averages include all seven days.</p>
          </>
        )}
      </section>

      <section className="meal-planner-groceries" aria-label="Grocery list">
        <div className="meal-planner-grocery-heading">
          <div>
            <h2>Automatic grocery list</h2>
            <p>Scaled to planned servings. Compatible mass and volume units are combined (1 cup = 240 ml). Pantry stock is never automatically consumed.</p>
          </div>
          <div className="meal-planner-export-controls">
            <label className="meal-planner-export-option">
              <input type="checkbox" checked={usePantry} onChange={(event) => setUsePantry(event.target.checked)} />
              Subtract my pantry
            </label>
            <Link to="/pantry">Manage pantry</Link>
            <label className="meal-planner-export-option">
              <input type="checkbox" checked={exportOnlyUnchecked} onChange={(event) => setExportOnlyUnchecked(event.target.checked)} />
              Only unchecked
            </label>
            <button type="button" onClick={copyGroceryList} disabled={!visibleItems.length}>Copy list</button>
            <button type="button" onClick={exportPdf} disabled={!visibleItems.length}>Download PDF</button>
          </div>
        </div>
        {usePantry && (pantryCovered > 0 || pantryPartiallyCovered > 0) && (
          <p role="status">Your pantry covers {pantryCovered} complete grocery lines and reduces {pantryPartiallyCovered} more. Known quantities only.</p>
        )}
        {copyMessage && <p role="status">{copyMessage}</p>}
        {groceryError && <p role="alert" className="meal-planner-error">{groceryError}</p>}
        {!loading && !groceryError && visibleItems.length === 0 && <p>{items.length ? "Your pantry covers all measurable ingredients for this week." : "No ingredients yet. Add recipes to your week."}</p>}
        {visibleItems.length > 0 && Object.entries(groupedItems).map(([category, groupItems]) => (
          <div className="meal-planner-grocery-group" key={category}>
            <h3>{category}</h3>
            <ul className="meal-planner-grocery-items">
              {groupItems.map((item) => {
                const checked = checkedItems.includes(item.id);
                return (
                  <li key={item.id}>
                    <label className={checked ? "meal-planner-checked" : ""}>
                      <input type="checkbox" checked={checked} onChange={(event) => setGroceryChecked(item.id, event.target.checked)} />
                      <span>{item.name}</span>
                      <span className="meal-planner-grocery-amount">{item.amount}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
      <MealRecipePicker open={Boolean(picker)}
        title={picker ? `Choose ${DAY_NAMES[picker.day]} ${picker.mealType}` : "Choose recipe"}
        disabled={Boolean(savingSlot) || aiSaving || aiBusy} onClose={() => setPicker(null)} onSelect={selectPickedRecipe} />
    </main>
  );
}
