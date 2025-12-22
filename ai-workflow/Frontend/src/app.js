let backendUrl = null;
let jobId = null;
let pollInterval = null;
let chatHistory = [];

// ---------------- CONFIG ----------------

fetch("config.json")
  .then(res => res.json())
  .then(cfg => backendUrl = cfg.backend_url);

// ---------------- TASKS ----------------

function getSelectedTasks() {
  const boxes = document.querySelectorAll("input[type=checkbox]:checked");
  const tasks = {
    summary: false,
    quiz: false,
    flashcards: false,
    full_pipeline: false
  };
  boxes.forEach(b => tasks[b.value] = true);
  return tasks;
}

// ---------------- JOB ----------------

async function createJob() {
  const file = document.getElementById("pdfFile").files[0];
  if (!file) return alert("Select a PDF");

  const jobRes = await fetch(`${backendUrl}/jobs/create`, { method: "POST" });
  const job = await jobRes.json();
  jobId = job.job_id;

  const form = new FormData();
  form.append("file", file);

  await fetch(`${backendUrl}/jobs/${jobId}/upload`, {
    method: "POST",
    body: form
  });

  document.getElementById("statusBox").textContent =
    `Job ${jobId} created and file uploaded`;
}

async function runJob() {
  if (!jobId) return alert("Create job first");

  const tasks = getSelectedTasks();
  if (!Object.values(tasks).some(Boolean)) {
    return alert("Select at least one task");
  }

  await fetch(`${backendUrl}/jobs/${jobId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks })
  });

  document.getElementById("statusBox").textContent = "Job running...";
  startPolling();
}

function startPolling() {
  pollInterval = setInterval(async () => {
    const res = await fetch(`${backendUrl}/jobs/${jobId}/status`);
    const data = await res.json();

    document.getElementById("statusBox").textContent =
      JSON.stringify(data, null, 2);

    if (data.status === "completed") {
      clearInterval(pollInterval);
      document.getElementById("resultBox").textContent =
        data.result || "No output";
    }
  }, 2000);
}

// ---------------- CHAT UI ----------------

function handleChatKey(e) {
  if (e.key === "Enter") sendChatMessage();
}

function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  const msg = { role: "user", content: text };
  chatHistory.push(msg);

  renderChatMessage(msg);
  input.value = "";
}

function renderChatMessage(msg) {
  const chatBox = document.getElementById("chatBox");
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble user";
  bubble.textContent = msg.content;
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ---------------- SEND TO JUDGE ----------------

async function sendConversationToJudge() {
  if (!jobId) return alert("No job found");
  if (chatHistory.length === 0) return alert("Chat is empty");

  await fetch(`${backendUrl}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      conversation: chatHistory
    })
  });

  alert("Conversation sent to Judge Agent");
}
