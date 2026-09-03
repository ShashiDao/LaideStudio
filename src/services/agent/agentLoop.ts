import { AGENT_TOOLS, executeAgentTool, type ToolExecutionContext } from './tools';
import type { LLMAdapter, LLMContentBlock, LLMMessage, LLMToolCall, LLMTool } from '../llm/llmAdapter';
import { useAppStore } from '../../store';
import { McpService } from './mcpClient';
import { countTurnTokens, getModelPricing, calculateEstimatedCost } from '../usage/tokenSpend';
import { AgentWorkspaceOverlay, type WorkspaceOverlay } from './workspace/overlay';
import { listFiles } from '../fs/vfs';
import {
  verifyCandidateOverlay,
  normalizeVerificationEvidence,
  type CandidateVerificationResult,
  type CandidateVerifier
} from './workspace/candidateVerifier';
import { taskStore } from './task/taskStore';

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
  overlay?: WorkspaceOverlay;
  baseRevision?: string;
  verifier?: CandidateVerifier;
  onVerification?: (result: CandidateVerificationResult, attempt: number) => void;
  onRepairAttempt?: (attempt: number, error: string) => void;
  taskId?: string;
  executionToken?: string;
}

export interface AgentLoopMessages extends Array<LLMMessage> {
  verificationResult?: CandidateVerificationResult;
  repairAttempts?: number;
  verified?: boolean;
  taskId?: string;
}

interface TurnExecutionCtx {
  effectiveSystemPrompt?: string;
  dynamicTools: LLMTool[];
  mcpToolMappings: Map<string, string>;
  onUpdate?: (messages: LLMMessage[]) => void;
  signal?: AbortSignal;
  maxSteps: number;
  stepCounter: { count: number };
  tokenTracker: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedTokens: number;
    hasReportedUsage: boolean;
  };
  options?: RunAgentLoopOptions;
}

