const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
    path: "/root/DockerHook/.env",
});

const normPath = (p) => (p ? path.normalize(p) : p);

const devFlag =
    String(process.env.DEV_TEST_MODE || "false").toLowerCase() === "true";
const defaultDevTrigger = path.join(__dirname, "..", ".dev_trigger");

module.exports = {
    port: Number(process.env.PORT || 3000),
    // when true, the server will relax some checks for local frontend testing
    devTestMode: devFlag,
    authToken: process.env.AUTH_TOKEN || "",
    composePath: normPath(
        // allow override via env, otherwise keep normal default; in dev mode we don't require the real compose file
        process.env.COMPOSE_PATH ||
            (devFlag
                ? path.join(__dirname, "..", "public", "docker_compose.yml")
                : "/root/docker_compose.yml")
    ),
    triggerDir: normPath(
        process.env.TRIGGER_DIR ||
            (devFlag ? defaultDevTrigger : "/var/run/dockerhook")
    ),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 60),
};
