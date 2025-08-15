const express = require("express");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const helmet = require("helmet");
const morgan = require("morgan");
const { authMiddleware, limiter } = require("./middleware");
const config = require("./config");

const app = express();
app.use(helmet());
app.use(morgan("tiny"));
app.use(express.json({ limit: "100kb" }));
app.use(limiter);

// serve frontend static files
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (req, res) => res.json({ status: "ok", now: Date.now() }));

// default root now serves the simple frontend (static index.html)
app.get("/", (req, res) =>
    res.sendFile(path.join(__dirname, "..", "public", "index.html"))
);

function readCompose() {
    const p = config.composePath;
    if (!fs.existsSync(p)) {
        if (config.devTestMode) {
            // return a small mocked compose for frontend dev testing
            const mocked = {
                version: "3.8",
                services: {
                    web: { image: "nginx:alpine", ports: ["80:80"] },
                },
            };
            const raw = yaml.dump(mocked);
            return {
                raw,
                parsed: mocked,
                mtime: Date.now(),
                size: raw.length,
                path: p,
            };
        }
        throw new Error("compose file not found: " + p);
    }
    const stat = fs.statSync(p);
    const raw = fs.readFileSync(p, "utf8");
    const parsed = yaml.load(raw);
    return { raw, parsed, mtime: stat.mtimeMs, size: stat.size, path: p };
}

app.get("/compose", (req, res) => {
    try {
        const data = readCompose();
        res.json({
            meta: { path: data.path, mtime: data.mtime, size: data.size },
            compose: data.parsed,
        });
    } catch (err) {
        res.status(500).json({
            error: "failed to read compose",
            message: String(err),
        });
    }
});

app.get("/compose/raw", (req, res) => {
    try {
        const data = readCompose();
        res.type("text/yaml").send(data.raw);
    } catch (err) {
        res.status(500).send("failed to read compose: " + String(err));
    }
});

// Protected webhook that writes a trigger file into TRIGGER_DIR.
app.post("/webhook", authMiddleware, (req, res) => {
    try {
        const payload = req.body || {};
        const ts = Date.now();
        const fname = `trigger_${ts}.json`;
        const outDir = path.resolve(config.triggerDir);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const filePath = path.join(outDir, fname);
        const content = JSON.stringify(
            { receivedAt: new Date().toISOString(), payload },
            null,
            2
        );
        // Write atomically
        const tmp = filePath + ".tmp";
        fs.writeFileSync(tmp, content, { mode: 0o600 });
        fs.renameSync(tmp, filePath);
        res.status(202).json({ status: "accepted", trigger: filePath });
    } catch (err) {
        res.status(500).json({
            error: "failed to write trigger",
            message: String(err),
        });
    }
});

// API: status and logs used by the frontend
const pkg = require(path.join(__dirname, "..", "package.json"));
const STATUS_FILE = path.join(path.resolve(config.triggerDir), "status.json");
const LOG_FILE = path.join(path.resolve(config.triggerDir), "update.log");

app.get("/api/status", (req, res) => {
    let status = { version: pkg.version || "0.0.0", state: "inactive" };
    try {
        if (fs.existsSync(STATUS_FILE)) {
            const raw = fs.readFileSync(STATUS_FILE, "utf8");
            const parsed = JSON.parse(raw);
            status = Object.assign(status, parsed);
        }
    } catch (err) {
        // ignore
    }
    res.json({
        version: status.version,
        status: status.state || "inactive",
        lastRepo: status.lastRepo,
        lastAt: status.lastAt,
    });
});

app.get("/api/log", (req, res) => {
    const lines = Number(req.query.lines || 500);
    try {
        if (!fs.existsSync(LOG_FILE)) return res.status(200).send("");
        const raw = fs.readFileSync(LOG_FILE, "utf8");
        const parts = raw.split(/\r?\n/).filter(Boolean);
        const tail = parts.slice(-lines).join("\n");
        return res.type("text/plain").send(tail);
    } catch (err) {
        return res.status(500).send("failed to read log");
    }
});

// Start
const port = config.port;
// ensure trigger directory exists (helps devTestMode local .dev_trigger)
try {
    const outDir = path.resolve(config.triggerDir);
    if (!fs.existsSync(outDir))
        fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    // create empty status/log if not present so frontend doesn't error
    const statusPath = path.join(outDir, "status.json");
    const logPath = path.join(outDir, "update.log");
    if (!fs.existsSync(statusPath))
        fs.writeFileSync(
            statusPath,
            JSON.stringify({ state: "inactive" }, null, 2),
            { mode: 0o600 }
        );
    if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, "", { mode: 0o600 });
} catch (err) {
    console.error(
        "failed to prepare trigger dir/status for frontend",
        err.message
    );
}

app.listen(port, () => {
    console.log(`dockerhook-frontend listening on ${port}`);
});
