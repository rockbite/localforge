// src/services/compressionTracker.js
/**
 * Simple in-memory compression tracker service
 * Tracks which sessions are currently being compressed
 * This state is intentionally not persisted, as compression jobs are lost on server restart
 */

// Map to track active compression jobs per session ID
const activeCompressions = new Map(); // sessionId -> startTime

/**
 * CompressionTracker service
 */
export const compressionTracker = {
  /**
   * Start tracking a compression job for a session
   * @param {string} sessionId - The session ID to track
   * @returns {boolean} - Whether the job was started (false if already compressing)
   */
  startCompression(sessionId) {
    if (activeCompressions.has(sessionId)) {
      return false; // Already compressing this session
    }
    
    activeCompressions.set(sessionId, Date.now());
    return true;
  },
  
  /**
   * End tracking a compression job for a session
   * @param {string} sessionId - The session ID to stop tracking
   */
  endCompression(sessionId) {
    activeCompressions.delete(sessionId);
  },
  
  /**
   * Check if a session is currently being compressed
   * @param {string} sessionId - The session ID to check
   * @returns {boolean} - Whether the session is being compressed
   */
  isCompressing(sessionId) {
    return activeCompressions.has(sessionId);
  },
  
  /**
   * Get all session IDs that are currently being compressed
   * @returns {string[]} - Array of session IDs currently being compressed
   */
  getAllCompressingSessions() {
    return [...activeCompressions.keys()];
  }
};