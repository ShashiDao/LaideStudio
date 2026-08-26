import { AGENT_TOOLS, executeAgentTool } from './tools';
import type { LLMAdapter, LLMContentBlock, LLMMessage, LLMToolCall, LLMTool } from '../llm/llmAdapter';
import { useAppStore } from '../../store';
import { McpService } from './mcpClient';
import { countTurnTokens, getModelPricing, calculateEstimatedCost } from '../usage/tokenSpend';

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
  const mcpConnectionErrors: { serverId: string; url: string; error: string }[] = [];

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
        mcpToolMappings.set(safeName, JSON.stringify({ serverId: server.id, originalName: t.name, serverUrl: server.url }));
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to connect or fetch tools from MCP server ${server.url}:`, e);
      mcpConnectionErrors.push({
        serverId: server.id,
        url: server.url,
        error: errMsg
      });
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

  if (mcpConnectionErrors.length > 0) {
    const errorDetails = mcpConnectionErrors
      .map(err => `• **${err.url}**: ${err.error}`)
      .join('\n');
    currentMessages.push({
      role: 'assistant',
      content: `⚠️ **MCP Server Connection Failure**\nCould not connect or retrieve tools from MCP server(s):\n${errorDetails}\n\nTools from these servers will not be available during this session.`
    });
  }

  if (onUpdate) onUpdate([...currentMessages]);

  let effectiveSystemPrompt = systemPrompt;
  if (mcpConnectionErrors.length > 0) {
    const errorText = mcpConnectionErrors.map(e => `- ${e.url}: ${e.error}`).join('\n');
    effectiveSystemPrompt = (systemPrompt ? `${systemPrompt}\n\n` : '') +
      `<mcp_connection_warnings>\nFailed to connect to MCP server(s):\n${errorText}\n</mcp_connection_warnings>`;
  }

  let stepCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let hasReportedUsage = false;

  while (true) {
    if (signal?.aborted) break;

    const stream = adapter.stream({
      messages: currentMessages,
      systemPrompt: effectiveSystemPrompt,
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
        } else if (yieldResult.type === 'usage') {
          if (yieldResult.usage) {
            totalInputTokens += yieldResult.usage.inputTokens || 0;
            totalOutputTokens += yieldResult.usage.outputTokens || 0;
            totalCachedTokens += yieldResult.usage.cachedTokens || 0;
            hasReportedUsage = true;
          }
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
          const { serverId, originalName, serverUrl } = JSON.parse(mcpMapping);
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.args);
          } catch {
            args = {};
          }
          const result = await McpService.executeTool(serverId, originalName, args);
          if (result?.isError) {
            resultStr = `[MCP Error] Tool "${originalName}" (${serverUrl || serverId}) reported an error: ${typeof result.content === 'string' ? result.content : JSON.stringify(result.content)}`;
          } else if (Array.isArray(result?.content)) {
            resultStr = result.content
              .map((c) => ('text' in c && typeof c.text === 'string' ? c.text : JSON.stringify(c)))
              .join('\n');
          } else {
            resultStr = typeof result?.content === 'string' ? result.content : JSON.stringify(result ?? {});
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          resultStr = `[MCP Connection Error] Failed to execute MCP tool "${tc.name}": ${errMsg}`;
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

  // Record token spend and estimated cost for this agent turn
  try {
    let inputTokens = totalInputTokens;
    let outputTokens = totalOutputTokens;
    let totalTokens = inputTokens + outputTokens;

    if (!hasReportedUsage || (inputTokens === 0 && outputTokens === 0)) {
      const tokenStats = countTurnTokens(currentMessages, systemPrompt, dynamicTools);
      inputTokens = tokenStats.inputTokens;
      outputTokens = tokenStats.outputTokens;
      totalTokens = tokenStats.totalTokens;
    }

    const pricing = getModelPricing(options?.provider, options?.model || options?.modelName);
    const estimatedCostUsd = calculateEstimatedCost(inputTokens, outputTokens, pricing);

    let promptPreview = typeof userMessage === 'string'
      ? userMessage
      : (Array.isArray(userMessage) ? (userMessage.find(b => b.type === 'text') as { text?: string } | undefined)?.text || '' : '');
    if (promptPreview && promptPreview.length > 100) {
      promptPreview = promptPreview.slice(0, 100) + '...';
    }

    useAppStore.getState().recordTokenUsage({
      projectId,
      provider: options?.provider || 'assistant',
      model: options?.model || options?.modelName || 'assistant',
      profileLabel: options?.modelName,
      inputTokens,
      outputTokens,
      cachedTokens: totalCachedTokens > 0 ? totalCachedTokens : undefined,
      totalTokens,
      estimatedCostUsd,
      category: 'agent_chat',
      promptPreview,
      stepCount
    });
  } catch (e) {
    console.warn('Failed to record token usage in agent loop:', e);
  }

  return currentMessages;
}
