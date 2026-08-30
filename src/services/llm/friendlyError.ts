export interface FriendlyErrorAction {
  label: string;
  url: string;
}

export interface FriendlyErrorResult {
  summary: string;
  action?: FriendlyErrorAction;
}

export const RAW_ERROR_TAG_START = '<!-- RAW_ERROR_START -->';
export const RAW_ERROR_TAG_END = '<!-- RAW_ERROR_END -->';

/**
 * Transforms raw provider and network error strings into user-friendly, actionable summaries.
 */
export function toFriendlyErrorMessage(rawMessage: string): FriendlyErrorResult {
  const msg = (rawMessage || '').trim();
  const lower = msg.toLowerCase();

  // 1. OpenRouter guardrail restrictions / data policy mismatch
  // Example: OpenAI-compatible stream failed: 404 - {"message":"No endpoints available matching your guardrail restrictions and data policy...","code":404}
  if (
    (lower.includes('no endpoints available') && (lower.includes('guardrail') || lower.includes('data policy') || lower.includes('privacy'))) ||
    (lower.includes('openrouter') && (lower.includes('data policy') || lower.includes('guardrail')))
  ) {
    // Extract openrouter URL if present
    const urlMatch = msg.match(/https?:\/\/(?:www\.)?openrouter\.ai\/[^\s"',)}\]]+/i);
    const actionUrl = urlMatch ? urlMatch[0] : 'https://openrouter.ai/settings/preferences';

    return {
      summary: 'No provider endpoints match your data policy or privacy settings on OpenRouter.',
      action: {
        label: 'OpenRouter Privacy Settings',
        url: actionUrl
      }
    };
  }

  // 2. Rate limits / Quota exhaustion (HTTP 429, ResourceExhausted, etc.)
  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('ratelimit') ||
    lower.includes('too many requests') ||
    lower.includes('resource_exhausted') ||
    lower.includes('resourceexhausted') ||
    lower.includes('quota exceeded') ||
    lower.includes('insufficient_quota') ||
    lower.includes('credit limit') ||
    lower.includes('credits remaining') ||
    lower.includes('exceeded your current quota')
  ) {
    return {
      summary: 'Rate limit exceeded — please wait a moment before trying again or check your account quota.'
    };
  }

  // 3. Invalid API key / Unauthorized / Authentication failed (HTTP 401, 403, invalid_api_key, etc.)
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid_api_key') ||
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key') ||
    lower.includes('api key not valid') ||
    lower.includes('authentication') ||
    lower.includes('permission_denied') ||
    lower.includes('permissiondenied') ||
    lower.includes('api key could not be decrypted') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('forbidden')
  ) {
    return {
      summary: 'Invalid or unauthorized API key — please check your credentials in Settings.'
    };
  }

  // 4. Model not found / unavailable (HTTP 404, NOT_FOUND, model_not_found, etc.)
  if (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('not_found') ||
    lower.includes('model_not_found') ||
    lower.includes('unknown model') ||
    lower.includes('does not exist') ||
    lower.includes('does not have access to model') ||
    lower.includes('unsupported model')
  ) {
    return {
      summary: 'Model not found or unavailable — please verify the model ID in Settings.'
    };
  }

  // 5. Unmatched fallback
  return {
    summary: 'Something went wrong talking to the model provider'
  };
}

/**
 * Formats a friendly error message into a structured chat content string,
 * retaining the raw message safely for collapsible details.
 */
export function formatFriendlyErrorForChat(rawMessage: string): string {
  const { summary, action } = toFriendlyErrorMessage(rawMessage);
  let content = `⚠️ **${summary}**`;
  if (action) {
    content += `\n\n[${action.label}](${action.url})`;
  }
  if (rawMessage) {
    content += `\n\n${RAW_ERROR_TAG_START}\n${rawMessage}\n${RAW_ERROR_TAG_END}`;
  }
  return content;
}

/**
 * Parses chat content to detect if it is an error message, extracting the summary,
 * action link, and raw error details.
 */
export function parseFriendlyErrorFromMessage(content: string): {
  isError: boolean;
  summary: string;
  action?: FriendlyErrorAction;
  rawError?: string;
} {
  if (!content || typeof content !== 'string') {
    return { isError: false, summary: '' };
  }

  // Detect error prefixes or tags
  const hasWarningPrefix = content.startsWith('⚠️') || content.includes('⚠️ Request failed:');
  const hasRawErrorTag = content.includes(RAW_ERROR_TAG_START);

  if (!hasWarningPrefix && !hasRawErrorTag) {
    return { isError: false, summary: '' };
  }

  let rawError: string | undefined;
  let text = content;

  if (text.includes(RAW_ERROR_TAG_START) && text.includes(RAW_ERROR_TAG_END)) {
    const startIdx = text.indexOf(RAW_ERROR_TAG_START);
    const endIdx = text.indexOf(RAW_ERROR_TAG_END);
    rawError = text.slice(startIdx + RAW_ERROR_TAG_START.length, endIdx).trim();
    text = text.slice(0, startIdx).trim();
  }

  // Check if there is an action link
  let action: FriendlyErrorAction | undefined;
  const linkMatch = text.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  if (linkMatch) {
    action = { label: linkMatch[1], url: linkMatch[2] };
    text = text.replace(linkMatch[0], '').trim();
  }

  // Clean summary
  let summary = text
    .replace(/^⚠️\s*/, '')
    .replace(/^Request failed:\s*/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .trim();

  // If legacy un-tagged error format (e.g. `⚠️ Request failed: <raw>`), compute friendly error
  if (!rawError && (content.startsWith('⚠️ Request failed:') || !summary)) {
    const raw = content.replace(/^⚠️\s*(?:Request failed:\s*)?/, '').trim();
    const friendly = toFriendlyErrorMessage(raw);
    summary = friendly.summary;
    action = action || friendly.action;
    rawError = raw;
  }

  return {
    isError: true,
    summary: summary || 'Something went wrong talking to the model provider',
    action,
    rawError
  };
}
