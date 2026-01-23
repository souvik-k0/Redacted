const state = {
  currentCase: null,
  actionPoints: 0,
  selectedSuspectId: null,
  chatHistory: [],
  evidenceFound: [],
  labReady: false,
  labProcessing: false,
  responseIndex: {},
  apiKey: null,
  activeCases: []
};

// UI Elements
const caseTitle = document.getElementById("case-title");
const actionPointsEl = document.getElementById("action-points");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const apiKeyInput = document.getElementById("api-key");
const saveKeyBtn = document.getElementById("save-key");
const keyStatus = document.getElementById("key-status");
const casePicker = document.getElementById("case-picker");
const caseList = document.getElementById("case-list");
const gameView = document.getElementById("game-view");
const suspectName = document.getElementById("suspect-name");
const suspectPersona = document.getElementById("suspect-persona");
const chatWindow = document.getElementById("chat-window");
const userInput = document.getElementById("user-input");
const sendMessage = document.getElementById("send-message");
const searchBody = document.getElementById("search-body");
const checkRoom = document.getElementById("check-room");
const sendLab = document.getElementById("send-lab");
const caseSummary = document.getElementById("case-summary");
const caseMeta = document.getElementById("case-meta");
const suspectList = document.getElementById("suspect-list");
const evidenceList = document.getElementById("evidence-list");
const accuseSuspect = document.getElementById("accuse-suspect");
const accuseMotive = document.getElementById("accuse-motive");
const submitAccusation = document.getElementById("submit-accusation");
const accusationResult = document.getElementById("accusation-result");
const backToCases = document.getElementById("back-to-cases");

const updateActionPoints = () => {
  actionPointsEl.textContent = `Actions: ${state.actionPoints}`;
  actionPointsEl.classList.add("action-point-deduct");
  setTimeout(() => actionPointsEl.classList.remove("action-point-deduct"), 200);

  const disabled = state.actionPoints <= 0;
  userInput.disabled = disabled || !state.selectedSuspectId;
  sendMessage.disabled = disabled || !state.selectedSuspectId;
  searchBody.disabled = disabled;
  checkRoom.disabled = disabled;
  sendLab.disabled = disabled || !state.labReady || state.labProcessing;

  if (state.actionPoints === 0) {
    addMessage("system", "<strong>GAME OVER:</strong> You have run out of actions. The killer has escaped.", true);
    gameView.classList.add("shake-effect");
  }
};

const showTypingIndicator = () => {
  const bubble = document.createElement("div");
  bubble.className = "typing-indicator";
  bubble.id = "typing-indicator";
  bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
};

const removeTypingIndicator = () => {
  const bubble = document.getElementById("typing-indicator");
  if (bubble) bubble.remove();
};

const addMessage = (author, text, isHtml = false) => {
  state.chatHistory.push({ author, text });
  const bubble = document.createElement("div");
  bubble.className = `message ${author}`;
  if (isHtml) {
    bubble.innerHTML = text;
  } else {
    bubble.textContent = text;
  }
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
};

const renderEvidence = (newItems = []) => {
  evidenceList.innerHTML = "";
  state.evidenceFound.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    if (newItems.includes(item)) {
      li.classList.add("new-evidence");
    }
    evidenceList.appendChild(li);
  });
};

const setSystemIntro = (caseData) => {
  chatWindow.innerHTML = "";
  addMessage(
    "system",
    `Case opened: ${caseData.title}. You have ${state.actionPoints} actions to solve it.`
  );
};

