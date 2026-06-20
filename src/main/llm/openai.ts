import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import {
  LLMRefusalError,
  type AskArgs,
  type EnhanceArgs,
  type EnhancementResult,
  type LLMProvider
} from './provider'

// Schema imposto al modello via Structured Outputs (BUILD-SPEC §7).
const EnhancementSchema = z.object({
  enhanced_md: z.string(),
  summary: z.string()
})

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async enhance({ systemPrompt, userPrompt }: EnhanceArgs): Promise<EnhancementResult> {
    const completion = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: zodResponseFormat(EnhancementSchema, 'enhancement')
    })

    const msg = completion.choices[0]?.message
    if (msg?.refusal) throw new LLMRefusalError(msg.refusal)
    const parsed = msg?.parsed
    if (!parsed) throw new Error('Nessun output strutturato ricevuto dal modello.')

    return {
      enhancedMd: parsed.enhanced_md,
      summary: parsed.summary
    }
  }

  async ask({ systemPrompt, userPrompt }: AskArgs): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
    return completion.choices[0]?.message?.content?.trim() ?? ''
  }
}
