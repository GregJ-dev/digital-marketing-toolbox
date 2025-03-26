// INIT
console.log("✅ Démarrage du fichier server.js...");
const form = document.getElementById("searchForm");
const resultsDiv = document.getElementById("results");
const exportBtn = document.getElementById("exportBtn");
const historyBtn = document.getElementById("historyBtn");
const activeFilters = new Set(["seo", "ads", "shopping"]);
let paginatedData = [];        // Tous les résultats à afficher
let currentPage = 1;           // Page en cours
const resultsPerPage = 20;     // Nombre de lignes par page
let lastScanResults = []; // Contient les dernières données injectées (scan ou historique)
let sortState = { key: null, asc: true };

const CMS_ICON_MAP = {
    "WordPress": "wordpress",
    "WooCommerce": "woocommerce",
    "Shopify": "shopify",
    "PrestaShop": "prestashop",
    "Joomla": "joomla",
    "Magento": "magento",
    "Webflow": "webflow",
    "Wix": "wix"
  };
  
  const TMS_ICON_MAP = {
    "Google Tag Manager": "google-tag-manager",
    "Tealium": "tealium",
    "Adobe Launch": "adobe"
  };
  
  const PIXEL_ICON_MAP = {
    "Meta": "meta",
    "Google Ads": "google-ads",
    "LinkedIn": "linkedin",
    "TikTok": "tiktok",
    "Microsoft Ads": "microsoft-ads",
    "Snapchat": "snapchat",
    "Pinterest": "pinterest"
  };

  const CMP_ICON_MAP = {
    "Didomi": "didomi.svg",
    "OneTrust": "onetrust.svg",
    "Axeptio": "axeptio.svg",
    "Cookiebot": "cookiebot.svg",
    "Tarte au citron": "tarteaucitron.svg",
    "Iubenda": "iubenda.svg"
  };
  
  

// FILTRES
document.querySelectorAll("#filterTags .tag").forEach(tag => {
    tag.addEventListener("click", () => {
      const type = tag.dataset.type;
      if (activeFilters.has(type)) {
        activeFilters.delete(type);
        tag.classList.remove("selected");
      } else {
        activeFilters.add(type);
        tag.classList.add("selected");
      }
    });
  });

// AFFICHE DETAIL SCAN
function toggleDetails(row) {
    const nextRow = row.nextElementSibling;
    if (!nextRow || !nextRow.classList.contains("details-row")) return;
  
    const toggleBtn = row.querySelector(".toggle-btn");
    const metaCell = nextRow.querySelector(".meta-cell");
  
    // Toggle visibility
    const isOpen = nextRow.style.display === "table-row";
    nextRow.style.display = isOpen ? "none" : "table-row";
  
    if (toggleBtn) {
      toggleBtn.textContent = isOpen ? "＋" : "－";
    }
  
    // Inject content only once
    if (!metaCell.dataset.loaded || metaCell.dataset.loaded === "false") {
      const description = row.dataset.metaDescription || "Non détectée";
      metaCell.textContent = `📝 Meta description : ${description}`;
      metaCell.dataset.loaded = "true";
    }
  }
   
  
// FORM SUBMISSION + SCAN LOADING
form.addEventListener("submit", async function (e) {
    e.preventDefault();
  
    const query = document.getElementById("searchQuery").value;
    resultsDiv.innerHTML = `<p id="statusMessage">Recherche en cours...</p>`;
    exportBtn.style.display = "none";
  
    try {
      // Appel SERP API
      const response = await fetch("http://localhost:3000/search?q=" + encodeURIComponent(query));
      const data = await response.json();
  
      // Filtrage SEO / Ads / Shopping
      const filtered = data.filter(item => activeFilters.has(item.type));
  
      const domainMap = new Map();
      filtered.forEach(item => {
        try {
          const url = new URL(item.link);
          const domain = url.hostname;
          if (!domainMap.has(domain)) {
            domainMap.set(domain, {
              domain,
              url: item.link,
              type: item.type,
              metaDescription: item.metaDescription
            });
          }
        } catch (err) {
          console.warn("URL invalide ignorée :", item.link);
        }
      });
  
      const uniqueResults = Array.from(domainMap.values());
  
      // 💡 Affiche le tableau avec sabliers
      renderPendingResults(uniqueResults, true);
  
      // 🔄 Lance le scan backend
      const scanResponse = await fetch("http://localhost:3000/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: uniqueResults.map(item => item.url),
          query,
          type: "live"
        })
      });
  
      const scanData = await scanResponse.json();
      injectScanResults(scanData, true);
  
    } catch (error) {
      resultsDiv.innerHTML = `<p style="color:red;">Erreur : ${error.message}</p>`;
    }
});
  

  // RESULTS
  function getSortArrow(key) {
    if (sortState.key !== key) return "";
    return sortState.asc ? "↑" : "↓";
  }

