import type { 
  LLMAdapter, 
  LLMRequest, 
  LLMResponse, 
  LLMStreamYield, 
  LLMUsage,
  LLMToolCall 
} from '../llmAdapter';

export class GoogleProvider implements LLMAdapter {
  constructor(
    private apiKey: string,
    private model: string = 'gemini-1.5-pro'
  ) { /* empty */ }

  private formatRequest(req: LLMRequest) {
    const contents = req.messages.map(m => {
      const contentParts: any[] = [];
      if (typeof m.content === 'string') {
        if (m.content) contentParts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === 'text') {
            contentParts.push({ text: block.text });
          } else if (block.type === 'image') {
            contentParts.push({
              inlineData: {
                mimeType: block.mediaType,
                data: block.data
              }
            });
          }
        }
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'model',
          parts: [
            ...contentParts,
            ...m.toolCalls.map(tc => ({
              functionCall: { name: tc.name, args: JSON.parse(tc.args) }
            }))
          ]
        };
      } else if (m.role === 'tool') {
        return {
          role: 'user',
          parts: [{
            functionResponse: {
              name: m.toolName || '',
              response: { result: m.content }
            }
          }]
        };
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: contentParts.length > 0 ? contentParts : [{ text: '' }]
      };
    });

    const systemInstruction = req.systemPrompt 
      ? { parts: [{ text: req.systemPrompt }] } 
      : undefined;

    const tools = req.tools?.length 
      ? [{ function_declarations: req.tools.map(t => ({ 
          name: t.name, 
          description: t.description, 
          parameters: t.parameters 
        })) }] 
      : undefined;

    const generationConfig: Record<string, any> = { /* empty */ };
    if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
    if (req.maxTokens !== undefined) generationConfig.maxOutputTokens = req.maxTokens;

    return {
      contents,
      ...(systemInstruction ? { systemInstruction } : { /* empty */ }),
      ...(tools ? { tools } : { /* empty */ }),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : { /* empty */ })
    };
  }

  async countTokens(req: LLMRequest): Promise<number> {
    const body = this.formatRequest(req);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:countTokens?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errStr = `${res.status} ${res.statusText || ''}`.trim();
      try {
        const text = await res.text();
        try {
          const errObj = JSON.parse(text);
          errStr += ` - ${JSON.stringify(errObj.error || errObj)}`;
        } catch {
          errStr += text ? ` - ${text}` : '';
        }
      } catch { /* empty */ }
      throw new Error(`Google token count failed: ${errStr}`);
    }

    const data = await res.json();
    return data.totalTokens || 0;
  }

  async send(req: LLMRequest): Promise<LLMResponse> {
    const body = this.formatRequest(req);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errStr = `${res.status} ${res.statusText || ''}`.trim();
      try {
        const text = await res.text();
        try {
          const errObj = JSON.parse(text);
          errStr += ` - ${JSON.stringify(errObj.error || errObj)}`;
        } catch {
          errStr += text ? ` - ${text}` : '';
        }
      } catch { /* empty */ }
      throw new Error(`Google request failed: ${errStr}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    let text = '';
    const toolCalls: LLMToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        text += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: crypto.randomUUID(),
          name: part.functionCall.name,
          args: typeof part.functionCall.args === 'string' ? part.functionCall.args : JSON.stringify(part.functionCall.args)
        });
      }
    }

    const usage: LLMUsage = {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0
    };

    return { text, toolCalls: toolCalls.length ? toolCalls : undefined, usage };
  }

  async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
    const body = this.formatRequest(req);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal
    });

    if (!res.ok) {
      let errStr = `${res.status} ${res.statusText || ''}`.trim();
      try {
        const text = await res.text();
        try {
          const errObj = JSON.parse(text);
          errStr += ` - ${JSON.stringify(errObj.error || errObj)}`;
        } catch {
          errStr += text ? ` - ${text}` : '';
        }
      } catch { /* empty */ }
      throw new Error(`Google stream failed: ${errStr}`);
    }
    if (!res.body) throw new Error('No response body from Google stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;
        if (!dataStr) continue;

        let event: any;
        try {
          event = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (event.usageMetadata) {
          usage.inputTokens = event.usageMetadata.promptTokenCount || 0;
          usage.outputTokens = event.usageMetadata.candidatesTokenCount || 0;
        }

        const candidate = event.candidates?.[0];
        if (!candidate) continue;

        const parts = candidate.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.text) {
            yield { type: 'text', text: part.text };
          } else if (part.functionCall) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: crypto.randomUUID(),
                name: part.functionCall.name,
                args: typeof part.functionCall.args === 'string' ? part.functionCall.args : JSON.stringify(part.functionCall.args)
              }
            };
          }
        }
      }
    }
    
    yield { type: 'usage', usage };
  }
}
