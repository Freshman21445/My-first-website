/* ================================================================
   EXPLANATION SYSTEM — ALL MODULES COMBINED INTO ONE FILE
   Replace all js/ script tags with one single script tag:
   <script src="explanationSystem.bundle.js"></script>
   ================================================================ */

/* ── 1. AIManager ─────────────────────────────────────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI MANAGER - Core Orchestration System for Multi-Provider AI Integration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Responsibilities:
 * - Manage multiple AI providers (GPT-4, Claude, GPT-3.5, Hugging Face)
 * - Smart provider switching based on availability & limits
 * - Rate limiting and quota management
 * - Error handling & retry logic
 * - Generate explanations at multiple levels
 * - Track usage and provider status
 */

class AIManager {
  constructor(config = {}) {
    // ─── Configuration ─────────────────────────────────────────────────
    this.config = {
      openaiKey: config.openaiKey || '',
      claudeKey: config.claudeKey || '',
      huggingFaceKey: config.huggingFaceKey || '',
      cohereKey: config.cohereKey || '',
      replicateKey: config.replicateKey || '',
      ...config
    };

    // ─── Provider Definitions ──────────────────────────────────────────
    this.providers = {
      'gpt4-turbo': {
        name: 'OpenAI GPT-4 Turbo',
        type: 'openai',
        model: 'gpt-4-turbo-preview',
        apiKey: this.config.openaiKey,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        maxTokens: 4096,
        rateLimit: { calls: 200, period: 'day' }, // per day
        priority: 1, // Primary
        enabled: !!this.config.openaiKey,
        status: 'active',
        currentUsage: 0
      },
      'claude': {
        name: 'Claude (Anthropic)',
        type: 'claude',
        model: 'claude-3-opus-20240229',
        apiKey: this.config.claudeKey,
        endpoint: 'https://api.anthropic.com/v1/messages',
        maxTokens: 4096,
        rateLimit: { calls: 150, period: 'day' },
        priority: 2, // Backup for deep explanations
        enabled: !!this.config.claudeKey,
        status: 'active',
        currentUsage: 0
      },
      'gpt35': {
        name: 'OpenAI GPT-3.5',
        type: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: this.config.openaiKey,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        maxTokens: 2048,
        rateLimit: { calls: 500, period: 'day' },
        priority: 3, // Overflow for lighter explanations
        enabled: !!this.config.openaiKey,
        status: 'active',
        currentUsage: 0
      },
      'huggingface': {
        name: 'Hugging Face / Self-hosted LLM',
        type: 'huggingface',
        model: 'mistralai/Mistral-7B-Instruct-v0.1',
        apiKey: this.config.huggingFaceKey,
        endpoint: 'https://api-inference.huggingface.co/models/',
        maxTokens: 2048,
        rateLimit: { calls: 1000, period: 'day' }, // Unlimited fallback
        priority: 4, // Fallback
        enabled: !!this.config.huggingFaceKey,
        status: 'active',
        currentUsage: 0
      },
      'cohere': {
        name: 'Cohere API',
        type: 'cohere',
        model: 'command',
        apiKey: this.config.cohereKey,
        endpoint: 'https://api.cohere.com/v1/generate',
        maxTokens: 2048,
        rateLimit: { calls: 200, period: 'day' },
        priority: 5, // Future expansion
        enabled: !!this.config.cohereKey,
        status: 'active',
        currentUsage: 0
      },
      'replicate': {
        name: 'Replicate',
        type: 'replicate',
        model: 'meta/llama-2-70b-chat',
        apiKey: this.config.replicateKey,
        endpoint: 'https://api.replicate.com/v1/predictions',
        maxTokens: 2048,
        rateLimit: { calls: 300, period: 'day' },
        priority: 6, // Future expansion
        enabled: !!this.config.replicateKey,
        status: 'active',
        currentUsage: 0
      }
    };

    // ─── Request Queue & Retry Logic ───────────────────────────────────
    this.requestQueue = [];
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms

    // ─── Usage Tracking ────────────────────────────────────────────────
    this.usageLog = {};
    this.loadUsageLog();

    // ─── State Management ──────────────────────────────────────────────
    this.currentProviderIndex = 0;
    this.failedProviders = [];
    this.pendingRequests = [];
  }

/* ── 2. CloudflareHandler ─────────────────────────────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLOUDFLARE HANDLER - Storage & Delivery System
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Responsibilities:
 * - Upload explanation content to Cloudflare
 * - Retrieve explanation content from Cloudflare
 * - Manage versions and URLs
 * - Handle storage errors and retries
 * - Generate shareable URLs
 */

class CloudflareHandler {
  constructor(config = {}) {
    // ─── Configuration ────────────────────────────────────────────────
    this.config = {
      workerUrl: config.workerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
      r2Endpoint: config.r2Endpoint || null, // Optional direct R2 access
      accountId: config.accountId || null,
      apiToken: config.apiToken || null,
      storagePath: 'explanations', // Path in Cloudflare for explanations
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };

    this.uploadQueue = [];
    this.cache = new Map(); // Local caching for retrieved content
  }

/* ── 3. FirestoreHandler (FIXED for Firebase v9) ──────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIRESTORE HANDLER - Explanation Metadata & Link Management
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXED: Uses Firebase v9 modular SDK (window._firestoreFns) instead of
 *        legacy v8 chained syntax (db.collection(...).doc(...))
 */

class FirestoreHandler {
  constructor(db) {
    this.db = db;

    // Collection names
    this.collectionsNames = {
      questions:            'adminExams',          // matches your index.html usage
      explanations:         'explanations',
      explanationHistory:   'explanationGenerationHistory',
      explanationVersions:  'explanationVersions'
    };

    this.schemaVersion = 1;
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  _fns() {
    // Always pull the latest reference (set by the Firebase module script)
    const fns = window._firestoreFns;
    if (!fns) throw new Error('Firestore functions not available (window._firestoreFns missing)');
    return fns;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE EXPLANATIONS
  // ═══════════════════════════════════════════════════════════════════════

  async saveExplanationLink(questionId, level, cloudflareUrl, fileId, provider) {
    try {
      if (!questionId || !level || !cloudflareUrl) {
        throw new Error('Missing required fields: questionId, level, cloudflareUrl');
      }

      const { doc, updateDoc, collection } = this._fns();
      const docRef = doc(this.db, this.collectionsNames.questions, questionId);

      const updateData = {};
      if (level === 2) {
        updateData['explanations.level2'] = {
          url: cloudflareUrl, fileId, provider,
          uploadedAt: new Date(), version: 1, status: 'published'
        };
      } else if (level === 3) {
        updateData['explanations.level3'] = {
          url: cloudflareUrl, fileId, provider,
          uploadedAt: new Date(), version: 1, status: 'published'
        };
      }

      await updateDoc(docRef, updateData);
      await this.logExplanationGeneration(questionId, level, provider, 'saved');

      return { questionId, level, url: cloudflareUrl, fileId, status: 'saved', timestamp: new Date() };
    } catch (error) {
      console.error('Error saving explanation link:', error);
      return { questionId, level, error: error.message, status: 'error', timestamp: new Date() };
    }
  }

  async batchSaveExplanationLinks(explanations) {
    const results = [];
    for (const e of explanations) {
      results.push(await this.saveExplanationLink(e.questionId, e.level, e.cloudflareUrl, e.fileId, e.provider));
    }
    return {
      total: explanations.length,
      successful: results.filter(r => r.status === 'saved').length,
      failed: results.filter(r => r.status === 'error').length,
      results, timestamp: new Date()
    };
  }

  async updateExplanationLink(questionId, level, newCloudflareUrl, fileId, provider) {
    try {
      const { doc, getDoc, updateDoc } = this._fns();
      const docRef = doc(this.db, this.collectionsNames.questions, questionId);
      const snap = await getDoc(docRef);

      if (!snap.exists()) throw new Error(`Question ${questionId} not found`);

      const explanations = snap.data().explanations || {};
      const levelKey = `level${level}`;
      const currentExplanation = explanations[levelKey];
      const nextVersion = (currentExplanation?.version || 0) + 1;

      if (currentExplanation) {
        await this.saveExplanationVersion(questionId, level, currentExplanation);
      }

      const updateData = {};
      updateData[`explanations.${levelKey}`] = {
        url: newCloudflareUrl, fileId, provider,
        uploadedAt: new Date(), version: nextVersion, status: 'published',
        previousVersion: currentExplanation?.version || 0
      };

      await updateDoc(docRef, updateData);
      await this.logExplanationGeneration(questionId, level, provider, 'updated');

      return { questionId, level, version: nextVersion, url: newCloudflareUrl, status: 'updated', timestamp: new Date() };
    } catch (error) {
      console.error('Error updating explanation link:', error);
      return { questionId, level, error: error.message, status: 'error', timestamp: new Date() };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RETRIEVE EXPLANATIONS
  // ═══════════════════════════════════════════════════════════════════════

  async getExplanationLinks(questionId) {
    try {
      const { doc, getDoc } = this._fns();
      const docRef = doc(this.db, this.collectionsNames.questions, questionId);
      const snap = await getDoc(docRef);

      if (!snap.exists()) throw new Error(`Question ${questionId} not found`);

      const data = snap.data();
      const explanations = data.explanations || {};

      return {
        questionId,
        level1: { text: data.explanation || null, source: 'firestore', available: !!data.explanation },
        level2: {
          url: explanations.level2?.url || null,
          fileId: explanations.level2?.fileId || null,
          provider: explanations.level2?.provider || null,
          version: explanations.level2?.version || null,
          uploadedAt: explanations.level2?.uploadedAt || null,
          available: !!explanations.level2?.url, source: 'cloudflare'
        },
        level3: {
          url: explanations.level3?.url || null,
          fileId: explanations.level3?.fileId || null,
          provider: explanations.level3?.provider || null,
          version: explanations.level3?.version || null,
          uploadedAt: explanations.level3?.uploadedAt || null,
          available: !!explanations.level3?.url, source: 'cloudflare'
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting explanation links:', error);
      return {
        questionId, error: error.message,
        level1: { available: false }, level2: { available: false }, level3: { available: false }
      };
    }
  }

  async getMultipleExplanationLinks(questionIds) {
    const results = {};
    for (const qid of questionIds) {
      results[qid] = await this.getExplanationLinks(qid);
    }
    return results;
  }

  async getPendingExplanations(chapterId = null) {
    try {
      const { collection, query, where, getDocs } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (chapterId) {
        q = query(q, where('chapterId', '==', chapterId));
      } else {
        q = query(q);
      }

      const snapshot = await getDocs(q);
      const pending = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const explanations = data.explanations || {};
        if (!explanations.level2?.url || !explanations.level3?.url) {
          pending.push({
            questionId: docSnap.id,
            question: data.question,
            chapterId: data.chapterId,
            missingLevels: [
              !explanations.level2?.url ? 2 : null,
              !explanations.level3?.url ? 3 : null
            ].filter(Boolean)
          });
        }
      });

      return { total: pending.length, chapterId, pending, timestamp: new Date() };
    } catch (error) {
      console.error('Error getting pending explanations:', error);
      return { error: error.message, pending: [] };
    }
  }

  async getExplanationStats(courseId = null) {
    try {
      const { collection, query, where, getDocs } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (courseId) {
        q = query(q, where('courseId', '==', courseId));
      } else {
        q = query(q);
      }

      const snapshot = await getDocs(q);
      let level2Count = 0, level3Count = 0, bothCount = 0, noneCount = 0;

      snapshot.forEach(docSnap => {
        const explanations = docSnap.data().explanations || {};
        const hasLevel2 = !!explanations.level2?.url;
        const hasLevel3 = !!explanations.level3?.url;
        if (hasLevel2 && hasLevel3) bothCount++;
        else if (hasLevel2) level2Count++;
        else if (hasLevel3) level3Count++;
        else noneCount++;
      });

      return {
        courseId, totalQuestions: snapshot.size,
        level2Only: level2Count, level3Only: level3Count,
        bothLevels: bothCount, noExplanations: noneCount,
        coverage: {
          level2: ((level2Count + bothCount) / snapshot.size * 100).toFixed(2) + '%',
          level3: ((level3Count + bothCount) / snapshot.size * 100).toFixed(2) + '%'
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VERSIONING
  // ═══════════════════════════════════════════════════════════════════════

  async saveExplanationVersion(questionId, level, explanationData) {
    try {
      const { doc, setDoc, collection } = this._fns();
      const versionRef = doc(
        this.db,
        this.collectionsNames.explanationVersions,
        `${questionId}_level${level}_v${explanationData.version}`
      );

      await setDoc(versionRef, {
        questionId, level,
        version: explanationData.version,
        url: explanationData.url,
        fileId: explanationData.fileId,
        provider: explanationData.provider,
        uploadedAt: explanationData.uploadedAt,
        archivedAt: new Date()
      });

      return { status: 'archived', version: explanationData.version };
    } catch (error) {
      console.error('Error archiving version:', error);
      return { error: error.message };
    }
  }

  async getExplanationVersions(questionId, level) {
    try {
      const { collection, query, where, getDocs, orderBy } = this._fns();
      const q = query(
        collection(this.db, this.collectionsNames.explanationVersions),
        where('questionId', '==', questionId),
        where('level', '==', level),
        orderBy('version', 'desc')
      );
      const snapshot = await getDocs(q);
      const versions = [];
      snapshot.forEach(d => versions.push(d.data()));
      return { questionId, level, versions, totalVersions: versions.length };
    } catch (error) {
      console.error('Error getting versions:', error);
      return { questionId, level, error: error.message, versions: [] };
    }
  }

  async restorePreviousVersion(questionId, level, versionNumber) {
    try {
      const { doc, getDoc } = this._fns();
      const versionRef = doc(
        this.db,
        this.collectionsNames.explanationVersions,
        `${questionId}_level${level}_v${versionNumber}`
      );
      const snap = await getDoc(versionRef);
      if (!snap.exists()) throw new Error(`Version ${versionNumber} not found`);

      const vd = snap.data();
      await this.saveExplanationLink(questionId, level, vd.url, vd.fileId, vd.provider);

      return { questionId, level, restoredVersion: versionNumber, status: 'restored', timestamp: new Date() };
    } catch (error) {
      console.error('Error restoring version:', error);
      return { error: error.message, status: 'error' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOGGING & HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  async logExplanationGeneration(questionId, level, provider, action) {
    try {
      const { collection, addDoc } = this._fns();
      await addDoc(collection(this.db, this.collectionsNames.explanationHistory), {
        questionId, level, provider, action,
        timestamp: new Date(),
        userId: this.getCurrentUserId()
      });
      return { status: 'logged' };
    } catch (error) {
      // Non-fatal — don't crash on logging failure
      console.warn('Error logging explanation event:', error);
      return { error: error.message };
    }
  }

  async getGenerationHistory(questionId, limit = 10) {
    try {
      const { collection, query, where, getDocs, orderBy } = this._fns();
      const q = query(
        collection(this.db, this.collectionsNames.explanationHistory),
        where('questionId', '==', questionId),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const history = [];
      snapshot.forEach(d => history.push(d.data()));
      return { questionId, history: history.slice(0, limit), timestamp: new Date() };
    } catch (error) {
      console.error('Error getting history:', error);
      return { error: error.message, history: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCHEMA MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  async initializeQuestionExplanations(questionId) {
    try {
      const { doc, updateDoc } = this._fns();
      const docRef = doc(this.db, this.collectionsNames.questions, questionId);
      await updateDoc(docRef, {
        explanations: {
          level2: { url: null, fileId: null, provider: null, uploadedAt: null, version: 0, status: 'pending' },
          level3: { url: null, fileId: null, provider: null, uploadedAt: null, version: 0, status: 'pending' }
        },
        explanationStatus: 'incomplete',
        schemaVersion: this.schemaVersion,
        updatedAt: new Date()
      });
      return { questionId, status: 'initialized', timestamp: new Date() };
    } catch (error) {
      console.error('Error initializing:', error);
      return { error: error.message, status: 'error' };
    }
  }

  async migrateQuestionsSchema(courseId = null) {
    try {
      const { collection, query, where, getDocs, writeBatch, doc } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (courseId) {
        q = query(q, where('courseId', '==', courseId));
      } else {
        q = query(q);
      }

      const snapshot = await getDocs(q);
      let migratedCount = 0;

      // writeBatch may not be in _firestoreFns — use individual updates as fallback
      const updates = [];
      snapshot.forEach(docSnap => {
        if (!docSnap.data().explanations) {
          const { updateDoc: upd } = this._fns();
          updates.push(upd(docSnap.ref, {
            explanations: {
              level2: { url: null, status: 'pending' },
              level3: { url: null, status: 'pending' }
            },
            schemaVersion: this.schemaVersion,
            migratedAt: new Date()
          }));
          migratedCount++;
        }
      });

      await Promise.all(updates);

      return { totalQuestions: snapshot.size, migratedCount, status: 'completed', timestamp: new Date() };
    } catch (error) {
      console.error('Error migrating schema:', error);
      return { error: error.message, status: 'error' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════

  async deleteExplanation(questionId, level) {
    try {
      const { doc, updateDoc } = this._fns();
      const updateData = {};
      updateData[`explanations.level${level}`] = { url: null, fileId: null, status: 'deleted', deletedAt: new Date() };
      await updateDoc(doc(this.db, this.collectionsNames.questions, questionId), updateData);
      await this.logExplanationGeneration(questionId, level, 'system', 'deleted');
      return { questionId, level, status: 'deleted', timestamp: new Date() };
    } catch (error) {
      console.error('Error deleting explanation:', error);
      return { error: error.message, status: 'error' };
    }
  }

  getCurrentUserId() {
    try {
      // Try to get the logged-in user's phone/id from your app's globals
      return window._currentUserPhone || window._currentUserId || 'admin';
    } catch (e) {
      return 'admin';
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FirestoreHandler;
}

/* ── 4. ExplanationGeneratorPanel ─────────────────────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION GENERATOR PANEL - Special User Interface
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Select question/chapter to explain
 * - Choose resource (paste text or PDF URL)
 * - Select AI provider
 * - Generate explanations (Level 2 & 3)
 * - Edit generated content
 * - Save to Cloudflare & Firestore
 * - Track generation status & history
 */

class ExplanationGeneratorPanel {
  constructor(aiManager, cloudflareHandler, firestoreHandler, config = {}) {
    // ─── Dependencies ──────────────────────────────────────────────────
    this.aiManager = aiManager;
    this.cloudflareHandler = cloudflareHandler;
    this.firestoreHandler = firestoreHandler;

    // ─── Configuration ────────────────────────────────────────────────
    this.config = {
      panelId: config.panelId || 'explanationGeneratorPanel',
      theme: config.theme || 'dark',
      autoSave: config.autoSave || false,
      ...config
    };

    // ─── State Management ──────────────────────────────────────────────
    this.state = {
      currentQuestion: null,
      currentChapter: null,
      selectedResource: null,
      resourceType: null, // 'text' or 'pdf'
      selectedProvider: 'gpt4-turbo',
      generatedExplanations: {
        level2: null,
        level3: null
      },
      editedExplanations: {
        level2: null,
        level3: null
      },
      generationStatus: {
        level2: 'idle', // idle, generating, completed, error
        level3: 'idle'
      },
      saveStatus: null,
      history: []
    };

    // ─── UI Elements Cache ─────────────────────────────────────────────
    this.elements = {};
    this.initialized = false;
  }

/* ── 5. ExplanationDisplaySystem ──────────────────────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION DISPLAY SYSTEM - User Interface for Multi-Level Explanations
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Progressive button disclosure (buttons appear as user advances)
 * - Typing effect animation for realistic AI feel
 * - Blink transition between levels
 * - Offline detection and graceful degradation
 * - Smooth scrolling and transitions
 * - Loading indicators
 * - Error handling
 */

class ExplanationDisplaySystem {
  constructor(cloudflareHandler, firestoreHandler, config = {}) {
    // ─── Dependencies ──────────────────────────────────────────────────
    this.cloudflareHandler = cloudflareHandler;
    this.firestoreHandler = firestoreHandler;

    // ─── Configuration ────────────────────────────────────────────────
    this.config = {
      typingSpeed: config.typingSpeed || 20, // ms per character
      transitionDuration: config.transitionDuration || 300, // ms
      cacheExplanations: config.cacheExplanations || true,
      showLoadingIndicator: config.showLoadingIndicator || true,
      offlineMode: config.offlineMode || false,
      ...config
    };

    // ─── State Management ──────────────────────────────────────────────
    this.state = {
      currentQuestionId: null,
      currentLevel: 1, // 1, 2, or 3
      explanations: {
        level1: null,
        level2: null,
        level3: null
      },
      isLoading: false,
      isOnline: navigator.onLine,
      typingInProgress: false,
      cache: new Map()
    };

    // ─── Event Listeners ───────────────────────────────────────────────
    this.setupOnlineListener();
  }

/* ── 6. ExplanationSystem Init (FIXED) ────────────────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION SYSTEM INITIALIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXED:
 *  - Removed auto-init DOMContentLoaded block (conflicts with index.html init)
 *  - initialize() now uses the already-available window._firestoreDb
 */

window.ExplanationSystem = {
  // ─── Module References ─────────────────────────────────────────────
  aiManager: null,
  cloudflareHandler: null,
  firestoreHandler: null,
  generatorPanel: null,
  displaySystem: null,

  // ─── Status ────────────────────────────────────────────────────────
  isInitialized: false,
  config: {},

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  async initialize(db, config = {}) {
    try {
      console.log('🚀 Starting ExplanationSystem initialization...');
      this.config = config;

      // ─── AI Manager ───────────────────────────────────────────────
      this.aiManager = new AIManager({
        openaiKey:      config.openaiKey      || '',
        claudeKey:      config.claudeKey      || '',
        huggingFaceKey: config.huggingFaceKey || '',
        cohereKey:      config.cohereKey      || '',
        replicateKey:   config.replicateKey   || ''
      });
      console.log('✅ AI Manager initialized');
      const aiStatus = this.aiManager.getHealthStatus();
      console.log(`   ${aiStatus.active}/${aiStatus.total} providers active`);

      // ─── Cloudflare Handler ───────────────────────────────────────
      this.cloudflareHandler = new CloudflareHandler({
        workerUrl:   config.cloudflareWorkerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
        storagePath: 'explanations',
        maxRetries:  config.cloudflareRetries  || 3
      });
      console.log('✅ Cloudflare Handler initialized');
      // Health check is async — run in background, don't block init
      this.cloudflareHandler.healthCheck().then(h => console.log(`   Cloudflare status: ${h.status}`));

      // ─── Firestore Handler ────────────────────────────────────────
      this.firestoreHandler = new FirestoreHandler(db);
      console.log('✅ Firestore Handler initialized');

      // ─── Display System ───────────────────────────────────────────
      if (typeof ExplanationDisplaySystem !== 'undefined') {
        this.displaySystem = new ExplanationDisplaySystem(
          this.cloudflareHandler,
          this.firestoreHandler,
          {
            typingSpeed:         config.typingSpeed         || 20,
            transitionDuration:  config.transitionDuration  || 300,
            cacheExplanations:   config.cacheExplanations   !== false,
            showLoadingIndicator:config.showLoadingIndicator !== false,
            offlineMode:         config.offlineMode         || false
          }
        );
        console.log('✅ Explanation Display System initialized');
      }

      // ─── Generator Panel (optional) ───────────────────────────────
      const panelContainer = document.getElementById(
        config.panelContainerId || 'explanationGeneratorPanel'
      );
      if (panelContainer && typeof ExplanationGeneratorPanel !== 'undefined') {
        this.generatorPanel = new ExplanationGeneratorPanel(
          this.aiManager,
          this.cloudflareHandler,
          this.firestoreHandler,
          { panelId: config.panelContainerId || 'explanationGeneratorPanel', theme: config.theme || 'dark' }
        );
        await this.generatorPanel.initialize();
        await this.generatorPanel.loadProviderOptions();
        console.log('✅ Explanation Generator Panel initialized');
      } else {
        console.log('ℹ️  Generator Panel not found / not needed — skipping');
      }

      this.isInitialized = true;
      console.log('✨ ExplanationSystem fully initialized!');

      return {
        status: 'initialized',
        timestamp: new Date(),
        modules: {
          aiManager:        !!this.aiManager,
          cloudflareHandler:!!this.cloudflareHandler,
          firestoreHandler: !!this.firestoreHandler,
          displaySystem:    !!this.displaySystem,
          generatorPanel:   !!this.generatorPanel
        }
      };

    } catch (error) {
      console.error('❌ Error initializing ExplanationSystem:', error);
      return { status: 'error', error: error.message, timestamp: new Date() };
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════

  async initializeQuestionExplanations(questionId, containerElement) {
    try {
      if (!this.isInitialized) return { status: 'error', message: 'System not initialized' };
      if (!this.displaySystem)  return { status: 'error', message: 'Display System not available' };
      return await this.displaySystem.initializeForQuestion(questionId, containerElement);
    } catch (error) {
      console.error('Error initializing question explanations:', error);
      return { status: 'error', error: error.message };
    }
  },

  setApiKeys(keys) {
    if (!this.aiManager) return { status: 'error', message: 'AI Manager not initialized' };
    this.aiManager.updateApiKeys(keys);
    console.log('✅ API keys updated');
    return { status: 'updated', timestamp: new Date() };
  },

  showGeneratorPanel() {
    if (!this.generatorPanel) return { status: 'error', message: 'Panel not initialized' };
    const el = document.getElementById(this.config.panelContainerId || 'explanationGeneratorPanel');
    if (el) { el.style.display = 'block'; el.scrollIntoView({ behavior: 'smooth' }); return { status: 'shown' }; }
    return { status: 'error', message: 'Panel element not found' };
  },

  hideGeneratorPanel() {
    const el = document.getElementById(this.config.panelContainerId || 'explanationGeneratorPanel');
    if (el) { el.style.display = 'none'; return { status: 'hidden' }; }
    return { status: 'error', message: 'Panel element not found' };
  },

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      aiManager:    this.aiManager    ? this.aiManager.getHealthStatus()    : null,
      cloudflare:   this.cloudflareHandler ? this.cloudflareHandler.getConfig() : null,
      displaySystem:this.displaySystem ? this.displaySystem.getState()      : null,
      timestamp: new Date()
    };
  },

  getProviders()              { return this.aiManager ? this.aiManager.getProviderStatus() : null; },
  getUsageStats(p = null)     { return this.aiManager ? this.aiManager.getUsageStats(p)    : null; },

  async getExplanationCoverage(courseId) {
    return this.firestoreHandler ? await this.firestoreHandler.getExplanationStats(courseId) : null;
  },

  async getPendingExplanations(chapterId = null) {
    return this.firestoreHandler ? await this.firestoreHandler.getPendingExplanations(chapterId) : null;
  },

  async migrateSchema(courseId = null) {
    if (!this.firestoreHandler) return { status: 'error', message: 'Firestore Handler not initialized' };
    const result = await this.firestoreHandler.migrateQuestionsSchema(courseId);
    console.log('✅ Schema migration complete:', result);
    return result;
  },

  async generateExplanation(question, correctAnswer, level = 1, context = '', provider = null) {
    if (!this.aiManager) return { status: 'error', message: 'AI Manager not initialized' };
    return await this.aiManager.generateExplanation(question, correctAnswer, level, context, provider);
  },

  clearCaches() {
    const results = {};
    if (this.cloudflareHandler) results.cloudflare    = this.cloudflareHandler.clearCache();
    if (this.displaySystem)     results.displaySystem = this.displaySystem.clearCache();
    console.log('✅ Caches cleared');
    return results;
  },

  resetDailyUsage() {
    if (!this.aiManager) return { status: 'error', message: 'AI Manager not initialized' };
    this.aiManager.resetDailyUsage();
    return { status: 'reset', timestamp: new Date() };
  },

  logSystemInfo() {
    console.group('📊 ExplanationSystem Information');
    console.log('Status:', this.isInitialized ? '✅ Initialized' : '❌ Not initialized');
    if (this.aiManager) {
      console.group('AI Manager');
      console.log('Providers:', this.aiManager.getProviderStatus());
      console.log('Usage:',     this.aiManager.getUsageStats());
      console.groupEnd();
    }
    if (this.cloudflareHandler) {
      console.group('Cloudflare');
      console.log('Config:', this.cloudflareHandler.getConfig());
      console.groupEnd();
    }
    console.groupEnd();
  }
};

// ── NOTE: Auto-initialization removed intentionally ─────────────────────────
// index.html already handles initialization after Firestore is ready.
// Having two init attempts caused a race condition and double-init errors.

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.ExplanationSystem;
}

console.log('✅ ExplanationSystem module loaded');

console.log('✅ All explanation modules loaded and ready.');