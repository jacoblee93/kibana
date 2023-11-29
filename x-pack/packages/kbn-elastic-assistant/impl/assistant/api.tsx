/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { OpenAiProviderType } from '@kbn/stack-connectors-plugin/public/common';

import { HttpSetup, IHttpFetchError } from '@kbn/core-http-browser';
import type { Conversation, Message } from '../assistant_context/types';
import { API_ERROR } from './translations';
import { MODEL_GPT_3_5_TURBO } from '../connectorland/models/model_selector/model_selector';
import { PerformEvaluationParams } from './settings/evaluation_settings/use_perform_evaluation';

export interface FetchConnectorExecuteAction {
  assistantLangChain: boolean;
  apiConfig: Conversation['apiConfig'];
  http: HttpSetup;
  messages: Message[];
  signal?: AbortSignal | undefined;
}

export interface FetchConnectorExecuteResponse {
  response: string | ReadableStreamDefaultReader<Uint8Array>;
  isError: boolean;
  isStream: boolean;
  traceData?: {
    transactionId: string;
    traceId: string;
  };
}

export const fetchConnectorExecuteAction = async ({
  assistantLangChain,
  http,
  messages,
  apiConfig,
  signal,
}: FetchConnectorExecuteAction): Promise<FetchConnectorExecuteResponse> => {
  const outboundMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const body =
    apiConfig?.provider === OpenAiProviderType.OpenAi
      ? {
          model: apiConfig.model ?? MODEL_GPT_3_5_TURBO,
          messages: outboundMessages,
          n: 1,
          stop: null,
          temperature: 0.2,
        }
      : {
          // Azure OpenAI and Bedrock invokeAI both expect this body format
          messages: outboundMessages,
        };

  const requestBody = !assistantLangChain
    ? {
        params: {
          subActionParams: body,
          subAction: 'invokeStream',
        },
        assistantLangChain,
      }
    : // langchain handles streaming by taking the full text from the LLM invokeAI response
      // and streaming it back to the client with their special chain of actions
      {
        params: {
          subActionParams: body,
          subAction: 'invokeAI',
        },
        assistantLangChain,
      };

  try {
    console.log('WE ARE HERE before fetch');
    const response = await http.fetch(
      `/internal/elastic_assistant/actions/connector/${apiConfig?.connectorId}/_execute`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
        signal,
        asResponse: true,
        rawResponse: true,
      }
    );
    console.log('WE ARE HERE after fetch with RESPONSE????', response?.response);

    const reader = response?.response?.body?.getReader();

    if (!reader) {
      return {
        response: `${API_ERROR}\n\nCould not get reader from response`,
        isError: true,
        isStream: false,
      };
    }
    return {
      response: reader,
      isStream: true,
      isError: false,
    };
    // // might need this still???
    //   response: assistantLangChain ? getFormattedMessageContent(response.data) : response.data,
  } catch (error) {
    console.log('WE ARE HERE error 1', error);
    const reader = error?.response?.body?.getReader();

    if (!reader) {
      return {
        response: `${API_ERROR}\n\n${error?.body?.message ?? error?.message}`,
        isError: true,
        isStream: false,
      };
    }
    return {
      response: reader,
      isStream: true,
      isError: true,
    };
  }
};

export interface GetKnowledgeBaseStatusParams {
  http: HttpSetup;
  resource?: string;
  signal?: AbortSignal | undefined;
}

export interface GetKnowledgeBaseStatusResponse {
  elser_exists: boolean;
  esql_exists?: boolean;
  index_exists: boolean;
  pipeline_exists: boolean;
}

/**
 * API call for getting the status of the Knowledge Base. Provide
 * a resource to include the status of that specific resource.
 *
 * @param {Object} options - The options object.
 * @param {HttpSetup} options.http - HttpSetup
 * @param {string} [options.resource] - Resource to get the status of, otherwise status of overall KB
 * @param {AbortSignal} [options.signal] - AbortSignal
 *
 * @returns {Promise<GetKnowledgeBaseStatusResponse | IHttpFetchError>}
 */
