const $ = (id) => document.getElementById(id);
async function fetchStatus() {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("failed to fetch status");
    return res.json();
}
async function fetchLog() {
    // request only the last 40 lines for the UI
    const res = await fetch("/api/log?lines=40");
    if (!res.ok) return "failed to fetch log";
    return res.text();
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function timeAgo(ts) {
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - ts) / 1000)); // seconds
    if (diff < 60) return diff + (diff === 1 ? " second ago" : " seconds ago");
    const mins = Math.floor(diff / 60);
    if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
    const hrs = Math.floor(mins / 60);
    return hrs + (hrs === 1 ? " hour ago" : " hours ago");
}

function formatLast(time) {
    if (!time) return "";
    const d = new Date(time);
    if (isNaN(d.getTime())) return "";
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${hh}:${mm}:${ss} (${timeAgo(d.getTime())})`;
}
async function refresh() {
    try {
        const s = await fetchStatus();
        $("version").textContent = s.version || "-";
        const st = $("status");
        const icon = $("status-icon");
        const statusText = (s.status || "-").toUpperCase();
        st.textContent = statusText;
        const cls = (s.status || "inactive").toLowerCase();
        st.className = "value " + cls;
        // update status icon: classes are 'status-icon active|inactive|updating|error'
        icon.className =
            "status-icon " + (s.status || "inactive").toLowerCase();
        // Only display last updated according to the lastAt value (set on actual updates).
        $("last").textContent = formatLast(s.lastAt);
        const log = await fetchLog();
        $("log").value = log;
    } catch (err) {
        $("status").textContent = "ERROR";
        $("status").className = "value inactive";
        const icon = $("status-icon");
        icon.className = "status-icon error";
        $("log").value = String(err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    $("refresh").addEventListener("click", refresh);
    $("trigger").addEventListener("click", async () => {
        const key = $("authKey").value || "";
        const repo = $("repoName").value || "example/repo";
        const now = new Date().toISOString();
        const payload = {
            action: "push",
            repository: {
                full_name: repo,
                name: repo.split("/").slice(-1)[0] || "repo",
                owner: { login: repo.split("/")[0] || "owner" },
                html_url: `https://github.com/${repo}`,
            },
            ref: "refs/heads/main",
            before: "0000000000000000000000000000000000000000",
            after: "1111111111111111111111111111111111111111",
            pusher: { name: "tester", email: "tester@example.com" },
            sender: { login: "tester" },
            created_at: now,
            received_at: now,
        };
        try {
            const res = await fetch("/webhook", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: key ? `Bearer ${key}` : "",
                    "X-GitHub-Event": "push",
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const msg =
                    body && body.error ? body.error : `status=${res.status}`;
                $("log").value = `[trigger] failed: ${msg}\n` + $("log").value;
            } else {
                const body = await res.json().catch(() => ({}));
                $("log").value =
                    `[trigger] accepted ${JSON.stringify(body)}\n` +
                    $("log").value;
                // refresh UI to reflect new trigger being processed
                setTimeout(refresh, 500);
            }
        } catch (e) {
            $("log").value = `[trigger] error: ${e.message}\n` + $("log").value;
        }
    });
    refresh();
    setInterval(refresh, 5000);
});
