const ALLOWED_LANGS = new Set(["en", "es", "fr", "de", "hi", "ta", "ar", "ja", "zh"]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { text, targetLang } = req.body || {};
    const safeText = typeof text === "string" ? text.trim() : "";
    const safeLang = typeof targetLang === "string" ? targetLang.trim().toLowerCase() : "";

    if (!safeText) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    if (!ALLOWED_LANGS.has(safeLang)) {
      res.status(400).json({ error: "Unsupported language" });
      return;
    }

    const translation = await translateWithFallbacks(safeText, safeLang);
    if (!translation) {
      res.status(502).json({ error: "Translation service unavailable" });
      return;
    }

    res.status(200).json({ translation });
  } catch {
    res.status(500).json({ error: "Unexpected translation error" });
  }
};

async function translateWithFallbacks(text, targetLang) {
  const providers = [
    () => translateWithGoogle(text, targetLang),
    () => translateWithLibre(text, targetLang)
  ];

  for (const provider of providers) {
    try {
      const translated = await provider();
      if (translated && translated.trim()) {
        return translated.trim();
      }
    } catch {
      // Continue to next provider.
    }
  }

  return "";
}

async function translateWithGoogle(text, targetLang) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=" +
    encodeURIComponent(targetLang) +
    "&q=" +
    encodeURIComponent(text);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Google provider failed");
  }

  const data = await response.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Invalid Google response");
  }

  const parts = data[0]
    .map((chunk) => (Array.isArray(chunk) ? chunk[0] : ""))
    .filter(Boolean);

  return parts.join("");
}

async function translateWithLibre(text, targetLang) {
  const response = await fetch("https://translate.argosopentech.com/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      q: text,
      source: "auto",
      target: targetLang,
      format: "text"
    })
  });

  if (!response.ok) {
    throw new Error("Libre provider failed");
  }

  const data = await response.json();
  return data.translatedText || "";
}
