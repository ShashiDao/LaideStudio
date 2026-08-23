import { AGENT_TOOLS, executeAgentTool } from './tools';
import type { LLMAdapter, LLMContentBlock, LLMMessage, LLMToolCall, LLMTool } from '../llm/llmAdapter';
import { useAppStore } from '../../store';
import { McpService } from './mcpClient';

export interface RunAgentLoopOptions {
  temperature?: number;
  maxTokens?: number;
  screenshot?: {
    mediaType: string;
    data: string;
  } | null;
  modelName?: string;
  model?: string;
  provider?: string;
}

export async function runAgentLoop(
  userMessage: string | LLMContentBlock[],
  messages: LLMMessage[],
  adapter: LLMAdapter,
  projectId: string,
  systemPrompt?: string,
  onUpdate?: (messages: LLMMessage[]) => void,
  signal?: AbortSignal,
  maxSteps: number = 25,
  options?: RunAgentLoopOptions
): Promise<LLMMessage[]> {
  const mcpServers = useAppStore.getState().mcpServers;
  const dynamicTools: LLMTool[] = [...AGENT_TOOLS];
  const mcpToolMappings = new Map<string, string>();

  // Initialize MCP tools
  for (const server of mcpServers) {
    try {
      await McpService.connect(server.id, server.url);
      const tools = await McpService.listTools(server.id);
      for (const t of tools) {
        const safeName = `mcp_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        dynamicTools.push({
          name: safeName,
          description: t.description || `MCP tool from ${server.url}`,
          parameters: t.inputSchema || { type: 'object', properties: {} }
        });
        mcpToolMappings.set(safeName, JSON.stringify({ serverId: server.id, originalName: t.name }));
      }
    } catch (e) {
      console.warn(`Failed to connect or fetch tools from MCP server ${server.url}:`, e);
      // Surface failure as a generic error tool if connection fails completely?
      // For now, if connect fails, we just log and ignore. The tools won't be available.
      // Wait, the prompt says: "Handle per-server connect/reconnect and surface failures as tool-call errors rather than crashing the loop."
      // If we can't connect, maybe we still expose a "dummy" tool that returns the error? 
      // But if we can't connect we don't know the tools. So if it fails during execution we return tool-call error.
    }
  }

  let userContent: string | LLMContentBlock[];

  if (Array.isArray(userMessage)) {
    userContent = [...userMessage];
    if (options?.screenshot) {
      userContent.push({
        type: 'image',
        mediaType: options.screenshot.mediaType,
        data: options.screenshot.data
      });
    }
  } else if (typeof userMessage === 'string') {
    if (options?.screenshot) {
      userContent = [
        { type: 'text', text: userMessage },
        {
          type: 'image',
          mediaType: options.screenshot.mediaType,
          data: options.screenshot.data
        }
      ];
    } else {
      userContent = userMessage;
    }
  } else {
    userContent = userMessage;
  }

  const currentMessages: LLMMessage[] = [
    ...messages,
    { role: 'user', content: userContent }
  ];

  if (onUpdate) onUpdate([...currentMessages]);

  let stepCount = 0;

  while (true) {
    if (signal?.aborted) break;

    const stream = adapter.stream({
      messages: currentMessages,
      systemPrompt,
      systemPromptCacheable: true,
      tools: dynamicTools,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      signal
    });

    let textContent = '';
    const toolCalls: LLMToolCall[] = [];

    // Add a placeholder assistant message that we'll update
    const assistantMsgIndex = currentMessages.length;
    currentMessages.push({ role: 'assistant', content: '', model: options?.modelName });

    try {
      for await (const yieldResult of stream) {
        if (signal?.aborted) break;

        if (yieldResult.type === 'text') {
          textContent += yieldResult.text;
        } else if (yieldResult.type === 'tool_call') {
          toolCalls.push(yieldResult.toolCall);
        }
        
        // Update the placeholder
        currentMessages[assistantMsgIndex] = {
          role: 'assistant',
          content: textContent,
          toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
          model: options?.modelName
        };
        if (onUpdate) onUpdate([...currentMessages]);
      }
    } catch (err: unknown) {
      const isAbort = signal?.aborted || (err instanceof Error && err.name === 'AbortError');
      if (isAbort) {
        const lastMsg = currentMessages[currentMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content && (!lastMsg.toolCalls || lastMsg.toolCalls.length === 0)) {
          currentMessages.pop();
          if (onUpdate) onUpdate([...currentMessages]);
        }
        break;
      }
      throw err;
    }

    if (signal?.aborted) {
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content && (!lastMsg.toolCalls || lastMsg.toolCalls.length === 0)) {
        currentMessages.pop();
        if (onUpdate) onUpdate([...currentMessages]);
      }
      break;
    }

    if (toolCalls.length === 0) {
      break;
    }

    stepCount++;

    // Execute tools
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      if (signal?.aborted) {
        for (let j = i; j < toolCalls.length; j++) {
          const unexecutedTc = toolCalls[j];
          currentMessages.push({
            role: 'tool',
            content: "Cancelled by user",
            toolCallId: unexecutedTc.id,
            toolName: unexecutedTc.name
          });
        }
        if (onUpdate) onUpdate([...currentMessages]);
        break;
      }
      let resultStr;
      const mcpMapping = mcpToolMappings.get(tc.name);
      if (mcpMapping) {
        try {
          const { serverId, originalName } = JSON.parse(mcpMapping);
          const args = JSON.parse(tc.args);
          const result = await McpService.executeTool(serverId, originalName, args);
          if (result.isError) {
            resultStr = `Error executing MCP tool: ${JSON.stringify(result.content)}`;
          } else {
            resultStr = result.content
              .map((c: any) => c.text || JSON.stringify(c))
              .join('\n');
          }
        } catch (e) {
          resultStr = `Error executing MCP tool: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else {
        const currentAssistantMsg = currentMessages[assistantMsgIndex];
        const toolContext = {
          model: currentAssistantMsg?.model || options?.model || options?.modelName,
          provider: options?.provider,
          messageId: tc.id
        };
        resultStr = await executeAgentTool(tc.name, tc.args, projectId, toolContext);
      }

      currentMessages.push({
        role: 'tool',
        content: resultStr,
        toolCallId: tc.id,
        toolName: tc.name
      });
      if (onUpdate) onUpdate([...currentMessages]);
    }

    if (signal?.aborted) break;

    // Check if step cap reached
    if (stepCount >= maxSteps) {
      currentMessages.push({
        role: 'assistant',
        content: `Agent stopped after ${stepCount} steps.`
      });
      if (onUpdate) onUpdate([...currentMessages]);
      break;
    }
  }

  return currentMessages;
}
