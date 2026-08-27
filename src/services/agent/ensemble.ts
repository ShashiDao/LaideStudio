import type { LLMAdapter, LLMContentBlock, LLMMessage, LLMTool, LLMToolCall, LLMUsage } from '../llm/llmAdapter';
import type { PatchDefinition } from './patchSchema';
import type { FileItem, ProvenanceTestResult } from '../../db';
import { AGENT_TOOLS, validateProjectPath } from './tools';
import { runProjectTestsDetailed } from '../bundler/testRunner';
import { McpService } from './mcpClient';
import { useAppStore } from '../../store';
import { countTurnTokens, getModelPricing, calculateEstimatedCost } from '../usage/tokenSpend';

export interface EnsembleCandidateProfile {
  id: string;
  label: string;
  provider: string;
  model: string;
  adapter: LLMAdapter;
}

export interface EnsembleRunOptions {
  temperature?: number;
  maxTokens?: number;
  screenshot?: {
    mediaType: string;
    data: string;
  } | null;
  maxSteps?: number;
}

export interface CandidateExecutionResult {
  candidateId: string;
  profile: EnsembleCandidateProfile;
  patches: PatchDefinition[];
  messages: LLMMessage[];
  testResult: ProvenanceTestResult | null;
  error?: string;
  status: 'passed' | 'failed' | 'error' | 'no_patches';
}

export interface EnsembleEvaluationResult {
  candidateA: CandidateExecutionResult;
  candidateB: CandidateExecutionResult;
  passedCandidates: CandidateExecutionResult[];
  chosenCandidate: CandidateExecutionResult | null;
  requiresUserSelection: boolean;
  summary: string;
}

/**
 * Executes a single agent loop pass in an isolated in-memory simulation container,
 * intercepting write_file calls into candidate patches instead of applying them to the global store or VFS.
 */