async function runToolCallingTurns(
  currentMessages: LLMMessage[],
  adapter: LLMAdapter,
  projectId: string,
  overlay: WorkspaceOverlay,
  ctx: TurnExecutionCtx
): Promise<void> {
  const {
    effectiveSystemPrompt,
    dynamicTools,
    mcpToolMappings,
    onUpdate,
    signal,
    maxSteps,
    stepCounter,
    tokenTracker,
    options
  } = ctx;

  while (true) {
    if (signal?.aborted) break;

    const stream = adapter.stream({
      messages: [...currentMessages],
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
            tokenTracker.totalInputTokens += yieldResult.usage.inputTokens || 0;
            tokenTracker.totalOutputTokens += yieldResult.usage.outputTokens || 0;
            tokenTracker.totalCachedTokens += yieldResult.usage.cachedTokens || 0;
            tokenTracker.hasReportedUsage = true;
          }
        }

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

    stepCounter.count++;

    // Execute tools against candidate overlay
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

      let resultStr: string;
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
        const toolContext: ToolExecutionContext = {
          model: currentAssistantMsg?.model || options?.model || options?.modelName,
          provider: options?.provider,
          messageId: tc.id,
          overlay
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
    if (stepCounter.count >= maxSteps) {
      currentMessages.push({
        role: 'assistant',
        content: `Agent stopped after ${stepCounter.count} steps.`
      });
      if (onUpdate) onUpdate([...currentMessages]);
      break;
    }
  }
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
): Promise<AgentLoopMessages> {
  const mcpServers = useAppStore.getState().mcpServers;
  const dynamicTools: LLMTool[] = [...AGENT_TOOLS];
  const mcpToolMappings = new Map<string, string>();
  const mcpConnectionErrors: { serverId: string; url: string; error: string }[] = [];

  const baseFiles = await listFiles(projectId);
  const baseRevision = options?.baseRevision || (baseFiles.length > 0 ? String(Math.max(...baseFiles.map(f => f.updatedAt || 0))) : 'base');
  const overlay: WorkspaceOverlay = options?.overlay ?? new AgentWorkspaceOverlay(projectId, baseFiles, baseRevision);

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

  const stepCounter = { count: 0 };
  const tokenTracker = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    hasReportedUsage: false
  };

  const turnCtx: TurnExecutionCtx = {
    effectiveSystemPrompt,
    dynamicTools,
    mcpToolMappings,
    onUpdate,
    signal,
    maxSteps,
    stepCounter,
    tokenTracker,
    options
  };

  // 1. Task initialization / attachment
  let taskId = options?.taskId;
  const executionToken = options?.executionToken || crypto.randomUUID();

  if (!taskId) {
    const promptSummary = typeof userMessage === 'string'
      ? userMessage.slice(0, 150)
      : (Array.isArray(userMessage) ? (userMessage.find(b => b.type === 'text') as { text?: string } | undefined)?.text?.slice(0, 150) || 'Agent Task' : 'Agent Task');
    const createdTask = await taskStore.createTask(projectId, promptSummary, {
      baseRevision: options?.baseRevision,
      executionToken
    });
    taskId = createdTask.id;
  }

  // Ensure task transitions to 'running'
  const currentTask = await taskStore.getTask(taskId);
  if (currentTask && currentTask.state === 'created') {
    await taskStore.updateTaskState(taskId, 'running', {
      executionToken,
      baseRevision: options?.baseRevision
    });
  }

  // Phase 1: Initial Agent Tool Turns (Editing)
  try {
    await runToolCallingTurns(currentMessages, adapter, projectId, overlay, turnCtx);
  } catch (error) {
    if (signal?.aborted) {
      await taskStore.updateTaskState(taskId, 'aborted', {
        abortedAt: Date.now(),
        executionToken
      });
    } else {
      await taskStore.updateTaskState(taskId, 'failed', {
        failureSummary: String(error).slice(0, 1200),
        executionToken,
        completedAt: Date.now()
      });
    }
    throw error;
  }

  if (signal?.aborted) {
    await taskStore.updateTaskState(taskId, 'aborted', {
      abortedAt: Date.now(),
      executionToken
    });
  }

  // Phase 2: Candidate Verification & Bounded Autonomous Repair
  let repairAttempts = 0;
  const MAX_REPAIR_ATTEMPTS = 1; // Strictly bounded to exactly ONE attempt in MVP
  let finalVerificationResult: CandidateVerificationResult | null = null;

  const hasCandidateEdits = overlay.diff().length > 0;
  const shouldVerify = Boolean(options?.verifier || hasCandidateEdits);

  if (signal?.aborted) {
    // Already marked aborted
  } else if (shouldVerify) {
    // Transition to 'verifying'
    await taskStore.updateTaskState(taskId, 'verifying', { executionToken });

    const verifier = options?.verifier ?? verifyCandidateOverlay;

    // Initial Verification of Candidate
    finalVerificationResult = await verifier(overlay);
    options?.onVerification?.(finalVerificationResult, repairAttempts);

    if (signal?.aborted) {
      await taskStore.updateTaskState(taskId, 'aborted', {
        abortedAt: Date.now(),
        executionToken
      });
    } else {
      const isUnavailable = finalVerificationResult.status === 'unavailable' || Boolean(finalVerificationResult.skippedWorkerVerification);

      if (finalVerificationResult.success && !isUnavailable) {
        // Initial verification passed! -> VERIFIED
        await taskStore.updateTaskState(taskId, 'verified', {
          verificationStatus: 'passed',
          executionToken,
          completedAt: Date.now()
        });
      } else if (isUnavailable) {
        // Verification UNAVAILABLE -> do NOT repair, mark FAILED
        const { formattedText: failureSummary } = normalizeVerificationEvidence(finalVerificationResult, 1200);
        await taskStore.updateTaskState(taskId, 'failed', {
          verificationStatus: 'unavailable',
          failureSummary,
          executionToken,
          completedAt: Date.now()
        });
      } else if (repairAttempts < MAX_REPAIR_ATTEMPTS) {
        // Verification failed, enter bounded repair attempt 1
        repairAttempts++;
        const { formattedText: failureEvidence } = normalizeVerificationEvidence(finalVerificationResult, 1200);
        options?.onRepairAttempt?.(repairAttempts, failureEvidence);

        await taskStore.updateTaskState(taskId, 'repairing', {
          repairAttempts,
          verificationStatus: 'failed',
          failureSummary: failureEvidence,
          executionToken
        });

        // Supply normalized bounded failure evidence to the agent in the same context
        const repairPrompt = `[Verification Failure - Automatic Repair Attempt ${repairAttempts} of ${MAX_REPAIR_ATTEMPTS}]\n` +
          `The candidate workspace changes failed verification:\n` +
          `${failureEvidence}\n\n` +
          `Please analyze the verification error and use tool calls (such as write_file) to repair the candidate workspace. ` +
          `All repairs must be applied to the existing candidate overlay. ` +
          `You have exactly ONE repair attempt. Do not repeat the same error.`;

        currentMessages.push({
          role: 'user',
          content: repairPrompt
        });
        if (onUpdate) onUpdate([...currentMessages]);

        // Agent performs repair edits in the SAME WorkspaceOverlay
        await runToolCallingTurns(currentMessages, adapter, projectId, overlay, turnCtx);

        if (signal?.aborted) {
          await taskStore.updateTaskState(taskId, 'aborted', {
            abortedAt: Date.now(),
            executionToken
          });
        } else {
          // Transition back to 'verifying'
          await taskStore.updateTaskState(taskId, 'verifying', { executionToken });

          // Verify the SAME candidate overlay again
          finalVerificationResult = await verifier(overlay);
          options?.onVerification?.(finalVerificationResult, repairAttempts);

          if (signal?.aborted) {
            await taskStore.updateTaskState(taskId, 'aborted', {
              abortedAt: Date.now(),
              executionToken
            });
          } else if (
            finalVerificationResult.success &&
            finalVerificationResult.status !== 'unavailable' &&
            !finalVerificationResult.skippedWorkerVerification
          ) {
            // Repaired candidate verified!
            await taskStore.updateTaskState(taskId, 'verified', {
              verificationStatus: 'passed',
              repairAttempts,
              executionToken,
              completedAt: Date.now()
            });
          } else {
            // Second verification failed or unavailable -> Terminal 'failed'
            const { formattedText: finalFailureSummary } = normalizeVerificationEvidence(finalVerificationResult, 1200);
            await taskStore.updateTaskState(taskId, 'failed', {
              verificationStatus: finalVerificationResult.status === 'unavailable' ? 'unavailable' : 'failed',
              failureSummary: finalFailureSummary,
              repairAttempts,
              executionToken,
              completedAt: Date.now()
            });
          }
        }
      }
    }
  } else {
    // No edits to verify and no custom verifier -> transition through verifying to verified
    await taskStore.updateTaskState(taskId, 'verifying', { executionToken });
    await taskStore.updateTaskState(taskId, 'verified', {
      verificationStatus: 'passed',
      executionToken,
      completedAt: Date.now()
    });
  }

  // Record token spend and estimated cost for this entire agent run
  try {
    let inputTokens = tokenTracker.totalInputTokens;
    let outputTokens = tokenTracker.totalOutputTokens;
    let totalTokens = inputTokens + outputTokens;

    if (!tokenTracker.hasReportedUsage || (inputTokens === 0 && outputTokens === 0)) {
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
      cachedTokens: tokenTracker.totalCachedTokens > 0 ? tokenTracker.totalCachedTokens : undefined,
      totalTokens,
      estimatedCostUsd,
      category: 'agent_chat',
      promptPreview,
      stepCount: stepCounter.count
    });
  } catch (e) {
    console.warn('Failed to record token usage in agent loop:', e);
  }

  // Phase 3: Final Diff / Pending Review
  // If verification failed or was unavailable or aborted: do not publish unverified patches.
  if (signal?.aborted) {
    useAppStore.getState().clearPendingPatches();
  } else {
    const isFailedOrUnavailable = Boolean(
      shouldVerify &&
      finalVerificationResult &&
      (!finalVerificationResult.success ||
        finalVerificationResult.status === 'unavailable' ||
        finalVerificationResult.skippedWorkerVerification)
    );

    if (isFailedOrUnavailable && finalVerificationResult) {
      useAppStore.getState().clearPendingPatches();
      const isUnavailable = finalVerificationResult.status === 'unavailable' || Boolean(finalVerificationResult.skippedWorkerVerification);
      const failureMessage = isUnavailable
        ? `⚠️ Candidate verification was unavailable in this environment:\n${finalVerificationResult.error || finalVerificationResult.output || 'Web Worker unavailable'}\nCandidate changes were not verified and will not be published.`
        : `⚠️ Automatic repair failed. The candidate workspace could not be verified:\n${finalVerificationResult.error || finalVerificationResult.output || 'Verification failure'}`;
      currentMessages.push({
        role: 'assistant',
        content: failureMessage
      });
      if (onUpdate) onUpdate([...currentMessages]);
    } else {
      const diffPatches = overlay.diff();
      if (diffPatches.length > 0) {
        useAppStore.getState().setPendingPatches(diffPatches);
      }
    }
  }

  const resultMessages: AgentLoopMessages = currentMessages;
  resultMessages.verificationResult = finalVerificationResult ?? undefined;
  resultMessages.repairAttempts = repairAttempts;
  const isCandidateVerified = Boolean(
    !signal?.aborted &&
    (finalVerificationResult
      ? (finalVerificationResult.success === true &&
         finalVerificationResult.status !== 'unavailable' &&
         !finalVerificationResult.skippedWorkerVerification)
      : !hasCandidateEdits)
  );
  resultMessages.verified = isCandidateVerified;
  resultMessages.taskId = taskId;

  return resultMessages;
}
