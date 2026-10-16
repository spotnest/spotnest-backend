
import type { Request, Response } from 'express';
import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export const handleAiRequest = async (req: Request, res: Response) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ success: false, message: "Prompt is required" });
        }

        const completion = await groq.chat.completions.create({
            model: 'openai/gpt-oss-20b',
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        const generatedText = completion.choices[0]?.message?.content;

        return res.status(200).json({
            success: true,
            data: generatedText,
        });
    } catch (error: any) {
        console.error("Groq SDK Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};