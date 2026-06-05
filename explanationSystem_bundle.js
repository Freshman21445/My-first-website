/* ================================================================
   EXPLANATION SYSTEM — BUNDLE
   ================================================================ */

/* ── CloudflareHandler ─────────────────────────────────────────── */
class CloudflareHandler {
  constructor(config = {}) {
    this.config = {
      workerUrl: config.workerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
      storagePath: config.storagePath || 'explanations',
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
    this.cache = new Map();
  }

  getConfig() {
    return { workerUrl: this.config.workerUrl, storagePath: this.config.storagePath };
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    return { cleared: size };
  }

  async healthCheck() {
    try {
      const response = await fetch(this.config.workerUrl, { method: 'HEAD' });
      return { status: response.ok ? 'healthy' : 'degraded', statusCode: response.status };
    } catch (e) {
      return { status: 'unreachable', error: e.message };
    }
  }

  _generateFileId(questionId, level, provider) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.config.storagePath}/${questionId}_level${level}_${timestamp}_${random}.txt`;
  }

  async uploadExplanation(questionId, explanationText, level, provider) {
    const fileId = this._generateFileId(questionId, level, provider);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload',
            fileId: fileId,
            content: explanationText,
            metadata: { questionId, level, provider, uploadedAt: new Date().toISOString() }
          })
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          const url = data.url || `${this.config.workerUrl}?file=${encodeURIComponent(fileId)}`;
          this.cache.set(fileId, explanationText);
          return { status: 'success', url, fileId, questionId, level, provider };
        }

        if (response.status === 404 || response.status === 405) {
          console.error('Cloudflare Worker does not support upload action — check your Worker script.');
          return {
            status: 'error',
            error: 'Cloudflare Worker upload not supported (HTTP ' + response.status + '). Check your Worker configuration.',
            questionId, level, provider
          };
        }

        throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        if (attempt === this.config.maxRetries) {
          console.error('All Cloudflare upload attempts failed:', err.message);
          return {
            status: 'error',
            error: 'Cloudflare upload failed after ' + this.config.maxRetries + ' attempts: ' + err.message,
            questionId, level, provider
          };
        }
        await new Promise(r => setTimeout(r, this.config.retryDelay * attempt));
      }
    }
  }

  async retrieveExplanation(fileId) {
    if (this.cache.has(fileId)) return { status: 'success', content: this.cache.get(fileId), source: 'cache' };

    try {
      const url = `${this.config.workerUrl}?file=${encodeURIComponent(fileId)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.text();
      this.cache.set(fileId, content);
      return { status: 'success', content, source: 'cloudflare' };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  async retrieveByUrl(url) {
    if (!url || url.startsWith('firestore://')) return { status: 'error', error: 'No Cloudflare URL available' };
    // Check cache by url
    if (this.cache.has(url)) return { status: 'success', content: this.cache.get(url), source: 'cache' };
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.text();
      this.cache.set(url, content);
      return { status: 'success', content, source: 'cloudflare' };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
}

/* ── FirestoreHandler ──────────────────────────────────────────── */
class FirestoreHandler {
  constructor(db) {
    this.db = db;
    this.collectionsNames = {
      questions:           'adminExams',
      explanationHistory:  'explanationGenerationHistory',
      explanationVersions: 'explanationVersions'
    };
    this.schemaVersion = 1;
  }

  _fns() {
    const fns = window._firestoreFns;
    if (!fns) throw new Error('Firestore functions not available');
    return fns;
  }

  getCurrentUserId() {
    try { return window._currentUserPhone || window._currentUserId || 'admin'; } catch (e) { return 'admin'; }
  }

  // Save Cloudflare URL for level 1, 2 — all explanations go to Cloudflare
  async saveExplanationLink(questionId, level, cloudflareUrl, fileId, provider) {
    try {
      const { doc, updateDoc } = this._fns();
      const docRef = doc(this.db, this.collectionsNames.questions, questionId);
      const updateData = {};

      if (level === 1) {
        updateData['explanations.level1'] = {
          url: cloudflareUrl, fileId, provider,
          uploadedAt: new Date(), version: 1, status: 'published'
        };
      } else if (level === 2) {
        updateData['explanations.level2'] = {
          url: cloudflareUrl, fileId, provider,
          uploadedAt: new Date(), version: 1, status: 'published'
        };
      }

      await updateDoc(docRef, updateData);
      await this.logExplanationGeneration(questionId, level, provider, 'saved');
      return { questionId, level, url: cloudflareUrl, fileId, status: 'saved', timestamp: new Date() };
    } catch (error) {
      console.error('Error saving explanation link:', error);
      return { questionId, level, error: error.message, status: 'error' };
    }
  }

  async getExplanationLinks(questionId) {
    try {
      const { doc, getDoc } = this._fns();
      const snap = await getDoc(doc(this.db, this.collectionsNames.questions, questionId));
      if (!snap.exists()) throw new Error(`Question ${questionId} not found`);
      const data = snap.data();
      const explanations = data.explanations || {};
      return {
        questionId,
        level1: { url: explanations.level1?.url || null, available: !!explanations.level1?.url, source: 'cloudflare' },
        level2: { url: explanations.level2?.url || null, available: !!explanations.level2?.url, source: 'cloudflare' }
      };
    } catch (error) {
      return {
        questionId, error: error.message,
        level1: { available: false }, level2: { available: false }
      };
    }
  }

  async getExplanationStats(courseId = null) {
    try {
      const { collection, query, where, getDocs } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (courseId) q = query(q, where('courseId', '==', courseId));
      else q = query(q);
      const snapshot = await getDocs(q);
      let level1Count = 0, level2Count = 0, bothCount = 0, noneCount = 0;
      snapshot.forEach(d => {
        const exp = d.data().explanations || {};
        const h1 = !!exp.level1?.url, h2 = !!exp.level2?.url;
        if (h1 && h2) bothCount++;
        else if (h1) level1Count++;
        else if (h2) level2Count++;
        else noneCount++;
      });
      return { courseId, totalQuestions: snapshot.size, level1Only: level1Count, level2Only: level2Count, bothLevels: bothCount, noExplanations: noneCount };
    } catch (error) {
      return { error: error.message };
    }
  }

  async getPendingExplanations(chapterId = null) {
    try {
      const { collection, query, where, getDocs } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (chapterId) q = query(q, where('chapterId', '==', chapterId));
      else q = query(q);
      const snapshot = await getDocs(q);
      const pending = [];
      snapshot.forEach(d => {
        const data = d.data(), exp = data.explanations || {};
        if (!exp.level1?.url || !exp.level2?.url) {
          pending.push({
            questionId: d.id,
            question: data.question,
            missingLevels: [!exp.level1?.url ? 1 : null, !exp.level2?.url ? 2 : null].filter(Boolean)
          });
        }
      });
      return { total: pending.length, pending };
    } catch (error) {
      return { error: error.message, pending: [] };
    }
  }

  async logExplanationGeneration(questionId, level, provider, action) {
    try {
      const { collection, addDoc } = this._fns();
      await addDoc(collection(this.db, this.collectionsNames.explanationHistory), {
        questionId, level, provider, action, timestamp: new Date()
      });
    } catch (e) {
      console.warn('Logging failed (non-fatal):', e.message);
    }
  }

  async migrateQuestionsSchema(courseId = null) {
    try {
      const { collection, query, where, getDocs, updateDoc } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (courseId) q = query(q, where('courseId', '==', courseId));
      else q = query(q);
      const snapshot = await getDocs(q);
      let migratedCount = 0;
      const updates = [];
      snapshot.forEach(d => {
        if (!d.data().explanations) {
          updates.push(updateDoc(d.ref, {
            explanations: {
              level1: { url: null, status: 'pending' },
              level2: { url: null, status: 'pending' }
            },
            schemaVersion: this.schemaVersion
          }));
          migratedCount++;
        }
      });
      await Promise.all(updates);
      return { totalQuestions: snapshot.size, migratedCount, status: 'completed' };
    } catch (error) {
      return { error: error.message, status: 'error' };
    }
  }
}

/* ── ExplanationSystem ─────────────────────────────────────────── */
window.ExplanationSystem = {
  cloudflareHandler: null,
  firestoreHandler: null,
  isInitialized: false,
  config: {},

  async initialize(db, config = {}) {
    try {
      console.log('🚀 Starting ExplanationSystem initialization...');
      this.config = config;

      this.cloudflareHandler = new CloudflareHandler({
        workerUrl:   config.cloudflareWorkerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
        storagePath: 'explanations',
        maxRetries:  config.cloudflareRetries  || 3
      });
      console.log('✅ Cloudflare Handler initialized');

      this.firestoreHandler = new FirestoreHandler(db);
      console.log('✅ Firestore Handler initialized');

      this.isInitialized = true;
      console.log('✨ ExplanationSystem fully initialized!');

      return { status: 'initialized', timestamp: new Date() };
    } catch (error) {
      console.error('❌ Error initializing ExplanationSystem:', error);
      return { status: 'error', error: error.message };
    }
  },

  // Fetch explanation for a question — always from Cloudflare, silently
  async fetchExplanation(questionId, level) {
    if (!this.isInitialized) return { status: 'error', error: 'System not initialized.', text: '' };
    try {
      const links = await this.firestoreHandler.getExplanationLinks(questionId);
      const levelKey = 'level' + level;
      const linkData = links[levelKey];
      if (!linkData || !linkData.available || !linkData.url) {
        return { status: 'unavailable', text: '' };
      }
      const result = await this.cloudflareHandler.retrieveByUrl(linkData.url);
      if (result.status === 'success') return { status: 'success', text: result.content, level };
      return { status: 'error', error: result.error, text: '' };
    } catch (e) {
      return { status: 'error', error: e.message, text: '' };
    }
  },

  getStatus() {
    return { isInitialized: this.isInitialized, timestamp: new Date() };
  },

  async getExplanationCoverage(courseId)   { return this.firestoreHandler ? await this.firestoreHandler.getExplanationStats(courseId) : null; },
  async getPendingExplanations(chapterId)  { return this.firestoreHandler ? await this.firestoreHandler.getPendingExplanations(chapterId) : null; },
  async migrateSchema(courseId = null)     { return this.firestoreHandler ? await this.firestoreHandler.migrateQuestionsSchema(courseId) : null; },

  clearCaches() {
    if (this.cloudflareHandler) this.cloudflareHandler.clearCache();
    return { status: 'cleared' };
  }
};

console.log('✅ ExplanationSystem bundle loaded and ready.');
