/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { RetrievalQAChain } from 'langchain/chains';
import { BufferMemory, ChatMessageHistory } from 'langchain/memory';
import { ChainTool, Tool } from 'langchain/tools';
import { PassThrough, Readable } from 'stream';
import { ActionsClientLlm } from '../llm/actions_client_llm';
import { ElasticsearchStore } from '../elasticsearch_store/elasticsearch_store';
import { KNOWLEDGE_BASE_INDEX_PATTERN } from '../../../routes/knowledge_base/constants';
import type { AgentExecutorParams, AgentExecutorResponse } from '../executors/types';

export const DEFAULT_AGENT_EXECUTOR_ID = 'Elastic AI Assistant Agent Executor';

/**
 * The default agent executor used by the Elastic AI Assistant. Main agent/chain that wraps the ActionsClientLlm,
 * sets up a conversation BufferMemory from chat history, and registers tools like the ESQLKnowledgeBaseTool.
 *
 */
export const callAgentExecutor = async ({
  actions,
  connectorId,
  esClient,
  langChainMessages,
  llmType,
  logger,
  request,
  elserId,
  kbResource,
  traceOptions,
}: AgentExecutorParams): AgentExecutorResponse => {
  const llm = new ActionsClientLlm({
    actions,
    connectorId,
    request,
    llmType,
    logger,
    streaming: true,
  });

  const pastMessages = langChainMessages.slice(0, -1); // all but the last message
  const latestMessage = langChainMessages.slice(-1); // the last message

  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    memoryKey: 'chat_history', // this is the key expected by https://github.com/langchain-ai/langchainjs/blob/a13a8969345b0f149c1ca4a120d63508b06c52a5/langchain/src/agents/initialize.ts#L166
    inputKey: 'input',
    outputKey: 'output',
    returnMessages: true,
  });

  // ELSER backed ElasticsearchStore for Knowledge Base
  const esStore = new ElasticsearchStore(
    esClient,
    KNOWLEDGE_BASE_INDEX_PATTERN,
    logger,
    elserId,
    kbResource
  );

  const modelExists = await esStore.isModelInstalled();
  if (!modelExists) {
    throw new Error(
      'Please ensure ELSER is configured to use the Knowledge Base, otherwise disable the Knowledge Base in Advanced Settings to continue.'
    );
  }

  // Create a chain that uses the ELSER backed ElasticsearchStore, override k=10 for esql query generation for now
  const chain = RetrievalQAChain.fromLLM(llm, esStore.asRetriever(10));

  // TODO: Dependency inject these tools
  const tools: Tool[] = [
    new ChainTool({
      name: 'ESQLKnowledgeBaseTool',
      description:
        'Call this for knowledge on how to build an ESQL query, or answer questions about the ES|QL query language.',
      chain,
      tags: ['esql', 'query-generation', 'knowledge-base'],
    }),
  ];

  // // Sets up tracer for tracing executions to APM. See x-pack/plugins/elastic_assistant/server/lib/langchain/tracers/README.mdx
  // // If LangSmith env vars are set, executions will be traced there as well. See https://docs.smith.langchain.com/tracing
  // const apmTracer = new APMTracer({ projectName: traceOptions?.projectName ?? 'default' }, logger);
  //
  // let traceData;
  //
  // // Wrap executor call with an APM span for instrumentation
  // await withAssistantSpan(DEFAULT_AGENT_EXECUTOR_ID, async (span) => {
  //   if (span?.transaction?.ids['transaction.id'] != null && span?.ids['trace.id'] != null) {
  //     traceData = {
  //       // Transactions ID since this span is the parent
  //       transaction_id: span.transaction.ids['transaction.id'],
  //       trace_id: span.ids['trace.id'],
  //     };
  //     span.addLabels({ evaluationId: traceOptions?.evaluationId });
  //   }
  //
  //   return executor.call(
  //     { input: latestMessage[0].content },
  //     {
  //       callbacks: [apmTracer, ...(traceOptions?.tracers ?? [])],
  //       runName: DEFAULT_AGENT_EXECUTOR_ID,
  //       tags: traceOptions?.tags ?? [],
  //     }
  //   );
  // });

  const executor = await initializeAgentExecutorWithOptions(tools, llm, {
    agentType: 'chat-conversational-react-description',
    // agentType: 'zero-shot-react-description',
    returnIntermediateSteps: true,
    memory,
    verbose: true,
  });
  console.log('WE ARE HERE before stream call');
  const resp = await executor.stream({ input: latestMessage[0].content, chat_history: [] });
  const textEncoder = new TextEncoder();
  async function* generate() {
    for await (const chunk of resp) {
      console.log('WE ARE HERE CHUNK', chunk);
      yield textEncoder.encode(JSON.stringify(chunk));
    }
  }

  const readable = Readable.from(generate());

  return readable.pipe(new PassThrough());
};
