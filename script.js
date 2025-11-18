// --- DOM elements ---
const randomBtn = document.getElementById("random-btn");
const recipeDisplay = document.getElementById("recipe-display");
const remixBtn = document.getElementById("remix-btn");
const remixOutput = document.getElementById("remix-output");
const remixThemeSelect = document.getElementById("remix-theme");

// Make remix output an ARIA live region so screen readers announce loading and
// error updates. Use a small guard in case the element isn't present.
if (remixOutput) {
  remixOutput.setAttribute('aria-live', 'polite');
  remixOutput.setAttribute('role', 'status');
}

// Keep track of the currently displayed recipe so the Remix button can use it
let currentRecipe = null;

// Saved recipes UI elements and storage key
const savedContainer = document.getElementById('saved-recipes-container');
const savedList = document.getElementById('saved-recipes-list');
const SAVED_RECIPES_KEY = 'savedRecipes';

// This function creates a list of ingredients for the recipe from the API data
// It loops through the ingredients and measures, up to 20, and returns an HTML string
// that can be used to display them in a list format
// If an ingredient is empty or just whitespace, it skips that item 
function getIngredientsHtml(recipe) {
  let html = "";
  for (let i = 1; i <= 20; i++) {
    const ing = recipe[`strIngredient${i}`];
    const meas = recipe[`strMeasure${i}`];
    if (ing && ing.trim()) html += `<li>${meas ? `${meas} ` : ""}${ing}</li>`;
  }
  return html;
}

// This function displays the recipe on the page
function renderRecipe(recipe) {
  // store current recipe globally so other functions (like remix) can access it
  currentRecipe = recipe;

  recipeDisplay.innerHTML = `
    <div class="recipe-title-row">
      <h2>${recipe.strMeal}</h2>
    </div>
    <img src="${recipe.strMealThumb}" alt="${recipe.strMeal}" />
    <h3>Ingredients:</h3>
    <ul>${getIngredientsHtml(recipe)}</ul>
    <h3>Instructions:</h3>
    <p>${recipe.strInstructions.replace(/\r?\n/g, "<br>")}</p>
    <div class="save-row">
      <button id="save-recipe-btn" class="main-btn">Save Recipe</button>
    </div>
  `;

  // Hook up Save button after rendering
  const saveBtn = document.getElementById('save-recipe-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (!currentRecipe || !currentRecipe.strMeal) {
        // friendly UI feedback if no recipe is loaded
        recipeDisplay.insertAdjacentHTML('beforeend', '<p>Please load a recipe before saving.</p>');
        return;
      }
      saveRecipeName(currentRecipe.strMeal);
    });
  }
}

// --- Saved recipes (localStorage) helpers ---
function getSavedRecipes() {
  try {
    const raw = localStorage.getItem(SAVED_RECIPES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading saved recipes from localStorage', err);
    return [];
  }
}

function setSavedRecipes(list) {
  try {
    localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Error saving recipes to localStorage', err);
  }
}

function saveRecipeName(name) {
  const list = getSavedRecipes();
  if (!list.includes(name)) {
    list.push(name);
    setSavedRecipes(list);
    renderSavedRecipesList();
  }
}

function renderSavedRecipesList() {
  const list = getSavedRecipes();
  // show or hide the container depending on whether there are saved recipes
  if (!savedContainer || !savedList) return;
  if (list.length === 0) {
    savedContainer.style.display = 'none';
    savedList.innerHTML = '';
    return;
  }

  savedContainer.style.display = '';
  savedList.innerHTML = '';
  list.forEach(name => {
    const li = document.createElement('li');
    li.className = 'saved-recipe-item';

    // recipe name text
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    nameSpan.className = 'saved-recipe-name';
    nameSpan.style.cursor = 'pointer';
    nameSpan.title = 'Click to load this recipe';

    // delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'delete-saved-recipe-btn';
    delBtn.style.marginLeft = '8px';

    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSavedRecipe(name);
    });

    // clicking the name loads the full recipe from MealDB
    nameSpan.addEventListener('click', () => {
      fetchAndDisplayRecipeByName(name);
    });

    li.appendChild(nameSpan);
    li.appendChild(delBtn);
    savedList.appendChild(li);
  });
}

function deleteSavedRecipe(name) {
  const list = getSavedRecipes();
  const filtered = list.filter(n => n !== name);
  setSavedRecipes(filtered);
  renderSavedRecipesList();
}