export async function runSimulatedAgentCandidate(
  userMessage: string | LLMContentBlock[],
  chatHistory: LLMMessage[],
  profile: EnsembleCandidateProfile,
  projectId: string,
  systemPrompt: string | undefined,
  baseFiles: FileItem[],
  signal?: AbortSignal,
  options?: EnsembleRunOptions
): Promise<{
  patches: PatchDefinition[];
  messages: LLMMessage[];
  error?: string;
  usage?: LLMUsage;
  hasReportedUsage?: boolean;
  stepCount?: number;
}> {
  const maxSteps = options?.maxSteps ?? 25;
  const mcpServers = useAppStore.getState().mcpServers;
  const dynamicTools: LLMTool[] = [...AGENT_TOOLS];
  const mcpToolMappings = new Map<string, string>();
  const mcpConnectionErrors: { serverId: string; url: string; error: string }[] = [];

  // Collect simulated patches
  const simulatedPatches: PatchDefinition[] = [];
  // Simulated file state in memory
  let simulatedFiles: FileItem[] = (baseFiles || []).map(f => ({ ...f }));

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
      console.warn(`Simulated candidate: failed connecting MCP server ${server.url}:`, e);
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
    ...chatHistory,
    { role: 'user', content: userContent }
  ];

  if (mcpConnectionErrors.length > 0) {
    const errorDetails = mcpConnectionErrors
      .map(err => `• **${err.url}**: ${err.error}`)
      .join('\n');
    currentMessages.push({
      role: 'assistant',
      content: `⚠️ **MCP Server Connection Failure**\nCould not connect or retrieve tools from MCP server(s):\n${errorDetails}\n\nTools from these servers will not be available during this run.`
    });
  }

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

  try {
    while (true) {
      if (signal?.aborted) break;

      const stream = profile.adapter.stream({
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

      const assistantMsgIndex = currentMessages.length;
      currentMessages.push({ role: 'assistant', content: '', model: profile.label || profile.model });

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

        currentMessages[assistantMsgIndex] = {
          role: 'assistant',
          content: textContent,
          toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
          model: profile.label || profile.model
        };
      }

      if (signal?.aborted) break;
      if (toolCalls.length === 0) break;

      stepCount++;

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        if (signal?.aborted) {
          currentMessages.push({
            role: 'tool',
            content: 'Cancelled by user',
            toolCallId: tc.id,
            toolName: tc.name
          });
          break;
        }

        let resultStr = '';
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
          // Execute standard tools in the simulated in-memory context
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.args);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            resultStr = `Error: Failed to parse tool arguments: ${errMsg}`;
          }

          if (!resultStr) {
            switch (tc.name) {
              case 'list_directory': {
                const path = typeof args.path === 'string' ? args.path : '/';
                const pathValidation = validateProjectPath(path);
                if (!pathValidation.valid) {
                  resultStr = pathValidation.error!;
                  break;
                }
                const prefix = path.endsWith('/') ? path : `${path}/`;
                const prefixLen = prefix === '/' ? 1 : prefix.length;
                const children = new Set<string>();
                for (const f of simulatedFiles) {
                  if (f.path.startsWith(prefix) || prefix === '/') {
                    const relPath = prefix === '/' ? f.path.slice(1) : f.path.slice(prefixLen);
                    if (relPath.includes('/')) {
                      children.add(relPath.split('/')[0] + '/');
                    } else if (relPath.length > 0) {
                      children.add(relPath);
                    }
                  }
                }
                resultStr = children.size === 0 ? 'Directory is empty or does not exist.' : Array.from(children).sort().join('\n');
                break;
              }

              case 'read_file': {
                const path = typeof args.path === 'string' ? args.path : '';
                if (!path) {
                  resultStr = 'Error: Missing path parameter.';
                  break;
                }
                const pathValidation = validateProjectPath(path);
                if (!pathValidation.valid) {
                  resultStr = pathValidation.error!;
                  break;
                }
                const file = simulatedFiles.find(f => f.path === path);
                resultStr = file ? file.content : `Error: File not found: ${path}`;
                break;
              }

              case 'write_file': {
                const path = typeof args.path === 'string' ? args.path : '';
                const type = (args.type as 'create' | 'replace' | 'delete') || 'replace';
                const oldContent = typeof args.oldContent === 'string' ? args.oldContent : undefined;
                const newContent = typeof args.newContent === 'string' ? args.newContent : '';
                const rationale = typeof args.rationale === 'string' ? args.rationale : 'Ensemble candidate proposed patch';

                const pathValidation = validateProjectPath(path);
                if (!pathValidation.valid) {
                  resultStr = pathValidation.error!;
                  break;
                }

                let resolvedOld = oldContent;
                const existingFile = simulatedFiles.find(f => f.path === path);
                if (!resolvedOld && existingFile) {
                  resolvedOld = existingFile.content;
                }

                const patchDef: PatchDefinition = {
                  path,
                  type,
                  oldContent: resolvedOld,
                  newContent,
                  rationale,
                  model: profile.model,
                  provider: profile.provider,
                  messageId: tc.id
                };

                const existingPatchIdx = simulatedPatches.findIndex(p => p.path === path);
                if (existingPatchIdx >= 0) {
                  simulatedPatches[existingPatchIdx] = patchDef;
                } else {
                  simulatedPatches.push(patchDef);
                }

                // Update simulated in-memory files for subsequent read_file/test executions
                if (type === 'delete') {
                  simulatedFiles = simulatedFiles.filter(f => f.path !== path);
                } else if (existingFile) {
                  existingFile.content = newContent;
                  existingFile.updatedAt = Date.now();
                } else {
                  simulatedFiles.push({
                    id: `sim-${Math.random().toString(36).slice(2, 9)}`,
                    projectId,
                    path,
                    content: newContent,
                    updatedAt: Date.now()
                  });
                }

                resultStr = `Successfully queued patch for ${path}. (Note: Evaluated in ensemble test sandbox).`;
                break;
              }

              case 'search_code': {
                const query = typeof args.query === 'string' ? args.query : '';
                if (!query) {
                  resultStr = 'Error: Missing query parameter.';
                  break;
                }
                const matches: string[] = [];
                for (const f of simulatedFiles) {
                  if (f.content.includes(query)) {
                    const lines = f.content.split('\n');
                    for (let l = 0; l < lines.length; l++) {
                      if (lines[l].includes(query)) {
                        matches.push(`${f.path}:${l + 1}: ${lines[l].trim()}`);
                      }
                    }
                  }
                }
                resultStr = matches.length === 0 ? `No matches found for "${query}".` : matches.slice(0, 100).join('\n');
                break;
              }

              case 'run_tests': {
                const testRes = await runProjectTestsDetailed(simulatedFiles);
                resultStr = testRes.output || testRes.error || 'No output from tests.';
                break;
              }

              default: {
                resultStr = `Unknown tool: ${tc.name}`;
              }
            }
          }
        }

        currentMessages.push({
          role: 'tool',
          content: resultStr,
          toolCallId: tc.id,
          toolName: tc.name
        });
      }

      if (signal?.aborted) break;
      if (stepCount >= maxSteps) {
        currentMessages.push({
          role: 'assistant',
          content: `Agent stopped after ${stepCount} steps.`
        });
        break;
      }
    }

    return {
      patches: simulatedPatches,
      messages: currentMessages,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens
      },
      hasReportedUsage,
      stepCount
    };
  } catch (err) {
    return {
      patches: simulatedPatches,
      messages: currentMessages,
      error: err instanceof Error ? err.message : String(err),
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens
      },
      hasReportedUsage,
      stepCount
    };
  }
}

