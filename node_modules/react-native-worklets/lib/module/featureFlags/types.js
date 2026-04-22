'use strict';

/**
 * This constant is needed for typechecking and preserving static typechecks in
 * generated .d.ts files. Without it, the static flags resolve to an object
 * without specific keys.
 */
export const DefaultStaticFeatureFlags = {
  RUNTIME_TEST_FLAG: false,
  FETCH_PREVIEW_ENABLED: false,
  IOS_DYNAMIC_FRAMERATE_ENABLED: true
};
//# sourceMappingURL=types.js.map