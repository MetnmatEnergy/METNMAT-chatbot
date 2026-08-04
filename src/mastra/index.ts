
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';

import { intentClassifierAgent } from './agents/intent-classifier.agent';
import { issueAgent } from './agents/issue-creation.agent';
import { salesAgent } from './agents/sales.agent';
import { languageFormatterAgent } from './agents/language-formatter.agent';
import { widgetAgent } from './agents/widget.agent';
import { mastraStorage } from './storage';

export { mastraStorage } from './storage';

export const mastra = new Mastra({

  agents: {
    "intent-classifier-agent": intentClassifierAgent,
    "sales-agent": salesAgent,
    "issue-creation-agent": issueAgent,
    "widget-agent": widgetAgent,
    "language-formatter-agent": languageFormatterAgent,
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  storage: mastraStorage,
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Mastra Studio
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
