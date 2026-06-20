// Interfaccia astratta del provider LLM. MVP implementa solo OpenAI (openai.ts);
// l'astrazione lascia spazio a provider futuri (Anthropic, ecc.) senza toccare
// l'engine di enhancement (BUILD-SPEC §11, PRD §7.4).

export interface EnhancementResult {
  enhancedMd: string
  summary: string
}

export interface EnhanceArgs {
  systemPrompt: string
  userPrompt: string
}

export interface AskArgs {
  systemPrompt: string
  userPrompt: string
}

export interface LLMProvider {
  /** Genera note strutturate (Structured Outputs). */
  enhance(args: EnhanceArgs): Promise<EnhancementResult>
  /** Q&A libero su una riunione (M5). */
  ask(args: AskArgs): Promise<string>
}

/** Il modello ha rifiutato (refusal di prima classe, BUILD-SPEC §7). */
export class LLMRefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMRefusalError'
  }
}
