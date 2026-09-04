import type { LLMAdapter } from '../llm/llmAdapter';
import type { PatchDefinition } from './patchSchema';
import { useAppStore } from '../../store';
import { getModelPricing, calculateEstimatedCost } from '../usage/tokenSpend';

export type ReviewFindingSeverity = 'info' | 'warning' | 'critical';

export interface ReviewFinding {
  severity: ReviewFindingSeverity;
  file: string;
  summary: string;
}

export interface FreshContextReviewOptions {
  projectId?: string;
  provider?: string;
  model?: string;
  profileLabel?: string;
}

/**
 * Fresh-context review findings are strictly ADVISORY.
 *
 * Distinct from candidate verification failures (buildRunner / testRunner) which trigger
 * the autonomous repair loop, and distinct from secret findings (isSecurityFailure) which
 * hard-block patch publication to prevent credential leakage, fresh-context review findings
 * NEVER block user patch approval and NEVER feed the repair loop. They provide independent
 * critique for the human reviewer to inspect alongside diff hunks in PatchReviewSheet.
 */
export async function runFreshContextReview(
  patches: PatchDefinition[],
  userRequest: string,
  adapter: LLMAdapter,
  signal?: AbortSignal,
  options?: FreshContextReviewOptions
): Promise<ReviewFinding[]> {
  if (!patches || patches.length === 0) {
    return [];
  }

  const formatPatches = (patchList: PatchDefinition[]) => {
    return patchList
      .map(
        (p) =>
          `--- ${p.path} (${p.type})\nRationale: ${p.rationale || 'None'}\n\`\`\`\n${p.newContent || '(file deleted)'}\n\`\`\``
      )
      .join('\n\n');
  };

  const systemPrompt = `You are an expert, independent Code Reviewer acting as an adversarial fresh-context second pass.
Your goal is to actively hunt for problems, bugs, security vulnerabilities, edge-case regressions, and severe style or correctness flaws in the proposed patches.
Do not flatter or agree with the author. Be skeptical, rigorous, and direct.
If the patches are sound and contain no notable issues, return an empty list of findings.

You MUST return your findings strictly as a JSON object matching this schema:
{
  "findings": [
    {
      "severity": "info" | "warning" | "critical",
      "file": "path/to/file",
      "summary": "Specific, actionable critique of the flaw found"
    }
  ]
}`;

  const userPrompt = `Original User Request:
${userRequest || '(No user request specified)'}

Proposed Code Patches:
${formatPatches(patches)}

Task:
Critique the proposed changes for correctness, security, performance, regression risks, and alignment with the original request.
Return a structured JSON object with findings. If no issues exist, return { "findings": [] }.`;

  try {
    const response = await adapter.send({
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt,
      temperature: 0.1,
      signal
    });

    // Reuse the Arbiter's tolerant JSON extraction (text.match(/\{[\s\S]*\}/))
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const findings: ReviewFinding[] = [];

    if (parsed && Array.isArray(parsed.findings)) {
      for (const item of parsed.findings) {
        if (
          item &&
          typeof item === 'object' &&
          typeof item.summary === 'string' &&
          (item.severity === 'info' || item.severity === 'warning' || item.severity === 'critical')
        ) {
          findings.push({
            severity: item.severity,
            file: typeof item.file === 'string' && item.file ? item.file : (patches[0]?.path || 'general'),
            summary: item.summary.trim()
          });
        }
      }
    }

    // Record token usage with category 'fresh_context_review'
    try {
      const inputTokens = response.usage?.inputTokens ?? 0;
      const outputTokens = response.usage?.outputTokens ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        const provider = options?.provider || 'assistant';
        const model = options?.model || 'assistant';
        const pricing = getModelPricing(provider, model);
        const cost = calculateEstimatedCost(inputTokens, outputTokens, pricing);
        useAppStore.getState().recordTokenUsage({
          projectId: options?.projectId,
          provider,
          model,
          profileLabel: options?.profileLabel,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCostUsd: cost,
          category: 'fresh_context_review',
          promptPreview: 'Fresh-context review pass',
          stepCount: 1
        });
      }
    } catch (tokenErr) {
      console.warn('Failed to record fresh-context review token usage:', tokenErr);
    }

    return findings;
  } catch (err) {
    if (signal?.aborted) {
      throw err;
    }
    console.warn('Fresh-context review failed:', err);
    return [];
  }
}
