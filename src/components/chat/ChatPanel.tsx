import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, 
  Cpu, 
  Code, 
  Loader2, 
  Square, 
  ChevronDown, 
  ChevronUp, 
  Files, 
  Sparkles, 
  AlertCircle,
  AlertTriangle,
  Server,
  Eye,
  X,
  GitMerge,
  Coins
} from 'lucide-react';
import { useAppStore } from '../../store';
import { runAgentLoop } from '../../services/agent/agentLoop';
import { runEnsembleDualEvaluation, type EnsembleEvaluationResult } from '../../services/agent/ensemble';
import { EnsembleCandidatePickerModal } from '../modals/EnsembleCandidatePickerModal';
import { QuickConnectSheet } from '../shared/QuickConnectSheet';
import { createLLMAdapter } from '../../services/llm/factory';
import { db, type FileItem } from '../../db';
import { listFiles } from '../../services/fs/vfs';

import { EmptyState } from '../shared/EmptyState';
import type { LLMToolCall } from '../../services/llm/llmAdapter';
import { 
  SUGGESTION_PROMPTS, 
  BASE_SYSTEM_PROMPT, 
  buildFileManifest, 
  buildSystemPrompt,
  isPathExcludedFromManifest
} from '../../services/agent/prompts';
import { getModelContextWindow } from '../../services/llm/modelDiscovery';
import { 
  computeSessionUsageSummary, 
  formatUsdCost, 
  formatTokenCount 
} from '../../services/usage/tokenSpend';
import ReactMarkdown from 'react-markdown';
import type { ShellBreakpoint } from '../../hooks/useShellBreakpoint';

export function formatPathMiddleEllipsis(path: string, maxLength: number = 42): string {
  if (!path || path.length <= maxLength) return path;
  
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) {
    const extIndex = path.lastIndexOf('.');
    if (extIndex > 3 && extIndex < path.length - 1) {
      const ext = path.slice(extIndex);
      const base = path.slice(0, extIndex);
      const avail = maxLength - ext.length - 3;
      if (avail > 2) {
        return `${base.slice(0, Math.ceil(avail / 2))}...${base.slice(-Math.floor(avail / 2))}${ext}`;
      }
    }
    return `${path.slice(0, maxLength - 7)}...${path.slice(-4)}`;
  }

  const dir = path.slice(0, lastSlash);
  const fileName = path.slice(lastSlash + 1);
  
  if (fileName.length >= maxLength - 4) {
    const extIndex = fileName.lastIndexOf('.');
    if (extIndex > 3 && extIndex < fileName.length - 1) {
      const ext = fileName.slice(extIndex);
      const base = fileName.slice(0, extIndex);
      const avail = maxLength - ext.length - 7;
      if (avail > 2) {
        return `.../${base.slice(0, Math.ceil(avail / 2))}...${base.slice(-Math.floor(avail / 2))}${ext}`;
      }
    }
    return `.../${fileName.slice(0, maxLength - 10)}...${fileName.slice(-6)}`;
  }
  
  const availDir = maxLength - fileName.length - 4;
  if (availDir < 3) {
    return `.../${fileName}`;
  }
  return `${dir.slice(0, Math.ceil(availDir / 2))}...${dir.slice(-Math.floor(availDir / 2))}/${fileName}`;
}

