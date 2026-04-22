'use strict';

import { WorkletsError } from './debug/WorkletsError';
import { RuntimeKind } from './runtimeKind';
export const UIRuntimeId = RuntimeKind.UI;
export function createWorkletRuntime() {
  throw new WorkletsError('`createWorkletRuntime` is not supported on web.');
}
export function runOnRuntime() {
  throw new WorkletsError('`runOnRuntime` is not supported on web.');
}
export function scheduleOnRuntime() {
  throw new WorkletsError('`scheduleOnRuntime` is not supported on web.');
}
export function scheduleOnRuntimeWithId() {
  throw new WorkletsError('`scheduleOnRuntimeWithId` is not supported on web.');
}
export function runOnRuntimeSync() {
  throw new WorkletsError('`runOnRuntimeSync` is not supported on web.');
}
export function runOnRuntimeSyncWithId() {
  throw new WorkletsError('`runOnRuntimeSyncWithId` is not supported on web.');
}
export function runOnRuntimeAsync() {
  throw new WorkletsError('`runOnRuntimeAsync` is not supported on web.');
}
export function getUIRuntimeHolder() {
  throw new WorkletsError('`getUIRuntimeHolder` is not supported on web.');
}
export function getUISchedulerHolder() {
  throw new WorkletsError('`getUISchedulerHolder` is not supported on web.');
}
//# sourceMappingURL=runtimes.js.map