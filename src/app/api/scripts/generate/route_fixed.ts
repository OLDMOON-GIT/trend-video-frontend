import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getCurrentUser } from '@/lib/session';
import { promises as fs } from 'fs';
import { createBackup } from '@/lib/backup';
import { sendErrorEmail } from '@/lib/email';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const unifiedAgentScript = path.join('src', 'ai_aggregator', 'agents', 'agent.py');

const SUPPORTED_MODELS = ['claude', 'chatgpt', 'gemini'] as const;
type ScriptModel = (typeof SUPPORTED_MODELS)[number];

// Track running processes Map (local reference)
const runningProcesses = new Map<string, any>();

// Function to read short form prompt from file
async function getShortFormPrompt(): Promise<string> {
  try {
    // Find in frontend/prompts path
    const promptsPath = path.join(process.cwd(), 'prompts');
    const files = await fs.readdir(promptsPath);

    // Search for prompt_shortform.txt or prompt.txt
    let promptFile: string | undefined = files.find(file => file === 'prompt_shortform.txt');
    if (!promptFile) {
      promptFile = files.find(file => file === 'prompt.txt');
    }

    if (promptFile) {
      const filePath = path.join(promptsPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('Short form prompt file read complete:', promptFile);
      return content;
    }

    // Return default prompt if file not found
    console.warn('Short form prompt file not found, using default prompt');
    return `You are a YouTube content script creator.

Create a short and impactful video script for the following topic in 1 minute.

Topic: {title}

Important: Don't ask questions, just create the script immediately. Create a script based only on the topic without asking for additional information.

Script creation guidelines:
1. Start with a Hook sentence that grabs the viewer's attention in the first 3 seconds
2. Deliver the core message clearly and concisely
3. Write in a conversational tone to be friendly
4. End with a CTA (Call To Action) that prompts the viewer to take action
5. Write about 200-300 words

Create only the script now:`;
  } catch (error) {
    console.error('Short form prompt file read failed:', error);
    throw error;
  }
}