/**
 * Applies patches in-memory to a copy of base files and executes project test suite.
 */
export async function evaluateCandidatePatches(
  baseFiles: FileItem[],
  patches: PatchDefinition[],
  testRunner?: (files: FileItem[]) => Promise<ProvenanceTestResult>
): Promise<ProvenanceTestResult> {
  if (patches.length === 0) {
    return {
      passed: 0,
      failed: 0,
      total: 0,
      status: 'passed',
      output: 'No code patches proposed.'
    };
  }

  // Create isolated in-memory copy of files with candidate patches applied
  let filesCopy: FileItem[] = baseFiles.map(f => ({ ...f }));

  for (const patch of patches) {
    if (patch.type === 'delete') {
      filesCopy = filesCopy.filter(f => f.path !== patch.path);
    } else if (patch.type === 'create') {
      const existing = filesCopy.find(f => f.path === patch.path);
      if (existing) {
        existing.content = patch.newContent;
      } else {
        filesCopy.push({
          id: `sim-patch-${Math.random().toString(36).slice(2, 9)}`,
          projectId: filesCopy[0]?.projectId || 'ensemble',
          path: patch.path,
          content: patch.newContent,
          updatedAt: Date.now()
        });
      }
    } else {
      // replace / append
      const existing = filesCopy.find(f => f.path === patch.path);
      if (existing) {
        existing.content = patch.newContent;
      } else {
        filesCopy.push({
          id: `sim-patch-${Math.random().toString(36).slice(2, 9)}`,
          projectId: filesCopy[0]?.projectId || 'ensemble',
          path: patch.path,
          content: patch.newContent,
          updatedAt: Date.now()
        });
      }
    }
  }

  if (testRunner) {
    return await testRunner(filesCopy);
  }

  return await runProjectTestsDetailed(filesCopy);
}

/**
 * Runs the dual-provider ensemble workflow:
 * 1. Concurrently dispatches coding prompt to Candidate A and Candidate B using LLMAdapter abstraction.
 * 2. Collects proposed patches from both candidates.
 * 3. Runs both candidate patchsets through the sandboxed test runner.
 * 4. Filters to passing patches:
 *    - If exactly 1 passes: automatically selects that patch.
 *    - If both pass: surfaces both diffs and lets user pick.
 *    - If neither passes or no tests pass: flags test failures.
 */
