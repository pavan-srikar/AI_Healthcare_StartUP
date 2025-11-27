// Main Express Server File - API Routes
// Fix 1: Use type-only imports for Request and Response from Express
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateHealthResponse } from './ai.js';
import prisma from './db.js';

dotenv.config();

const app = express();
// Enable CORS so your frontend/mobile app can talk to this
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// HEALTH CHECK
app.get('/', (req, res) => {
    res.send('AI Health Backend is Running');
});

// CREATE USER (Call this once when user installs app)
app.post('/api/user', async (req: Request, res: Response) : Promise<any> => {
    try {
        const user = await prisma.user.create({ data: {} });
        res.json({ userId: user.id, status: "created" });
    } catch (error) {
        res.status(500).json({ error: "Database error creating user" });
    }
});

// CHAT ENDPOINT (The main loop)
app.post('/api/chat', async (req: Request, res: Response) : Promise<any> => {
    const { userId, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ error: "Missing userId or message" });
    }

    try {
        const response = await generateHealthResponse(userId, message);
        res.json({ response });
    } catch (error) {
        res.status(500).json({ error: "AI processing failed" });
    }
});

// GET MEMORY (To see what the AI knows about the user)
app.get('/api/memory/:userId', async (req: Request, res: Response) => {
    const facts = await prisma.fact.findMany({ where: { userId: req.params.userId } });
    res.json(facts);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});