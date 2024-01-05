/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { KibanaRequest, Logger } from '@kbn/core/server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { get } from 'lodash/fp';

import { BaseChatModel } from 'langchain/chat_models/base';
// import { BaseMessageChunk, ChatGeneration } from 'langchain/schema';
import { AIMessage, BaseMessage, ChatResult } from 'langchain/schema';
import { getMessageContentAndRole } from '../helpers';
import { RequestBody } from '../types';

const LLM_TYPE = 'ActionsClientLlm';

interface ActionsClientLlmParams {
  actions: ActionsPluginStart;
  connectorId: string;
  llmType?: string;
  logger: Logger;
  request: KibanaRequest<unknown, unknown, RequestBody>;
  streaming?: boolean;
  traceId?: string;
}

export class ActionsClientLlm extends BaseChatModel {
  #actions: ActionsPluginStart;
  #connectorId: string;
  #logger: Logger;
  #request: KibanaRequest<unknown, unknown, RequestBody>;
  #actionResultData: string;
  streaming = false;
  #traceId: string;

  // Local `llmType` as it can change and needs to be accessed by abstract `_llmType()` method
  // Not using getter as `this._llmType()` is called in the constructor via `super({})`
  protected llmType: string;

  constructor({
    actions,
    connectorId,
    traceId = uuidv4(),
    llmType,
    logger,
    request,
    streaming,
  }: ActionsClientLlmParams) {
    super({});

    this.#actions = actions;
    this.#connectorId = connectorId;
    this.#traceId = traceId;
    this.llmType = llmType ?? LLM_TYPE;
    this.#logger = logger;
    this.#request = request;
    this.#actionResultData = '';
    this.streaming = streaming ?? this.streaming;
  }

  getActionResultData(): string {
    return this.#actionResultData;
  }

  _llmType() {
    return this.llmType;
  }

  // Model type needs to be `base_chat_model` to work with LangChain OpenAI Tools
  // We may want to make this configurable (ala _llmType) if different agents end up requiring different model types
  // See: https://github.com/langchain-ai/langchainjs/blob/fb699647a310c620140842776f4a7432c53e02fa/langchain/src/agents/openai/index.ts#L185
  _modelType() {
    return 'base_chat_model';
  }

  async _call(prompt: string): Promise<string> {
    // convert the Langchain prompt to an assistant message:
    const assistantMessage = getMessageContentAndRole(prompt);
    this.#logger.debug(
      `ActionsClientLlm#_call\ntraceId: ${this.#traceId}\nassistantMessage:\n${JSON.stringify(
        assistantMessage
      )} `
    );
    // create a new connector request body with the assistant message:
    const requestBody = {
      actionId: this.#connectorId,
      params: {
        ...this.#request.body.params, // the original request body params
        subActionParams: {
          ...this.#request.body.params.subActionParams, // the original request body params.subActionParams
          messages: [assistantMessage], // the assistant message
        },
      },
    };

    // create an actions client from the authenticated request context:
    const actionsClient = await this.#actions.getActionsClientWithRequest(this.#request);

    const actionResult = await actionsClient.execute(requestBody);

    if (actionResult.status === 'error') {
      throw new Error(
        `${LLM_TYPE}: action result status is error: ${actionResult?.message} - ${actionResult?.serviceMessage}`
      );
    }

    const content = get('data.message', actionResult);

    if (typeof content !== 'string') {
      throw new Error(
        `${LLM_TYPE}: content should be a string, but it had an unexpected type: ${typeof content}`
      );
    }
    this.#actionResultData = content; // save the raw response from the connector, because that's what the assistant expects
    return content;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const prompt = messages.reduce((str, i) => str + i.content, '');
    console.log('HEREHEREHERE: prompt:', prompt);
    const response = await this._call(prompt);
    console.log('HEREHEREHERE: response:', response);
    const message = new AIMessage(response);
    if (typeof message.content !== 'string') {
      throw new Error('Cannot generate with a simple chat model when output is not a string.');
    }
    return {
      generations: [
        {
          text: message.content,
          message,
        },
      ],
    };
  }
}
