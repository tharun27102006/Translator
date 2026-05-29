const STORAGE_KEY = "cityvoice-comments-v2";
const LEGACY_STORAGE_KEY = "cityvoice-comments-v1";
const CLIENT_KEY = "cityvoice-client-id";

const form = document.getElementById("commentForm");
const commentInput = document.getElementById("commentInput");
const formMessage = document.getElementById("formMessage");
const cityStatus = document.getElementById("cityStatus");
const commentsList = document.getElementById("commentsList");
const emptyState = document.getElementById("emptyState");
const commentTemplate = document.getElementById("commentTemplate");
const targetLanguage = document.getElementById("targetLanguage");

const clientId = getOrCreateClientId();
let currentCity = "Unknown City";
let comments = loadComments();

init();

function init() {
  clearLegacyComments();
  renderComments();
  detectCity();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlePostComment();
  });
}

function clearLegacyComments() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function getOrCreateClientId() {
  const existing = localStorage.getItem(CLIENT_KEY);
  if (existing) {
    return existing;
  }

  const id = "u-" + crypto.randomUUID();
  localStorage.setItem(CLIENT_KEY, id);
  return id;
}

function loadComments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveComments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
}

function showFormMessage(message, isError = true) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "#b91c1c" : "#0f766e";
}

function handlePostComment() {
  const text = commentInput.value.trim();

  if (!text) {
    showFormMessage("Comment cannot be empty.");
    return;
  }

  // Block symbols while allowing all scripts and basic punctuation.
  const hasInvalidChars = /[^\p{L}\p{N}\s.,!?"'\-:;]/u.test(text);
  if (hasInvalidChars) {
    showFormMessage("Comment blocked: special characters are not allowed.");
    return;
  }

  const comment = {
    id: crypto.randomUUID(),
    text,
    city: currentCity,
    createdAt: new Date().toISOString(),
    likes: 0,
    dislikes: 0,
    voters: {}
  };

  comments.unshift(comment);
  saveComments();
  renderComments();

  commentInput.value = "";
  showFormMessage("Comment posted.", false);
}

async function detectCity() {
  try {
    cityStatus.textContent = "Detecting city...";

    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) {
      throw new Error("Failed city lookup");
    }

    const data = await response.json();
    if (data && data.city) {
      currentCity = data.city;
      cityStatus.textContent = "Your city: " + currentCity;
      return;
    }

    cityStatus.textContent = "City unavailable";
  } catch {
    cityStatus.textContent = "City unavailable";
  }
}

function renderComments() {
  commentsList.innerHTML = "";
  emptyState.classList.toggle("hidden", comments.length !== 0);

  for (const comment of comments) {
    const fragment = commentTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".comment-card");

    const cityEl = fragment.querySelector(".comment-city");
    const timeEl = fragment.querySelector(".comment-time");
    const textEl = fragment.querySelector(".comment-text");
    const translatedEl = fragment.querySelector(".translated-text");

    const likeBtn = fragment.querySelector(".like");
    const dislikeBtn = fragment.querySelector(".dislike");
    const translateBtn = fragment.querySelector(".translate");

    cityEl.textContent = "City: " + (comment.city || "Unknown City");
    timeEl.textContent = new Date(comment.createdAt).toLocaleString();
    textEl.textContent = comment.text;

    likeBtn.querySelector(".like-count").textContent = String(comment.likes || 0);
    dislikeBtn.querySelector(".dislike-count").textContent = String(comment.dislikes || 0);

    likeBtn.addEventListener("click", () => {
      castVote(comment.id, "like");
    });

    dislikeBtn.addEventListener("click", () => {
      castVote(comment.id, "dislike");
    });

    translateBtn.addEventListener("click", async () => {
      translateBtn.disabled = true;
      translateBtn.textContent = "Translating...";

      const translated = await translateText(comment.text, targetLanguage.value);
      if (translated) {
        translatedEl.textContent = translated;
        translatedEl.classList.remove("hidden");
      } else {
        translatedEl.textContent = "Translation unavailable right now.";
        translatedEl.classList.remove("hidden");
      }

      translateBtn.disabled = false;
      translateBtn.textContent = "Translate";
    });

    card.dataset.id = comment.id;
    commentsList.appendChild(fragment);
  }
}

function castVote(commentId, action) {
  const index = comments.findIndex((comment) => comment.id === commentId);
  if (index === -1) {
    return;
  }

  const comment = comments[index];
  if (!comment.voters) {
    comment.voters = {};
  }

  const previousVote = comment.voters[clientId];

  if (previousVote === action) {
    return;
  }

  if (previousVote === "like") {
    comment.likes = Math.max(0, comment.likes - 1);
  }

  if (previousVote === "dislike") {
    comment.dislikes = Math.max(0, comment.dislikes - 1);
  }

  comment.voters[clientId] = action;

  if (action === "like") {
    comment.likes += 1;
  }

  if (action === "dislike") {
    comment.dislikes += 1;
  }

  // Auto-moderation: remove after reaching 2 dislikes.
  if (comment.dislikes >= 2) {
    comments.splice(index, 1);
    saveComments();
    renderComments();
    return;
  }

  saveComments();
  renderComments();
}

async function translateText(text, targetLang) {
  const safeText = text.trim();
  if (!safeText) {
    return "";
  }

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: safeText,
        targetLang
      })
    });

    if (!response.ok) {
      throw new Error("Translate API request failed");
    }

    const data = await response.json();
    return data.translation || "";
  } catch {
    return "";
  }
}