const callGeminiAI = async (suspect, userText) => {
  const caseContext = `
    Case: ${state.currentCase.title}
    Victim: ${state.currentCase.victim}
    Cause of Death: ${state.currentCase.cause}
    Location: ${state.currentCase.location}
    Time: ${state.currentCase.time}
  `;

  const suspectContext = `
    You are ${suspect.name}.
    Persona: ${suspect.persona}
    Your Secret: ${suspect.secret || "None"}
    Your Alibi: ${suspect.alibi}
    Your Motive: ${suspect.motive}
    Your Relationship to Victim: ${suspect.relationship}
    What you know about evidence: ${suspect.evidence}
  `;

  const prompt = `
    ${caseContext}
    ${suspectContext}
    The user (Detective) asks: "${userText}"
    Instructions:
    1. Reply in character as ${suspect.name}.
    2. Be defensive if you are the killer or have a secret.
    3. Keep it under 50 words.
    4. Do not reveal your secret unless pressed hard or presented proof.
    5. If innocent, be helpful but maybe annoyed.
    6. Never break character.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return getScriptedResponse(suspect, userText) + " (AI Error: Reverted to script)";
    }
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Network/API Error:", error);
    return getScriptedResponse(suspect, userText) + " (Connection Error)";
  }
};

const generateAICases = async () => {
  if (!state.apiKey) {
    alert("Please enter your Gemini API Key in Settings to generate cases.");
    settingsModal.classList.remove("hidden");
    return;
  }

  caseList.innerHTML = '<div class="loading-msg">Generating 5 Unique Cases via Gemini AI...<br>This may take a few seconds.</div>';

  const prompt = `
    Generate 5 unique detective mystery cases.
    Each case must be a valid JSON object following this exact schema:
    [
      {
        "id": "unique_string",
        "title": "String",
        "theme": "String (e.g. Noir, Cyberpunk, Victorian)",
        "narrative": "String (Long description)",
        "summary": "String (Short description)",
        "victim": "Name",
        "cause": "Cause of death",
        "location": "Location",
        "time": "Time",
        "suspects": [
          {
            "id": "unique_id",
            "name": "Name",
            "persona": "Description",
            "alibi": "Alibi explanation",
            "motive": "Motive explanation",
            "evidence": "Evidence linking them",
            "secret": "A secret they are hiding"
          }
        ],
        "evidence": {
          "initial": ["Item 1", "Item 2"],
          "bodySearch": ["Item 3", "Item 4"],
          "roomSearch": ["Item 5", "Item 6"],
          "labClue": "Clue from lab analysis",
          "smokingGun": "The piece of evidence that proves the killer"
        },
        "killerId": "id of one suspect",
        "motiveText": "Full explanation of why they did it",
        "motiveKeywords": ["keyword1", "keyword2", "keyword3"]
      }
    ]
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json"
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
      })
    });
    const data = await response.json();

    if (data.error) {
      console.error("Gemini Generation Error:", data.error);
      alert(`AI Error: ${data.error.message || "Unknown Error"}`);
      caseList.innerHTML = '<div class="error-msg">AI Generation Failed. Check settings.</div>';
      return;
    }

    if (!data.candidates || !data.candidates[0].content) {
      console.error("No candidates returned. Safety Block?", data);
      alert("AI Generation Blocked by Safety Filters. Try again.");
      caseList.innerHTML = '<div class="error-msg">Generation Blocked by Safety Levels.</div>';
      return;
    }

    let text = data.candidates[0].content.parts[0].text;
    const newCases = JSON.parse(text);

    if (!Array.isArray(newCases)) {
      throw new Error("AI did not return an array.");
    }

    // Assign random images to cases
    const sceneImages = ["scene_office.png", "scene_alley.png", "scene_mansion.png"];
    newCases.forEach(c => {
      c.image = sceneImages[Math.floor(Math.random() * sceneImages.length)];
    });

    state.activeCases = newCases;
    renderCaseCards();
    alert("5 New AI Cases Generated Successfully!");

  } catch (error) {
    console.error("AI Generation Failed:", error);
    alert("Error generating cases. Monitor console for details.");
    caseList.innerHTML = '<div class="error-msg">Network or API Error.</div>';
  }
};

const getScriptedResponse = (suspect, text) => {
  const lower = text.toLowerCase();
  if (lower.includes("alibi") || lower.includes("where") || lower.includes("time")) {
    return suspect.alibi;
  }
  if (lower.includes("motive") || lower.includes("why")) {
    return suspect.motive;
  }
  if (lower.includes("relationship") || lower.includes("victim")) {
    return suspect.relationship;
  }
  if (lower.includes("evidence") || lower.includes("clue")) {
    return suspect.evidence;
  }
  const index = state.responseIndex[suspect.id] ?? 0;
  const line = suspect.generic ? suspect.generic[index % suspect.generic.length] : "I have nothing to say.";
  state.responseIndex[suspect.id] = index + 1;
  return line;
};

const getSuspectResponse = async (suspect, text) => {
  if (state.apiKey) {
    return await callGeminiAI(suspect, text);
  } else {
    // Simulate thinking time for scripted response
    await new Promise(r => setTimeout(r, 1000));
    return getScriptedResponse(suspect, text);
  }
};

