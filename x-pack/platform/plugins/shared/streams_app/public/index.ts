/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { PluginInitializer, PluginInitializerContext } from '@kbn/core/public';

import { StreamsAppPlugin } from './plugin';
import type {
  StreamsAppPublicSetup,
  StreamsAppPublicStart,
  StreamsAppSetupDependencies,
  StreamsAppStartDependencies,
  ConfigSchema,
  StreamsApplicationComponentType,
  StreamsApplicationProps,
} from './types';
import { StreamsAppLocatorParams } from './app_locator';

export type {
  StreamsAppPublicSetup,
  StreamsAppPublicStart,
  StreamsApplicationComponentType,
  StreamsApplicationProps,
  StreamsAppLocatorParams,
};

export const plugin: PluginInitializer<
  StreamsAppPublicSetup,
  StreamsAppPublicStart,
  StreamsAppSetupDependencies,
  StreamsAppStartDependencies
> = (pluginInitializerContext: PluginInitializerContext<ConfigSchema>) =>
  new StreamsAppPlugin(pluginInitializerContext);
