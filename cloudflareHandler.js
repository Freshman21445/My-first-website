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

  // ═══════════════════════════════════════════════════════════════════════
  // UPLOAD TO CLOUDFLARE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Upload explanation content to Cloudflare
   * @param {string} questionId - Question ID (from Firestore)
   * @param {string} content - Explanation content
   * @param {number} level - Explanation level (2 or 3)
   * @param {string} provider - Which AI provider generated this
   * @returns {Promise<Object>} - { url, fileId, timestamp, status }
   */
  async uploadExplanation(questionId, content, level, provider) {
    try {
      if (!questionId || !content || !level) {
        throw new Error('Missing required fields: questionId, content, level');
      }

      // Generate file ID
      const fileId = this.generateFileId(questionId, level);
      
      // Prepare content with metadata
      const contentWithMetadata = {
        content: content,
        questionId: questionId,
        level: level,
        provider: provider,
        uploadedAt: new Date().toISOString(),
        version: 1
      };

      // Attempt upload with retries
      let result = null;
      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          result = await this.uploadToCloudflare(fileId, contentWithMetadata);
          break;
        } catch (error) {
          console.warn(`Upload attempt ${attempt + 1} failed:`, error);
          if (attempt === this.config.maxRetries - 1) {
            throw error;
          }
          await this.delay(this.config.retryDelay * (attempt + 1));
        }
      }

      // Generate public URL
      const publicUrl = this.generatePublicUrl(fileId);

      return {
        fileId: fileId,
        url: publicUrl,
        level: level,
        provider: provider,
        contentSize: new Blob([JSON.stringify(contentWithMetadata)]).size,
        uploadedAt: new Date(),
        status: 'success'
      };
    } catch (error) {
      console.error('Error uploading explanation:', error);
      return {
        fileId: null,
        url: null,
        level: level,
        error: error.message,
        status: 'error',
        uploadedAt: new Date()
      };
    }
  }

  /**
   * Upload to Cloudflare using Worker
   */
  async uploadToCloudflare(fileId, contentData) {
    const formData = new FormData();
    formData.append('file', new Blob([JSON.stringify(contentData)], { type: 'application/json' }), `${fileId}.json`);
    formData.append('path', this.config.storagePath);

    const response = await fetch(this.config.workerUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Cloudflare upload failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Batch upload multiple explanations
   */
  async batchUploadExplanations(explanations) {
    const results = [];
    
    for (const explanation of explanations) {
      const result = await this.uploadExplanation(
        explanation.questionId,
        explanation.content,
        explanation.level,
        explanation.provider
      );
      results.push(result);
      // Small delay between uploads
      await this.delay(100);
    }

    return {
      total: explanations.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      results: results,
      timestamp: new Date()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RETRIEVE FROM CLOUDFLARE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Retrieve explanation content from Cloudflare
   * @param {string} fileId - File ID to retrieve
   * @param {boolean} useCache - Use local cache if available
   * @returns {Promise<Object>} - { content, metadata, retrieved }
   */
  async retrieveExplanation(fileId, useCache = true) {
    try {
      // Check cache first
      if (useCache && this.cache.has(fileId)) {
        console.log(`Retrieved from cache: ${fileId}`);
        return {
          content: this.cache.get(fileId).content,
          metadata: this.cache.get(fileId).metadata,
          source: 'cache',
          retrieved: new Date()
        };
      }

      // Fetch from Cloudflare
      const response = await fetch(this.generatePublicUrl(fileId));

      if (!response.ok) {
        throw new Error(`Failed to retrieve: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the result
      this.cache.set(fileId, {
        content: data.content,
        metadata: {
          questionId: data.questionId,
          level: data.level,
          provider: data.provider,
          uploadedAt: data.uploadedAt
        }
      });

      return {
        content: data.content,
        metadata: {
          questionId: data.questionId,
          level: data.level,
          provider: data.provider,
          uploadedAt: data.uploadedAt
        },
        source: 'cloudflare',
        retrieved: new Date()
      };
    } catch (error) {
      console.error('Error retrieving explanation:', error);
      return {
        content: null,
        metadata: null,
        error: error.message,
        source: null,
        retrieved: new Date()
      };
    }
  }

  /**
   * Retrieve by URL (alternative method)
   */
  async retrieveByUrl(url) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to retrieve from URL: ${response.status}`);
      }

      const data = await response.json();

      return {
        content: data.content,
        metadata: {
          questionId: data.questionId,
          level: data.level,
          provider: data.provider,
          uploadedAt: data.uploadedAt
        },
        source: 'cloudflare',
        retrieved: new Date()
      };
    } catch (error) {
      console.error('Error retrieving from URL:', error);
      return {
        content: null,
        error: error.message,
        retrieved: new Date()
      };
    }
  }

  /**
   * Stream explanation content (for large files)
   */
  async streamExplanation(fileId, onChunk) {
    try {
      const response = await fetch(this.generatePublicUrl(fileId));

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        onChunk(chunk);
      }

      return { status: 'success' };
    } catch (error) {
      console.error('Stream error:', error);
      return { status: 'error', error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VERSIONING & MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Update explanation (creates new version, keeps old)
   */
  async updateExplanation(questionId, newContent, level, provider) {
    try {
      // Get existing file ID and increment version
      const baseFileId = this.generateFileId(questionId, level);
      const versionedFileId = `${baseFileId}_v${this.getNextVersion(questionId, level)}`;

      // Upload new version
      const result = await this.uploadExplanation(questionId, newContent, level, provider);

      return {
        ...result,
        fileId: versionedFileId,
        isUpdate: true,
        previousVersion: baseFileId
      };
    } catch (error) {
      console.error('Error updating explanation:', error);
      return {
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * Get version number for question/level
   */
  getNextVersion(questionId, level) {
    // This would be managed in Firestore in production
    // For now, return 1 as default
    return 1;
  }

  /**
   * Delete explanation from Cloudflare
   */
  async deleteExplanation(fileId) {
    try {
      // Clear from cache
      this.cache.delete(fileId);

      // In production, implement actual deletion through Worker
      return {
        fileId: fileId,
        status: 'deleted',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error deleting explanation:', error);
      return {
        fileId: fileId,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * List all explanations for a question
   */
  async listExplanations(questionId) {
    // This would require Worker support to list files
    // For now, returns basic structure
    return {
      questionId: questionId,
      explanations: [
        {
          level: 2,
          fileId: this.generateFileId(questionId, 2),
          url: this.generatePublicUrl(this.generateFileId(questionId, 2))
        },
        {
          level: 3,
          fileId: this.generateFileId(questionId, 3),
          url: this.generatePublicUrl(this.generateFileId(questionId, 3))
        }
      ]
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // URL GENERATION & FILE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate unique file ID
   */
  generateFileId(questionId, level) {
    return `q${questionId}_level${level}_${Date.now()}`;
  }

  /**
   * Generate public URL for file
   */
  generatePublicUrl(fileId) {
    // URL structure: workerUrl?id=fileId
    return `${this.config.workerUrl}?id=${encodeURIComponent(fileId)}`;
  }

  /**
   * Parse file ID to get question and level
   */
  parseFileId(fileId) {
    const match = fileId.match(/q(\d+)_level(\d)/);
    if (match) {
      return {
        questionId: match[1],
        level: parseInt(match[2])
      };
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    return { status: 'cleared', timestamp: new Date() };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      items: Array.from(this.cache.keys()),
      timestamp: new Date()
    };
  }

  /**
   * Pre-cache explanations
   */
  async precacheExplanations(fileIds) {
    const results = [];
    
    for (const fileId of fileIds) {
      const result = await this.retrieveExplanation(fileId, false);
      results.push({
        fileId: fileId,
        cached: result.status !== 'error',
        size: result.content ? result.content.length : 0
      });
    }

    return {
      total: fileIds.length,
      cached: results.filter(r => r.cached).length,
      results: results,
      timestamp: new Date()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STORAGE STATISTICS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get storage statistics (if tracking is enabled)
   */
  getStorageStats() {
    // This would require Worker API integration
    return {
      totalExplanations: 0,
      level2Count: 0,
      level3Count: 0,
      totalSize: 0,
      workerUrl: this.config.workerUrl,
      timestamp: new Date()
    };
  }

  /**
   * Estimate storage size
   */
  estimateSize(content) {
    return new Blob([JSON.stringify(content)]).size;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(this.config.workerUrl, { method: 'HEAD' });
      return {
        status: response.ok ? 'healthy' : 'degraded',
        workerUrl: this.config.workerUrl,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get configuration
   */
  getConfig() {
    return {
      workerUrl: this.config.workerUrl,
      storagePath: this.config.storagePath,
      maxRetries: this.config.maxRetries,
      cacheEnabled: true,
      cacheSize: this.cache.size
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER MODULES
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CloudflareHandler;
}
