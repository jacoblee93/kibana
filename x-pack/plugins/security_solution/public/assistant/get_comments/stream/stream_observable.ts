/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { concatMap, delay, finalize, Observable, of, scan, shareReplay, timestamp } from 'rxjs';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import type { Dispatch, SetStateAction } from 'react';
import { API_ERROR } from '@kbn/elastic-assistant/impl/assistant/translations';
import type { PromptObservableState, Chunk } from './types';

const MIN_DELAY = 35;
const errorChoice = {
  delta: {
    role: '',
    content: `${API_ERROR}\n\n`,
  },
  index: 0 as const,
  finish_reason: null,
};
const errorChunk: Chunk = {
  id: '',
  object: '',
  created: 12,
  model: '',
  choices: [errorChoice],
};
/**
 * Returns an Observable that reads data from a ReadableStream and emits values representing the state of the data processing.
 *
 * @param reader - The ReadableStreamDefaultReader used to read data from the stream.
 * @param setLoading - A function to update the loading state.
 * @returns {Observable<PromptObservableState>} An Observable that emits PromptObservableState
 */
export const getStreamObservable = (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  isError: boolean
): Observable<PromptObservableState> =>
  new Observable<PromptObservableState>((observer) => {
    observer.next({ chunks: [], loading: true });
    const decoder = new TextDecoder();
    const chunks: Chunk[] = [...(isError ? [errorChunk] : [])];
    function read() {
      reader
        .read()
        .then(({ done, value }: { done: boolean; value?: Uint8Array }) => {
          try {
            if (done) {
              observer.next({
                chunks,
                message: getMessageFromChunks(chunks),
                loading: false,
              });
              observer.complete();
              return;
            }
            const codec = new EventStreamCodec(toUtf8, fromUtf8);
            const event = codec.decode(value);
            const body = JSON.parse(
              Buffer.from(
                JSON.parse(new TextDecoder('utf-8').decode(event.body)).bytes,
                'base64'
              ).toString()
            );
            console.log('do we get here???', { done });
            console.log('body???', body);

            const bedrockChunk = {
              ...errorChunk,
              choices: [
                {
                  ...errorChoice,
                  delta: {
                    ...errorChoice.delta,
                    content: body.completion,
                  },
                },
              ],
            };
            if (false) {
              const nextChunks: Chunk[] = isError
                ? decoder
                    .decode(value)
                    .split('\n')
                    .map((line) => JSON.parse(line))
                    // we return a raw error of {message: string; status_code: number }
                    .map((all) => {
                      console.log('ALLL???', all);
                      const { message }: { message: string } = all;
                      return {
                        ...errorChunk,
                        choices: [
                          {
                            ...errorChoice,
                            delta: {
                              ...errorChoice.delta,
                              content: message,
                            },
                          },
                        ],
                      };
                    })
                : decoder
                    .decode(value)
                    .split('\n')
                    // every line starts with "data: ", we remove it and are left with stringified JSON or the string "[DONE]"
                    .map((str) => str.substring(6))
                    // filter out empty lines and the "[DONE]" string
                    .filter((str) => !!str && str !== '[DONE]')
                    .map((line) => JSON.parse(line));
            }
            console.log('bedrockChunk????', bedrockChunk);
            // nextChunks.forEach((chunk) => {
            chunks.push(bedrockChunk);
            const message = getMessageFromChunks(chunks);
            console.log('MESSAGE????', message);
            observer.next({
              chunks,
              message: getMessageFromChunks(chunks),
              loading: true,
            });
            // });
          } catch (err) {
            observer.error(err);
            return;
          }
          read();
        })
        .catch((err) => {
          observer.error(err);
        });
    }
    read();
    return () => {
      reader.cancel();
    };
  }).pipe(
    // make sure the request is only triggered once,
    // even with multiple subscribers
    shareReplay(1),
    // append a timestamp of when each value was emitted
    timestamp(),
    // use the previous timestamp to calculate a target
    // timestamp for emitting the next value
    scan((acc, value) => {
      const lastTimestamp = acc.timestamp || 0;
      const emitAt = Math.max(lastTimestamp + MIN_DELAY, value.timestamp);
      return {
        timestamp: emitAt,
        value: value.value,
      };
    }),
    // add the delay based on the elapsed time
    // using concatMap(of(value).pipe(delay(50))
    // leads to browser issues because timers
    // are throttled when the tab is not active
    concatMap((value) => {
      const now = Date.now();
      const delayFor = value.timestamp - now;

      if (delayFor <= 0) {
        return of(value.value);
      }

      return of(value.value).pipe(delay(delayFor));
    }),
    // set loading to false when the observable completes or errors out
    finalize(() => setLoading(false))
  );

function getMessageFromChunks(chunks: Chunk[]) {
  return chunks.map((chunk) => chunk.choices[0]?.delta.content ?? '').join('');
}

export const getPlaceholderObservable = () => new Observable<PromptObservableState>();