function renderPendingResults(results, isLiveScan = true) {
    paginatedData = results;
    currentPage = 1;
    renderCurrentPage(isLiveScan);
  }
  
function renderCurrentPage(isLiveScan = true) {
    const totalPages = Math.ceil(paginatedData.length / resultsPerPage);
    const start = (currentPage - 1) * resultsPerPage;
    const end = start + resultsPerPage;
    const currentSlice = paginatedData.slice(start, end);

    // 📊 Stats synthèse sur tout le dataset (pas seulement la page)
const total = paginatedData.length;
const withCMP = paginatedData.filter(r => r.cmp && r.cmp !== "Aucune").length;
const v2 = paginatedData.filter(r => r.consentVersion === "v2").length;
const avg = paginatedData.reduce((sum, r) => sum + (r.rgpdScore || 0), 0) / (total || 1);

let statsHTML = `
  <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:10px;">
    <strong>📊 Synthèse :</strong>
    <ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 14px;">
      <li>CMP détectés : ${withCMP} / ${total} (${Math.round((withCMP / total) * 100)}%)</li>
      <li>Consent Mode v2 : ${v2} / ${total} (${Math.round((v2 / total) * 100)}%)</li>
      <li>Score moyen RGPD : ${avg.toFixed(1)} / 100</li>
    </ul>
  </div>
`;

  
    let tableHTML = `
      <p id="statusMessage">
        ${isLiveScan ? "🔍 Scan en cours..." : "📂 Scan historique rechargé"}
      </p>
      ${statsHTML}
    <input id="filterInput" type="text" placeholder="🔎 Filtrer les résultats..." style="width: 100%; padding: 8px; margin-bottom: 10px; font-size: 14px; border-radius: 8px; border: 1px solid #ccc;">

    <table id="resultTable">

        <thead>
  <tr>
    <th></th><th data-sort="domain">Domaine ${getSortArrow("domain")}</th>
    <th data-sort="rgpdScore">Score ${getSortArrow("rgpdScore")}</th>
    <th data-sort="consent">CoMo ${getSortArrow("consent")}</th>
    <th data-sort="consentVersion">Version ${getSortArrow("consentVersion")}</th>
    <th data-sort="cmp">CMP ${getSortArrow("cmp")}</th>
    <th data-sort="cms">CMS ${getSortArrow("cms")}</th>
    <th data-sort="tms">TMS ${getSortArrow("tms")}</th>
    <th data-sort="pixels">Pixels ${getSortArrow("pixels")}</th>
  </tr>
</thead>

        <tbody>
    `;
  
    currentSlice.forEach(item => {
      try {
        const url = new URL(item.url);
        const domain = url.hostname;
  
        tableHTML += `
          <tr class="result-row" data-domain="${domain}" data-meta-description="${item.metaDescription || "Non détectée"}" onclick="toggleDetails(this)">
            <td><button class='toggle-btn'>＋</button></td>
            <td><a href="${item.url}" target="_blank">${domain}</a></td>
            <td class="score-cell">⏳</td>
            <td class="status-cell">⏳</td>
            <td class="version-cell">⏳</td>
            <td class="cmp-cell">⏳</td>
            <td class="cms-cell">⏳</td>
            <td class="tms-cell">⏳</td>
            <td class="pixels-cell">⏳</td>
          </tr>
          <tr class="details-row" style="display:none;">
            <td colspan="9" class="meta-cell" data-loaded="false">📝 Meta description : ...</td>
        </tr>

        `;
      } catch (err) {
        console.warn("❌ URL invalide :", item.url);
      }
    });
  
    tableHTML += `</tbody></table>`;
  
    // Bloc pagination
    tableHTML += `
      <div id="paginationControls" style="margin-top: 15px; text-align: center;">
        <button id="prevPage" ${currentPage === 1 ? "disabled" : ""}>⬅️ Précédent</button>
        <span style="margin: 0 10px;">Page ${currentPage} / ${totalPages}</span>
        <button id="nextPage" ${currentPage === totalPages ? "disabled" : ""}>Suivant ➡️</button>
      </div>
    `;
  
    resultsDiv.innerHTML = tableHTML;

    document.getElementById("filterInput").addEventListener("input", function () {
        const value = this.value.toLowerCase();
        document.querySelectorAll("#resultTable tbody tr.result-row").forEach(row => {
          const text = row.innerText.toLowerCase();
          row.style.display = text.includes(value) ? "" : "none";
          const nextRow = row.nextElementSibling;
          if (nextRow && nextRow.classList.contains("details-row")) {
            nextRow.style.display = row.style.display;
          }
        });
      });

    // 🔽 Gérer le tri des colonnes
    document.querySelectorAll("#resultTable th[data-sort]").forEach(th => {
        th.style.cursor = "pointer";
      
        th.addEventListener("click", () => {
          const key = th.dataset.sort;
          const asc = sortState.key === key ? !sortState.asc : true;
          sortState = { key, asc };
      
          paginatedData.sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
      
            // ✅ Tri numérique pour score
            if (key === "score" || key === "rgpdScore") {
              valA = parseFloat(valA) || 0;
              valB = parseFloat(valB) || 0;
              return asc ? valA - valB : valB - valA;
            }
      
            // ✅ Tri version v1 < v2 < non détecté
            if (key === "version" || key === "consentVersion") {
              const order = { "v1": 1, "v2": 2, "non détecté": 0 };
              return asc
                ? (order[valA] || 0) - (order[valB] || 0)
                : (order[valB] || 0) - (order[valA] || 0);
            }
      
            // ✅ Tri texte normal
            valA = (valA || "").toString().toLowerCase();
            valB = (valB || "").toString().toLowerCase();
            return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
          });
      
          renderCurrentPage(false); // rafraîchir sans toucher au dataset
        });
      });
      
  
      
  
    // Gestion des boutons page suivante / précédente
    document.getElementById("prevPage").addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderCurrentPage(isLiveScan);
      }
    });
  
    document.getElementById("nextPage").addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderCurrentPage(isLiveScan);
      }
    });

    if (lastScanResults.length > 0) {
        injectScanResults(lastScanResults, false);
      }      

}
  
  
  
