const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const config = require("./config");

// Configuration
const WATCH_DIR = path.resolve(config.triggerDir || "/var/run/dockerhook");
const PROCESS_DIR = path.join(WATCH_DIR, "processing");
const PROCESSED_DIR = path.join(WATCH_DIR, "processed");
const FAILED_DIR = path.join(WATCH_DIR, "failed");
const POLL_INTERVAL = 2000;
// poll docker-compose state every 5 minutes so frontend status stays accurate
const COMPOSE_POLL_INTERVAL = 5 * 60 * 1000;
const UPDATE_CMD =
    process.env.UPDATE_CMD || "docker compose pull && docker compose up -d";
const LOG_FILE = path.join(WATCH_DIR, "update.log");
const STATUS_FILE = path.join(WATCH_DIR, "status.json");

function ensureDirs() {
    [WATCH_DIR, PROCESS_DIR, PROCESSED_DIR, FAILED_DIR].forEach((d) => {
        if (!fs.existsSync(d))
            fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    });
}

function listTriggers() {
    const files = fs
        .readdirSync(WATCH_DIR)
        .filter((f) => /^trigger_\d+\.json$/.test(f));
    files.sort();
    return files;
}

function atomicMove(src, dest) {
    fs.renameSync(src, dest);
}

function runShell(cmd, cwd = "/") {
    return new Promise((resolve) => {
        // run via /bin/sh -c so we can use && etc
        const p = spawn("/bin/sh", ["-c", cmd], {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        let err = "";
        p.stdout.on("data", (b) => (out += b.toString()));
        p.stderr.on("data", (b) => (err += b.toString()));
        p.on("close", (code) => resolve({ code, out, err }));
    });
}

async function isComposeRunning(workdir = "/") {
    try {
        // ask compose for container ids for the current project; if any exist consider it running
        const res = await runShell("docker compose ps -q", workdir);
        if (res.code !== 0) return false;
        return Boolean(String(res.out || "").trim());
    } catch (err) {
        return false;
    }
}

let _lastComposeState = null;
async function pollComposeStatePeriodically(workdir) {
    try {
        const running = await isComposeRunning(workdir);
        const state = running ? "active" : "inactive";
        if (_lastComposeState !== state) {
            _lastComposeState = state;
            // Only update the state on compose polls; do NOT touch lastAt here so
            // "LAST UPDATED" reflects only actual updates triggered by webhooks.
            writeStatus({ state });
            appendLog(`compose poll: state=${state}`);
        }
        return state;
    } catch (e) {
        // ignore polling errors but log
        appendLog(`compose poll error: ${e.message || String(e)}`);
        return null;
    }
}

// Adaptive poll loop: poll every COMPOSE_POLL_INTERVAL when active, or every 1 minute when inactive
async function composePollLoop(workdir) {
    try {
        const state = await pollComposeStatePeriodically(workdir);
        const nextInterval =
            state === "active" ? COMPOSE_POLL_INTERVAL : 60 * 1000;
        setTimeout(() => composePollLoop(workdir), nextInterval);
    } catch (e) {
        // on unexpected error, retry in 1 minute
        setTimeout(() => composePollLoop(workdir), 60 * 1000);
    }
}

async function processOne(file) {
    const src = path.join(WATCH_DIR, file);
    const processing = path.join(PROCESS_DIR, file);
    try {
        atomicMove(src, processing);
    } catch (err) {
        console.error("failed to move trigger to processing", err.message);
        return;
    }

    let payload = null;
    try {
        const raw = fs.readFileSync(processing, "utf8");
        payload = JSON.parse(raw);
    } catch (err) {
        console.error("invalid trigger file", processing, err.message);
        const bad = path.join(FAILED_DIR, file + ".bad");
        fs.renameSync(processing, bad);
        return;
    }

    console.log(
        "processing trigger",
        processing,
        "payload receivedAt=",
        payload.receivedAt
    );
    appendLog(`processing trigger ${file} receivedAt=${payload.receivedAt}`);

    try {
        // Change working dir to root where compose file is expected or allow override via env
        const workdir =
            process.env.COMPOSE_DIR ||
            path.dirname(config.composePath || "/root/docker_compose.yml") ||
            "/";
        // write updating status
        writeStatus({
            state: "updating",
            lastRepo: payload?.payload?.repository?.full_name || null,
            lastAt: new Date().toISOString(),
            version: require(path.join(__dirname, "..", "package.json"))
                .version,
        });
        console.log("running update cmd in", workdir, "cmd=", UPDATE_CMD);
        const res = await runShell(UPDATE_CMD, workdir);
        if (res.code === 0) {
            const dest = path.join(PROCESSED_DIR, file);
            fs.renameSync(processing, dest);
            appendLog(`update succeeded for ${file}`);
            writeStatus({
                state: "active",
                lastRepo: payload?.payload?.repository?.full_name || null,
                lastAt: new Date().toISOString(),
                version: require(path.join(__dirname, "..", "package.json"))
                    .version,
            });
            console.log("update succeeded for", file);
        } else {
            const dest = path.join(FAILED_DIR, file);
            fs.renameSync(processing, dest);
            appendLog(
                `update failed for ${file} code=${res.code} err=${res.err}`
            );
            writeStatus({
                state: "failed",
                lastRepo: payload?.payload?.repository?.full_name || null,
                lastAt: new Date().toISOString(),
                version: require(path.join(__dirname, "..", "package.json"))
                    .version,
            });
            console.error(
                "update failed for",
                file,
                "code=",
                res.code,
                "err=",
                res.err
            );
        }
    } catch (err) {
        appendLog(`error running update for ${file} ${err.message}`);
        console.error("error running update", err.message);
        const dest = path.join(FAILED_DIR, file);
        try {
            fs.renameSync(processing, dest);
        } catch (e) {
            console.error("failed to move to failed", e.message);
        }
    }
}

function appendLog(line) {
    try {
        const ts = new Date().toISOString();
        fs.appendFileSync(LOG_FILE, `[${ts}] ${line}\n`, { mode: 0o600 });
        // trim log to last 40 non-empty lines to keep history bounded
        try {
            const raw = fs.readFileSync(LOG_FILE, "utf8");
            const parts = raw.split(/\r?\n/).filter(Boolean);
            if (parts.length > 40) {
                const tail = parts.slice(-40).join("\n") + "\n";
                fs.writeFileSync(LOG_FILE, tail, { mode: 0o600 });
            }
        } catch (e) {
            // ignore trimming errors but log to stderr
            console.error("failed to trim log", e.message);
        }
    } catch (err) {
        console.error("failed to append log", err.message);
    }
}

function writeStatus(obj) {
    try {
        const base = {
            state: "inactive",
            version:
                require(path.join(__dirname, "..", "package.json")).version ||
                "0.0.0",
        };
        const merged = Object.assign(base, obj || {});
        fs.writeFileSync(STATUS_FILE, JSON.stringify(merged, null, 2), {
            mode: 0o600,
        });
    } catch (err) {
        console.error("failed to write status", err.message);
    }
}

async function loopOnce() {
    try {
        const list = listTriggers();
        for (const f of list) {
            await processOne(f);
        }
    } catch (err) {
        console.error("watcher loop error", err.message);
    }
}

async function main() {
    ensureDirs();
    // determine compose working dir and write an initial status so the frontend reflects current state
    const workdir =
        process.env.COMPOSE_DIR ||
        path.dirname(config.composePath || "/root/docker_compose.yml") ||
        "/";
    try {
        const running = await isComposeRunning(workdir);
        if (running) {
            writeStatus({ state: "active", lastAt: new Date().toISOString() });
        } else {
            writeStatus({
                state: "inactive",
                lastAt: new Date().toISOString(),
            });
        }
    } catch (e) {
        // ignore
    }
    console.log(
        "watcher started, watchDir=",
        WATCH_DIR,
        "composeDir=",
        workdir
    );
    // start compose polling loop
    try {
        // run immediately to seed status and start adaptive polling loop
        await pollComposeStatePeriodically(workdir);
        composePollLoop(workdir);
    } catch (e) {
        // ignore
    }
    // simple polling loop so we avoid depending on inotify on all platforms
    setInterval(loopOnce, POLL_INTERVAL);
    // also run once immediately
    await loopOnce();
}

if (require.main === module) {
    main().catch((e) => {
        console.error("fatal", e);
        process.exit(1);
    });
}

module.exports = { main };
