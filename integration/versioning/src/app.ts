import { createApp, http } from '@zeltjs/core';

import { AppV1Controller } from './app-v1.controller';
import { AppV2Controller } from './app-v2.controller';
import { DeepNestedV1Controller, DeepNestedV2Controller } from './deep-nested.controller';
import { DefaultVersionController } from './default-version.controller';
import { GlobalPrefixController, GlobalPrefixExcludeController } from './global-prefix.controller';
import { MiddlewareV1Controller, MiddlewareV2Controller } from './middleware.controller';
import { MultipleVersionV1Controller, MultipleVersionV2Controller } from './multiple.controller';
import {
  MultipleMiddlewareV1Controller,
  MultipleMiddlewareV2Controller,
} from './multiple-middleware.controller';
import { VersionNeutralController } from './neutral.controller';
import { NeutralMiddlewareController } from './neutral-middleware.controller';
import { NoVersioningController } from './no-versioning.controller';
import { OverrideController } from './override.controller';
import { OverridePartialController } from './override-partial.controller';

export const app = createApp([
  http({
    controllers: [
      AppV1Controller,
      AppV2Controller,
      MultipleVersionV1Controller,
      MultipleVersionV2Controller,
      NoVersioningController,
      VersionNeutralController,
      OverrideController,
      OverridePartialController,
      MiddlewareV1Controller,
      MiddlewareV2Controller,
      MultipleMiddlewareV1Controller,
      MultipleMiddlewareV2Controller,
      NeutralMiddlewareController,
      DefaultVersionController,
      GlobalPrefixController,
      GlobalPrefixExcludeController,
      DeepNestedV1Controller,
      DeepNestedV2Controller,
    ],
  }),
]);