// DISPLAY UPDATE
function injectScanResults(scanData, isLiveScan = true) {
    lastScanResults = scanData;
  
    scanData.forEach(scan => {
      const domain = new URL(scan.url).hostname;
  
      const row = document.querySelector(`tr.result-row[data-domain="${domain}"]`);
      if (!row) return;
  
      const score = scan.rgpdScore ?? 0;
  
      row.querySelector(".status-cell").textContent = scan.consent ? "✅" : "❌";
      row.querySelector(".version-cell").textContent = scan.consent ? scan.consentVersion || "–" : "–";
      const cmpCell = row.querySelector(".cmp-cell");

if (scan.cmp && scan.cmp !== "Aucune") {
  const cmpList = scan.cmp.split(",").map(c => c.trim());
  cmpCell.innerHTML = cmpList.map(name => {
    const iconFile = CMP_ICON_MAP[name];
    return iconFile
      ? `<img src="assets/icons/cmp/${iconFile}" alt="${name}" title="${name}" class="cmp-logo" style="margin-right: 6px;">`
      : name;
  }).join(" ");
} else {
  cmpCell.textContent = "❌";
}

      row.querySelector(".cms-cell").textContent = scan.cms || "–";
      row.querySelector(".tms-cell").textContent = scan.tms || "–";
      row.querySelector(".pixels-cell").textContent = scan.pixels || "–";
  
      const scoreCell = row.querySelector(".score-cell");
      scoreCell.textContent = score;
  
      const icon = document.createElement("span");
      icon.style.marginLeft = "6px";
      if (score >= 70) {
        icon.textContent = "🟢";
      } else if (score >= 40) {
        icon.textContent = "🟠";
      } else {
        icon.textContent = "🔴";
      }
      scoreCell.appendChild(icon);

      // CMS
      const cmsCell = row.querySelector(".cms-cell");
      if (CMS_ICON_MAP[scan.cms]) {
        cmsCell.innerHTML = `<img src="assets/icons/cms/${CMS_ICON_MAP[scan.cms]}.svg" alt="${scan.cms}" title="${scan.cms}" width="20">`;
      } else {
        cmsCell.textContent = scan.cms === "Non détecté" ? "🛠️" : (scan.cms || "–");
      }
      

// TMS (peut contenir plusieurs)
const tmsCell = row.querySelector(".tms-cell");
if (scan.tms && scan.tms !== "Aucun") {
  const tmsList = scan.tms.split(",").map(t => t.trim());
  tmsCell.innerHTML = tmsList.map(t =>
    TMS_ICON_MAP[t]
      ? `<img src="assets/icons/tms/${TMS_ICON_MAP[t]}.svg" alt="${t}" title="${t}" width="20">`
      : t
  ).join(" ");
} else {
  tmsCell.textContent = "–";
}

// Pixels (peut contenir plusieurs)
const pixelCell = row.querySelector(".pixels-cell");
if (scan.pixels && scan.pixels !== "Aucun") {
  const pixelList = scan.pixels.split(",").map(p => p.trim());
  pixelCell.innerHTML = pixelList.map(p =>
    PIXEL_ICON_MAP[p]
      ? `<img src="assets/icons/pixels/${PIXEL_ICON_MAP[p]}.svg" alt="${p}" title="${p}" width="20">`
      : p
  ).join(" ");
} else {
  pixelCell.textContent = "–";
}

  
      row.dataset.metaDescription = scan.metaDescription || "Non détectée";
    });
  
    if (isLiveScan) {
      const statusMsg = document.getElementById("statusMessage");
      if (statusMsg) {
        statusMsg.textContent = "✅ Scan terminé";
      }
    }
  
    exportBtn.style.display = "inline-block";
  }
  
  

