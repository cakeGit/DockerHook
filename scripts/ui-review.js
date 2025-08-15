const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const OUT_DIR = path.join(__dirname, "..", "artifacts");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
    const url = process.env.URL || "http://localhost:3000/";
    console.log("launching browser...");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const consoleMessages = [];
    page.on("console", (msg) => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    console.log("navigating to", url);
    const resp = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
    });
    const status = resp && resp.status ? resp.status() : "no-response";

    const title = await page.title();
    const html = await page.content();

    // checks
    const missingMetaViewport =
        (await page.$('meta[name="viewport"]')) === null;
    const imagesWithoutAlt = await page.$$eval(
        "img",
        (imgs) => imgs.filter((i) => !i.getAttribute("alt")).length
    );

    const screenshotPath = path.join(OUT_DIR, "homepage.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const report = {
        url,
        status,
        title,
        missingMetaViewport,
        imagesWithoutAlt,
        consoleMessages,
        pageErrors: errors,
        screenshot: screenshotPath,
        timestamp: Date.now(),
    };

    const reportPath = path.join(OUT_DIR, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log("wrote report to", reportPath);

    await browser.close();
    console.log("done");
}

run().catch((err) => {
    console.error(
        "ui-review failed:",
        err && err.stack ? err.stack : String(err)
    );
    process.exit(2);
});
