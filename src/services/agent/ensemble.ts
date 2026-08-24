import type { LLMAdapter, LLMContentBlock, LLMMessage, LLMTool, LLMToolCall } from '../llm/llmAdapter';
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
): Promise<{ patches: PatchDefinition[]; messages: LLMMessage[]; error?: string }> {
  const maxSteps = options?.maxSteps ?? 25;
  const mcpServers = useAppStore.getState().mcpServers;
  const dynamicTools: LLMTool[] = [...AGENT_TOOLS];
  const mcpToolMappings = new Map<string, string>();

  // Collect simulated patches
  const simulatedPatches: PatchDefinition[] = [];
  // Simulated file state in memory
  let simulatedFiles: FileItem[] = baseFiles.map(f => ({ ...f }));

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
      console.warn(`Simulated candidate: failed connecting MCP server ${server.url}:`, e);
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

  let stepCount = 0;

  try {
    while (true) {
      if (signal?.aborted) break;

      const stream = profile.adapter.stream({
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

      const assistantMsgIndex = currentMessages.length;
      currentMessages.push({ role: 'assistant', content: '', model: profile.label || profile.model });

      for await (const yieldResult of stream) {
        if (signal?.aborted) break;

        if (yieldResult.type === 'text') {
          textContent += yieldResult.text;
        } else if (yieldResult.type === 'tool_call') {
          toolCalls.push(yieldResult.toolCall);
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
            const { serverId, originalName } = JSON.parse(mcpMapping);
            const args = JSON.parse(tc.args);
            const result = await McpService.executeTool(serverId, originalName, args);
            resultStr = result.isError
              ? `Error executing MCP tool: ${JSON.stringify(result.content)}`
              : result.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
          } catch (e: any) {
            resultStr = `Error executing MCP tool: ${e?.message || String(e)}`;
          }
        } else {
          // Execute standard tools in the simulated in-memory context
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.args);
          } catch (err: any) {
            resultStr = `Error: Failed to parse tool arguments: ${err?.message || String(err)}`;
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
      messages: currentMessages
    };
  } catch (err: any) {
    return {
      patches: simulatedPatches,
      messages: currentMessages,
      error: err?.message || String(err)
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
      : (Array.isArray(userMessage) ? (userMessage.find(b => b.type === 'text') as any)?.text || '' : '');
    if (promptPreview && promptPreview.length > 100) {
      promptPreview = promptPreview.slice(0, 100) + '...';
    }

    if (resA.messages && resA.messages.length > 0) {
      const tokensA = countTurnTokens(resA.messages, systemPrompt, AGENT_TOOLS);
      const pricingA = getModelPricing(profileA.provider, profileA.model);
      const costA = calculateEstimatedCost(tokensA.inputTokens, tokensA.outputTokens, pricingA);
      useAppStore.getState().recordTokenUsage({
        projectId,
        provider: profileA.provider,
        model: profileA.model,
        profileLabel: profileA.label,
        inputTokens: tokensA.inputTokens,
        outputTokens: tokensA.outputTokens,
        totalTokens: tokensA.totalTokens,
        estimatedCostUsd: costA,
        category: 'ensemble_candidate_a',
        promptPreview
      });
    }

    if (resB.messages && resB.messages.length > 0) {
      const tokensB = countTurnTokens(resB.messages, systemPrompt, AGENT_TOOLS);
      const pricingB = getModelPricing(profileB.provider, profileB.model);
      const costB = calculateEstimatedCost(tokensB.inputTokens, tokensB.outputTokens, pricingB);
      useAppStore.getState().recordTokenUsage({
        projectId,
        provider: profileB.provider,
        model: profileB.model,
        profileLabel: profileB.label,
        inputTokens: tokensB.inputTokens,
        outputTokens: tokensB.outputTokens,
        totalTokens: tokensB.totalTokens,
        estimatedCostUsd: costB,
        category: 'ensemble_candidate_b',
        promptPreview
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

  if (passedCandidates.length === 1) {
    chosenCandidate = passedCandidates[0];
    summaryStr = `Ensemble auto-selected candidate ${chosenCandidate.profile.label} (${chosenCandidate.patches.length} patch(es) passed tests). Other candidate failed test verification.`;
  } else if (passedCandidates.length === 2) {
    requiresUserSelection = true;
    summaryStr = `Both candidates (${profileA.label} and ${profileB.label}) passed all test checks! Review and pick your preferred patch.`;
  } else {
    // Neither passed or no patches
    if (candA.patches.length > 0 && candB.patches.length === 0) {
      chosenCandidate = candA;
      summaryStr = `${profileA.label} proposed patches, but tests ${candA.status}. ${profileB.label} proposed no patches.`;
    } else if (candB.patches.length > 0 && candA.patches.length === 0) {
      chosenCandidate = candB;
      summaryStr = `${profileB.label} proposed patches, but tests ${candB.status}. ${profileA.label} proposed no patches.`;
    } else if (candA.patches.length > 0 && candB.patches.length > 0) {
      requiresUserSelection = true;
      summaryStr = `Neither candidate passed all sandboxed tests (A: ${candA.status}, B: ${candB.status}). You may review both diffs manually or pick one to debug.`;
    } else {
      summaryStr = 'Neither model candidate proposed code patches.';
    }
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