// DISPLAY MORE
resultsDiv.addEventListener("click", function (e) {
    if (e.target && e.target.classList.contains("toggle-btn")) {
      const row = e.target.closest("tr");
      const nextRow = row.nextElementSibling;
  
      if (nextRow && nextRow.classList.contains("details-row")) {
        nextRow.style.display = nextRow.style.display === "none" ? "table-row" : "none";
        e.target.textContent = nextRow.style.display === "none" ? "＋" : "－";
  
        if (!nextRow.querySelector(".meta-cell").dataset.loaded) {
          const fullDescription = row.dataset.metaDescription || "Non détectée";
          const truncated = fullDescription.length > 300 ? fullDescription.slice(0, 300) + "..." : fullDescription;
          nextRow.querySelector(".meta-cell").textContent = "📝 Meta description : " + truncated;
          nextRow.querySelector(".meta-cell").dataset.loaded = "true";
        }
      }
    }
  
    // 🔁 Gestion des boutons "Recharger" historique
    if (e.target && e.target.classList.contains("load-history-btn")) {
      const filename = e.target.dataset.file;
      resultsDiv.innerHTML = "<p>Chargement du scan...</p>";
  
      fetch(`http://localhost:3000/history/${filename}`)
        .then(res => res.json())
        .then(data => {
          if (!data || !data.results) throw new Error("Fichier invalide");
          console.log("📂 Données historiques chargées :", data);
          // 🧱 Affiche le tableau vide (⏳) avec renderPendingResults()
        renderPendingResults(data.results, false);
        // ✅ Injecte les vraies données dans les lignes
          injectScanResults(data.results, false);
        })
        .catch(err => {
          resultsDiv.innerHTML = `<p style="color:red;">Erreur chargement : ${err.message}</p>`;
        });
    }

    // 🗑️ Gestion du bouton "Supprimer"
    if (e.target && e.target.classList.contains("delete-history-btn")) {
    
    const filename = e.target.dataset.file;
    console.log("🧪 Suppression demandée pour :", filename);
  
    const confirmDelete = confirm(`Supprimer le scan "${filename}" ?`);
    if (!confirmDelete) return;
  
    fetch(`http://localhost:3000/history/${encodeURIComponent(filename)}`, {
        method: "DELETE"
      })      
        .then(res => {
          if (!res.ok) {
            throw new Error(`Erreur serveur (${res.status})`);
          }
          return res.json();
        })
        .then(data => {
          if (data.success) {
            alert(`🗑️ Fichier supprimé : ${filename}`);
            historyBtn.click(); // recharge la liste
          } else {
            throw new Error(data.error || "Erreur inconnue");
          }
        })
        .catch(err => {
          alert("❌ Erreur lors de la suppression : " + err.message);
        });  
    }  

});