const selectSuspect = (suspectId) => {
  state.selectedSuspectId = suspectId;
  const suspect = state.currentCase.suspects.find((item) => item.id === suspectId);
  suspectName.textContent = suspect.name;
  suspectPersona.textContent = suspect.persona;
  document.querySelectorAll(".suspect-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.id === suspectId);
  });
  addMessage("system", `Interrogation started with ${suspect.name}.`);
  updateActionPoints();
};

const renderSuspects = (caseData) => {
  suspectList.innerHTML = "";
  accuseSuspect.innerHTML = "<option value=''>Select suspect</option>";
  caseData.suspects.forEach((suspect) => {
    const card = document.createElement("div");
    card.className = "suspect-card";
    card.dataset.id = suspect.id;
    card.innerHTML = `<strong>${suspect.name}</strong><div>${suspect.persona}</div>`;
    card.addEventListener("click", () => selectSuspect(suspect.id));
    suspectList.appendChild(card);

    const option = document.createElement("option");
    option.value = suspect.id;
    option.textContent = suspect.name;
    accuseSuspect.appendChild(option);
  });
};

const renderCaseMeta = (caseData) => {
  caseSummary.textContent = caseData.summary;
  caseMeta.innerHTML = `
    <div><strong>Victim:</strong> ${caseData.victim}</div>
    <div><strong>Cause:</strong> ${caseData.cause}</div>
    <div><strong>Location:</strong> ${caseData.location}</div>
    <div><strong>Time:</strong> ${caseData.time}</div>
  `;
};

const storyView = document.getElementById("story-view");
const storyTitle = document.getElementById("story-title");
const storyText = document.getElementById("story-text");
const startInvestigationBtn = document.getElementById("start-investigation");
const mainMenu = document.getElementById("main-menu");
const startGameBtn = document.getElementById("start-game-btn");

startGameBtn.addEventListener("click", () => {
  mainMenu.classList.add("hidden");
  casePicker.classList.remove("hidden");
});

const enterInvestigation = () => {
  storyView.classList.add("hidden");
  gameView.classList.remove("hidden");
  updateActionPoints();
};

const startCase = (caseId) => {
  const caseData = state.activeCases.find((item) => item.id === caseId);
  state.currentCase = caseData;
  state.actionPoints = 20;
  state.selectedSuspectId = null;
  state.chatHistory = [];
  state.evidenceFound = [...caseData.evidence.initial];
  state.labReady = true;
  state.labProcessing = false;
  state.responseIndex = {};

  caseTitle.textContent = caseData.title;
  setSystemIntro(caseData);
  renderCaseMeta(caseData);
  renderSuspects(caseData);
  renderEvidence();
  accusationResult.textContent = "";
  accuseMotive.value = "";
  suspectName.textContent = "Select a Suspect";
  suspectPersona.textContent = "Pick someone to interrogate.";

  // Show Story View
  storyTitle.textContent = caseData.title;
  storyText.innerHTML = caseData.narrative || caseData.summary;

  // Random Photo ID & Image Display
  const photoIdEl = document.getElementById("photo-id");
  const sceneImageContainer = document.getElementById("crime-scene-image");

  if (photoIdEl) {
    photoIdEl.textContent = Math.floor(Math.random() * 8999) + 1000;
  }

  if (sceneImageContainer && caseData.image) {
    sceneImageContainer.innerHTML = `<img src="./${caseData.image}" alt="Evidence Photo" style="width:100%; height:100%; object-fit:cover; filter: sepia(0.2) contrast(1.2);">`;
  } else if (sceneImageContainer) {
    sceneImageContainer.innerHTML = `<span>EVIDENCE PHOTO #<span id="photo-id">---</span></span><span class="stamp-missing">IMAGE MISSING</span>`;
  }

  casePicker.classList.add("hidden");
  storyView.classList.remove("hidden");
  // gameView will be shown after story
};

startInvestigationBtn.addEventListener("click", enterInvestigation);

const handleUserMessage = async () => {
  if (!state.selectedSuspectId || state.actionPoints <= 0) return;
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  state.actionPoints -= 1;
  updateActionPoints(); // Update UI immediately

  addMessage("user", text);
  showTypingIndicator();

  const suspect = state.currentCase.suspects.find(
    (item) => item.id === state.selectedSuspectId
  );

  const response = await getSuspectResponse(suspect, text);
  removeTypingIndicator();
  addMessage("suspect", response);
};

