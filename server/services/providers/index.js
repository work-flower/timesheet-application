import * as jiraProvider from './jiraProvider.js';
import * as azureDevOpsProvider from './azureDevOpsProvider.js';

const providers = {
  jira: jiraProvider,
  'azure-devops': azureDevOpsProvider,
};

export function getProvider(type) {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown ticket source type: ${type}`);
  return provider;
}
