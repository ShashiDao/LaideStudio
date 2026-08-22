import { OpenAICompatibleProvider } from './openaiCompatible';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model: string = 'gpt-4o') {
    super('https://api.openai.com/v1', apiKey, model);
  }
}
