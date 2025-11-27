// Orchestrator: Uses DeepSeek for chat/reasoning and Gemini for background memory processing
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from './db.ts';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
// --- NEW ESM PATH IMPORTS ---
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// -----------------------------

dotenv.config();

// ESM equivalent of __dirname and __filename MUST be defined first
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Gemini (Used for fast memory extraction & grounding)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Load Personality - NOW USES ESM __dirname
const personalityPath = path.join(__dirname, '../personality.json'); 
const personality = JSON.parse(fs.readFileSync(personalityPath, 'utf-8'));

/**
 * BACKGROUND TASK: Analyzes user input for permanent facts (Allergies, Location, Diet).
 * Uses Gemini Flash because it's cheap and fast.
 */
async function extractAndSaveMemory(userId: string, userInput: string) {
    try {
        const prompt = `
        Analyze this user message: "${userInput}".
        Extract strictly permanent health facts (e.g., "I live in Delhi", "I am vegan", "I have a rash").
        Return ONLY the fact as a text string. If no permanent fact is found, return "null".
        `;

        const result = await geminiModel.generateContent(prompt);
        const fact = result.response.text().trim();

        if (fact.toLowerCase() !== "null" && fact.length > 5) {
            await prisma.fact.create({
                data: { userId, content: fact }
            });
            console.log(`[Memory Saved]: ${fact}`);
        }
    } catch (error) {
        console.error("[Memory Error]:", error);
    }
}

/**
 * MAIN CHAT: Generates the health response using DeepSeek (Reasoning Model).
 */
export async function generateHealthResponse(userId: string, userMessage: string): Promise<string> {
    
    // 1. Fetch User Context (Last 5 messages + All stored facts)
    const facts = await prisma.fact.findMany({ where: { userId } });
    const history = await prisma.message.findMany({ 
        where: { userId }, 
        take: 5, 
        orderBy: { createdAt: 'desc' } 
    });

    // 2. Format Context for AI
    const memoryBlock = facts.map(f => `- ${f.content}`).join('\n');
    const historyBlock = history.reverse().map(m => `${m.role}: ${m.content}`).join('\n');

    const systemPrompt = `
    You are ${personality.name}, ${personality.role}.
    Tone: ${personality.tone}.
    Directives: ${JSON.stringify(personality.directives)}.
    
    CRITICAL USER DATA (Use this to customize your answer):
    ${memoryBlock || "No prior data known."}

    PREVIOUS CONVERSATION:
    ${historyBlock}

    Task: Answer the user's new message: "${userMessage}".
    If they describe symptoms, ask clarifying questions. Keep it safe and medical.
    `;

    // 3. Call DeepSeek API
    try {
        const response = await axios.post(
            'https://api.deepseek.com/chat/completions',
            {
                model: "deepseek-chat", 
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const aiAnswer = response.data.choices[0].message.content;

        // 4. Save the interaction to DB
        await prisma.message.create({ data: { userId, role: 'user', content: userMessage } });
        await prisma.message.create({ data: { userId, role: 'assistant', content: aiAnswer } });

        // 5. Trigger Memory Extraction (Background - don't await)
        extractAndSaveMemory(userId, userMessage);

        return aiAnswer;

    } catch (error) {
        console.error("DeepSeek API Error:", error);
        return "I apologize, but I'm having trouble accessing my medical engine right now. Please try again in a moment.";
    }
}