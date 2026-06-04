/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIRESTORE HANDLER - Explanation Metadata & Link Management
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Responsibilities:
 * - Store explanation links in Firestore
 * - Retrieve explanation metadata by question
 * - Manage explanation versions
 * - Handle schema updates and migrations
 * - Track explanation generation history
 */

class FirestoreHandler {
  constructor(db) {
    // ─── Configuration ────────────────────────────────────────────────
    this.db = db; // Firebase Firestore instance
    
    // Collection names
    this.collectionsNames = {
      questions: 'questions',
      explanations: 'explanations',
      explanationHistory: 'explanationGenerationHistory',
      explanationVersions: 'explanationVersions'
    };

    // Schema version for migrations
    this.schemaVersion = 1;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE EXPLANATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save explanation link to Firestore
   * Stores URL for Level 2 or Level 3 explanations
   * 
   * @param {string} questionId - Question ID
   * @param {number} level - Explanation level (2 or 3)
   * @param {string} cloudflareUrl - URL from Cloudflare
   * @param {string} fileId - File ID in Cloudflare
   * @param {string} provider - AI provider that generated this
   * @returns {Promise<Object>} - Save result
   */
  async saveExplanationLink(questionId, level, cloudflareUrl, fileId, provider) {
    try {
      if (!questionId || !level || !cloudflareUrl) {
        throw new Error('Missing required fields: questionId, level, cloudflareUrl');
      }

      const docRef = this.db.collection(this.collectionsNames.questions).doc(questionId);

      // Update document with explanation link
      const updateData = {};
      
      if (level === 2) {
        updateData['explanations.level2'] = {
          url: cloudflareUrl,
          fileId: fileId,
          provider: provider,
          uploadedAt: new Date(),
          version: 1,
          status: 'published'
        };
      } else if (level === 3) {
        updateData['explanations.level3'] = {
          url: cloudflareUrl,
          fileId: fileId,
          provider: provider,
          uploadedAt: new Date(),
          version: 1,
          status: 'published'
        };
      }

      await docRef.update(updateData);

      // Log to history
      await this.logExplanationGeneration(questionId, level, provider, 'saved');

      return {
        questionId: questionId,
        level: level,
        url: cloudflareUrl,
        fileId: fileId,
        status: 'saved',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error saving explanation link:', error);
      return {
        questionId: questionId,
        level: level,
        error: error.message,
        status: 'error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Save multiple explanation links at once
   */
  async batchSaveExplanationLinks(explanations) {
    const results = [];
    
    for (const explanation of explanations) {
      const result = await this.saveExplanationLink(
        explanation.questionId,
        explanation.level,
        explanation.cloudflareUrl,
        explanation.fileId,
        explanation.provider
      );
      results.push(result);
    }

    return {
      total: explanations.length,
      successful: results.filter(r => r.status === 'saved').length,
      failed: results.filter(r => r.status === 'error').length,
      results: results,
      timestamp: new Date()
    };
  }

  /**
   * Update explanation link (new version)
   */
  async updateExplanationLink(questionId, level, newCloudflareUrl, fileId, provider) {
    try {
      const docRef = this.db.collection(this.collectionsNames.questions).doc(questionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error(`Question ${questionId} not found`);
      }

      // Get current explanation
      const explanations = doc.data().explanations || {};
      const levelKey = `level${level}`;
      const currentExplanation = explanations[levelKey];
      const nextVersion = (currentExplanation?.version || 0) + 1;

      // Save old version to history
      if (currentExplanation) {
        await this.saveExplanationVersion(questionId, level, currentExplanation);
      }

      // Update with new version
      const updateData = {};
      updateData[`explanations.${levelKey}`] = {
        url: newCloudflareUrl,
        fileId: fileId,
        provider: provider,
        uploadedAt: new Date(),
        version: nextVersion,
        status: 'published',
        previousVersion: currentExplanation?.version || 0
      };

      await docRef.update(updateData);

      // Log to history
      await this.logExplanationGeneration(questionId, level, provider, 'updated');

      return {
        questionId: questionId,
        level: level,
        version: nextVersion,
        url: newCloudflareUrl,
        status: 'updated',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error updating explanation link:', error);
      return {
        questionId: questionId,
        level: level,
        error: error.message,
        status: 'error',
        timestamp: new Date()
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RETRIEVE EXPLANATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get explanation links for a question
   * @param {string} questionId - Question ID
   * @returns {Promise<Object>} - Explanation data with URLs
   */
  async getExplanationLinks(questionId) {
    try {
      const docRef = this.db.collection(this.collectionsNames.questions).doc(questionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error(`Question ${questionId} not found`);
      }

      const explanations = doc.data().explanations || {};

      return {
        questionId: questionId,
        level1: {
          // Level 1 is stored in questions document
          text: doc.data().explanation || null,
          source: 'firestore',
          available: !!doc.data().explanation
        },
        level2: {
          url: explanations.level2?.url || null,
          fileId: explanations.level2?.fileId || null,
          provider: explanations.level2?.provider || null,
          version: explanations.level2?.version || null,
          uploadedAt: explanations.level2?.uploadedAt || null,
          available: !!explanations.level2?.url,
          source: 'cloudflare'
        },
        level3: {
          url: explanations.level3?.url || null,
          fileId: explanations.level3?.fileId || null,
          provider: explanations.level3?.provider || null,
          version: explanations.level3?.version || null,
          uploadedAt: explanations.level3?.uploadedAt || null,
          available: !!explanations.level3?.url,
          source: 'cloudflare'
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting explanation links:', error);
      return {
        questionId: questionId,
        error: error.message,
        level1: { available: false },
        level2: { available: false },
        level3: { available: false }
      };
    }
  }

  /**
   * Get explanations for multiple questions
   */
  async getMultipleExplanationLinks(questionIds) {
    const results = {};

    for (const questionId of questionIds) {
      results[questionId] = await this.getExplanationLinks(questionId);
    }

    return results;
  }

  /**
   * Get all questions with pending explanations
   */
  async getPendingExplanations(chapterId = null) {
    try {
      let query = this.db.collection(this.collectionsNames.questions);

      if (chapterId) {
        query = query.where('chapterId', '==', chapterId);
      }

      const snapshot = await query.get();
      const pending = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        const explanations = data.explanations || {};

        if (!explanations.level2?.url || !explanations.level3?.url) {
          pending.push({
            questionId: doc.id,
            question: data.question,
            chapterId: data.chapterId,
            missingLevels: [
              !explanations.level2?.url ? 2 : null,
              !explanations.level3?.url ? 3 : null
            ].filter(Boolean)
          });
        }
      });

      return {
        total: pending.length,
        chapterId: chapterId,
        pending: pending,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting pending explanations:', error);
      return {
        error: error.message,
        pending: []
      };
    }
  }

  /**
   * Get explanation generation statistics
   */
  async getExplanationStats(courseId = null) {
    try {
      let query = this.db.collection(this.collectionsNames.questions);

      if (courseId) {
        query = query.where('courseId', '==', courseId);
      }

      const snapshot = await query.get();
      
      let level2Count = 0;
      let level3Count = 0;
      let bothCount = 0;
      let noneCount = 0;

      snapshot.forEach(doc => {
        const explanations = doc.data().explanations || {};
        const hasLevel2 = !!explanations.level2?.url;
        const hasLevel3 = !!explanations.level3?.url;

        if (hasLevel2 && hasLevel3) bothCount++;
        else if (hasLevel2) level2Count++;
        else if (hasLevel3) level3Count++;
        else noneCount++;
      });

      return {
        courseId: courseId,
        totalQuestions: snapshot.size,
        level2Only: level2Count,
        level3Only: level3Count,
        bothLevels: bothCount,
        noExplanations: noneCount,
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

  /**
   * Save old version of explanation
   */
  async saveExplanationVersion(questionId, level, explanationData) {
    try {
      const versionRef = this.db
        .collection(this.collectionsNames.explanationVersions)
        .doc(`${questionId}_level${level}`)
        .collection('versions')
        .doc(`v${explanationData.version}`);

      await versionRef.set({
        questionId: questionId,
        level: level,
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

  /**
   * Get explanation versions history
   */
  async getExplanationVersions(questionId, level) {
    try {
      const snapshot = await this.db
        .collection(this.collectionsNames.explanationVersions)
        .doc(`${questionId}_level${level}`)
        .collection('versions')
        .orderBy('version', 'desc')
        .get();

      const versions = [];
      snapshot.forEach(doc => {
        versions.push(doc.data());
      });

      return {
        questionId: questionId,
        level: level,
        versions: versions,
        totalVersions: versions.length
      };
    } catch (error) {
      console.error('Error getting versions:', error);
      return {
        questionId: questionId,
        level: level,
        error: error.message,
        versions: []
      };
    }
  }

  /**
   * Restore previous version
   */
  async restorePreviousVersion(questionId, level, versionNumber) {
    try {
      const versionRef = this.db
        .collection(this.collectionsNames.explanationVersions)
        .doc(`${questionId}_level${level}`)
        .collection('versions')
        .doc(`v${versionNumber}`);

      const doc = await versionRef.get();
      if (!doc.exists) {
        throw new Error(`Version ${versionNumber} not found`);
      }

      const versionData = doc.data();
      
      // Update question with restored version
      await this.saveExplanationLink(
        questionId,
        level,
        versionData.url,
        versionData.fileId,
        versionData.provider
      );

      return {
        questionId: questionId,
        level: level,
        restoredVersion: versionNumber,
        status: 'restored',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error restoring version:', error);
      return {
        error: error.message,
        status: 'error'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOGGING & HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Log explanation generation/update event
   */
  async logExplanationGeneration(questionId, level, provider, action) {
    try {
      const historyRef = this.db
        .collection(this.collectionsNames.explanationHistory)
        .doc();

      await historyRef.set({
        questionId: questionId,
        level: level,
        provider: provider,
        action: action, // 'generated', 'saved', 'updated', 'deleted'
        timestamp: new Date(),
        userId: this.getCurrentUserId() // You'll need to implement this
      });

      return { status: 'logged' };
    } catch (error) {
      console.error('Error logging:', error);
      return { error: error.message };
    }
  }

  /**
   * Get generation history for a question
   */
  async getGenerationHistory(questionId, limit = 10) {
    try {
      const snapshot = await this.db
        .collection(this.collectionsNames.explanationHistory)
        .where('questionId', '==', questionId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const history = [];
      snapshot.forEach(doc => {
        history.push(doc.data());
      });

      return {
        questionId: questionId,
        history: history,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting history:', error);
      return { error: error.message, history: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCHEMA MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize question with explanation fields
   */
  async initializeQuestionExplanations(questionId) {
    try {
      const docRef = this.db.collection(this.collectionsNames.questions).doc(questionId);

      await docRef.update({
        explanations: {
          level1: {
            // Already stored as 'explanation' field
          },
          level2: {
            url: null,
            fileId: null,
            provider: null,
            uploadedAt: null,
            version: 0,
            status: 'pending'
          },
          level3: {
            url: null,
            fileId: null,
            provider: null,
            uploadedAt: null,
            version: 0,
            status: 'pending'
          }
        },
        explanationStatus: 'incomplete',
        schemaVersion: this.schemaVersion,
        updatedAt: new Date()
      });

      return {
        questionId: questionId,
        status: 'initialized',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error initializing:', error);
      return { error: error.message, status: 'error' };
    }
  }

  /**
   * Migrate questions to new schema
   */
  async migrateQuestionsSchema(courseId = null) {
    try {
      let query = this.db.collection(this.collectionsNames.questions);

      if (courseId) {
        query = query.where('courseId', '==', courseId);
      }

      const snapshot = await query.get();
      let migratedCount = 0;

      const batch = this.db.batch();

      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Check if already migrated
        if (!data.explanations) {
          batch.update(doc.ref, {
            explanations: {
              level1: { /* explanation text already in 'explanation' field */ },
              level2: { url: null, status: 'pending' },
              level3: { url: null, status: 'pending' }
            },
            schemaVersion: this.schemaVersion,
            migratedAt: new Date()
          });
          migratedCount++;
        }
      });

      await batch.commit();

      return {
        totalQuestions: snapshot.size,
        migratedCount: migratedCount,
        status: 'completed',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error migrating schema:', error);
      return { error: error.message, status: 'error' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Delete explanation (soft delete - keep history)
   */
  async deleteExplanation(questionId, level) {
    try {
      const updateData = {};
      updateData[`explanations.level${level}`] = {
        url: null,
        fileId: null,
        status: 'deleted',
        deletedAt: new Date()
      };

      await this.db.collection(this.collectionsNames.questions).doc(questionId).update(updateData);

      await this.logExplanationGeneration(questionId, level, 'system', 'deleted');

      return {
        questionId: questionId,
        level: level,
        status: 'deleted',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error deleting explanation:', error);
      return { error: error.message, status: 'error' };
    }
  }

  /**
   * Get current user ID (implement based on your auth system)
   */
  getCurrentUserId() {
    // TODO: Implement based on your Firebase Auth setup
    return 'anonymous';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER MODULES
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FirestoreHandler;
}
