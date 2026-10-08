const params = new URLSearchParams(location.search);
let sourceTabId = Number(params.get("tabId")) || null;
let currentVideo = null;
let pushedVideo = null;

const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const cardHtml = (video, active = false) => {
  if (!video) {
    return '<div class="placeholder">Nothing is currently pushed.</div>';
  }

  const image = video.image
    ? `<img src="${escapeHtml(video.image)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
    : "";

  return `
    <div class="media">
      ${image}
    </div>
    <div class="card-body">
      <div class="badge ${active ? "active" : ""}">
        ${active ? "PUSHED TO DISCORD" : "CURRENT"}
      </div>
      <div class="title">${escapeHtml(video.title || "YouTube Video")}</div>
      <div class="artist">${escapeHtml(video.artist || "YouTube")}</div>
      <div class="url">${escapeHtml(video.url || "")}</div>
    </div>
  `;
};

const setStatus = (text = "", kind = "") => {
  const node = $("status");
  node.textContent = text;
  node.className = kind ? `status ${kind}` : "status";
};

const render = () => {
  $("currentCard").innerHTML = currentVideo
    ? cardHtml(currentVideo)
    : '<div class="placeholder">Open a YouTube watch page to use manual push.</div>';

  $("pushedCard").innerHTML = pushedVideo
    ? cardHtml(pushedVideo, true)
    : '<div class="placeholder">Nothing is pushed to Discord.</div>';

  const hasCurrent = !!currentVideo;
  const hasPushed = !!pushedVideo;

  $("pushCurrent").disabled = !hasCurrent;
  $("replaceCurrent").disabled = !hasCurrent;
  $("clearPushed").disabled = !hasPushed;

  $("pushCurrent").textContent = hasPushed
    ? "Replace with current video"
    : "Push current video";
};

const getSourceTab = async () => {
  if (Number.isInteger(sourceTabId)) {
    try {
      const tab = await browser.tabs.get(sourceTabId);
      if (tab?.id != null) return tab;
    } catch {}
  }

  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const tab = tabs?.[0] || null;

  if (tab?.id != null) {
    sourceTabId = tab.id;
  }

  return tab;
};

const loadState = async () => {
  setStatus("Reading YouTube…");

  const tab = await getSourceTab();

  if (!tab?.id) {
    currentVideo = null;
    render();
    setStatus("No active browser tab.", "error");
    return;
  }

  const result = await browser.runtime.sendMessage({
    type: "manualPush:getState",
    tabId: tab.id,
  });

  if (!result?.ok) {
    currentVideo = null;
    pushedVideo = null;
    render();
    setStatus(result?.error || "Unable to read the current video.", "error");
    return;
  }

  currentVideo = result.current || null;
  pushedVideo = result.pushed || null;
  render();

  if (!currentVideo) {
    setStatus("Open a YouTube watch page.");
  } else if (pushedVideo) {
    setStatus(
      "A video is pinned to Discord until you replace or clear it.",
      "success",
    );
  } else {
    setStatus("Ready to push.");
  }
};

const pushCurrent = async () => {
  if (!Number.isInteger(sourceTabId) || !currentVideo) return;

  $("pushCurrent").disabled = true;
  $("replaceCurrent").disabled = true;
  setStatus("Pushing to Discord…");

  const result = await browser.runtime.sendMessage({
    type: "manualPush:pushCurrent",
    tabId: sourceTabId,
  });

  if (!result?.ok) {
    setStatus(result?.error || "Push failed.", "error");
    render();
    return;
  }

  pushedVideo = result.pushed || null;
  render();
  setStatus("This video is now pinned to Discord.", "success");
};

const clearPushed = async () => {
  $("clearPushed").disabled = true;
  setStatus("Clearing Discord…");

  const result = await browser.runtime.sendMessage({
    type: "manualPush:clear",
  });

  if (!result?.ok) {
    setStatus(result?.error || "Clear failed.", "error");
    render();
    return;
  }

  pushedVideo = null;
  render();
  setStatus("Discord presence cleared.", "success");
};

$("pushCurrent").addEventListener("click", pushCurrent);
$("replaceCurrent").addEventListener("click", pushCurrent);
$("clearPushed").addEventListener("click", clearPushed);
$("refresh").addEventListener("click", loadState);

$("openLibrary").addEventListener("click", async () => {
  await browser.tabs.create({
    url: browser.runtime.getURL("activityLibrary/library.html"),
  });
});

$("openOriginal").addEventListener("click", async () => {
  await browser.tabs.create({
    url: browser.runtime.getURL("popup/popup.html?fullpage=1"),
  });
});

browser.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.manualPush) return;

  pushedVideo = changes.manualPush.newValue || null;
  render();

  setStatus(
    pushedVideo
      ? "The pushed video is pinned to Discord."
      : "Discord presence cleared.",
    pushedVideo ? "success" : "",
  );
});

render();
loadState();
