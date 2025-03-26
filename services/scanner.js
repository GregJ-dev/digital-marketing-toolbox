const { chromium } = require("playwright");

const CMP_SIGNATURES = [
  { name: "Didomi", pattern: /didomi/i },
  { name: "OneTrust", pattern: /onetrust/i },
  { name: "Axeptio", pattern: /axeptio/i },
  { name: "Cookiebot", pattern: /cookiebot/i },
  { name: "Quantcast", pattern: /quantcast/i },
  { name: "TrustArc", pattern: /trustarc/i },
  { name: "Civic", pattern: /civic/i },
  { name: "Usercentrics", pattern: /usercentrics/i },
  { name: "Tarte au citron", pattern: /tarteaucitron/i },
  { name: "Commanders Act", pattern: /tagcommander|commandersact/i }
];

function detectConsentModeVersion(html) {
  if (/default_consent_state/i.test(html)) return "v2";
  if (/gtag\(\s*['"]consent['"]\s*,\s*['"]/i.test(html)) return "v1";
  return "non détecté";
}

function detectCMP(html) {
  const matches = CMP_SIGNATURES.filter(cmp => cmp.pattern.test(html));
  return matches.map(m => m.name);
}

function detectCMS(html) {
  if (/wp-content|wordpress/i.test(html)) return "WordPress";
  if (/shopify|cdn\.shopify\.com/i.test(html)) return "Shopify";
  if (/prestashop/i.test(html)) return "PrestaShop";
  if (/magento/i.test(html)) return "Magento";
  if (/joomla/i.test(html)) return "Joomla";
  if (/woocommerce/i.test(html)) return "WooCommerce";
  if (/webflow/i.test(html)) return "Webflow";
  if (/wix\.com/i.test(html)) return "Wix";
  return "Non détecté";
}

function detectPixels(html) {
  const pixels = [];
  if (/facebook\.net\/en_US\/fbevents\.js|fbq\(/i.test(html)) pixels.push("Meta");
  if (/googleadservices\.com|gtag\(.*AW-\d+/i.test(html)) pixels.push("Google Ads");
  if (/snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/i.test(html)) pixels.push("LinkedIn");
  if (/analytics\.tiktok\.com|ttq\(/i.test(html)) pixels.push("TikTok");
  if (/bat\.bing\.com\/bat\.js|_uetq/i.test(html)) pixels.push("Microsoft Ads");
  if (/snaptr\(|sc-static\.net\/scevent/i.test(html)) pixels.push("Snapchat");
  if (/pintrk\(/i.test(html)) pixels.push("Pinterest");
  return pixels.length ? pixels.join(", ") : "Aucun";
}

function detectTMS(html) {
  const tmsList = [];
  if (/googletagmanager\.com\/gtm\.js|GTM-[\w\d]+/i.test(html)) tmsList.push("Google Tag Manager");
  if (/cdn\.tagcommander\.com|commandersact/i.test(html)) tmsList.push("Commanders Act");
  if (/tealium|tags\.tiqcdn\.com/i.test(html)) tmsList.push("Tealium");
  if (/adobedtm\.com|launch/i.test(html)) tmsList.push("Adobe Launch");
  if (/tag\.piwik\.pro|ppms\.js/i.test(html)) tmsList.push("Piwik PRO");
  return tmsList.length ? tmsList.join(", ") : "Aucun";
}

function calculateRgpdScore(consentVersion, cmpList) {
  let score = 0;
  if (cmpList.length > 0) score += 40;
  if (consentVersion === "v1") score += 10;
  if (consentVersion === "v2") score += 20;
  return Math.min(score, 100);
}

async function analyzePage(page) {
  const html = await page.content();

  const consentVersion = detectConsentModeVersion(html);
  const cmpList = detectCMP(html);
  const rgpdScore = calculateRgpdScore(consentVersion, cmpList);
  const pixels = detectPixels(html);
  const cms = detectCMS(html);
  const tms = detectTMS(html);

  const metaDescription = await extractMetaDescription(page);

  try {
    // Attend au moins une des deux balises
    await page.waitForSelector('meta[name="description"], meta[property="og:description"]', { timeout: 5000 });

    const descriptionContent = await page.evaluate(() => {
      const desc = document.querySelector('meta[name="description"]');
      if (desc && desc.content) return desc.content.trim();

      const og = document.querySelector('meta[property="og:description"]');
      if (og && og.content) return og.content.trim();

      return null;
    });

    if (descriptionContent) metaDescription = descriptionContent;
  } catch (err) {
    console.warn("Meta description non trouvée :", err.message);
  }

  return {
    consentVersion,
    cmp: cmpList.length ? cmpList.join(", ") : "Aucune",
    rgpdScore,
    cms,
    tms,
    pixels,
    metaDescription
  };
}

async function scanUrls(urls) {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const url of urls) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let consent = null;
    let analysis = {};
    try {
      await page.goto(url, { timeout: 20000, waitUntil: "domcontentloaded" });
      const html = await page.content();
      consent = /gtag\(\s*['"]consent['"]/i.test(html);

      analysis = await analyzePage(page);
    } catch (err) {
      console.error("Erreur lors du scan de", url, err.message);
    } finally {
      await page.close();
      await context.close();
    }

    results.push({
      url,
      consent,
      ...analysis
    });
  }

  await browser.close();
  return results;
}

async function extractMetaDescription(page) {
  try {
    await page.waitForLoadState("load", { timeout: 10000 });

    const description = await page.evaluate(() => {
      const metas = Array.from(document.getElementsByTagName("meta"));

      // Filtrer uniquement les descriptions légitimes
      const validMeta = metas.find(m => {
        const name = m.getAttribute("name") || m.getAttribute("property") || "";
        const content = m.getAttribute("content") || "";

        const isDescription = ["description", "og:description"].includes(name.toLowerCase());
        const isValidContent = content.length > 20 && !content.includes("width=device-width") && !content.includes("charset");

        return isDescription && isValidContent;
      });

      return validMeta ? validMeta.getAttribute("content").trim() : null;
    });

    return description || "Non détectée";
  } catch (err) {
    console.warn("Échec extraction description :", err.message);
    return "Non détectée";
  }
}

module.exports = { scanUrls };