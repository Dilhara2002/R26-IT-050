'use strict';

import { WorkletsError } from '../debug/WorkletsError';

/**
 * Creates a new {@link Shareable} holding the provided initial value. You must
 * explicitly declare which Worklet Runtime will host the Shareable by passing
 * its `runtimeId`.
 *
 * Currently only hosting a Shareable on the UI Runtime is supported.
 *
 * @param hostRuntimeId - The `runtimeId` of the Worklet Runtime that will host
 *   the Shareable. Use {@link UIRuntimeId}.
 * @param initial - The initial value of the Shareable.
 * @param config - Optional advanced configuration.
 * @returns The created {@link Shareable}.
 * @see {@link https://docs.swmansion.com/react-native-worklets/docs/memory/createShareable | createShareable docs}
 */

/**
 * @deprecated Only UI host runtime is supported now. Use {@link UIRuntimeId} as
 *   the `hostRuntimeId` argument.
 */

export function createShareable(_hostRuntimeId, _initial, _config) {
  throw new WorkletsError('`createShareable` is not supported on web.');
}
//# sourceMappingURL=shareable.js.map