export async function runEnsembleDualEvaluation(
  userMessage: string | LLMContentBlock[],
  chatHistory: LLMMessage[],
  profileA: EnsembleCandidateProfile,
  profileB: EnsembleCandidateProfile,
  projectId: string,
  systemPrompt: string | undefined,
  baseFiles: FileItem[],
  signal?: AbortSignal,
  options?: EnsembleRunOptions,
  onProgress?: (statusMessage: string) => void,
  testRunner?: (files: FileItem[]) => Promise<ProvenanceTestResult>
): Promise<EnsembleEvaluationResult> {
  onProgress?.(`Dispatching coding task in parallel to ${profileA.label} and ${profileB.label}...`);

  // Run both candidate model generations in parallel
  const [resA, resB] = await Promise.all([
    runSimulatedAgentCandidate(userMessage, chatHistory, profileA, projectId, systemPrompt, baseFiles, signal, options),
    runSimulatedAgentCandidate(userMessage, chatHistory, profileB, projectId, systemPrompt, baseFiles, signal, options)
  ]);

  // Record token usage & costs for both candidate model runs
  try {
    let promptPreview = typeof userMessage === 'string'
      ? userMessage
      : (Array.isArray(userMessage) ? (userMessage.find(b => b.type === 'text') as { text?: string } | undefined)?.text || '' : '');
    if (promptPreview && promptPreview.length > 100) {
      promptPreview = promptPreview.slice(0, 100) + '...';
    }

    if (resA.messages && resA.messages.length > 0) {
      let inputTokens = resA.usage?.inputTokens ?? 0;
      let outputTokens = resA.usage?.outputTokens ?? 0;
      let totalTokens = inputTokens + outputTokens;

      if (!resA.hasReportedUsage || (inputTokens === 0 && outputTokens === 0)) {
        const tokensA = countTurnTokens(resA.messages, systemPrompt, AGENT_TOOLS);
        inputTokens = tokensA.inputTokens;
        outputTokens = tokensA.outputTokens;
        totalTokens = tokensA.totalTokens;
      }

      const pricingA = getModelPricing(profileA.provider, profileA.model);
      const costA = calculateEstimatedCost(inputTokens, outputTokens, pricingA);
      useAppStore.getState().recordTokenUsage({
        projectId,
        provider: profileA.provider,
        model: profileA.model,
        profileLabel: profileA.label,
        inputTokens,
        outputTokens,
        cachedTokens: resA.usage?.cachedTokens ? resA.usage.cachedTokens : undefined,
        totalTokens,
        estimatedCostUsd: costA,
        category: 'ensemble_candidate_a',
        promptPreview,
        stepCount: resA.stepCount
      });
    }

    if (resB.messages && resB.messages.length > 0) {
      let inputTokens = resB.usage?.inputTokens ?? 0;
      let outputTokens = resB.usage?.outputTokens ?? 0;
      let totalTokens = inputTokens + outputTokens;

      if (!resB.hasReportedUsage || (inputTokens === 0 && outputTokens === 0)) {
        const tokensB = countTurnTokens(resB.messages, systemPrompt, AGENT_TOOLS);
        inputTokens = tokensB.inputTokens;
        outputTokens = tokensB.outputTokens;
        totalTokens = tokensB.totalTokens;
      }

      const pricingB = getModelPricing(profileB.provider, profileB.model);
      const costB = calculateEstimatedCost(inputTokens, outputTokens, pricingB);
      useAppStore.getState().recordTokenUsage({
        projectId,
        provider: profileB.provider,
        model: profileB.model,
        profileLabel: profileB.label,
        inputTokens,
        outputTokens,
        cachedTokens: resB.usage?.cachedTokens ? resB.usage.cachedTokens : undefined,
        totalTokens,
        estimatedCostUsd: costB,
        category: 'ensemble_candidate_b',
        promptPreview,
        stepCount: resB.stepCount
      });
    }
  } catch (e) {
    console.warn('Failed to record ensemble token usage:', e);
  }

  if (signal?.aborted) {
    throw new Error('Ensemble execution was aborted by user');
  }

  onProgress?.('Evaluating candidate patches against sandboxed test runner...');

  // Concurrently run tests on both candidate patchsets
  const [testA, testB] = await Promise.all([
    evaluateCandidatePatches(baseFiles, resA.patches, testRunner),
    evaluateCandidatePatches(baseFiles, resB.patches, testRunner)
  ]);

  const determineStatus = (
    patches: PatchDefinition[],
    testRes: ProvenanceTestResult,
    err?: string
  ): 'passed' | 'failed' | 'error' | 'no_patches' => {
    if (err) return 'error';
    if (patches.length === 0) return 'no_patches';
    if (testRes.status === 'passed') return 'passed';
    if (testRes.status === 'failed') return 'failed';
    return 'error';
  };

  const candA: CandidateExecutionResult = {
    candidateId: 'A',
    profile: profileA,
    patches: resA.patches,
    messages: resA.messages,
    testResult: testA,
    error: resA.error,
    status: determineStatus(resA.patches, testA, resA.error)
  };

  const candB: CandidateExecutionResult = {
    candidateId: 'B',
    profile: profileB,
    patches: resB.patches,
    messages: resB.messages,
    testResult: testB,
    error: resB.error,
    status: determineStatus(resB.patches, testB, resB.error)
  };

  const passedCandidates: CandidateExecutionResult[] = [];
  if (candA.status === 'passed' && candA.patches.length > 0) passedCandidates.push(candA);
  if (candB.status === 'passed' && candB.patches.length > 0) passedCandidates.push(candB);

  let chosenCandidate: CandidateExecutionResult | null = null;
  let requiresUserSelection = false;
  let summaryStr: string;

  if (candA.patches.length > 0 && candB.patches.length > 0) {
    onProgress?.('Running Arbiter (Judge Pass) to select the best candidate...');
    try {
      const userMsgStr = typeof userMessage === 'string' 
        ? userMessage 
        : (Array.isArray(userMessage) 
          ? userMessage.filter((m): m is Extract<LLMContentBlock, { type: 'text' }> => m.type === 'text').map(m => m.text).join('\n') 
          : JSON.stringify(userMessage));

      const formatPatches = (patches: PatchDefinition[]) => {
        return patches.map(p => `--- ${p.path} (${p.type})\nRationale: ${p.rationale}\n\`\`\`\n${p.newContent}\n\`\`\``).join('\n\n');
      };

      const judgePrompt = `You are an expert Code Arbiter evaluating two candidate patchsets for a project.
Original User Request:
${userMsgStr}

Candidate A (${profileA.label}):
Patches:
${formatPatches(candA.patches)}
Test Results A:
Status: ${candA.testResult?.status}
Output: ${candA.testResult?.output?.slice(0, 1000) || 'None'}

Candidate B (${profileB.label}):
Patches:
${formatPatches(candB.patches)}
Test Results B:
Status: ${candB.testResult?.status}
Output: ${candB.testResult?.output?.slice(0, 1000) || 'None'}

Task: 
1. Review the patches for correctness and alignment with the user request.
2. Review the test results (passed > failed).
3. Select the best candidate. If one passes tests and the other fails, choose the passing one. If both pass or both fail, choose based on code quality and correctness.
You MUST return your decision as a valid JSON object strictly matching this schema:
{
  "winner": "A" | "B",
  "reasoning": "brief rationale"
}`;

      const judgeResponse = await profileA.adapter.send({
        messages: [{ role: 'user', content: judgePrompt }],
        systemPrompt: 'You are a JSON-only arbitration agent. Always respond with valid JSON containing exactly "winner" and "reasoning" keys.',
        temperature: 0.1,
        signal
      });
      
      const jsonMatch = judgeResponse.text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      
      if (!parsed || (parsed.winner !== 'A' && parsed.winner !== 'B')) {
        throw new Error('Arbiter returned invalid JSON or winner');
      }

      chosenCandidate = parsed.winner === 'B' ? candB : candA;
      summaryStr = `Ensemble Arbiter evaluated both and selected candidate ${chosenCandidate.profile.label}. Reasoning: ${parsed.reasoning}`;
      requiresUserSelection = false;

      try {
        const inputTokens = judgeResponse.usage?.inputTokens ?? 0;
        const outputTokens = judgeResponse.usage?.outputTokens ?? 0;
        if (inputTokens > 0 || outputTokens > 0) {
          const pricing = getModelPricing(profileA.provider, profileA.model);
          const cost = calculateEstimatedCost(inputTokens, outputTokens, pricing);
          useAppStore.getState().recordTokenUsage({
            projectId,
            provider: profileA.provider,
            model: profileA.model,
            profileLabel: profileA.label,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            estimatedCostUsd: cost,
            category: 'ensemble_arbiter',
            promptPreview: 'Arbiter (Judge) pass',
            stepCount: 1
          });
        }
      } catch (e) {
        console.warn('Failed to record arbiter token usage:', e);
      }

    } catch (err) {
      console.error('Arbiter failed:', err);
      // Fallback
      if (passedCandidates.length === 1) {
        chosenCandidate = passedCandidates[0];
        summaryStr = `Ensemble auto-selected candidate ${chosenCandidate.profile.label} (${chosenCandidate.patches.length} patch(es) passed tests). Arbiter pass failed.`;
      } else {
        requiresUserSelection = true;
        summaryStr = candA.status === 'passed' && candB.status === 'passed'
          ? `Both candidates passed tests. Arbiter failed, review and pick your preferred patch.`
          : `Neither candidate passed all sandboxed tests (A: ${candA.status}, B: ${candB.status}). You may review both diffs manually or pick one to debug.`;
      }
    }
  } else if (candA.patches.length > 0) {
      chosenCandidate = candA;
      summaryStr = `${profileA.label} proposed patches, but ${profileB.label} proposed none. Tests ${candA.status}.`;
  } else if (candB.patches.length > 0) {
      chosenCandidate = candB;
      summaryStr = `${profileB.label} proposed patches, but ${profileA.label} proposed none. Tests ${candB.status}.`;
  } else {
      summaryStr = 'Neither model candidate proposed code patches.';
  }

  return {
    candidateA: candA,
    candidateB: candB,
    passedCandidates,
    chosenCandidate,
    requiresUserSelection,
    summary: summaryStr
  };
}
