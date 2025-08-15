const $ = (id) => document.getElementById(id);
async function fetchStatus() {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("failed to fetch status");
    return res.json();
}
async function fetchLog() {
    const res = await fetch("/api/log?lines=500");
    if (!res.ok) return "failed to fetch log";
    return res.text();
}
function formatLast(repo, time) {
    if (!repo && !time) return "—";
    return (repo || "unknown") + " at " + (time || "unknown");
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
        $("last").textContent = formatLast(s.lastRepo, s.lastAt);
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
    refresh();
    setInterval(refresh, 5000);
});
