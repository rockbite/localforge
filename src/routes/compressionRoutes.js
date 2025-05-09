// Compression Routes
import express from 'express';
import { projectSessionManager } from '../services/sessions/index.js';
import { FIELD_NAMES } from '../services/sessions/schema.js';
import {compressConversationHistory} from "../logic/compress.js";

const router = express.Router();

/**
 * Compress endpoint - does nothing but writes a todo
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

    let modifiedHistory = compressConversationHistory(sessionData.history);

    // todo: update history using project session manager to modifiedHistory and persist it, then tell frontend to update the chat.
    // after implemeting this bit, also implement on frontend whats needed to reload.

    // Send success response
    res.json({
      success: true,
      message: 'proper msg here, but dont show it idk', //todo change
      sessionId
    });
  } else {
    // don't do anything
    res.json({
      success: false,
      message: '', // todo frontnd should just reactive the button here, e.g. so user can try again, but no hstory was modified
      sessionId
    });
  }
});

export default router;