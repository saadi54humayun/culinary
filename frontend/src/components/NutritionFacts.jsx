import "./NutritionFacts.css";

const METRICS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" }
];

export function MacroValues({ values }) {
  if (!values) return null;
  return (
    <div className="nutrition-macros">
      {METRICS.map(({ key, label, unit }) => (
        <div className="nutrition-macro" key={key}>
          <span>{label}</span>
          <strong>{Number(values[key] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>
          <small>{unit}</small>
        </div>
      ))}
    </div>
  );
}

export default function NutritionFacts({ nutrition, loading, error }) {
  return (
    <section className="nutrition-facts" aria-label="Estimated recipe nutrition">
      <h2>Estimated nutrition</h2>
      <p>USDA FoodData Central estimates, per serving. Not a laboratory measurement.</p>
      {loading && <p role="status">Analyzing recipe ingredients…</p>}
      {error && <p role="alert" className="nutrition-warning">{error}</p>}
      {nutrition?.status === "unavailable" && (
        <p className="nutrition-warning">Nutrition could not be estimated from the supplied quantities and ingredients.</p>
      )}
      {nutrition?.status && nutrition.status !== "unavailable" && (
        <>
          <MacroValues values={nutrition.perServing} />
          {nutrition.status === "partial" && (
            <p className="nutrition-warning" role="status">
              Partial estimate: {nutrition.missingIngredients?.length || 0} ingredient(s) not included. Totals are understated.
            </p>
          )}
          <p className="nutrition-source">Matched {nutrition.matchedCount} of {nutrition.ingredientCount} ingredients. Weights for counts/cups may be approximate.</p>
        </>
      )}
      {nutrition?.missingIngredients?.length > 0 && (
        <details>
          <summary>Ingredients needing clarification</summary>
          <ul>
            {nutrition.missingIngredients.map((item, index) => (
              <li key={`${item.name}-${index}`}>{item.name}: {item.reason}</li>
            ))}
          </ul>
        </details>
      )}
      {nutrition?.matches?.length > 0 && (
        <details>
          <summary>USDA ingredient matches</summary>
          <ul>
            {nutrition.matches.map((item, index) => (
              <li key={`${item.fdcId}-${index}`}>
                {item.name}: {item.matchedFood} ({item.grams} g{item.approximateWeight ? ", approximate weight" : ""})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
