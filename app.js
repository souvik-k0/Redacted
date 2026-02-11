const state = {
  currentCase: null,
  actionPoints: 0,
  selectedSuspectId: null,
  chatHistory: [],
  evidenceFound: [],
  investigationNotes: [],
  labReady: false,
  labProcessing: false,
  responseIndex: {},
  activeCases: [],
  
  // Persistent State (Managed by GameDatabase)
  user: null, // { id, name, xp, rankIndex, apiKey, language, solvedCases }
  language: 'en'
};

// ========================
// ENHANCED DATABASE SYSTEM
// ========================
const GameDatabase = {
  DB_KEY: 'redacted_db_v2',
  VERSION: 2,
  
  // Initialize database with proper schema
  init: function() {
    try {
      const existingData = localStorage.getItem(this.DB_KEY);
      
      if (!existingData) {
        // Create fresh database with proper schema
        const initialData = {
          version: this.VERSION,
          users: {},
          lastUser: null,
          settings: {
            autoSave: true,
            backupEnabled: false,
            lastBackup: null
          },
          statistics: {
            totalUsers: 0,
            totalCasesSolved: 0,
            totalPlayTime: 0,
            lastUpdated: Date.now()
          }
        };
        this._save(initialData);
        console.log('New database initialized with version', this.VERSION);
      } else {
        // Check if we need to migrate from old version
        const data = JSON.parse(existingData);
        if (data.version !== this.VERSION) {
          this._migrateFromV1(data);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Database initialization failed:', error);
      return false;
    }
  },

  // Get entire database (with error handling)
  getDB: function() {
    try {
      const data = localStorage.getItem(this.DB_KEY);
      if (!data) {
        this.init();
        return this.getDB();
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to get database:', error);
      this.init(); // Reset on critical error
      return this.getDB();
    }
  },

  // Save database with validation
  _save: function(data) {
    try {
      // Validate data structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data structure');
      }
      
      // Ensure required fields
      data.version = this.VERSION;
      data.lastUpdated = Date.now();
      
      localStorage.setItem(this.DB_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Failed to save database:', error);
      return false;
    }
  },

  // User management
  createUser: function(name, initialData = {}) {
    try {
      const db = this.getDB();
      const id = this._generateUserId(name);
      
      if (db.users[id]) {
        throw new Error('User already exists');
      }
      
      const user = {
        id: id,
        name: name.trim(),
        xp: 0,
        rankIndex: 0,
        language: 'en',
        solvedCases: [],
        currentCase: null,
        playTime: 0,
        achievements: [],
        preferences: {
          soundEnabled: true,
          musicEnabled: false,
          notifications: true
        },
        createdAt: Date.now(),
        lastLogin: Date.now(),
        ...initialData
      };
      
      // Remove any sensitive data
      delete user.apiKey;
      
      db.users[id] = user;
      db.statistics.totalUsers = Object.keys(db.users).length;
      
      if (this._save(db)) {
        return user;
      }
      
      throw new Error('Failed to save user');
    } catch (error) {
      console.error('Failed to create user:', error);
      return null;
    }
  },

  getUser: function(userId) {
    try {
      const db = this.getDB();
      return db.users[userId] || null;
    } catch (error) {
      console.error('Failed to get user:', error);
      return null;
    }
  },

  updateUser: function(userId, updates) {
    try {
      const db = this.getDB();
      const user = db.users[userId];
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Apply updates (excluding sensitive fields)
      const safeUpdates = { ...updates };
      delete safeUpdates.apiKey;
      delete safeUpdates.id;
      delete safeUpdates.createdAt;
      
      Object.assign(user, safeUpdates);
      user.lastUpdated = Date.now();
      
      if (this._save(db)) {
        return user;
      }
      
      throw new Error('Failed to save user updates');
    } catch (error) {
      console.error('Failed to update user:', error);
      return null;
    }
  },

  deleteUser: function(userId) {
    try {
      const db = this.getDB();
      
      if (!db.users[userId]) {
        return true; // Already deleted
      }
      
      delete db.users[userId];
      db.statistics.totalUsers = Object.keys(db.users).length;
      
      // Clear last user if it was this user
      if (db.lastUser === userId) {
        db.lastUser = null;
      }
      
      return this._save(db);
    } catch (error) {
      console.error('Failed to delete user:', error);
      return false;
    }
  },

  getAllUsers: function() {
    try {
      const db = this.getDB();
      return Object.values(db.users);
    } catch (error) {
      console.error('Failed to get users:', error);
      return [];
    }
  },

  // Authentication and session management
  login: function(name) {
    try {
      const db = this.getDB();
      const id = this._generateUserId(name);
      
      let user = db.users[id];
      
      if (!user) {
        // Create new user with proper validation
        user = this.createUser(name);
        if (!user) {
          throw new Error('Failed to create user during login');
        }
      }
      
      // Update login stats
      user.lastLogin = Date.now();
      user.loginCount = (user.loginCount || 0) + 1;
      
      db.lastUser = id;
      
      if (this._save(db)) {
        return user;
      }
      
      throw new Error('Failed to save login state');
    } catch (error) {
      console.error('Login failed:', error);
      return null;
    }
  },

  getLastUser: function() {
    try {
      const db = this.getDB();
      return db.lastUser ? this.getUser(db.lastUser) : null;
    } catch (error) {
      console.error('Failed to get last user:', error);
      return null;
    }
  },

  // Case management
  addSolvedCase: function(userId, caseData) {
    try {
      const user = this.getUser(userId);
      if (!user) return false;
      
      const solvedCase = {
        caseId: caseData.id || caseData.caseId,
        title: caseData.title || 'Unknown Case',
        solvedAt: Date.now(),
        accuracy: caseData.accuracy || 100,
        timeTaken: caseData.timeTaken || 0,
        score: caseData.score || 0
      };
      
      user.solvedCases.push(solvedCase);
      
      // Update statistics
      const db = this.getDB();
      db.statistics.totalCasesSolved++;
      
      return this.updateUser(userId, user);
    } catch (error) {
      console.error('Failed to add solved case:', error);
      return false;
    }
  },

  // Utility methods
  _generateUserId: function(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_');
  },

  _migrateFromV1: function(oldData) {
    try {
      console.log('Migrating database from v1 to v2');
      
      const newData = {
        version: this.VERSION,
        users: {},
        lastUser: oldData.lastUser,
        settings: {
          autoSave: true,
          backupEnabled: false,
          lastBackup: null
        },
        statistics: {
          totalUsers: Object.keys(oldData.users || {}).length,
          totalCasesSolved: 0,
          totalPlayTime: 0,
          lastUpdated: Date.now()
        }
      };
      
      // Migrate users
      if (oldData.users) {
        Object.entries(oldData.users).forEach(([id, user]) => {
          newData.users[id] = {
            ...user,
            currentCase: null,
            playTime: 0,
            achievements: [],
            preferences: {
              soundEnabled: true,
              musicEnabled: false,
              notifications: true
            },
            lastLogin: user.lastLogin || user.createdAt || Date.now(),
            loginCount: 1
          };
          
          // Calculate total solved cases
          if (user.solvedCases && user.solvedCases.length > 0) {
            newData.statistics.totalCasesSolved += user.solvedCases.length;
          }
        });
      }
      
      this._save(newData);
      console.log('Database migration completed successfully');
      return true;
    } catch (error) {
      console.error('Database migration failed:', error);
      return false;
    }
  },

  // Backup and restore functionality
  exportData: function() {
    try {
      const db = this.getDB();
      return JSON.stringify(db, null, 2);
    } catch (error) {
      console.error('Failed to export data:', error);
      return null;
    }
  },

  importData: function(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (data && typeof data === 'object') {
        return this._save(data);
      }
      throw new Error('Invalid data format');
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  },

  // Clear all data (for testing/debugging)
  clearAll: function() {
    try {
      localStorage.removeItem(this.DB_KEY);
      return true;
    } catch (error) {
      console.error('Failed to clear database:', error);
      return false;
    }
  }
};

// ========================
// AUDIO SYSTEM (No external assets needed)
// ========================
const SoundManager = {
  ctx: null,
  init: function() {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
  },
  playTone: function(freq, type, duration, vol = 0.1) {
    if (!this.ctx) this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  click: function() { this.playTone(800, 'sine', 0.1, 0.05); },
  type: function() { this.playTone(400 + Math.random() * 200, 'triangle', 0.05, 0.02); },
  success: function() {
    this.playTone(440, 'sine', 0.2, 0.1);
    setTimeout(() => this.playTone(554, 'sine', 0.2, 0.1), 100);
    setTimeout(() => this.playTone(659, 'sine', 0.4, 0.1), 200);
  },
  failure: function() {
    this.playTone(150, 'sawtooth', 0.4, 0.1);
    setTimeout(() => this.playTone(100, 'sawtooth', 0.4, 0.1), 200);
  },
  evidence: function() {
    this.playTone(1200, 'sine', 0.1, 0.05);
    setTimeout(() => this.playTone(1800, 'sine', 0.3, 0.05), 100);
  }
};

// ========================
// PROGRESSION SYSTEM
// ========================
const RANKS = [
  { threshold: 0, title: "🔰 Rookie", titleBn: "🔰 শিক্ষানবিশ" },
  { threshold: 100, title: "👮 Constable", titleBn: "👮 কনস্টেবল" },
  { threshold: 300, title: "🕵️ Detective", titleBn: "🕵️ গোয়েন্দা" },
  { threshold: 600, title: "🔍 Inspector", titleBn: "🔍 ইন্সপেক্টর" },
  { threshold: 1000, title: "🌟 Chief", titleBn: "🌟 প্রধান" },
  { threshold: 2000, title: "👑 Legend", titleBn: "👑 কিংবদন্তি" }
];

const PlayerStats = {
  // Migrated to use GameDatabase
  load: function() {
    // This is now handled by Login Logic
    this.updateRank();
  },
  
  addXP: function(amount) {
    if (!state.user) return;
    
    const oldRankIndex = state.user.rankIndex;
    state.user.xp += amount;
    
    // Check Rank Up
    let newIndex = 0;
    for (let i = 0; i < RANKS.length; i++) {
      if (state.user.xp >= RANKS[i].threshold) {
        newIndex = i;
      }
    }
    state.user.rankIndex = newIndex;
    
    // Save to DB
    GameDatabase.updateUser(state.user.id, state.user);
    
    // Check for rank up notification
    if (state.user.rankIndex > oldRankIndex) {
      this.showRankUpModal(state.user.rankIndex);
      SoundManager.success();
    }
    this.updateUI();
  },

  updateRank: function() {
    if (!state.user) return;
    // Just sync UI
    this.updateUI();
  },

  updateUI: function() {
    const rankEl = document.getElementById("player-rank");
    if (rankEl && state.user) {
      const rankData = RANKS[state.user.rankIndex];
      const title = state.language === 'bn' ? rankData.titleBn : rankData.title;
      rankEl.textContent = `${title} (${state.user.xp} XP)`;
    }
  },
  
  showRankUpModal: function(newIndex) {
    const rankData = RANKS[newIndex];
    const title = state.language === 'bn' ? rankData.titleBn : rankData.title;
    
    const modal = document.createElement('div');
    modal.className = 'level-up-modal';
    modal.innerHTML = `
      <span class="rank-icon">⭐</span>
      <h2>PROMOTION!</h2>
      <p>You have been promoted to:</p>
      <h3>${title}</h3>
      <button class="primary-btn" onclick="this.parentElement.remove()">ACCEPT</button>
    `;
    document.body.appendChild(modal);
  }
};

// ========================
// UI ELEMENTS
// ========================
const loginModal = document.getElementById("login-modal");
const detectiveNameInput = document.getElementById("detective-name");
const loginBtn = document.getElementById("login-btn");
const existingProfiles = document.getElementById("existing-profiles");
const profileButtons = document.getElementById("profile-buttons");
const caseTitle = document.getElementById("case-title");
const actionPointsEl = document.getElementById("action-points");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const apiKeyInput = document.getElementById("api-key");
const languageSelect = document.getElementById("language-select");
const saveKeyBtn = document.getElementById("save-key");
const keyStatus = document.getElementById("key-status");
const casePicker = document.getElementById("case-picker");
// ... (rest of UI elements remain same, just ensuring languageSelect is defined)

// ========================
// TRANSLATIONS
// ========================
const translations = {
  en: {
    brandSubtitle: "Top Secret Case Files",
    menuSubtitle: "Top Secret Case Files. Authorized Personnel Only.",
    enterArchives: "ENTER ARCHIVES",
    unsolvedCases: "UNSOLVED CASE FILES",
    aiSetup: "⚙️ AI Setup",
    selectCase: "Select a Case",
    actions: "Actions:",
    beginInvestigation: "Begin Investigation",
    selectSuspect: "Select a Suspect",
    pickSuspect: "Pick someone to interrogate.",
    searchBody: "Search Body",
    checkRoom: "Check Room",
    sendLab: "Send to Lab",
    chatPlaceholder: "Ask a question...",
    send: "Send",
    caseFile: "Case File",
    suspects: "Suspects",
    evidence: "Evidence",
    accusation: "Accusation",
    culprit: "Culprit",
    motive: "Motive",
    motivePlaceholder: "State the motive",
    submitAccusation: "Submit Accusation",
    backToCases: "Back to Cases",
    activateAI: "ACTIVATE AI",
    closeCase: "CLOSE CASE",
    caseClosed: "CASE CLOSED",
    caseCold: "CASE COLD: FAILURE",
    imageMissing: "IMAGE MISSING",
    modalTitle: "DETECTIVE INTELLIGENCE",
    modalDesc: "To enable dynamic AI conversations, enter your Google Gemini API Key below. (Free at aistudio.google.com)",
    labelApiKey: "API Key:",
    statusMissing: "Current Status: MISSING API KEY",
    statusOnline: "Current Status: AI ENABLED (Online)",
    investigationActions: "Investigation Actions",
    interrogating: "Interrogating:",
    detectivesNotes: "Detective's Notes",
    suspectsHint: "Click to interrogate",
    beginInvestigating: "Begin your investigation..."
  },
  bn: {
    brandSubtitle: "টপ সিক্রেট কেস ফাইল",
    menuSubtitle: "গোপনীয় কেস ফাইল। শুধুমাত্র অনুমোদিত ব্যক্তিদের জন্য।",
    enterArchives: "আর্কাইভে প্রবেশ করুন",
    unsolvedCases: "অমীমাংসিত রহস্য",
    aiSetup: "⚙️ সেটিংস",
    selectCase: "একটি কেস নির্বাচন করুন",
    actions: "অ্যাকশন:",
    beginInvestigation: "তদন্ত শুরু করুন",
    selectSuspect: "সন্দেহভাজন নির্বাচন করুন",
    pickSuspect: "জিজ্ঞাসাবাদের জন্য কাউকে বেছে নিন।",
    searchBody: "শরীর তল্লাশি",
    checkRoom: "ঘর তল্লাশি",
    sendLab: "ল্যাবে পাঠান",
    chatPlaceholder: "প্রশ্ন জিজ্ঞাসা করুন...",
    send: "পাঠান",
    caseFile: "কেস ফাইল",
    suspects: "সন্দেহভাজনরা",
    evidence: "প্রমাণ",
    accusation: "অভিযোগ",
    culprit: "অপরাধী",
    motive: "উদ্দেশ্য",
    motivePlaceholder: "উদ্দেশ্য বর্ণনা করুন",
    submitAccusation: "অভিযোগ জমা দিন",
    backToCases: "সব কেস",
    activateAI: "সেভ করুন",
    closeCase: "কেস বন্ধ করুন",
    caseClosed: "কেস সমাধান হয়েছে",
    caseCold: "কেস সমাধান হয়নি",
    imageMissing: "ছবি নেই",
    modalTitle: "গোয়েন্দা বুদ্ধিমত্তা (AI)",
    modalDesc: "ডাইনামিক AI কথোপকথন চালু করতে, নিচে আপনার Google Gemini API Key দিন। (aistudio.google.com এ বিনামূল্যে)",
    labelApiKey: "API কি (Key):",
    statusMissing: "বর্তমান অবস্থা: API KEY নেই",
    statusOnline: "বর্তমান অবস্থা: AI চালু আছে (অনলাইন)",
    investigationActions: "তদন্ত কার্যকলাপ",
    interrogating: "জিজ্ঞাসাবাদ:",
    detectivesNotes: "গোয়েন্দার নোট",
    suspectsHint: "জিজ্ঞাসাবাদ করতে ক্লিক করুন",
    beginInvestigating: "তদন্ত শুরু করুন..."
  }
};

const updateUILanguage = (lang) => {
  // CRITICAL: Set state.language FIRST before anything else
  state.language = lang;
  if (state.user) {
    state.user.language = lang;
    GameDatabase.updateUser(state.user.id, state.user);
  }

  // CRITICAL: Also sync the dropdown to match
  if (languageSelect.value !== lang) {
    languageSelect.value = lang;
  }

  console.log(`updateUILanguage called with: ${lang}, state.language now: ${state.language}, dropdown now: ${languageSelect.value}`);

  const t = translations[lang] || translations.en;

  // Main UI - handle missing elements gracefully
  try {
    const brandSubtitle = document.querySelector(".brand-subtitle");
    const menuSubtitle = document.querySelector(".menu-subtitle");
    const startGameBtn = document.getElementById("start-game-btn");
    const casePickerH2 = document.querySelector("#case-picker h2");
    const caseTitle = document.getElementById("case-title");
    const startInvestigationBtn = document.getElementById("start-investigation");
    
    if (brandSubtitle) brandSubtitle.textContent = t.brandSubtitle;
    if (menuSubtitle) menuSubtitle.textContent = t.menuSubtitle;
    if (startGameBtn) startGameBtn.textContent = t.enterArchives;
    if (casePickerH2) casePickerH2.textContent = t.unsolvedCases;
    if (caseTitle) caseTitle.textContent = t.selectCase;
    if (startInvestigationBtn) startInvestigationBtn.textContent = t.beginInvestigation;
    if (settingsBtn) settingsBtn.innerHTML = t.aiSetup;
  } catch (error) {
    console.warn("Error updating main UI language:", error);
  }

  // Modal Content - handle missing elements gracefully
  try {
    const settingsModalH2 = document.querySelector("#settings-modal h2");
    const settingsModalP = document.querySelector("#settings-modal p");
    const apiKeyLabel = document.querySelector("label[for='api-key']");
    
    if (settingsModalH2) settingsModalH2.textContent = t.modalTitle;
    if (settingsModalP) settingsModalP.textContent = t.modalDesc;
    if (apiKeyLabel) apiKeyLabel.textContent = t.labelApiKey;
  } catch (error) {
    console.warn("Error updating modal content:", error);
  }

  // Game Actions - handle missing elements gracefully
  try {
    const suspectNameEl = document.getElementById("suspect-name");
    const suspectPersonaEl = document.getElementById("suspect-persona");
    if (suspectNameEl) suspectNameEl.textContent = t.selectSuspect;
    if (suspectPersonaEl) suspectPersonaEl.textContent = t.pickSuspect;
    
    if (searchBody) searchBody.textContent = t.searchBody;
    if (checkRoom) checkRoom.textContent = t.checkRoom;
    if (sendLab) sendLab.textContent = t.sendLab;
    
    // Chat modal elements - only update if they exist
    const chatUserInput = document.getElementById("user-input");
    const chatSendMessage = document.getElementById("send-message");
    if (chatUserInput) chatUserInput.placeholder = t.chatPlaceholder;
    if (chatSendMessage) chatSendMessage.textContent = t.send;
  } catch (error) {
    console.warn("Error updating game actions:", error);
  }

  // Headers - handle missing elements gracefully
  try {
    const caseFileHeader = document.querySelector("#game-view h3:nth-of-type(1)");
    const suspectsHeader = document.querySelector("#game-view h3:nth-of-type(2)");
    const evidenceHeader = document.querySelector("#game-view h3:nth-of-type(3)");
    const accusationHeader = document.querySelector("#game-view h3:nth-of-type(4)");
    
    if (caseFileHeader) caseFileHeader.textContent = t.caseFile;
    if (suspectsHeader) suspectsHeader.textContent = t.suspects;
    if (evidenceHeader) evidenceHeader.textContent = t.evidence;
    if (accusationHeader) accusationHeader.textContent = t.accusation;
  } catch (error) {
    console.warn("Error updating headers:", error);
  }

  // Accusation Form
  document.querySelector("label[for='accuse-suspect']").textContent = t.culprit;
  document.querySelector("label[for='accuse-motive']").textContent = t.motive;
  accuseMotive.placeholder = t.motivePlaceholder;
  submitAccusation.textContent = t.submitAccusation;
  backToCases.textContent = t.backToCases;
  saveKeyBtn.textContent = t.activateAI;
  document.getElementById("close-solution").textContent = t.closeCase;

  // Update status message immediately if possible
  updateKeyStatus();

  // Update static elements if they exist
  const stamps = document.querySelectorAll(".stamp-missing");
  stamps.forEach(s => s.textContent = t.imageMissing);

  // New Investigation UI elements
  const actionHeader = document.getElementById("action-header");
  if (actionHeader) actionHeader.textContent = t.investigationActions;

  const interrogationTitle = document.getElementById("interrogation-title");
  if (interrogationTitle) interrogationTitle.textContent = t.interrogating;

  const notesHeader = document.getElementById("notes-header");
  if (notesHeader) notesHeader.textContent = t.detectivesNotes;

  const suspectsHint = document.getElementById("suspects-hint");
  if (suspectsHint) suspectsHint.textContent = t.suspectsHint;

  const notePlaceholder = document.getElementById("note-placeholder");
  if (notePlaceholder) notePlaceholder.textContent = t.beginInvestigating;

  // Update action buttons with emojis
  if (searchBody) searchBody.textContent = `🔍 ${t.searchBody}`;
  if (checkRoom) checkRoom.textContent = `🚪 ${t.checkRoom}`;
  if (sendLab) sendLab.textContent = `🧪 ${t.sendLab}`;

  // Update Rank UI
  PlayerStats.updateUI();
};


const caseList = document.getElementById("case-list");
const gameView = document.getElementById("game-view");
const suspectName = document.getElementById("suspect-name");
const suspectPersona = document.getElementById("suspect-persona");
// chatWindow removed - now using notes-based UI
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

// Typing indicator for chat bubble
const showTypingIndicator = () => {
  const chatBubble = document.getElementById("chat-bubble");
  if (chatBubble) {
    chatBubble.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
    SoundManager.type();
  }
};

// Legacy addMessage - redirects to notes system
const addMessage = (author, text, isHtml = false) => {
  state.chatHistory.push({ author, text });
  if (author === "system") {
    addNote("system", text);
  } else if (author === "suspect") {
    const suspect = state.currentCase?.suspects?.find(s => s.id === state.selectedSuspectId);
    addNote("interrogation", text, suspect?.name || "Suspect");
  } else if (author === "user") {
    addNote("interrogation", `Q: "${text}"`, "Detective");
  }
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

// Investigation Notes System
const addNote = (type, text, speaker = null) => {
  const note = {
    type: type, // 'evidence', 'interrogation', 'system'
    text: text,
    speaker: speaker,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  };
  state.investigationNotes.push(note);
  renderNotes();
};

const renderNotes = () => {
  const notesContent = document.getElementById("notes-content");
  const placeholder = document.getElementById("note-placeholder");

  if (state.investigationNotes.length === 0) {
    if (placeholder) placeholder.style.display = "block";
    return;
  }

  if (placeholder) placeholder.style.display = "none";

  // Clear and re-render (keep placeholder hidden)
  notesContent.innerHTML = "";

  state.investigationNotes.forEach(note => {
    const entry = document.createElement("div");
    entry.className = `note-entry ${note.type}`;

    let noteText = note.text;
    if (note.speaker) {
      noteText = `<strong>${note.speaker}:</strong> ${note.text}`;
    }

    entry.innerHTML = `
      <span class="note-time">${note.time}</span>
      <span class="note-text">${noteText}</span>
    `;
    notesContent.appendChild(entry);
  });

  // Scroll to bottom
  notesContent.scrollTop = notesContent.scrollHeight;
};

const setSystemIntro = (caseData) => {
  // Reset investigation notes for new case
  state.investigationNotes = [];
  renderNotes();

  // Add intro note
  addNote("system", `Case opened: ${caseData.title}. You have ${state.actionPoints} actions to solve it.`);

  // Hide interrogation section (will show when suspect selected)
  const interrogationSection = document.getElementById("interrogation-section");
  if (interrogationSection) {
    interrogationSection.classList.add("hidden");
  }
};

const callGeminiAI = async (suspect, userText) => {
  // Determine if this suspect is the killer
  const isKiller = suspect.id === state.currentCase.killerId;

  // Get evidence the detective has found
  const evidenceFound = state.evidenceFound.join(", ") || "None yet";

  // Get recent conversation history for context
  const recentHistory = state.investigationNotes
    .filter(note => note.speaker === suspect.name || (note.speaker === "Detective" && note.type === "interrogation"))
    .slice(-6)
    .map(note => `${note.speaker}: ${note.text}`)
    .join("\n");

  const caseContext = `
    CASE DETAILS:
    Case: ${state.currentCase.title}
    Victim: ${state.currentCase.victim}
    Cause of Death: ${state.currentCase.cause}
    Location: ${state.currentCase.location}
    Time: ${state.currentCase.time}
    Summary: ${state.currentCase.summary}
  `;

  const suspectContext = `
    CHARACTER PROFILE:
    Name: ${suspect.name}
    Role/Persona: ${suspect.persona}
    Secret (hidden): ${suspect.secret || "None"}
    Claimed Alibi: ${suspect.alibi}
    True Motive: ${suspect.motive}
    Relationship to Victim: ${suspect.relationship}
    Evidence knowledge: ${suspect.evidence}
    
    IS KILLER: ${isKiller ? "YES - You committed this crime" : "NO - You are innocent"}
  `;

  const gameContext = `
    INVESTIGATION STATE:
    Evidence found by detective: ${evidenceFound}
    
    RECENT CONVERSATION:
    ${recentHistory || "First question to this suspect."}
  `;

  let langInstruction = "";
  if (state.language === "bn") {
    langInstruction = `
      CRITICAL: Respond entirely in BENGALI (বাংলা).
      Setting is Kolkata. Use Bengali expressions and cultural nuances.
    `;
  }

  const behaviorRules = isKiller ? `
    GUILTY SUSPECT BEHAVIOR:
    - Never admit guilt unless confronted with absolute proof
    - Be evasive, deflect, or cast suspicion on others
    - Add subtle inconsistencies if asked repeated questions
    - Show nervousness when evidence implicating you is mentioned
    - Get defensive or angry if directly accused without proof
    - Your goal: survive until detective runs out of actions
  ` : `
    INNOCENT SUSPECT BEHAVIOR:
    - Be genuinely helpful but appropriately guarded
    - If you have a secret (affair, debt), be nervous about THAT, not the murder
    - Your alibi is TRUE - be confident about it
    - Offer useful info about other suspects if asked
    - Show grief, fear, or frustration at being suspected
    - Be annoyed if accused without evidence
  `;

  const prompt = `
    ${caseContext}
    ${suspectContext}
    ${gameContext}
    
    Detective asks: "${userText}"
    
    ${langInstruction}
    ${behaviorRules}
    
    RULES:
    1. Stay in character as ${suspect.name}
    2. Under 60 words, concise but dramatic
    3. React to any evidence mentioned
    4. If caught in contradiction, deflect or show stress
    5. Never break character or mention this is a game
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return getScriptedResponse(suspect, userText) + " (AI Error)";
    }
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Network/API Error:", error);
    return getScriptedResponse(suspect, userText) + " (Connection Error)";
  }
};

const generateAICases = async () => {
  // CRITICAL: Read language directly from dropdown FIRST
  const effectiveLang = languageSelect.value;
  state.language = effectiveLang; // Force sync

  console.log("=== GENERATE AI CASES DEBUG ===");
  console.log("Dropdown value:", languageSelect.value);
  console.log("State.language:", state.language);
  console.log("Effective language for this call:", effectiveLang);
  console.log("================================");

  if (!state.apiKey) {
    console.log("No API key - opening settings modal");
    settingsModal.classList.remove("hidden");
    return;
  }

  const loadingMsg = effectiveLang === 'bn'
    ? 'জেমিনি AI এর মাধ্যমে ৫টি অনন্য কেস তৈরি হচ্ছে...<br>কয়েক সেকেন্ড সময় লাগতে পারে।'
    : 'Generating 5 Unique Cases via Gemini AI...<br>This may take a few seconds.';
  caseList.innerHTML = `<div class="loading-msg">${loadingMsg}</div>`;

  let prompt = "";

  if (effectiveLang === "bn") {
    // BENGALI PROMPT - Very explicit, MUST generate in Bengali
    prompt = `
!!! CRITICAL INSTRUCTION - READ FIRST !!!
YOU MUST RESPOND ENTIRELY IN BENGALI (বাংলা) LANGUAGE.
DO NOT USE ANY ENGLISH TEXT IN THE VALUES.
ONLY THE JSON KEYS SHOULD BE IN ENGLISH.
ALL VALUES MUST BE IN BENGALI SCRIPT (বাংলা লিপি).

তুমি একজন বাংলা গোয়েন্দা গল্প লেখক। তোমাকে ৫টি ডিটেকটিভ মিস্ট্রি কেস বাংলায় লিখতে হবে।

বাধ্যতামূলক নিয়ম:
১. সব টেক্সট বাংলায় লিখতে হবে। কোনো ইংরেজি শব্দ চলবে না।
২. স্থান: কলকাতা, পশ্চিমবঙ্গ (যেমন - শ্যামবাজার, কলেজ স্ট্রিট, গড়িয়াহাট, বালিগঞ্জ, উত্তর কলকাতা)
৩. চরিত্রের নাম: বাংলা নাম (যেমন - সুব্রত চ্যাটার্জি, মিতালী ব্যানার্জি, রাজেশ ঘোষ, প্রিয়ংকা রায়)
৪. থিম: বাংলা কালচারাল (যেমন - পুজোর মৌসুম, কলেজ স্ট্রিটের বইয়ের দোকান, পুরনো জমিদার বাড়ি)
৫. narrative ফিল্ডে কমপক্ষে ১০০ শব্দ লিখতে হবে - বিস্তারিত গল্প বলো!

JSON ফরম্যাট (keys ইংরেজি, values বাংলা):
[
  {
    "id": "kolkata_case_1",
    "title": "হাওড়া ব্রিজের রহস্য",
    "theme": "নোয়ার কলকাতা",
    "narrative": "একটি ঝড়ের রাতে হাওড়া ব্রিজের নিচে একটি লাশ পাওয়া যায়। লাশটি ছিল বিখ্যাত ব্যবসায়ী অমিত সেনের। তার মাথায় গভীর আঘাত ছিল। পুলিশ ঘটনাস্থলে পৌঁছে দেখল যে তার পকেটে একটি রহস্যময় চিঠি ছিল। চিঠিতে লেখা ছিল কিছু সংকেত যা বোঝা যাচ্ছিল না। ব্রিজের নিচে তার গাড়িও পাওয়া গেল, কিন্তু গাড়ির চাবি নেই। প্রত্যক্ষদর্শীরা জানাল যে রাত দুটোর দিকে একটি গাড়ি দ্রুত গতিতে ব্রিজ থেকে নেমে গিয়েছিল। এই রহস্যময় খুনের তদন্ত শুরু হল...",
    "summary": "হাওড়া ব্রিজে রহস্যজনক মৃত্যু",
    "victim": "অমিত সেন",
    "cause": "মাথায় আঘাত",
    "location": "হাওড়া ব্রিজ, কলকাতা",
    "time": "রাত ২টা",
    "suspects": [
      {
        "id": "suspect_1",
        "name": "রাজীব চ্যাটার্জি",
        "persona": "ব্যবসায়ী, ৪৫ বছর",
        "alibi": "আমি বাড়িতে ছিলাম",
        "motive": "ব্যবসায়িক প্রতিদ্বন্দ্বিতা",
        "evidence": "তার গাড়ি ব্রিজের কাছে দেখা গেছে",
        "secret": "সে টাকা ধার করেছিল"
      }
    ],
    "evidence": {
      "initial": ["রক্তমাখা রুমাল", "ভাঙা চশমা"],
      "bodySearch": ["মানিব্যাগ", "একটি চিঠি"],
      "roomSearch": ["ছোরা", "পোড়া কাগজ"],
      "labClue": "আঙুলের ছাপ মিলেছে",
      "smokingGun": "হত্যাকারীর ফোনের রেকর্ড"
    },
    "killerId": "suspect_1",
    "motiveText": "টাকার জন্য খুন",
    "solution": "রাজীব টাকা ফেরত দিতে না পেরে অমিতকে খুন করে",
    "motiveKeywords": ["টাকা", "ঋণ", "প্রতিশোধ"]
  }
]

এখন ৫টি সম্পূর্ণ আলাদা কেস তৈরি করো। প্রতিটিতে ৩-৪ জন সন্দেহভাজন রাখো।
মনে রেখো: সব কিছু বাংলায়! narrative কমপক্ষে ১০০ শব্দ!
`;
  } else {
    // English prompt - Enhanced for smarter gameplay
    prompt = `
Generate 5 unique detective mystery cases with SMART, INTERCONNECTED clues.
CRITICAL: Make suspects memorable with distinct personalities. The killer should be hard to identify!

Each case must follow this schema:
[
  {
    "id": "unique_string",
    "title": "Catchy mystery title",
    "theme": "String (e.g. Noir, Cyberpunk, Victorian, Corporate)",
    "narrative": "MUST be 100+ words. Set the scene dramatically. Include red herrings!",
    "summary": "1-2 sentence hook",
    "victim": "Full name",
    "cause": "Specific cause of death",
    "location": "Detailed location",
    "time": "Specific time",
    "suspects": [
      {
        "id": "suspect_1",
        "name": "Full name",
        "persona": "Job, age, 2-3 personality traits",
        "alibi": "Specific, verifiable alibi with time and witness if any",
        "motive": "Clear reason they MIGHT have done it",
        "relationship": "Their relationship to the victim",
        "evidence": "What evidence might implicate them",
        "secret": "A non-murder secret they're hiding (affair, debt, etc.)",
        "personality": "How they behave when questioned (nervous, arrogant, helpful, defensive)"
      }
    ],
    "evidence": {
      "initial": ["2 obvious clues at scene"],
      "bodySearch": ["2 clues from examining victim"],
      "roomSearch": ["2 clues from searching area"],
      "labClue": "Technical analysis result",
      "smokingGun": "The ONE piece of evidence that proves the killer"
    },
    "killerId": "id of the actual killer",
    "motiveText": "The TRUE motive explained",
    "solution": "100+ word detailed explanation of HOW the crime was committed, what evidence proves it, and how the killer tried to cover it up",
    "motiveKeywords": ["3-4 keywords the detective must mention to solve it"]
  }
]

IMPORTANT RULES:
1. Each case needs 3-4 suspects with DIFFERENT personalities
2. At least one suspect should seem VERY guilty but be innocent (red herring)
3. The actual killer should seem less suspicious initially
4. Alibis should be specific enough to verify or disprove
5. Narrative and solution must be 100+ words each - make them dramatic!
    `;
  }

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
      caseList.innerHTML = `<div class="error-msg">AI Error: ${data.error.message || "Generation Failed"}</div>`;
      return;
    }

    if (!data.candidates || !data.candidates[0].content) {
      console.error("No candidates returned. Safety Block?", data);
      caseList.innerHTML = '<div class="error-msg">Generation Blocked by Safety Filters.</div>';
      return;
    }

    let text = data.candidates[0].content.parts[0].text;

    // DEBUG: Log raw response to verify Bengali content
    console.log("=== RAW AI RESPONSE ===");
    console.log(text.substring(0, 500)); // First 500 chars
    console.log("========================");

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
    console.log(effectiveLang === 'bn' ? '৫টি নতুন AI কেস সফলভাবে তৈরি হয়েছে!' : '5 New AI Cases Generated Successfully!');

  } catch (error) {
    console.error("AI Generation Failed:", error);
    caseList.innerHTML = '<div class="error-msg">Network or API Error. Check console.</div>';
  }
};

// Chat modal elements - consolidated reference
const chatModal = document.getElementById("chat-modal");
const chatHistory = document.getElementById("chat-history");
const chatSuspectName = document.getElementById("chat-suspect-name");
const chatSuspectPersona = document.getElementById("chat-suspect-persona");
const closeChatBtn = document.getElementById("close-chat");

// Close chat functionality
closeChatBtn.addEventListener("click", () => {
  chatModal.classList.add("hidden");
  state.currentSuspect = null;
});

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

const addChatMessage = (sender, text) => {
  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-msg ${sender}`;
  msgDiv.textContent = text;
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight; // Auto-scroll
};

const selectSuspect = (suspectId) => {
  state.selectedSuspectId = suspectId;
  const suspect = state.currentCase.suspects.find((item) => item.id === suspectId);
  state.currentSuspect = suspect;

  // Update Chat UI
  chatSuspectName.textContent = suspect.name;
  chatSuspectPersona.textContent = suspect.persona;
  chatHistory.innerHTML = ""; // Clear previous chat
  
  // Show Chat Modal
  chatModal.classList.remove("hidden");
  
  // Setup chat modal event listeners
  setupChatModalListeners();
  
  // Add initial greeting
  addChatMessage("suspect", `I am ${suspect.name}. ${suspect.persona}. What do you want, Detective?`);
  
  // Play sound
  SoundManager.click();

  // Highlight active suspect card
  document.querySelectorAll(".suspect-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.id === suspectId);
  });

  // Add note about starting interrogation
  addNote("system", `Interrogation started with ${suspect.name}.`);
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
  
  // No longer needed in main view
  // suspectName.textContent = "Select a Suspect";
  // suspectPersona.textContent = "Pick someone to interrogate.";

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
  const userInput = document.getElementById("user-input");
  if (!userInput) return;
  
  const text = userInput.value.trim();
  if (!text) return;
  
  addChatMessage("user", text);
  userInput.value = "";
  state.actionPoints -= 1;
  updateActionPoints();

  const suspect = state.currentCase.suspects.find(
    (item) => item.id === state.selectedSuspectId
  );

  // Show typing indicator in chat modal
  const typingDiv = document.createElement("div");
  typingDiv.className = "chat-msg suspect typing-indicator";
  typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatHistory.appendChild(typingDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const response = await getSuspectResponse(suspect, text);
    
    // Remove typing indicator
    chatHistory.removeChild(typingDiv);
    
    addChatMessage("suspect", response);
    SoundManager.success();

    // Add to investigation notes
    addNote("interrogation", `Q: "${text}"`, "Detective");
    addNote("interrogation", response, suspect.name);
    
  } catch (error) {
    chatHistory.removeChild(typingDiv);
    addChatMessage("suspect", "(The suspect stays silent... connection error.)");
    console.error(error);
  }
};

const handleSearch = (type) => {
  if (state.actionPoints <= 0) return;
  const caseEvidence = state.currentCase.evidence;
  let newItems = [];
  let searchType = "";

  if (type === "body") {
    newItems = caseEvidence.bodySearch;
    searchType = state.language === 'bn' ? "শরীর তল্লাশি" : "Body Search";
  }
  if (type === "room") {
    newItems = caseEvidence.roomSearch;
    searchType = state.language === 'bn' ? "ঘর তল্লাশি" : "Room Search";
  }

  const added = newItems.filter((item) => !state.evidenceFound.includes(item));
  if (added.length === 0) {
    addNote("evidence", state.language === 'bn' ? "কোনো নতুন প্রমাণ পাওয়া যায়নি।" : "No new evidence found.");
    return;
  }

  state.actionPoints -= 1;
  state.evidenceFound = [...state.evidenceFound, ...added];
  renderEvidence(added);
  SoundManager.evidence();

  // Add each evidence item as a note
  added.forEach(item => {
    addNote("evidence", `[${searchType}] ${item}`);
  });

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
    SoundManager.evidence();
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

  /* Updated Accusation Logic for Solution Modal */
  const solutionModal = document.getElementById("solution-modal");
  const solutionStatus = document.getElementById("solution-status");
  const solutionKiller = document.getElementById("solution-killer");
  const solutionMotive = document.getElementById("solution-motive");
  const solutionNarrative = document.getElementById("solution-narrative");
  const solutionPhoto = document.getElementById("solution-killer-photo");
  const closeSolutionBtn = document.getElementById("close-solution");

  closeSolutionBtn.addEventListener("click", () => {
    solutionModal.classList.add("hidden");
    gameView.classList.add("hidden");
    casePicker.classList.remove("hidden");
    state.currentCase = null;
    state.activeCases = state.activeCases.filter(c => c.id !== caseData.id); // Remove solved case
    renderCaseCards();
  });

  const killer = caseData.suspects.find((item) => item.id === caseData.killerId);
  solutionKiller.textContent = killer.name;
  solutionMotive.textContent = caseData.motiveText;
  solutionNarrative.textContent = caseData.solution || "The detective pieced together the clues...";
  solutionPhoto.innerHTML = "📸"; // Placeholder for killer photo

  if (isCorrectSuspect && isCorrectMotive) {
    solutionStatus.textContent = "CASE CLOSED: SUCCESS";
    solutionStatus.style.color = "var(--success)";
    SoundManager.success();
    // Award XP
    PlayerStats.addXP(100);
    addNote("system", `Case Solved! +100 XP`);
  } else {
    solutionStatus.textContent = "CASE COLD: FAILURE";
    solutionStatus.style.color = "#d32f2f";
    SoundManager.failure();
    // Pity XP
    PlayerStats.addXP(10);
    addNote("system", `Case Failed. +10 XP`);
  }

  solutionModal.classList.remove("hidden");
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
  languageSelect.value = state.language;
  updateKeyStatus();
});




// Header Language Selector Listener
languageSelect.addEventListener("change", (e) => {
  const selectedLang = e.target.value;
  if (selectedLang !== state.language) {
    updateUILanguage(selectedLang);
    // If API key is present, auto-regenerate cases in new language
    if (state.apiKey) {
      console.log(`Language changed to ${selectedLang === 'bn' ? 'Bengali' : 'English'}. Regenerating cases...`);
      generateAICases();
    }
  }
});

// Update Settings Listener (Language handling moved to header listener)
saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  
  if (key) {
    state.apiKey = key;
    // NOTE: We do NOT save the API key to GameDatabase anymore.
    console.log("Settings Saved! Generating cases...");
    settingsModal.classList.add("hidden");
    generateAICases();
  } else {
    state.apiKey = null;
    // NOTE: Key removed from session
    console.log("API Key Removed.");
    state.activeCases = [];
    renderCaseCards();
  }
  updateKeyStatus();
  settingsModal.classList.add("hidden");
});

// Data Management Functionality
const exportDataBtn = document.getElementById("export-data");
const importDataInput = document.getElementById("import-data");
const clearDataBtn = document.getElementById("clear-data");
const dataStatus = document.getElementById("data-status");

// Update data status display
const updateDataStatus = () => {
  try {
    const db = GameDatabase.getDB();
    const userCount = Object.keys(db.users || {}).length;
    const dataSize = JSON.stringify(db).length;
    const currentUser = state.user ? state.user.name : "Not logged in";
    
    dataStatus.textContent = `Current User: ${currentUser} | Users: ${userCount} | Data: ${Math.round(dataSize / 1024)}KB`;
    
    if (userCount > 0) {
      dataStatus.style.color = "var(--success)";
    } else {
      dataStatus.style.color = "#666";
    }
  } catch (error) {
    dataStatus.textContent = "Data Status: Error loading data";
    dataStatus.style.color = "#d32f2f";
  }
};

// Export game data
const exportGameData = () => {
  try {
    const data = GameDatabase.exportData();
    if (!data) {
      throw new Error("No data to export");
    }
    
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    
    a.href = url;
    a.download = `redacted_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addMessage("system", "Game data exported successfully!");
    console.log("Game data exported");
  } catch (error) {
    console.error("Export failed:", error);
    addMessage("system", "Export failed: " + error.message);
  }
};

// Import game data
const importGameData = (file) => {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = e.target.result;
      if (!data) {
        throw new Error("Empty file");
      }
      
      const parsedData = JSON.parse(data);
      if (!parsedData || typeof parsedData !== "object") {
        throw new Error("Invalid file format");
      }
      
      // Confirm import (destructive operation)
      if (confirm("WARNING: This will replace ALL current game data. Continue?")) {
        if (GameDatabase.importData(data)) {
          addMessage("system", "Game data imported successfully!");
          console.log("Game data imported");
          
          // Reload the page to apply changes
          setTimeout(() => {
            if (confirm("Data imported successfully. Reload page to apply changes?")) {
              window.location.reload();
            }
          }, 1000);
        } else {
          throw new Error("Import failed - invalid data structure");
        }
      }
    } catch (error) {
      console.error("Import failed:", error);
      addMessage("system", "Import failed: " + error.message);
    }
  };
  
  reader.onerror = () => {
    console.error("File reading error");
    addMessage("system", "Failed to read file");
  };
  
  reader.readAsText(file);
};

// Clear all game data
const clearAllData = () => {
  // Double confirmation for destructive operation
  if (!confirm("⚠️ DANGER ZONE ⚠️\n\nThis will PERMANENTLY delete ALL game data including:\n• All user profiles\n• All progress and XP\n• All solved cases\n• All settings\n\nThis action cannot be undone!\n\nAre you absolutely sure?")) {
    return;
  }
  
  if (!confirm("LAST CHANCE: This will delete EVERYTHING. Type 'DELETE ALL' to confirm:")) {
    return;
  }
  
  const confirmation = prompt("Type 'DELETE ALL' to confirm data deletion:");
  if (confirmation !== "DELETE ALL") {
    addMessage("system", "Data deletion cancelled");
    return;
  }
  
  try {
    if (GameDatabase.clearAll()) {
      addMessage("system", "All game data has been cleared successfully!");
      console.log("All game data cleared");
      
      // Reset application state
      state.user = null;
      state.apiKey = null;
      state.activeCases = [];
      state.language = 'en';
      
      // Update UI
      updateDataStatus();
      updateKeyStatus();
      renderCaseCards();
      PlayerStats.updateRank();
      
      // Show login modal
      loginModal.classList.remove("hidden");
      
      addMessage("system", "Please create a new profile to continue playing.");
    } else {
      throw new Error("Failed to clear data");
    }
  } catch (error) {
    console.error("Clear data failed:", error);
    addMessage("system", "Failed to clear data: " + error.message);
  }
};

// Event listeners for data management
exportDataBtn.addEventListener("click", exportGameData);

importDataInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    importGameData(e.target.files[0]);
    e.target.value = ''; // Reset file input
  }
});

clearDataBtn.addEventListener("click", clearAllData);

// Update data status when settings modal is opened
settingsBtn.addEventListener("click", updateDataStatus);

const updateKeyStatus = () => {
  const t = translations[state.language];
  if (state.apiKey) {
    keyStatus.textContent = t.statusOnline;
    keyStatus.style.color = "var(--success)";
  } else {
    keyStatus.textContent = t.statusMissing;
    keyStatus.style.color = "#d32f2f";
  }
};

// Global Sound Listener for Buttons
document.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.classList.contains('case-card') || e.target.classList.contains('suspect-card')) {
    SoundManager.click();
  }
});

// Login Logic
const handleLogin = (name) => {
  if (!name.trim()) return;
  
  const user = GameDatabase.login(name.trim());
  state.user = user;
  
  // Load User Settings
  state.language = user.language || 'en';
  state.apiKey = null; // Always reset API key on login (Session only)
  state.xp = user.xp || 0; // Legacy support
  
  // Update UI
  loginModal.classList.add("hidden");
  updateUILanguage(state.language);
  PlayerStats.updateRank();
  updateKeyStatus();
  
  // Greeting
  addMessage("system", `Welcome back, Detective ${user.name}.`);
};

loginBtn.addEventListener("click", () => {
  handleLogin(detectiveNameInput.value);
});

// Load Profiles on Start
GameDatabase.init();
const users = GameDatabase.getAllUsers();
if (users.length > 0) {
  existingProfiles.classList.remove("hidden");
  profileButtons.innerHTML = "";
  users.forEach(u => {
    const btn = document.createElement("button");
    btn.className = "profile-btn";
    btn.textContent = `${u.name} (Lvl ${u.rankIndex})`;
    btn.onclick = () => handleLogin(u.name);
    profileButtons.appendChild(btn);
  });
}

// Auto-login if only one user? No, let them choose.
// Initialize
// PlayerStats.load(); -> Removed, handled by login
updateKeyStatus();

// Event Listeners for Game Interaction
// Chat modal event listeners (will be set up when modal is opened)
function setupChatModalListeners() {
  const userInput = document.getElementById("user-input");
  const sendMessage = document.getElementById("send-message");
  
  if (userInput && sendMessage) {
    sendMessage.addEventListener("click", handleUserMessage);
    userInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleUserMessage();
    });
  }
}

searchBody.addEventListener("click", () => handleSearch("body"));
checkRoom.addEventListener("click", () => handleSearch("room"));
sendLab.addEventListener("click", handleLab);
submitAccusation.addEventListener("click", handleAccusation);

backToCases.addEventListener("click", () => {
  gameView.classList.add("hidden");
  casePicker.classList.remove("hidden");
  state.currentCase = null;
  renderCaseCards(); // Re-render to show "Open Case" buttons again
});

renderCaseCards();
updateActionPoints();

// CRITICAL: Initialize language state from dropdown on page load
// This ensures state.language matches whatever the browser has in the dropdown
(function initLanguage() {
  const initialLang = languageSelect.value;
  console.log(`Page load: initializing language from dropdown = ${initialLang}`);
  state.language = initialLang;
  // Update UI to match (in case browser restored a different selection)
  updateUILanguage(initialLang);
})();