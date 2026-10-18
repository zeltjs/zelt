import type { TxikiApp, TxikiAppOptions } from '@zeltjs/adapter-txiki';
import { onTxiki } from '@zeltjs/adapter-txiki';
import type { ConfiguredFeature, FeatureApp } from '@zeltjs/core';

export type TinyjsAppOptions = Omit<TxikiAppOptions, 'signals'>;

export type TinyjsApp<F extends readonly ConfiguredFeature[]> = TxikiApp<F>;

/** @throws {TypeError | AggregateError | ZeltLifecycleStateError} */
export const onTinyjs = <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: TinyjsAppOptions = {},
): Promise<TinyjsApp<F>> => onTxiki(app, { ...options, signals: false });
