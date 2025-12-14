import { GoogleGenAI } from "@google/genai";
import { Move, Player } from '../types';

// Safely initialize the AI client
const apiKey = process.env.API_KEY || '';
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const getGameCommentary = async (
  p1Move: Move,
  p2Move: Move,
  winner: Player | 'Draw',
  mode: 'VS_CPU' | 'VS_FRIEND' | 'ONLINE'
): Promise<string> => {
  if (!ai) {
    return "GG! Play again?";
  }

  try {
    const prompt = `
      Match Result:
      Mode: ${mode === 'VS_CPU' ? 'Human vs AI' : 'Human vs Human'}
      Player 1 Move: ${p1Move}
      Player 2 Move: ${p2Move}
      Winner: ${winner}

      Task: Write a very short, witty, 1-sentence commentary on this result. 
      If playing vs AI, be slightly sassy/competitive if AI wins, or gracious if AI loses.
      If Human vs Human, be an excited sportscaster.
      Keep it under 20 words.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a witty game announcer.",
        maxOutputTokens: 50,
      }
    });

    const text = response.text;
    if (!text) {
        return winner === 'Draw' ? "It's a draw!" : `${winner} takes the round!`;
    }

    return text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    return winner === 'Draw' ? "It's a draw!" : `${winner} takes the round!`;
  }
};