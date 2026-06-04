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