// Fetch a recipe by name from TheMealDB and display it using renderRecipe.
// Uses the MealDB search endpoint: https://www.themealdb.com/api/json/v1/1/search.php?s=NAME
async function fetchAndDisplayRecipeByName(name) {
  if (!name) return;
  recipeDisplay.innerHTML = '<p>Loading recipe...</p>';
  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MealDB error: ${res.status}`);
    const data = await res.json();
    const recipe = data?.meals?.[0];
    if (!recipe) {
      recipeDisplay.innerHTML = `<p>Sorry, I couldn't find the recipe "${name}".</p>`;
      return;
    }
    // renderRecipe will set currentRecipe and update the UI
    renderRecipe(recipe);
  } catch (err) {
    console.error('Error fetching recipe by name', err);
    recipeDisplay.innerHTML = '<p>Sorry — could not load that recipe right now. Please try again later.</p>';
  }
}

// Load saved recipes on startup
function loadSavedRecipesOnStart() {
  renderSavedRecipesList();
}

// Run loader so saved recipes are shown when the page loads
loadSavedRecipesOnStart();

// --- Remix functionality ---
// This function sends the raw recipe JSON and the selected theme to OpenAI's
// Chat Completions API and returns the assistant's text reply.
// Uses the global OPENAI_API_KEY set in `secrets.js` (no imports/exports needed).
async function remixRecipe(recipeJson, theme) {
  // Prepare a compact recipe representation to send to the model
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ing = recipeJson[`strIngredient${i}`];
    const meas = recipeJson[`strMeasure${i}`];
    if (ing && ing.trim()) ingredients.push(`${meas ? meas + ' ' : ''}${ing}`);
  }

  const userPrompt = `Here is a recipe in JSON format:\n${JSON.stringify(recipeJson, null, 2)}\n\n` +
    `Remix theme: "${theme}"\n\n` +
    `Please produce a short, fun, creative, and totally doable remix of the recipe. ` +
    `Highlight any changed ingredients (bullet list) and changed or new cooking steps. ` +
    `Keep it concise and actionable so someone can follow it in the kitchen. ` +
    `If nothing needs to change for the theme, say so and offer one optional twist. ` +
    `Only return the remixed recipe (no extraneous commentary).`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // `OPENAI_API_KEY` comes from `secrets.js` which is already loaded in the page
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: "You are a playful, concise, and helpful recipe remixing assistant." },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    // Follow OpenAI chat completions response shape
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error("Empty reply from OpenAI");
    return reply;
  } catch (err) {
    // Bubble up the error so the caller can show a friendly message
    throw err;
  }
}

// Click handler for the Remix button. Shows a friendly loading message,
// calls `remixRecipe`, and displays the result or a friendly error.
if (remixBtn) {
  remixBtn.addEventListener("click", async () => {
    // Basic guard: ensure there is a recipe loaded
    if (!currentRecipe) {
      remixOutput.innerHTML = `<p>Please load a recipe first (click "Surprise Me Again!").</p>`;
      return;
    }

    const theme = remixThemeSelect?.value || "Make it interesting";

    // Friendly loading message while we wait for the AI
    remixOutput.innerHTML = `<p>Stirring the idea pot... your remix is being prepared 🥄</p>`;

    try {
      const remixText = await remixRecipe(currentRecipe, theme);
      // Display the AI reply. Keep simple HTML wrapping to preserve line breaks.
      remixOutput.innerHTML = `<div class="remix-result">${remixText
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br>")}</div>`;
    } catch (err) {
      console.error("Remix error:", err);
      remixOutput.innerHTML = `<p>Sorry — I couldn't prepare a remix just now. Please try again in a moment.</p>`;
    }
  });
}

// This function gets a random recipe from the API and shows it
async function fetchAndDisplayRandomRecipe() {
  recipeDisplay.innerHTML = "<p>Loading...</p>"; // Show loading message
  try {
    // Fetch a random recipe from the MealDB API
    const res = await fetch('https://www.themealdb.com/api/json/v1/1/random.php');
    const data = await res.json(); // Parse the JSON response
    const recipe = data?.meals?.[0]; // Get the first recipe from the response
    if (!recipe) throw new Error('No recipe returned from MealDB');

    // Render the recipe into the page (this also sets currentRecipe)
    renderRecipe(recipe);

  } catch (error) {
    recipeDisplay.innerHTML = "<p>Sorry, couldn't load a recipe.</p>";
  }
}


// --- Event listeners ---
// When the button is clicked, get and show a new random recipe
if (randomBtn) {
  randomBtn.addEventListener('click', fetchAndDisplayRandomRecipe);
}

// When the page loads, show a random recipe right away
// (also ensures currentRecipe is set so other features work)
fetchAndDisplayRandomRecipe();