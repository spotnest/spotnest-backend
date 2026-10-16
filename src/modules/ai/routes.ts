import { Router } from 'express';
import { handleAiRequest } from './controller.js';

const router = Router();

router.post('/generate', handleAiRequest);

export default router;