const handleSearch = (type) => {
  if (state.actionPoints <= 0) return;
  const caseEvidence = state.currentCase.evidence;
  let newItems = [];
  if (type === "body") {
    newItems = caseEvidence.bodySearch;
  }
  if (type === "room") {
    newItems = caseEvidence.roomSearch;
  }
  const added = newItems.filter((item) => !state.evidenceFound.includes(item));
  if (added.length === 0) {
    addMessage("system", "No new evidence found.");
    return;
  }
  state.actionPoints -= 1;
  state.evidenceFound = [...state.evidenceFound, ...added];
  renderEvidence(added);
  addMessage("system", `${added.length} new evidence item(s) logged.`);
  updateActionPoints();
};

const handleLab = () => {
  if (state.actionPoints <= 0 || !state.labReady || state.labProcessing) return;
  state.actionPoints -= 1;
  state.labProcessing = true;
  updateActionPoints();

  // Visual timer in chat
  const timerId = "lab-timer-" + Date.now();
  addMessage("system", `Analyzing sample... <div id="${timerId}" class="lab-timer-container"><div class="lab-timer-bar"></div></div>`, true);

  // Animate bar
  setTimeout(() => {
    const bar = document.querySelector(`#${timerId} .lab-timer-bar`);
    if (bar) bar.style.width = "100%";
  }, 100);

  setTimeout(() => {
    const clue = state.currentCase.evidence.labClue;
    if (!state.evidenceFound.includes(clue)) {
      state.evidenceFound.push(clue);
      renderEvidence([clue]);
    }
    state.labProcessing = false;
    state.labReady = false;
    addMessage("system", "Lab report received: Analysis complete.");
    updateActionPoints();
  }, 5000);
};

const handleAccusation = () => {
  const suspectId = accuseSuspect.value;
  const motiveText = accuseMotive.value.trim().toLowerCase();
  if (!suspectId || !motiveText) {
    accusationResult.textContent = "Select a suspect and describe the motive.";
    gameView.classList.add("shake-effect");
    setTimeout(() => gameView.classList.remove("shake-effect"), 500);
    return;
  }
  const caseData = state.currentCase;
  const isCorrectSuspect = suspectId === caseData.killerId;
  const keywordHits = caseData.motiveKeywords.filter((keyword) =>
    motiveText.includes(keyword)
  ).length;
  const requiredHits = Math.ceil(caseData.motiveKeywords.length / 2);
  const isCorrectMotive = keywordHits >= requiredHits;

  if (isCorrectSuspect && isCorrectMotive) {
    accusationResult.style.color = "var(--success)";
    accusationResult.textContent = `CORRECT! Case Closed. ${caseData.evidence.smokingGun}`;
    // Victory animation could go here
  } else {
    const killer = caseData.suspects.find((item) => item.id === caseData.killerId);
    accusationResult.style.color = "#ff4444";
    accusationResult.textContent = `INCORRECT. The killer escaped.`;
    gameView.classList.add("shake-effect");
    setTimeout(() => gameView.classList.remove("shake-effect"), 500);
  }
};

const renderCaseCards = () => {
  caseList.innerHTML = "";
  if (state.activeCases.length === 0) {
    caseList.innerHTML = '<div class="empty-state">No cases available. <br>Please configure AI Settings to generate new cases.</div>';
    return;
  }
  state.activeCases.forEach((item) => {
    const card = document.createElement("div");
    card.className = "case-card";
    card.innerHTML = `
      <h3>${item.title}</h3>
      <p>${item.summary}</p>
      <span>${item.theme}</span>
      <div class="stamp-unsolved">UNSOLVED</div>
      <button>Open Case</button>
    `;
    card.addEventListener("click", () => startCase(item.id));
    caseList.appendChild(card);
  });
};

settingsBtn.addEventListener("click", () => {
  settingsModal.classList.remove("hidden");
  apiKeyInput.value = state.apiKey || "";
  updateKeyStatus();
});




saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    state.apiKey = key;
    alert("API Key Saved! Generating 5 New AI Cases...");
    settingsModal.classList.add("hidden");
    generateAICases();
  } else {
    state.apiKey = null;
    alert("API Key Removed.");
    state.activeCases = [];
    renderCaseCards();
  }
  updateKeyStatus();
  settingsModal.classList.add("hidden");
});

const updateKeyStatus = () => {
  if (state.apiKey) {
    keyStatus.textContent = "Current Status: AI ENABLED (Online)";
    keyStatus.style.color = "var(--success)";
  } else {
    keyStatus.textContent = "Current Status: MISSING API KEY";
    keyStatus.style.color = "#d32f2f";
  }
};

updateKeyStatus();

renderCaseCards();
updateActionPoints();