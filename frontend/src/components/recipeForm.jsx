import { useEffect, useRef, useState } from "react";

export default function RecipeForm({ onCancel, onCreated, onUpdated, initialRecipe = null }) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState(initialRecipe?.imageUrl ?? "");
    const [previewUrl, setPreviewUrl] = useState("");
    const previewUrlRef = useRef("");
    const [title, setTitle] = useState(initialRecipe?.title ?? "");
    const [description, setDescription] = useState(
        initialRecipe?.description ?? ""
    );

    const [ingredients, setIngredients] = useState(
        initialRecipe?.ingredients ??
        [{ name: "", quantity: "", unit: "" }]
    );

    const [stepsText, setStepsText] = useState(
        initialRecipe?.steps?.join("\n") ?? ""
    );

    const [prepTimeMinutes, setPrepTimeMinutes] = useState(
        initialRecipe?.prepTimeMinutes ?? ""
    );

    const [cookTimeMinutes, setCookTimeMinutes] = useState(
        initialRecipe?.cookTimeMinutes ?? ""
    );

    const [servings, setServings] = useState(
        initialRecipe?.servings ?? "1"
    );
    const [category, setCategory] = useState(initialRecipe?.category ?? "other");
    const [equipment, setEquipment] = useState(initialRecipe?.equipment ?? []);
    const [equipmentDeclared, setEquipmentDeclared] = useState(Boolean(initialRecipe?.equipmentDeclared));

    function updateIngredient(index, field, value) {
        setIngredients((previous) =>
            previous.map((ingredient, currentIndex) =>
                currentIndex === index
                    ? { ...ingredient, [field]: value }
                    : ingredient
            )
        );
    }

    function addIngredient() {
        setIngredients((previous) => [
            ...previous,
            { name: "", quantity: "", unit: "" }
        ]);
    }

    async function handleSubmit(event, saveMode = "published") {
        event?.preventDefault();
        setError("");

        const steps = stepsText
            .split("\n")
            .map((step) => step.trim())
            .filter((step) => step !== "");

        if (!title.trim()) {
            setError("Add a title before saving your recipe.");
            return;
        }

        if (saveMode === "published" && (
            ingredients.some((ingredient) => !ingredient.name.trim()) ||
            steps.length === 0
        )) {
            setError("Add a title, a name for every ingredient, and at least one step.");
            return;
        }

        const recipeData = {
            title: title.trim(),
            description: description.trim(),
            ingredients: ingredients
                .filter((ingredient) => ingredient.name.trim())
                .map((ingredient) => ({
                name: ingredient.name.trim(),
                quantity: ingredient.quantity.trim(),
                unit: ingredient.unit.trim()
                })),
            steps,
            category,
            equipment: equipmentDeclared ? equipment : undefined,
            equipmentDeclared,
            status: initialRecipe?.status === "published" ? undefined : saveMode
        };

        if (prepTimeMinutes !== "") recipeData.prepTimeMinutes = Number(prepTimeMinutes);
        if (cookTimeMinutes !== "") recipeData.cookTimeMinutes = Number(cookTimeMinutes);
        if (servings !== "") recipeData.servings = Number(servings);

        setSaving(true);

        try {

            let savedImageUrl = imageUrl;

            if (imageFile) {
                const formData = new FormData();
                formData.append("image", imageFile);

                const uploadResponse = await fetch("/api/uploads/recipe-image", {
                    method: "POST",
                    credentials: "include",
                    body: formData
                });

                const uploadData = await uploadResponse.json();

                if (!uploadResponse.ok) {
                    throw new Error(uploadData.message || "Image upload failed.");
                }

                savedImageUrl = uploadData.imageUrl;

                // Keep the uploaded URL if saving the recipe fails afterward.
                setImageUrl(savedImageUrl);
                if (previewUrlRef.current) {
                    URL.revokeObjectURL(previewUrlRef.current);
                    previewUrlRef.current = "";
                    setPreviewUrl("");
                }
                setImageFile(null);
            }

            recipeData.imageUrl = savedImageUrl;
            const url = initialRecipe
                ? `/api/recipes/${initialRecipe._id}`
                : "/api/recipes";

            const response = await fetch(url, {
                method: initialRecipe ? "PATCH" : "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(recipeData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to save your recipe.");
            }

            if (initialRecipe) {
                onUpdated(data.recipe);
            } else {
                onCreated(data.recipe);
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setSaving(false);
        }
    }


    useEffect(() => () => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    }, []);

    function handleImageChange(event) {
        const file = event.target.files?.[0];

        setError("");

        if (!file) return;

        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

        if (!allowedTypes.includes(file.type)) {
            setError("Choose a JPEG, PNG, or WebP image.");
            event.target.value = "";
            return;
        }

        if (file.size > 4 * 1024 * 1024) {
            setError("Your image must be 4 MB or smaller.");
            event.target.value = "";
            return;
        }

        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const localUrl = URL.createObjectURL(file);
        previewUrlRef.current = localUrl;
        setPreviewUrl(localUrl);
        setImageFile(file);
    }

    return (
        <form className="recipe-form" onSubmit={(event) => handleSubmit(event, "published")} noValidate>
            <label htmlFor="recipe-image">Recipe photo</label>
            <input
                id="recipe-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                disabled={saving}
            />

            <p>Optional. JPEG, PNG, or WebP, up to 4 MB.</p>

            {(previewUrl || imageUrl) && (
                <img
                    className="recipe-image-preview"
                    src={previewUrl || imageUrl}
                    alt="Recipe photo preview"
                />
            )}
            <h2>{initialRecipe ? "Edit recipe" : "Create a recipe"}</h2>

            <label htmlFor="recipe-title">Recipe title</label>
            <input
                id="recipe-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="For example, Simple Omelette"
                maxLength={120}
            />

            <label htmlFor="recipe-category">Category</label>
            <select
                id="recipe-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
            >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
                <option value="dessert">Dessert</option>
                <option value="drink">Drink</option>
                <option value="other">Other</option>
            </select>

            <fieldset className="recipe-equipment">
                <legend>Equipment</legend>
                <p>Check every item your recipe requires. Leave this unconfirmed for older or incomplete recipes.</p>
                {[
                    ["oven", "Oven"], ["stovetop", "Stovetop"], ["microwave", "Microwave"],
                    ["air-fryer", "Air fryer"], ["grill", "Grill"], ["slow-cooker", "Slow cooker"],
                    ["blender", "Blender"], ["none", "No equipment"]
                ].map(([value, label]) => (
                    <label key={value}>
                        <input type="checkbox" checked={equipment.includes(value)} onChange={(event) => {
                            setEquipmentDeclared(true);
                            setEquipment((previous) => event.target.checked ? [...previous, value] : previous.filter((item) => item !== value));
                        }} />
                        {label}
                    </label>
                ))}
            </fieldset>

            <label htmlFor="recipe-description">Description</label>
            <textarea
                id="recipe-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Tell us a little about your recipe"
                maxLength={1000}
                rows={3}
            />

            <h3>Ingredients</h3>

            {ingredients.map((ingredient, index) => (
                <fieldset key={index}>
                    <legend>Ingredient {index + 1}</legend>

                    <label>
                        Name
                        <input
                            type="text"
                            value={ingredient.name}
                            onChange={(event) =>
                                updateIngredient(index, "name", event.target.value)
                            }
                            placeholder="For example, Oil"
                        />
                    </label>

                    <label>
                        Quantity
                        <input
                            type="text"
                            value={ingredient.quantity}
                            onChange={(event) =>
                                updateIngredient(index, "quantity", event.target.value)
                            }
                            placeholder="For example, 1 or 1/2"
                        />
                    </label>

                    <label>
                        Unit
                        <input
                            type="text"
                            value={ingredient.unit}
                            onChange={(event) =>
                                updateIngredient(index, "unit", event.target.value)
                            }
                            placeholder="For example, tsp"
                        />
                    </label>
                </fieldset>
            ))}

            <button type="button" onClick={addIngredient}>
                + Add ingredient
            </button>


            <label htmlFor="recipe-steps">Cooking steps</label>
            <textarea
                id="recipe-steps"
                value={stepsText}
                onChange={(event) => setStepsText(event.target.value)}
                placeholder={"Beat the eggs.\nHeat oil in a pan.\nAdd the eggs and cook."}
                rows={5}
                aria-describedby="steps-help"
            />
            <p id="steps-help">Write each step on a separate line.</p>

            <label htmlFor="prep-time">Preparation time (minutes)</label>
            <input
                id="prep-time"
                type="number"
                min="0"
                step="1"
                value={prepTimeMinutes}
                onChange={(event) => setPrepTimeMinutes(event.target.value)}
            />

            <label htmlFor="cook-time">Cooking time (minutes)</label>
            <input
                id="cook-time"
                type="number"
                min="0"
                step="1"
                value={cookTimeMinutes}
                onChange={(event) => setCookTimeMinutes(event.target.value)}
            />

            <label htmlFor="recipe-servings">Servings</label>
            <input
                id="recipe-servings"
                type="number"
                min="1"
                step="1"
                value={servings}
                onChange={(event) => setServings(event.target.value)}
            />

            {error && <p role="alert">{error}</p>}

            {initialRecipe?.status !== "published" && (
                <button type="button" onClick={() => handleSubmit(null, "draft")} disabled={saving}>
                    {saving ? "Saving…" : "Save draft"}
                </button>
            )}

            <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : initialRecipe?.status === "draft" ? "Publish recipe" : "Save recipe"}
            </button>

            <button type="button" onClick={onCancel} disabled={saving}>
                Cancel
            </button>
        </form>
    );
}
