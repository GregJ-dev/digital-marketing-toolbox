const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { scanUrls } = require("./services/scanner");

const app = express();
const PORT = 3000;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const HISTORY_DIR = path.join(__dirname, "history");

// Middleware
app.use(cors());
app.use(express.json());

// 🔧 Crée le dossier /history si absent
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR);
  console.log("📁 Dossier /history créé");
}

// ✅ Test de démarrage
console.log("✅ Démarrage du fichier server.js...");

// 🔍 Recherche via SERP API
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Requête vide" });

  try {
    const response = await axios.get("https://serpapi.com/search", {
      params: {
        engine: "google",
        q: query,
        num: 50,
        api_key: SERPAPI_KEY,
        gl: "fr",
        hl: "fr",
        google_domain: "google.fr"
      }
    });

    const organic = response.data.organic_results || [];
    const ads = [
      ...(response.data.ads || []),
      ...(response.data.top_ads || []),
      ...(response.data.bottom_ads || [])
    ];
    const shopping = response.data.shopping_results || [];

    const results = [
      ...organic.map(result => ({ title: result.title, link: result.link, type: "seo" })),
      ...ads.map(result => ({ title: result.title, link: result.link, type: "ads" })),
      ...shopping.map(result => ({ title: result.title, link: result.link, type: "shopping" }))
    ].filter(result => result.link);

    console.log(`🔍 Recherche "${query}" : ${results.length} résultats`);
    res.json(results);
  } catch (err) {
    console.error("❌ Erreur SERP API :", err.message);
    res.status(500).json({ error: "Erreur lors de la recherche Google" });
  }
});

// 🔄 Scan des URLs avec Playwright
app.post("/scan", async (req, res) => {
  const urls = req.body.urls;
  const query = req.body.query || "manuel";
  const type = req.body.type || "manual";

  if (!Array.isArray(urls)) {
    return res.status(400).json({ error: "Le corps de la requête doit contenir une liste d'URLs." });
  }

  try {
    const results = await scanUrls(urls);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeQuery = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 30);
    const filename = `scan-${timestamp}-${safeQuery}-${type}.json`;

    const historyData = {
      query,
      date: new Date().toISOString(),
      type,
      results
    };

    fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(historyData, null, 2));
    console.log("📦 Scan sauvegardé :", filename);

    res.json(results);
  } catch (err) {
    console.error("❌ Erreur Playwright :", err.message);
    res.status(500).json({ error: "Erreur lors du scan", details: err.message });
  }
});

// 📁 Liste des fichiers d'historique
app.get("/history", (req, res) => {
  try {
    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith(".json"));

    const summaries = files.map(filename => {
      const fullPath = path.join(HISTORY_DIR, filename);
    
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    
        const date = data.date || fs.statSync(fullPath).mtime.toISOString();
        const query = data.query || "(aucune requête)";
        const results = Array.isArray(data.results) ? data.results : [];
    
        const numDomains = results.length;
        const avgScore = numDomains > 0
          ? (results.reduce((acc, item) => acc + (item.rgpdScore || 0), 0) / numDomains).toFixed(1)
          : "N/A";
    
        return {
          filename,
          date,
          query,
          numDomains,
          avgScore
        };
      } catch (err) {
        console.warn("⚠️ Fichier ignoré (non lisible ou invalide) :", filename);
        return null; // ← clé ici !
      }
    }).filter(Boolean); // ← on garde uniquement les fichiers valides
    

    // Tri par date décroissante
    summaries.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(summaries);
  } catch (err) {
    console.error("❌ Erreur lecture historique :", err);
    res.status(500).json({ error: "Erreur lecture historique", details: err.message });
  }
});


// 📄 Récupération d’un fichier
app.get("/history/:filename", (req, res) => {
  const file = req.params.filename;
  const fullPath = path.join(HISTORY_DIR, file);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Fichier non trouvé" });
  }

  try {
    const data = fs.readFileSync(fullPath, "utf8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: "Erreur lecture fichier", details: err.message });
  }
});

// 🚀 Lancement
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});

// 🗑️ Suppression d’un fichier historique
app.delete("/history/:filename", (req, res) => {
  const file = req.params.filename;
  console.log("🧪 Demande de suppression :", file);
  const fullPath = path.join(HISTORY_DIR, file);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Fichier non trouvé" });
  }

  try {
    fs.unlinkSync(fullPath);
    console.log("🗑️ Fichier supprimé :", file);
    res.json({ success: true, filename: file });
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la suppression", details: err.message });
  }
});