export function ChatPanel({ 
  projectId,
  breakpoint = 'phone'
}: { 
  projectId: string;
  breakpoint?: ShellBreakpoint;
}) {
  const isWide = breakpoint !== 'phone';
  const { 
    chatHistory, 
    setChatHistory, 
    activeProfileId, 
    setActiveTab, 
    keys, 
    tokenUsage, 
    setTokenUsage,
    sessionUsageRecords,
    pendingPatches,
    isPatchReviewOpen,
    setIsPatchReviewOpen,
    lastBuildError,
    queuedPrompt,
    setQueuedPrompt,
    customInstructions,
    temperature,
    maxOutputTokens,
    maxAgentSteps,
    manifestExcludePatterns,
    lastPreviewScreenshot,
    attachPreviewVision,
    setAttachPreviewVision,
    ensembleModeEnabled,
    ensembleCandidateBProfileId,
    setPendingPatches,
    chatDraft,
    setChatDraft
  } = useAppStore();

  const [input, setInput] = useState(() => chatDraft || '');
  const [loading, setLoading] = useState(false);

  // Sync draft to store so resizing across breakpoints retains in-progress prompt
  useEffect(() => {
    setChatDraft(input);
  }, [input, setChatDraft]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [ensembleEvaluation, setEnsembleEvaluation] = useState<EnsembleEvaluationResult | null>(null);
  const [profileName, setProfileName] = useState('No Profile Selected');
  const [profileLabel, setProfileLabel] = useState('');
  const [contextFiles, setContextFiles] = useState<FileItem[]>([]);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [expandedToolResults, setExpandedToolResults] = useState<Record<string, boolean>>({});
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Close details popup on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        setIsDetailsOpen(false);
      }
    }
    if (isDetailsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDetailsOpen]);

  const handleSend = async (overrideMessage?: string) => {
    const messageToSend = (overrideMessage !== undefined ? overrideMessage : input).trim();
    if (!messageToSend || !activeProfileId || !keys || loading) return;

    if (overrideMessage === undefined) {
      setInput('');
    }
    setLoading(true);
    setStatusMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const allProfiles = await db.connectionProfiles.toArray();
      const profileA = allProfiles.find(p => p.id === activeProfileId);
      if (!profileA) throw new Error('Active profile not found');

      // Check if ensemble mode is enabled and secondary profile is available
      const candidateBProfile = ensembleModeEnabled
        ? (ensembleCandidateBProfileId
            ? allProfiles.find(p => p.id === ensembleCandidateBProfileId && p.id !== activeProfileId)
            : allProfiles.find(p => p.id !== activeProfileId))
        : null;

      const isEnsembleActive = ensembleModeEnabled && !!candidateBProfile;

      const files = await listFiles(projectId);
      const manifestFiles = files.filter(f => !isPathExcludedFromManifest(f.path, manifestExcludePatterns));
      const systemPrompt = buildSystemPrompt(manifestFiles, customInstructions);

      const screenshotToPass = (attachPreviewVision && lastPreviewScreenshot)
        ? {
            mediaType: lastPreviewScreenshot.mediaType,
            data: lastPreviewScreenshot.data
          }
        : null;

      if (isEnsembleActive && candidateBProfile) {
        setStatusMessage(`Ensemble dispatching to ${profileA.label || profileA.model} & ${candidateBProfile.label || candidateBProfile.model}...`);

        const adapterA = await createLLMAdapter(profileA, keys.aesKey);
        const adapterB = await createLLMAdapter(candidateBProfile, keys.aesKey);

        const candProfileA = {
          id: profileA.id,
          label: profileA.label || profileA.model || profileA.provider,
          provider: profileA.provider,
          model: profileA.model,
          adapter: adapterA
        };

        const candProfileB = {
          id: candidateBProfile.id,
          label: candidateBProfile.label || candidateBProfile.model || candidateBProfile.provider,
          provider: candidateBProfile.provider,
          model: candidateBProfile.model,
          adapter: adapterB
        };

        const result = await runEnsembleDualEvaluation(
          messageToSend,
          chatHistory,
          candProfileA,
          candProfileB,
          projectId,
          systemPrompt,
          files,
          abortController.signal,
          {
            temperature,
            maxTokens: maxOutputTokens,
            screenshot: screenshotToPass,
            maxSteps: maxAgentSteps
          },
          (msg) => setStatusMessage(msg)
        );

        if (abortController.signal.aborted) return;

        if (result.requiresUserSelection) {
          // Surface both candidate diffs in comparison modal
          setEnsembleEvaluation(result);
        } else if (result.chosenCandidate) {
          // Exactly 1 passed or 1 proposed patches: apply candidate's patches & update chat history
          const chosen = result.chosenCandidate;
          if (chosen.patches.length > 0) {
            setPendingPatches(chosen.patches);
          }
          const chosenMessages = chosen.messages;
          setChatHistory(chosenMessages);
        } else {
          // No patches or errors
          setChatHistory([
            ...chatHistory,
            { role: 'user', content: messageToSend },
            { role: 'assistant', content: result.summary || 'Ensemble completed without candidate patches.' }
          ]);
        }
      } else {
        // Standard single-provider execution
        const activeModelName = profileA.label || profileA.model || profileA.provider || 'Assistant';
        const adapter = await createLLMAdapter(profileA, keys.aesKey);

        const finalMessages = await runAgentLoop(
          messageToSend,
          chatHistory,
          adapter,
          projectId,
          systemPrompt,
          (updatedMessages) => {
            setChatHistory(updatedMessages);
          },
          abortController.signal,
          maxAgentSteps,
          {
            temperature,
            maxTokens: maxOutputTokens,
            screenshot: screenshotToPass,
            modelName: activeModelName,
            model: profileA.model,
            provider: profileA.provider
          }
        );

        if (finalMessages.length > 0) {
          const lastMsg = finalMessages[finalMessages.length - 1];
          if (lastMsg.role === 'assistant' && !lastMsg.content && (!lastMsg.toolCalls || lastMsg.toolCalls.length === 0)) {
            const fixedMessages = [...finalMessages];
            fixedMessages[fixedMessages.length - 1] = {
              ...lastMsg,
              content: '⚠️ No response received from the model — try again'
            };
            setChatHistory(fixedMessages);
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError' && !abortController.signal.aborted) {
        console.error(e);
        const currentHistory = useAppStore.getState().chatHistory;
        setChatHistory([
          ...currentHistory,
          { role: 'assistant', content: `⚠️ Request failed: ${e.message || String(e)}` }
        ]);
      }
    } finally {
      setLoading(false);
      setStatusMessage(null);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    let active = true;
    if (activeProfileId) {
      db.connectionProfiles.get(activeProfileId).then(p => {
        if (active && p) {
          setProfileName(`${p.label || p.provider} (${p.model})`);
          setProfileLabel(p.label || p.model || p.provider || '');
        }
      });
    } else {
      Promise.resolve().then(() => {
        if (active) {
          setProfileName('No Profile Selected');
          setProfileLabel('');
        }
      });
    }
    return () => {
      active = false;
    };
  }, [activeProfileId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Handle queued prompt from other panels (e.g. PreviewPanel CTA)
  useEffect(() => {
    if (!queuedPrompt) return;
    const prompt = queuedPrompt;
    Promise.resolve().then(() => {
      setQueuedPrompt(null);
      if (activeProfileId && keys && !loading) {
        handleSend(prompt);
      } else {
        setInput(prompt);
      }
    });
  }, [queuedPrompt, activeProfileId, keys, loading]);

  // Update context files & token usage
  useEffect(() => {
    let active = true;

    async function updateContextAndTokens() {
      const files = await listFiles(projectId);
      if (!active) return;
      setContextFiles(files);

      const manifestFiles = files.filter(f => !isPathExcludedFromManifest(f.path, manifestExcludePatterns));
      const manifestText = buildFileManifest(manifestFiles);
      const effectiveSystem = customInstructions.trim()
        ? `${BASE_SYSTEM_PROMPT}\n\n<custom_instructions>\n${customInstructions.trim()}\n</custom_instructions>`
        : BASE_SYSTEM_PROMPT;

      const { encode } = await import('gpt-tokenizer');
      const tSystem = encode(effectiveSystem).length;
      const tManifest = encode(manifestText).length;

      let chatText = '';
      for (const m of chatHistory) chatText += `${m.role}\n${m.content}\n`;
      const tChat = encode(chatText).length + (chatHistory.length * 4);

      let maxTokens = 32000;
      if (activeProfileId) {
        try {
          const profile = await db.connectionProfiles.get(activeProfileId);
          if (profile) {
            maxTokens = getModelContextWindow(profile.provider, profile.model);
          }
        } catch {
          // fallback
        }
      }

      setTokenUsage({
        system: tSystem,
        codebase: tManifest,
        chat: tChat,
        max: maxTokens,
        isEstimate: false
      });
    }

    updateContextAndTokens();
    return () => {
      active = false;
    };
  }, [chatHistory, projectId, pendingPatches, setTokenUsage, customInstructions, activeProfileId, manifestExcludePatterns]);

  // Aggregate session API token spend and estimated costs
  const sessionSummary = useMemo(() => {
    return computeSessionUsageSummary(sessionUsageRecords || []);
  }, [sessionUsageRecords]);

  // Collapsed summary text construction
  const summaryText = useMemo(() => {
    const modelStr = profileLabel || profileName || 'Assistant';
    const visionStr = attachPreviewVision ? 'Vision on' : 'Vision off';
    const costStr = sessionSummary.totalCostUsd > 0 ? formatUsdCost(sessionSummary.totalCostUsd) : '$0.00';
    
    const parts = [modelStr, visionStr, costStr];
    if (ensembleModeEnabled) {
      parts.push('Ensemble');
    }
    return parts.join(' · ');
  }, [profileLabel, profileName, attachPreviewVision, sessionSummary.totalCostUsd, ensembleModeEnabled]);

  // Dynamic suggestion chips based on real project state
  const suggestionChips = useMemo(() => {
    const chips: string[] = [SUGGESTION_PROMPTS.WHAT_IS_IN_PROJECT];

    if (lastBuildError) {
      chips.push(SUGGESTION_PROMPTS.EXPLAIN_LAST_ERROR);
    }

    const hasIndex = contextFiles.some(f => f.path === '/index.html' || f.path === '/public/index.html');
    if (!hasIndex) {
      chips.push(SUGGESTION_PROMPTS.ADD_INDEX_HTML);
    }

    if (contextFiles.length === 0) {
      chips.push(SUGGESTION_PROMPTS.SCAFFOLD_STARTER);
    } else {
      const hasPackageJson = contextFiles.some(f => f.path === '/package.json');
      const hasReadme = contextFiles.some(f => f.path.toLowerCase().includes('readme'));
      if (hasPackageJson && !hasReadme) {
        chips.push(SUGGESTION_PROMPTS.ADD_README);
      }

      const hasComponents = contextFiles.some(f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx'));
      if (hasComponents) {
        chips.push(SUGGESTION_PROMPTS.ADD_COMPONENT);
      } else if (hasIndex && !lastBuildError) {
        chips.push(SUGGESTION_PROMPTS.ADD_TAILWIND);
      }
    }

    return chips;
  }, [contextFiles, lastBuildError]);

  const renderToolCall = (tc: LLMToolCall) => {
    if (tc.name === 'write_file') {
      try {
        const args = JSON.parse(tc.args);
        return (
          <div key={tc.id} className="mt-2 border border-border bg-surface/50 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-2 mb-2 text-accent font-sans text-xs">
              <Code size={14} />
              Proposed Patch: {args.type}
            </div>
            <div className="font-mono text-text mb-1 truncate">{args.path}</div>
            <div className="text-muted italic text-xs">{args.rationale}</div>
          </div>
        );
      } catch (_e) {
        return null;
      }
    }
    
    const toolResultMsg = chatHistory.find(m => m.role === 'tool' && m.toolCallId === tc.id);
    const isMcpTool = tc.name.startsWith('mcp_') || (toolResultMsg?.toolName && toolResultMsg.toolName.startsWith('mcp_'));
    const cleanToolName = isMcpTool ? tc.name.replace(/^mcp_/, '') : tc.name;
    const resultContent = toolResultMsg ? (typeof toolResultMsg.content === 'string' ? toolResultMsg.content : JSON.stringify(toolResultMsg.content)) : null;
    const isError = !!resultContent && (
      resultContent.includes('[MCP Error]') || 
      resultContent.includes('[MCP Connection Error]') || 
      resultContent.startsWith('Error:') || 
      resultContent.startsWith('Error executing MCP tool')
    );
    const isExpanded = !!expandedToolResults[tc.id];

    if (isError) {
      return (
        <div key={tc.id} className="mt-2 border border-oxide/40 bg-oxide/10 rounded-lg p-2.5 text-xs font-sans">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-oxide">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{isMcpTool ? `MCP Tool Error (${cleanToolName})` : `Tool Error (${cleanToolName})`}</span>
            </div>
            {resultContent && (
              <button
                type="button"
                onClick={() => setExpandedToolResults(prev => ({ ...prev, [tc.id]: !prev[tc.id] }))}
                className="text-[10px] text-oxide hover:underline cursor-pointer shrink-0"
              >
                {isExpanded ? 'Hide Details' : 'View Details'}
              </button>
            )}
          </div>
          {isExpanded && (
            <pre className="mt-2 p-2 rounded bg-surface border border-oxide/30 font-mono text-[11px] text-oxide whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {resultContent}
            </pre>
          )}
        </div>
      );
    }

    return (
      <div key={tc.id} className="mt-1.5 border border-border/70 bg-surface/50 rounded-md p-2 text-xs font-sans">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-muted font-mono text-[11px]">
            {isMcpTool ? (
              <Server size={12} className="text-accent shrink-0" />
            ) : (
              <Cpu size={12} className="text-accent shrink-0" />
            )}
            <span className="text-accent font-semibold">{isMcpTool ? 'MCP Tool:' : 'Tool:'}</span>
            <span className="text-text">{cleanToolName}</span>
          </div>
          {resultContent ? (
            <button
              type="button"
              onClick={() => setExpandedToolResults(prev => ({ ...prev, [tc.id]: !prev[tc.id] }))}
              className="text-[10px] text-muted hover:text-accent font-sans underline cursor-pointer shrink-0"
            >
              {isExpanded ? 'Hide Result' : 'View Result'}
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[10px] text-accent">
              <Loader2 size={10} className="animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>
        {isExpanded && resultContent && (
          <pre className="mt-2 p-2 rounded bg-code-bg border border-border font-mono text-[10px] text-text whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
            {resultContent}
          </pre>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Collapsible Context Files Row - Only displayed when workspace has files */}
      {contextFiles.length > 0 && (
        <div className="shrink-0 relative z-20 border-b border-border bg-surface shadow-xs">
          <button
            type="button"
            onClick={() => setContextExpanded(!contextExpanded)}
            aria-expanded={contextExpanded}
            aria-label={`${contextFiles.length} files in manifest, ${tokenUsage.codebase.toLocaleString()} manifest tokens`}
            className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-surface-elevated active:bg-surface-elevated/80 transition-colors text-left font-sans text-xs cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Files size={13} className="text-accent shrink-0" />
              <span className="text-text font-medium truncate">
                {contextFiles.length} {contextFiles.length === 1 ? 'file' : 'files'} in manifest
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[10px] sm:text-xs text-muted font-mono">
              <span className="font-semibold text-text/80">{tokenUsage.codebase.toLocaleString()}{tokenUsage.isEstimate ? '*' : ''} manifest tokens</span>
              {contextExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
            </div>
          </button>
          {contextExpanded && (
            <div 
              role="region"
              aria-label="Manifest files list"
              className="max-h-48 overflow-y-auto border-t border-b border-border bg-surface shadow-2xl p-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150"
            >
              {contextFiles.map(f => (
                <div 
                  key={f.path} 
                  title={f.path}
                  className="flex items-center justify-between text-xs font-mono px-2 py-1 rounded hover:bg-surface-elevated transition-colors group"
                >
                  <span className="text-muted group-hover:text-text truncate mr-2">
                    {formatPathMiddleEllipsis(f.path, 44)}
                  </span>
                  <span className="text-muted/80 text-[10px] sm:text-[10.5px] font-mono shrink-0 ml-2 bg-surface-elevated px-1.5 py-0.5 rounded border border-border/50">
                    {new TextEncoder().encode(f.content).length.toLocaleString()} B
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Persistent Pending Patches Banner */}
      {pendingPatches.length > 0 && !isPatchReviewOpen && (
        <button
          type="button"
          onClick={() => setIsPatchReviewOpen(true)}
          className="w-full shrink-0 bg-accent/15 border-b border-accent/30 px-3 py-2 flex items-center justify-between hover:bg-accent/25 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-2 text-accent font-sans text-xs font-semibold">
            <Sparkles size={14} className="animate-pulse shrink-0" />
            <span>{pendingPatches.length} {pendingPatches.length === 1 ? 'patch' : 'patches'} awaiting review</span>
          </div>
          <span className="text-[11px] font-sans text-accent underline decoration-brass/50 hover:decoration-brass shrink-0">
            Review & Apply →
          </span>
        </button>
      )}

      {/* Messages Scroll Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 pb-28"
      >
        {chatHistory.filter(m => m.role !== 'tool').map((msg, i) => {
          const rawText = typeof msg.content === 'string' 
            ? msg.content 
            : (Array.isArray(msg.content) 
                ? msg.content.map(b => b.type === 'text' ? b.text : '').join('\n')
                : '');
          // Omit bare leading colon from assistant output
          const cleanedText = msg.role === 'assistant' ? rawText.replace(/^:\s*/, '') : rawText;
          const senderModelName = msg.model || profileLabel || '';

          return (
            <div 
              key={i} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div 
                className={`max-w-[85%] rounded-lg p-3 ${
                  msg.role === 'user' 
                    ? 'bg-accent text-accent-text-on font-medium shadow-xs' 
                    : 'bg-surface border border-border text-text'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border/40 text-[11px] font-mono text-muted">
                    <Cpu size={12} className="text-accent shrink-0" />
                    <span className="font-bold text-text truncate">
                      {senderModelName ? `${senderModelName}` : 'Assistant'}
                    </span>
                  </div>
                )}

                {cleanedText && (
                  msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap text-sm space-y-2">
                      {typeof msg.content === 'string' ? (
                        cleanedText
                      ) : (
                        msg.content.map((part, pIdx) => {
                          if (part.type === 'text') {
                            return <div key={pIdx}>{part.text}</div>;
                          }
                          if (part.type === 'image') {
                            return (
                              <div key={pIdx} className="mt-2 rounded overflow-hidden border border-black/20 max-w-[260px] shadow-sm bg-white">
                                <img
                                  src={`data:${part.mediaType};base64,${part.data}`}
                                  alt="Attached preview screenshot"
                                  className="w-full h-auto object-contain block"
                                />
                                <div className="px-2 py-1 bg-black/5 text-[10px] text-zinc-600 font-sans flex items-center gap-1 border-t border-black/10">
                                  <Eye size={10} />
                                  <span>Preview Vision</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })
                      )}
                    </div>
                  ) : (
                    <div className="text-sm space-y-3">
                      <ReactMarkdown
                        components={{
                          p: ({ node: _node, ...props }) => <p className="leading-relaxed" {...props} />,
                          a: ({ node: _node, ...props }) => <a className="text-accent underline hover:no-underline" {...props} />,
                          strong: ({ node: _node, ...props }) => <strong className="font-semibold text-text" {...props} />,
                          h1: ({ node: _node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-2 text-text" {...props} />,
                          h2: ({ node: _node, ...props }) => <h2 className="text-lg font-bold mt-4 mb-2 text-text" {...props} />,
                          h3: ({ node: _node, ...props }) => <h3 className="text-base font-bold mt-3 mb-2 text-text" {...props} />,
                          ul: ({ node: _node, ...props }) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                          ol: ({ node: _node, ...props }) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
                          li: ({ node: _node, ...props }) => <li className="leading-relaxed" {...props} />,
                          code: ({ node: _node, inline, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '');
                            const strChildren = String(children || '');
                            // Inline code spans (single backtick) render inline; only multi-line / language blocks render full cards
                            const isInline = inline === true || (inline === undefined && !match && !className?.includes('language-') && !strChildren.includes('\n'));
                            
                            return isInline ? (
                              <code className="bg-surface-elevated text-accent px-1.5 py-0.5 rounded text-xs font-mono border border-border/60 align-middle inline-block my-0.5" {...props}>
                                {children}
                              </code>
                            ) : (
                              <div className="bg-code-bg rounded-md my-3 overflow-hidden border border-border">
                                <div className="px-3 py-1.5 bg-surface border-b border-border text-xs text-muted flex items-center font-mono">
                                  <Code size={12} className="mr-2 text-accent" /> {match ? match[1] : 'Code'}
                                </div>
                                <pre className="p-3 overflow-x-auto text-xs font-mono text-text">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              </div>
                            );
                          },
                          hr: ({ node: _node, ...props }) => <hr className="border-border my-4" {...props} />,
                          blockquote: ({ node: _node, ...props }) => <blockquote className="border-l-4 border-border pl-3 text-muted italic my-3" {...props} />,
                        }}
                      >
                        {cleanedText}
                      </ReactMarkdown>
                    </div>
                  )
                )}
                {msg.role === 'assistant' && !msg.content && !msg.toolCalls && loading && (
                  <div className="flex items-center gap-2 text-muted text-xs font-sans py-0.5">
                    <Loader2 size={14} className="animate-spin text-accent shrink-0" />
                    <span className="font-mono">Processing step...</span>
                  </div>
                )}
                {msg.toolCalls && msg.toolCalls.map(renderToolCall)}
              </div>
            </div>
          );
        })}
        {chatHistory.length === 0 && (
          <EmptyState
            icon={<Sparkles size={20} />}
            badge="Agentic Subsystem : Standby"
            title="LAIDE Agent Session"
            description="Describe a feature to build, request refactoring, or choose a prompt chip below to execute."
          >
            <div className="w-full pt-2.5 border-t border-border flex items-center justify-between text-[10px] font-mono text-muted">
              <span>VFS : ATTACHED</span>
              <span>PATCH REVIEW : STRICT</span>
            </div>
          </EmptyState>
        )}
      </div>

      {/* Bottom Input & Action Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-bg/95 backdrop-blur-md border-t border-border p-3">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          
          {/* Suggestion Chips on Empty State */}
          {chatHistory.length === 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {suggestionChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSend(chip)}
                  disabled={!activeProfileId || loading}
                  className="shrink-0 text-xs font-sans px-2.5 py-1 rounded-full bg-surface border border-border text-muted hover:text-accent hover:border-accent/40 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Sparkles size={11} className="text-accent shrink-0" />
                  <span>{chip}</span>
                </button>
              ))}
            </div>
          )}

            {/* Tappable Profile / Settings Status Row & Collapsed Summary Chip (when profile is active) */}
            {activeProfileId && (
              <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative inline-block" ref={detailsRef}>
                    <button
                      type="button"
                      onClick={() => setIsDetailsOpen(prev => !prev)}
                      aria-expanded={isDetailsOpen}
                      aria-label="Model and session details"
                      title="Click to view and adjust model, vision, ensemble, and cost settings"
                      className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-sans border transition-all cursor-pointer shadow-xs active:scale-95 ${
                        isDetailsOpen 
                          ? 'bg-surface-elevated border-accent text-accent font-medium' 
                          : 'bg-surface border-border text-muted hover:text-text hover:border-accent/40'
                      }`}
                    >
                      {ensembleModeEnabled && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" title="Ensemble mode active" />
                      )}
                      <Cpu size={11} className="text-accent shrink-0" />
                      <span className={`truncate font-mono text-[10.5px] ${isWide ? 'max-w-md' : 'max-w-[280px]'}`}>
                        {summaryText}
                      </span>
                      {isDetailsOpen ? <ChevronDown size={11} className="shrink-0 text-muted" /> : <ChevronUp size={11} className="shrink-0 text-muted" />}
                    </button>

                    {/* Expanded Detail Panel */}
                    {isDetailsOpen && (
                      <div 
                        className={`absolute bottom-full mb-1.5 left-0 z-30 p-2 rounded-lg bg-surface border border-border shadow-xl flex items-center flex-wrap gap-2 animate-in fade-in zoom-in-95 duration-100 font-sans ${
                          isWide ? 'min-w-[340px]' : 'min-w-[280px]'
                        }`}
                        role="region"
                        aria-label="Session control details"
                      >
                        {/* Profile switch button */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('settings');
                            setIsDetailsOpen(false);
                          }}
                          aria-label="Manage connection profile in Settings"
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-border hover:border-accent/40 text-left group cursor-pointer transition-colors"
                          title="Manage connection profile in Settings"
                        >
                          <Cpu size={12} className="text-accent shrink-0" />
                          <span className="text-[10px] font-sans text-muted group-hover:text-accent transition-colors truncate max-w-[180px]">
                            {profileName}
                          </span>
                        </button>

                        {/* Vision Toggle Button / Badge */}
                        {lastPreviewScreenshot ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setAttachPreviewVision(!attachPreviewVision)}
                              className={`px-2 py-1 rounded text-[10px] font-sans flex items-center gap-1.5 transition-colors cursor-pointer border ${
                                attachPreviewVision 
                                  ? 'bg-accent/15 border-accent/40 text-accent font-medium' 
                                  : 'bg-surface-elevated border-border text-muted hover:text-text'
                              }`}
                              title={attachPreviewVision ? 'Vision enabled: Preview screenshot attached to prompt' : 'Vision disabled: Click to attach preview screenshot'}
                            >
                              <Eye size={11} className={attachPreviewVision ? 'text-accent' : 'text-muted'} />
                              <span>{attachPreviewVision ? 'Vision Attached' : 'Attach Preview'}</span>
                              {lastPreviewScreenshot.dataUrl && attachPreviewVision && (
                                <img
                                  src={lastPreviewScreenshot.dataUrl}
                                  alt="Preview snapshot"
                                  className="w-3.5 h-3.5 object-cover rounded border border-accent/40 ml-0.5"
                                />
                              )}
                            </button>
                            {attachPreviewVision && (
                              <button
                                type="button"
                                onClick={() => setAttachPreviewVision(false)}
                                className="p-1 text-muted hover:text-oxide rounded transition-colors cursor-pointer"
                                title="Detach preview screenshot"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('preview');
                              setIsDetailsOpen(false);
                            }}
                            className="px-2 py-1 rounded text-[10px] font-sans flex items-center gap-1 bg-surface-elevated border border-border text-muted hover:text-accent hover:border-accent/40 transition-colors cursor-pointer"
                            title="Open Preview panel to capture screenshot for vision feedback"
                          >
                            <Eye size={11} />
                            <span>Preview Vision</span>
                          </button>
                        )}

                        {/* Ensemble Mode Indicator */}
                        {ensembleModeEnabled && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('settings');
                              setIsDetailsOpen(false);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-accent/15 border border-accent/30 text-accent text-[10px] font-sans font-semibold cursor-pointer hover:bg-accent/25 transition-colors"
                            title="Dual-LLM Ensemble Mode Active: coding requests are sent to two models in parallel and verified with sandboxed tests"
                          >
                            <GitMerge size={11} />
                            <span>Ensemble Mode</span>
                          </button>
                        )}

                        {/* Session Token Spend & Cost Badge */}
                        {sessionSummary.totalCostUsd > 0 && (
                          <div
                            className="flex items-center gap-1 px-2 py-1 rounded bg-surface-elevated border border-border text-muted text-[10px] font-mono shadow-xs"
                            title={`Session API Spend: ${formatUsdCost(sessionSummary.totalCostUsd)} (${formatTokenCount(sessionSummary.totalTokens)} total tokens across ${sessionSummary.recordsCount} run${sessionSummary.recordsCount === 1 ? '' : 's'})`}
                          >
                            <Coins size={11} className="text-accent" />
                            <span className="font-semibold text-text">{formatUsdCost(sessionSummary.totalCostUsd)}</span>
                            <span className="opacity-60">• {formatTokenCount(sessionSummary.totalTokens)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {loading && (
                  <span className="text-[10px] font-sans text-accent animate-pulse">
                    {statusMessage || 'Agent working...'}
                  </span>
                )}
              </div>
            )}
          
          {/* Textarea and Send / Stop Controls */}
          <div className="flex items-end gap-2">
            {!activeProfileId ? (
              <button
                type="button"
                onClick={() => setIsQuickConnectOpen(true)}
                aria-label="Configure an AI profile to start chatting"
                className="w-full bg-surface border border-rose-500/30 hover:border-rose-500/50 rounded-lg flex justify-between items-center px-3.5 py-2.5 min-h-[48px] text-left text-xs sm:text-sm text-rose-400/90 hover:text-rose-300 transition-colors cursor-pointer group shadow-xs active:scale-[0.99]"
                title="Quick connect an AI profile to start chatting"
              >
                <span className="font-sans truncate mr-2">
                  Configure an AI profile to start chatting
                </span>
                <span className="text-[11px] font-sans font-semibold px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/35 text-rose-400 shrink-0 group-hover:bg-rose-500/25 group-hover:border-rose-500/50 transition-colors shadow-2xs">
                  Connect AI →
                </span>
              </button>
            ) : (
              <>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  placeholder="Describe what to build or change..."
                  className="flex-1 bg-surface border border-border rounded-lg p-3 min-h-[48px] max-h-[200px] text-sm text-text placeholder-text/40 focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed resize-none leading-relaxed"
                  rows={1}
                  style={{
                    height: input ? 'auto' : '48px',
                  }}
                />

                {loading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="h-[48px] px-3 bg-oxide/20 border border-oxide/50 text-oxide hover:bg-oxide/30 rounded-lg flex items-center justify-center gap-1.5 font-sans text-xs font-bold transition-colors cursor-pointer shrink-0"
                    title="Cancel response"
                    aria-label="Cancel response"
                  >
                    <Square size={14} fill="currentColor" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                    className="h-[48px] w-[48px] shrink-0 bg-accent text-surface rounded-lg flex items-center justify-center hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    title="Send message"
                    aria-label="Send message"
                  >
                    <Send size={18} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Inline Quick-Connect Sheet */}
      <QuickConnectSheet
        isOpen={isQuickConnectOpen}
        onClose={() => setIsQuickConnectOpen(false)}
        onProfileConnected={() => {
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
      />

      {/* Candidate Picker Modal for Ensemble Dual Pass */}
      {ensembleEvaluation && (
        <EnsembleCandidatePickerModal
          evaluationResult={ensembleEvaluation}
          onSelectCandidate={(chosenCandidate) => {
            if (chosenCandidate.patches.length > 0) {
              setPendingPatches(chosenCandidate.patches);
            }
            const chosenMessages = chosenCandidate.messages;
            setChatHistory(chosenMessages);
            setEnsembleEvaluation(null);
          }}
          onDismiss={() => setEnsembleEvaluation(null)}
        />
      )}
    </div>
  );
}
