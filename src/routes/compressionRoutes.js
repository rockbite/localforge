// src/routes/compressionRoutes.js
// Compression Routes
import express from 'express';
import { projectSessionManager } from '../services/sessions/index.js';
import { FIELD_NAMES } from '../services/sessions/schema.js';
import { compressConversationHistory } from "../logic/compress.js";
import { compressionTracker } from '../services/compressionTracker.js';

console.log("compressionRoutes.js imported, setting up router");

const router = express.Router();

/**
 * Compress endpoint - Compresses conversation history for a session
 * @route POST /api/compression/:sessionId
 */
router.post('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  // todo: no abortion here, need to be able to abort later on

  console.log("Starting to compress message history on backend");

  // Check if this session is already being compressed
  if (!compressionTracker.startCompression(sessionId)) {
    return res.status(409).json({
      success: false,
      message: 'Compression already in progress for this session',
      sessionId
    });
  }

  try {
    // Validate session exists
    const sessionData = await projectSessionManager.getSession(sessionId);
    if (!sessionData) {
      compressionTracker.endCompression(sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    if(sessionData.history.length > 1) {
      try {
        // Compress the conversation history
        let modifiedHistory = await compressConversationHistory(sessionData.history, sessionData);

        // Update the session with compressed history
        sessionData[FIELD_NAMES.HISTORY] = modifiedHistory;
        await projectSessionManager.saveSession(sessionId);

        console.log('Session history compressed successfully')

        // Send success response with reload flag
        res.json({
          success: true,
          message: 'Session history compressed successfully',
          sessionId,
          shouldReloadChat: true
        });
      } catch (error) {
        console.error('Error compressing history:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to compress session history',
          sessionId,
          error: error.message
        });
      }
    } else {
      console.error('Not enough conversation history to compress');

      // Not enough history to compress
      res.json({
        success: false,
        message: 'Not enough conversation history to compress',
        sessionId,
        shouldReactivateButton: true
      });
    }
  } finally {
    // Always ensure the compression lock is released for this session
    compressionTracker.endCompression(sessionId);
  }
});

/**
 * Get compression status for a session
 * @route GET /api/compression/status/:sessionId
 */
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.json({
    compressing: compressionTracker.isCompressing(sessionId)
  });
});

export default router;