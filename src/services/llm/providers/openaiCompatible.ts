import type { 
  LLMAdapter, 
  LLMRequest, 
  LLMResponse, 
  LLMStreamYield, 
  LLMUsage,
  LLMToolCall 
} from '../llmAdapter';

export class OpenAICompatibleProvider implements LLMAdapter {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    private customHeaders: Record<string, string> = { /* empty */ }
  ) { /* empty */ }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.customHeaders
    };
  }

  private formatRequest(req: LLMRequest, stream: boolean = false) {
    const messages = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    for (const m of req.messages) {
      let content: any = m.content;
      if (Array.isArray(m.content)) {
        content = m.content.map(b => {
          if (b.type === 'text') {
            return { type: 'text', text: b.text };
          }
          if (b.type === 'image') {
            return {
              type: 'image_url',
              image_url: {
                url: `data:${b.mediaType};base64,${b.data}`
              }
            };
          }
          return { type: 'text', text: '' };
        });
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        messages.push({ 
          role: m.role, 
          content: content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.args }
          }))
        });
      } else if (m.role === 'tool') {
        messages.push({
          role: 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          tool_call_id: m.toolCallId
        });
      } else {
        messages.push({ role: m.role, content });
      }
    }

    const tools = req.tools?.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    return {
      model: this.model,
      messages,
      ...(tools?.length ? { tools } : { /* empty */ }),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : { /* empty */ }),
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : { /* empty */ }),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : { /* empty */ })
    };
  }

  async countTokens(_req: LLMRequest): Promise<number> {
    throw new Error('countTokens is not natively supported by this provider via REST API.');
  }

  async send(req: LLMRequest): Promise<LLMResponse> {
    const body = this.formatRequest(req, false);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
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
      throw new Error(`OpenAI-compatible request failed: ${errStr} (model: "${this.model}", baseUrl: "${this.baseUrl}")`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const text = choice?.message?.content || '';
    
    let toolCalls: LLMToolCall[] | undefined;
    if (choice?.message?.tool_calls?.length) {
      toolCalls = choice.message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        args: tc.function.arguments
      }));
    }

    const usage: LLMUsage = {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
    };

    return { text, toolCalls, usage };
  }

  async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
    const body = this.formatRequest(req, true);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
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
      throw new Error(`OpenAI-compatible stream failed: ${errStr} (model: "${this.model}", baseUrl: "${this.baseUrl}")`);
    }
    if (!res.body) throw new Error('No response body from stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };
    const activeToolCalls: Record<number, LLMToolCall> = { /* empty */ };

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

        if (event.usage) {
          usage.inputTokens = event.usage.prompt_tokens || 0;
          usage.outputTokens = event.usage.completion_tokens || 0;
        }

        const choice = event.choices?.[0];
        if (!choice) continue;

        if (choice.delta?.content) {
          yield { type: 'text', text: choice.delta.content };
        }

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            if (tc.id) {
              // Yield previous tool call at this index if we somehow missed flushing it
              if (activeToolCalls[tc.index]) {
                yield { type: 'tool_call', toolCall: { ...activeToolCalls[tc.index] } };
              }
              activeToolCalls[tc.index] = {
                id: tc.id,
                name: tc.function?.name || '',
                args: tc.function?.arguments || ''
              };
            } else if (tc.function?.arguments) {
              if (activeToolCalls[tc.index]) {
                activeToolCalls[tc.index].args += tc.function.arguments;
              }
            }
          }
        }

        if (choice.finish_reason === 'tool_calls') {
          for (const idx in activeToolCalls) {
            yield { type: 'tool_call', toolCall: { ...activeToolCalls[idx] } };
            delete activeToolCalls[idx];
          }
        }
      }
    }
    
    // Flush any remaining active tool calls in case finish_reason didn't catch them
    for (const idx in activeToolCalls) {
      yield { type: 'tool_call', toolCall: { ...activeToolCalls[idx] } };
    }
    
    yield { type: 'usage', usage };
  }
}
