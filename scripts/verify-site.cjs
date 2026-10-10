const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.SITE_URL || "http://127.0.0.1:4173/";
const browserPath = process.env.BROWSER_PATH;
const outputDir = path.resolve(__dirname, "..", ".qa");

async function expectText(locator, pattern, label) {
  const text = await locator.textContent();
  if (!pattern.test(text || "")) {
    throw new Error(`${label}: expected ${pattern}, received ${JSON.stringify(text)}`);
  }
}

async function expectNoLegacyTerminology(page, label) {
  const text = await page.locator("body").innerText();
  if (/\bfamil(?:y|ies)\b/iu.test(text)) {
    throw new Error(`${label}: legacy family terminology is still visible`);
  }
}

async function expectNoStructuralVariantTerminology(page, label) {
  const text = await page.locator("body").innerText();
  if (/\bvariants?\b/iu.test(text)) {
    throw new Error(`${label}: structural variant terminology is still visible`);
  }
}

async function expectCoreFields(page, label) {
  const situation = page.locator('[data-core-field="situation"]');
  const rule = page.locator('[data-core-field="commonsense-rule"]');
  if ((await situation.count()) !== 1 || (await rule.count()) !== 1) {
    throw new Error(`${label}: Situation and Commonsense Rule are not both explicit`);
  }
  await expectText(situation.locator(".core-field-label"), /^Situation$/i, `${label} situation label`);
  await expectText(rule.locator(".core-field-label"), /^Commonsense Rule$/i, `${label} rule label`);
}

let browser;

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: browserPath || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await expectText(
    page.locator("h1"),
    /Explore reusable testing commonsense/i,
    "home heading",
  );
  await expectNoLegacyTerminology(page, "home page");
  await expectText(
    page.locator('[data-stat="generalized"]'),
    /1,399/,
    "generalized rule count",
  );
  await expectText(page.locator('[data-stat="instances"]'), /3,708/, "instance count");
  await page.screenshot({ path: path.join(outputDir, "home-desktop.png"), fullPage: true });

  await page.locator('a[href="#/generalized"]').first().click();
  await expectText(page.locator("h1"), /Generalized commonsense/i, "catalog heading");
  await expectNoLegacyTerminology(page, "generalized catalog");
  await page.locator('input[type="search"]').fill("playback position");
  await expectText(page.locator(".results-meta span").first(), /[1-9][0-9]* matches/, "search matches");
  await expectText(page.locator(".catalog-item").first(), /Commonsense Rule[\s\S]*Situation/i, "catalog core fields");
  await page.locator(".catalog-item").first().click();
  await page.waitForFunction(() => window.location.hash.split("/").length >= 3);
  await expectCoreFields(page, "generalized detail");
  await expectText(page.locator(".info-card h2").nth(1), /Supporting instance-level/i, "member section");
  await expectNoLegacyTerminology(page, "generalized detail");
  await expectNoStructuralVariantTerminology(page, "generalized detail");
  if (/family/iu.test(await page.locator(".raw-json pre").textContent())) {
    throw new Error("generalized JSON contains legacy family fields");
  }
  if ((await page.locator(".member-card").count()) < 1) {
    throw new Error("generalized detail has no instance links");
  }
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(outputDir, "generalized-detail-desktop.png"),
    fullPage: true,
  });
  await page.locator(".member-card").first().click();
  await page.waitForFunction(() => window.location.hash.startsWith("#/instance/"));
  await expectText(page.locator(".back-link"), /instance-level catalog/i, "instance detail");
  await expectCoreFields(page, "instance detail");
  await expectNoLegacyTerminology(page, "instance detail");
  if ((await page.locator('a.external-link[href^="https://github.com/"]').count()) !== 1) {
    throw new Error("instance detail is missing its original GitHub issue link");
  }
  if ((await page.locator(".raw-json pre").count()) !== 1) {
    throw new Error("instance detail is missing the complete JSON disclosure");
  }
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(outputDir, "instance-detail-desktop.png"),
    fullPage: true,
  });

  await page.goto(`${baseUrl}#/instances`, { waitUntil: "networkidle" });
  await page.locator('input[type="search"]').fill("back arrow");
  await expectText(page.locator(".results-meta span").first(), /[1-9][0-9]* matches/, "instance search");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outputDir, "home-mobile.png"), fullPage: true });
  if (await page.locator("body").evaluate((body) => body.scrollWidth > window.innerWidth)) {
    throw new Error("mobile page has unexpected horizontal overflow");
  }

  await browser.close();
  browser = null;
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("Browser verification passed: home, catalogs, search, details, links, and mobile layout.");
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});