export const getKnowledgeBaseStatus = async ({
  http,
  resource,
  signal,
}: GetKnowledgeBaseStatusParams): Promise<GetKnowledgeBaseStatusResponse | IHttpFetchError> => {
  try {
    const path = `/internal/elastic_assistant/knowledge_base/${resource || ''}`;
    const response = await http.fetch(path, {
      method: 'GET',
      signal,
    });

    return response as GetKnowledgeBaseStatusResponse;
  } catch (error) {
    return error as IHttpFetchError;
  }
};

export interface PostKnowledgeBaseParams {
  http: HttpSetup;
  resource?: string;
  signal?: AbortSignal | undefined;
}

export interface PostKnowledgeBaseResponse {
  success: boolean;
}

/**
 * API call for setting up the Knowledge Base. Provide a resource to set up a specific resource.
 *
 * @param {Object} options - The options object.
 * @param {HttpSetup} options.http - HttpSetup
 * @param {string} [options.resource] - Resource to be added to the KB, otherwise sets up the base KB
 * @param {AbortSignal} [options.signal] - AbortSignal
 *
 * @returns {Promise<PostKnowledgeBaseResponse | IHttpFetchError>}
 */
export const postKnowledgeBase = async ({
  http,
  resource,
  signal,
}: PostKnowledgeBaseParams): Promise<PostKnowledgeBaseResponse | IHttpFetchError> => {
  try {
    const path = `/internal/elastic_assistant/knowledge_base/${resource || ''}`;
    const response = await http.fetch(path, {
      method: 'POST',
      signal,
    });

    return response as PostKnowledgeBaseResponse;
  } catch (error) {
    return error as IHttpFetchError;
  }
};

export interface DeleteKnowledgeBaseParams {
  http: HttpSetup;
  resource?: string;
  signal?: AbortSignal | undefined;
}

export interface DeleteKnowledgeBaseResponse {
  success: boolean;
}

/**
 * API call for deleting the Knowledge Base. Provide a resource to delete that specific resource.
 *
 * @param {Object} options - The options object.
 * @param {HttpSetup} options.http - HttpSetup
 * @param {string} [options.resource] - Resource to be deleted from the KB, otherwise delete the entire KB
 * @param {AbortSignal} [options.signal] - AbortSignal
 *
 * @returns {Promise<DeleteKnowledgeBaseResponse | IHttpFetchError>}
 */
export const deleteKnowledgeBase = async ({
  http,
  resource,
  signal,
}: DeleteKnowledgeBaseParams): Promise<DeleteKnowledgeBaseResponse | IHttpFetchError> => {
  try {
    const path = `/internal/elastic_assistant/knowledge_base/${resource || ''}`;
    const response = await http.fetch(path, {
      method: 'DELETE',
      signal,
    });

    return response as DeleteKnowledgeBaseResponse;
  } catch (error) {
    return error as IHttpFetchError;
  }
};

export interface PostEvaluationParams {
  http: HttpSetup;
  evalParams?: PerformEvaluationParams;
  signal?: AbortSignal | undefined;
}

export interface PostEvaluationResponse {
  evaluationId: string;
  success: boolean;
}

/**
 * API call for evaluating models.
 *
 * @param {Object} options - The options object.
 * @param {HttpSetup} options.http - HttpSetup
 * @param {string} [options.evalParams] - Params necessary for evaluation
 * @param {AbortSignal} [options.signal] - AbortSignal
 *
 * @returns {Promise<PostEvaluationResponse | IHttpFetchError>}
 */
export const postEvaluation = async ({
  http,
  evalParams,
  signal,
}: PostEvaluationParams): Promise<PostEvaluationResponse | IHttpFetchError> => {
  try {
    const path = `/internal/elastic_assistant/evaluate`;
    const query = {
      agents: evalParams?.agents.sort()?.join(','),
      datasetName: evalParams?.datasetName,
      evaluationType: evalParams?.evaluationType.sort()?.join(','),
      evalModel: evalParams?.evalModel.sort()?.join(','),
      outputIndex: evalParams?.outputIndex,
      models: evalParams?.models.sort()?.join(','),
      projectName: evalParams?.projectName,
      runName: evalParams?.runName,
    };

    const response = await http.fetch(path, {
      method: 'POST',
      body: JSON.stringify({
        dataset: JSON.parse(evalParams?.dataset ?? '[]'),
        evalPrompt: evalParams?.evalPrompt ?? '',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      query,
      signal,
    });

    return response as PostEvaluationResponse;
  } catch (error) {
    return error as IHttpFetchError;
  }
};