// REQUESTS HISTORY
historyBtn.addEventListener("click", async () => {
    resultsDiv.innerHTML = "<p>Chargement de l'historique...</p>";
  
    try {
        const response = await fetch("http://localhost:3000/history");
        const files = await response.json();
        
        // 🧠 Afficher le bon nom
        files.forEach(file => {
          const filename = typeof file === "string" ? file : file.filename || file.name;
          
          const fileDiv = document.createElement("div");
          fileDiv.innerHTML = `
            <strong>${filename}</strong>
            <button class="reload-btn" data-filename="${filename}">🔄 Recharger</button>
            <button class="delete-btn" data-filename="${filename}">🗑️</button>
            <hr />
          `;
          resultsDiv.appendChild(fileDiv);
        });
        
    } catch (err) {
      resultsDiv.innerHTML = `<p style="color:red;">Erreur : ${err.message}</p>`;
    }
});

const scanBtn = document.getElementById("scanBtn");

// BUTTONS
scanBtn.addEventListener("click", () => {
  // 🧹 Nettoie les résultats
  modeToggle.style.display = "flex";
  keywordModeSection.style.display = currentMode === "keyword" ? "block" : "none";
  manualModeSection.style.display = currentMode === "manual" ? "block" : "none";
  resultsDiv.innerHTML = `<h2>🔍 Scanner</h2>`;
  exportBtn.style.display = "none";
  document.getElementById("searchQuery").value = "";

  // Restaure les tags sélectionnés
  document.querySelectorAll("#filterTags .tag").forEach(tag => {
    tag.classList.add("selected");
    activeFilters.add(tag.dataset.type);
  });
});

historyBtn.addEventListener("click", async () => {
  // 👁️ Cache le formulaire
  resultsDiv.innerHTML = "<p>Chargement de l'historique...</p>";

  try {
    const response = await fetch("http://localhost:3000/history");
    const summaries = await response.json();

    if (summaries.length === 0) {
      resultsDiv.innerHTML = "<p>Aucun scan enregistré pour l’instant.</p>";
      return;
    }

    let html = "<h2>📂 Historique des scans</h2><ul style='list-style:none; padding-left:0;'>";

    summaries.forEach(summary => {
        const formattedDate = new Date(summary.date).toLocaleString("fr-FR");
      
        html += `<li style="margin:10px 0; padding: 10px; border: 1px solid #ccc; border-radius: 8px;">
          <div style="margin-bottom: 5px;">
            <strong>${summary.filename}</strong><br>
            🕒 <strong>Date :</strong> ${formattedDate}<br>
            🔍 <strong>Requête :</strong> ${summary.query}<br>
            🌐 <strong>Domaines :</strong> ${summary.numDomains} | 💯 <strong>Score moyen :</strong> ${summary.avgScore}
          </div>
          <button class="load-history-btn" data-file="${summary.filename}">🔄 Recharger</button>
          <button class="delete-history-btn" data-file="${summary.filename}" style="margin-left:10px; color:red;">🗑️ Supprimer</button>
        </li>`;
      });
      

    html += "</ul>";
    resultsDiv.innerHTML = html;
  } catch (err) {
    resultsDiv.innerHTML = `<p style="color:red;">Erreur : ${err.message}</p>`;
  }
});

