import type { 
  LLMAdapter, 
  LLMRequest, 
  LLMResponse, 
  LLMStreamYield, 
  LLMUsage,
  LLMToolCall 
} from '../llmAdapter';

export class AnthropicProvider implements LLMAdapter {
  constructor(
    private apiKey: string,
    private model: string = 'claude-3-7-sonnet-20250219'
  ) { /* empty */ }

  private getHeaders() {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      // Combine multiple betas using comma-separated string per Anthropic docs
      'anthropic-beta': 'prompt-caching-2024-07-31,token-counting-2024-11-01',
      'content-type': 'application/json'
    };
  }

  private formatRequest(req: LLMRequest, stream: boolean = false) {
    const messages = [];
    for (const m of req.messages) {
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const content: any[] = [];
        if (typeof m.content === 'string') {
          if (m.content) content.push({ type: 'text', text: m.content });
        } else if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block.type === 'text') {
              content.push({ type: 'text', text: block.text });
            } else if (block.type === 'image') {
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: block.mediaType,
                  data: block.data
                }
              });
            }
          }
        }
        for (const tc of m.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.args)
          });
        }
        messages.push({ role: 'assistant', content });
      } else if (m.role === 'tool') {
        const toolResult = {
          type: 'tool_result',
          tool_use_id: m.toolCallId,
          content: m.content
        };
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content) && lastMsg.content[0]?.type === 'tool_result') {
          lastMsg.content.push(toolResult);
        } else {
          messages.push({ role: 'user', content: [toolResult] });
        }
      } else {
        let content: any;
        if (typeof m.content === 'string') {
          if (m.cacheable) {
            content = [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }];
          } else {
            content = m.content;
          }
        } else if (Array.isArray(m.content)) {
          content = m.content.map((block, idx) => {
            const isLast = idx === (m.content as any[]).length - 1;
            const shouldCache = block.cacheable || (m.cacheable && isLast);
            if (block.type === 'image') {
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: block.mediaType,
                  data: block.data
                },
                ...(shouldCache ? { cache_control: { type: 'ephemeral' } } : { /* empty */ })
              };
            }
            return {
              type: 'text',
              text: block.text,
              ...(shouldCache ? { cache_control: { type: 'ephemeral' } } : { /* empty */ })
            };
          });
        } else {
          content = m.content;
        }
        messages.push({ role: m.role, content });
      }
    }

    let system: any = req.systemPrompt;
    if (req.systemPrompt && req.systemPromptCacheable) {
      system = [{
        type: 'text',
        text: req.systemPrompt,
        cache_control: { type: 'ephemeral' }
      }];
    }

    const tools = req.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));

    return {
      model: this.model,
      messages,
      ...(system ? { system } : { /* empty */ }),
      ...(tools?.length ? { tools } : { /* empty */ }),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : { /* empty */ }),
      max_tokens: req.maxTokens || 4096,
      stream
    };
  }

  async countTokens(req: LLMRequest): Promise<number> {
    const body = this.formatRequest(req, false);
    const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errStr = res.statusText;
      try { const errObj = await res.json(); errStr = JSON.stringify(errObj.error); } catch { /* empty */ }
      throw new Error(`Anthropic token count failed: ${errStr}`);
    }

    const data = await res.json();
    return data.input_tokens;
  }

  async send(req: LLMRequest): Promise<LLMResponse> {
    const body = this.formatRequest(req, false);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errStr = res.statusText;
      try { const errObj = await res.json(); errStr = JSON.stringify(errObj.error); } catch { /* empty */ }
      throw new Error(`Anthropic request failed: ${errStr}`);
    }

    const data = await res.json();

    let text = '';
    const toolCalls: LLMToolCall[] = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          text += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            args: typeof block.input === 'string' ? block.input : JSON.stringify(block.input)
          });
        }
      }
    }

    const usage: LLMUsage = {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      cachedTokens: data.usage?.cache_read_input_tokens || 0
    };

    return { text, toolCalls: toolCalls.length ? toolCalls : undefined, usage };
  }

  async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
    const body = this.formatRequest(req, true);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: req.signal
    });

    if (!res.ok) {
      let errStr = res.statusText;
      try { const errObj = await res.json(); errStr = JSON.stringify(errObj.error); } catch { /* empty */ }
      throw new Error(`Anthropic stream failed: ${errStr}`);
    }
    if (!res.body) throw new Error('No response body from Anthropic stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const usage: LLMUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    let activeToolCall: LLMToolCall | null = null;

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

        switch (event.type) {
          case 'message_start':
            usage.inputTokens = event.message?.usage?.input_tokens || 0;
            usage.cachedTokens = event.message?.usage?.cache_read_input_tokens || 0;
            break;
            
          case 'content_block_start':
            if (event.content_block?.type === 'tool_use') {
              activeToolCall = {
                id: event.content_block.id,
                name: event.content_block.name,
                args: ''
              };
            }
            break;
            
          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              yield { type: 'text', text: event.delta.text };
            } else if (event.delta?.type === 'input_json_delta' && activeToolCall) {
              activeToolCall.args += (event.delta.partial_json || '');
            }
            break;
            
          case 'content_block_stop':
            if (activeToolCall) {
              yield { type: 'tool_call', toolCall: { ...activeToolCall } };
              activeToolCall = null;
            }
            break;
            
          case 'message_delta':
            if (event.usage?.output_tokens !== undefined) {
              usage.outputTokens = event.usage.output_tokens;
            }
            break;
        }
      }
    }
    
    // Some final chunks might remain in the buffer but we don't expect data lines there without newlines.
    yield { type: 'usage', usage };
  }
}
