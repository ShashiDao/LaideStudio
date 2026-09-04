// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFreshContextReview } from './review';
import type { LLMAdapter, LLMRequest } from '../llm/llmAdapter';
import type { PatchDefinition } from './patchSchema';
import { useAppStore } from '../../store';

describe('Fresh-Context Reviewer (runFreshContextReview)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.getState().clearSessionUsage();
    useAppStore.getState().clearPendingPatches();
  });

  const samplePatches: PatchDefinition[] = [
    {
      type: 'replace',
      path: '/src/auth.ts',
      newContent: 'export function verify(token: string) { return true; }',
      rationale: 'Implement auth verification'
    }
  ];

  it('returns empty array if no patches provided', async () => {
    const mockAdapter: LLMAdapter = {
      countTokens: vi.fn().mockResolvedValue(10),
      send: vi.fn(),
      stream: vi.fn()
    };

    const findings = await runFreshContextReview([], 'check auth', mockAdapter);
    expect(findings).toEqual([]);
    expect(mockAdapter.send).not.toHaveBeenCalled();
  });

  it('calls adapter.send with adversarial system prompt and formatted diff with user request', async () => {
    let capturedReq: LLMRequest | null = null;
    const mockAdapter: LLMAdapter = {
      countTokens: vi.fn().mockResolvedValue(10),
      send: vi.fn().mockImplementation(async (req: LLMRequest) => {
        capturedReq = req;
        return {
          text: JSON.stringify({
            findings: [
              {
                severity: 'critical',
                file: '/src/auth.ts',
                summary: 'Function returns true unconditionally, bypassing all security'
              }
            ]
          }),
          usage: { inputTokens: 50, outputTokens: 25 }
        };
      }),
      stream: vi.fn()
    };

    const findings = await runFreshContextReview(
      samplePatches,
      'Add authentication verification',
      mockAdapter,
      undefined,
      { projectId: 'proj-1', provider: 'openai', model: 'gpt-4o' }
    );

    expect(capturedReq).toBeDefined();
    expect(capturedReq!.systemPrompt).toContain('adversarial');
    expect(capturedReq!.systemPrompt).toContain('hunt for problems');
    expect(capturedReq!.messages[0].content).toContain('Add authentication verification');
    expect(capturedReq!.messages[0].content).toContain('/src/auth.ts');
    expect(capturedReq!.messages[0].content).toContain('export function verify');

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      severity: 'critical',
      file: '/src/auth.ts',
      summary: 'Function returns true unconditionally, bypassing all security'
    });

    // Verify token usage logged with category 'fresh_context_review'
    const records = useAppStore.getState().sessionUsageRecords;
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('fresh_context_review');
    expect(records[0].inputTokens).toBe(50);
    expect(records[0].outputTokens).toBe(25);
  });

  it('uses tolerant extraction for markdown-fenced or decorated JSON output', async () => {
    const rawOutput = `Here is my critique of the code patches:
\`\`\`json
{
  "findings": [
    {
      "severity": "warning",
      "file": "/src/auth.ts",
      "summary": "Missing error handling for empty or null token"
    },
    {
      "severity": "info",
      "file": "/src/auth.ts",
      "summary": "Consider documenting return signature"
    }
  ]
}
\`\`\`
Hope this helps improve the code.`;

    const mockAdapter: LLMAdapter = {
      countTokens: vi.fn().mockResolvedValue(10),
      send: vi.fn().mockResolvedValue({
        text: rawOutput,
        usage: { inputTokens: 40, outputTokens: 20 }
      }),
      stream: vi.fn()
    };

    const findings = await runFreshContextReview(
      samplePatches,
      'Review changes',
      mockAdapter
    );

    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].file).toBe('/src/auth.ts');
    expect(findings[0].summary).toBe('Missing error handling for empty or null token');
    expect(findings[1].severity).toBe('info');
  });

  it('handles empty findings object cleanly', async () => {
    const mockAdapter: LLMAdapter = {
      countTokens: vi.fn().mockResolvedValue(10),
      send: vi.fn().mockResolvedValue({
        text: '{"findings": []}',
        usage: { inputTokens: 20, outputTokens: 5 }
      }),
      stream: vi.fn()
    };

    const findings = await runFreshContextReview(samplePatches, 'Review', mockAdapter);
    expect(findings).toEqual([]);
  });

  it('returns empty array gracefully on invalid or missing JSON without throwing', async () => {
    const mockAdapter: LLMAdapter = {
      countTokens: vi.fn().mockResolvedValue(10),
      send: vi.fn().mockResolvedValue({
        text: 'I could not find anything wrong, everything looks great!',
        usage: { inputTokens: 20, outputTokens: 5 }
      }),
      stream: vi.fn()
    };

    const findings = await runFreshContextReview(samplePatches, 'Review', mockAdapter);
    expect(findings).toEqual([]);
  });

  it('filters out malformed finding items with invalid severity or missing summary', async () => {
    const mockAdapter: LLMAdapter = {
      countTokens: vi.fn().mockResolvedValue(10),
      send: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          findings: [
            { severity: 'invalid_sev', file: '/src/auth.ts', summary: 'invalid severity' },
            { severity: 'warning', file: '/src/auth.ts' }, // missing summary
            { severity: 'warning', file: '', summary: 'Valid finding with fallback file' }
          ]
        }),
        usage: { inputTokens: 20, outputTokens: 5 }
      }),
      stream: vi.fn()
    };

    const findings = await runFreshContextReview(samplePatches, 'Review', mockAdapter);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].file).toBe('/src/auth.ts'); // falls back to first patch file
    expect(findings[0].summary).toBe('Valid finding with fallback file');
  });

  it('re-throws when AbortSignal is aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const mockAdapter: LLMAdapter = {
      countTokens: vi.fn().mockResolvedValue(10),
      send: vi.fn().mockImplementation(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      }),
      stream: vi.fn()
    };

    await expect(
      runFreshContextReview(samplePatches, 'Review', mockAdapter, abortController.signal)
    ).rejects.toThrow();
  });
});