// CSV EXPORT
exportBtn.addEventListener("click", () => {
    const rows = document.querySelectorAll("#resultTable tbody tr");
    let csvContent = "data:text/csv;charset=utf-8,Domaine,CoMo,Version,CMP,CMS,TMS,Pixels,Score RGPD\n";
  
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      const values = Array.from(cells).map(cell => `"${cell.innerText.trim()}"`);
      csvContent += values.join(",") + "\n";
    });
  
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "consent-scan.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
 
// 🎛️ Composants du switch
const keywordModeBtn = document.getElementById("keywordModeBtn");
const manualModeBtn = document.getElementById("manualModeBtn");
const keywordModeSection = document.getElementById("keywordModeSection");
const manualModeSection = document.getElementById("manualModeSection");
const modeToggle = document.getElementById("modeToggle");

let currentMode = "keyword"; // ou "manual"

keywordModeBtn.addEventListener("click", () => {
  currentMode = "keyword";
  keywordModeBtn.classList.add("selected");
  manualModeBtn.classList.remove("selected");
  keywordModeSection.style.display = "block";
  manualModeSection.style.display = "none";
  resultsDiv.innerHTML = "";
  exportBtn.style.display = "none";
});

manualModeBtn.addEventListener("click", () => {
  currentMode = "manual";
  manualModeBtn.classList.add("selected");
  keywordModeBtn.classList.remove("selected");
  keywordModeSection.style.display = "none";
  manualModeSection.style.display = "block";
  resultsDiv.innerHTML = "";
  exportBtn.style.display = "none";
});

// 🧭 Gestion du menu principal (Scan vs Historique)
scanBtn.addEventListener("click", () => {
  document.getElementById("keywordModeSection").style.display = currentMode === "keyword" ? "block" : "none";
  document.getElementById("manualModeSection").style.display = currentMode === "manual" ? "block" : "none";
  modeToggle.style.display = "flex";
  resultsDiv.innerHTML = "";
  exportBtn.style.display = "none";
});

async function loadHistory() {
    resultsDiv.innerHTML = `<p>Chargement de l'historique...</p>`;
  
    try {
      const response = await fetch("http://localhost:3000/history");
      const files = await response.json();
  
      resultsDiv.innerHTML = `<h2>📂 Historique</h2>`;
  
      files.forEach(file => {
        const { filename, date, query, numDomains, avgScore } = file;
  
        const fileDiv = document.createElement("div");
        fileDiv.classList.add("history-entry");
        fileDiv.innerHTML = `
          <p><strong>${filename}</strong></p>
          <p>🕒 Date : ${new Date(date).toLocaleString()}</p>
          <p>🔍 Requête : ${query}</p>
          <p>🌐 Domaines : ${numDomains} | 💯 Score moyen : ${avgScore}</p>
          <button class="reload-btn" data-filename="${filename}">🔁 Recharger</button>
          <button class="delete-btn" data-filename="${filename}">🗑️ Supprimer</button>
          <hr />
        `;
  
        resultsDiv.appendChild(fileDiv);
      });
  
      // Ajout du listener sur tous les boutons recharge
      document.querySelectorAll(".reload-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const filename = btn.dataset.filename;
          try {
            const res = await fetch(`http://localhost:3000/history/${filename}`);
            const data = await res.json();
            console.log("📂 Données rechargées depuis historique :", data);
            if (!Array.isArray(data.results)) {
              throw new Error("Fichier invalide ou vide.");
            }
  
            paginatedData = data.results;
            currentPage = 1;
            renderPendingResults(paginatedData, false);   // ⏳ sabliers
            injectScanResults(paginatedData, false);      // ✅ injecte les vraies données
  
            document.getElementById("statusMessage").textContent = "📂 Scan historique rechargé";
          } catch (err) {
            resultsDiv.innerHTML = `<p style="color:red;">❌ Erreur chargement : ${err.message}</p>`;
          }
        });
      });
  
    } catch (err) {
      resultsDiv.innerHTML = `<p style="color:red;">❌ Erreur chargement historique : ${err.message}</p>`;
    }
  }
  
  historyBtn.addEventListener("click", () => {
    modeToggle.style.display = "none";
    keywordModeSection.style.display = "none";
    manualModeSection.style.display = "none";
    resultsDiv.innerHTML = "";
    exportBtn.style.display = "none";
  
    loadHistory(); // ✅ Appel direct à la fonction qu’on a définie plus haut
  });