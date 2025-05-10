// src/routes/compressionRoutes.js
// Compression Routes
import express from 'express';
import { projectSessionManager } from '../services/sessions/index.js';
import { FIELD_NAMES } from '../services/sessions/schema.js';
import {compressConversationHistory} from "../logic/compress.js";

const router = express.Router();

/**
 * Compress endpoint - Compresses conversation history for a session
 * @route POST /api/compress/:sessionId
 */
router.post('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  // Validate session exists
  const sessionData = await projectSessionManager.getSession(sessionId);
  if (!sessionData) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if(sessionData.history.length > 1) {
    try {
      // Compress the conversation history
      let modifiedHistory = await compressConversationHistory(sessionData.history, sessionData);

      // Update the session with compressed history
      sessionData[FIELD_NAMES.HISTORY] = modifiedHistory;
      await projectSessionManager.saveSession(sessionId);

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
    // Not enough history to compress
    res.json({
      success: false,
      message: 'Not enough conversation history to compress',
      sessionId,
      shouldReactivateButton: true
    });
  }
});

export default router;