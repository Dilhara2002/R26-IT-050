'use strict';

import { WorkletsError } from '../debug/WorkletsError';
import { runOnRuntimeSyncWithId as BundleRunOnRuntimeSyncFromId, scheduleOnRuntimeWithId as BundleScheduleOnRuntimeFromId } from '../runtimes';
import { runOnUIAsync as BundleRuntimeRunOnUIAsync } from '../threads';
import { createSerializable } from './serializable';
import { serializableMappingCache } from './serializableMappingCache';
export function __installUnpacker() {
  let runOnRuntimeSyncFromId;
  let memoize;
  let scheduleOnRuntimeFromId;
  let runOnUIAsync;
  let serializer;
  if (globalThis.__RUNTIME_KIND === 1 || globalThis._WORKLETS_BUNDLE_MODE_ENABLED) {
    serializer = createSerializable;
    memoize = serializableMappingCache.set.bind(serializableMappingCache);
    runOnRuntimeSyncFromId = BundleRunOnRuntimeSyncFromId;
    scheduleOnRuntimeFromId = BundleScheduleOnRuntimeFromId;
    runOnUIAsync = BundleRuntimeRunOnUIAsync;
  } else {
    // Serializer can't be inlined here because it might be yet undefined
    // when the unpacker is installed.
    serializer = value => globalThis.__serializer(value);
    memoize = () => {
      // No-op on Worklet Runtimes outside of Bundle Mode.
    };
    const proxy = globalThis.__workletsModuleProxy;
    runOnRuntimeSyncFromId = (hostId, worklet, ...args) => {
      const serializedWorklet = serializer(() => {
        'worklet';

        return globalThis.__serializer(worklet(...args));
      });
      return proxy.runOnRuntimeSyncWithId(hostId, serializedWorklet);
    };
    scheduleOnRuntimeFromId = (hostId, worklet, ...args) => {
      proxy.scheduleOnRuntimeWithId(hostId, serializer(() => {
        'worklet';

        return globalThis.__serializer(worklet(...args));
      }));
    };
    runOnUIAsync = () => {
      throw new WorkletsError('runOnUIAsync is not supported on Worklet Runtimes yet');
    };
  }
  function shareableGuestUnpacker(hostId, shareableRef, guestDecorator) {
    let shareableGuest = shareableRef;
    shareableGuest.isHost = false;
    shareableGuest.__shareableRef = true;
    const get = () => {
      'worklet';

      return shareableGuest.value;
    };
    const setWithValue = value => {
      'worklet';

      shareableGuest.value = value;
    };
    const setWithSetter = setter => {
      'worklet';

      const currentValue = shareableGuest.value;
      const newValue = setter(currentValue);
      shareableGuest.value = newValue;
    };
    shareableGuest.getAsync = () => {
      return runOnUIAsync(get);
    };
    shareableGuest.getSync = () => {
      return runOnRuntimeSyncFromId(hostId, get);
    };
    shareableGuest.setAsync = value => {
      if (typeof value === 'function') {
        scheduleOnRuntimeFromId(hostId, setWithSetter, value);
      } else {
        scheduleOnRuntimeFromId(hostId, setWithValue, value);
      }
    };
    shareableGuest.setSync = value => {
      if (typeof value === 'function') {
        runOnRuntimeSyncFromId(hostId, setWithSetter, value);
      } else {
        runOnRuntimeSyncFromId(hostId, setWithValue, value);
      }
    };
    if (guestDecorator) {
      shareableGuest = guestDecorator(shareableGuest);
    }
    memoize(shareableGuest, shareableRef);
    return shareableGuest;
  }
  globalThis.__shareableGuestUnpacker = shareableGuestUnpacker;
}
//# sourceMappingURL=shareableGuestUnpacker.native.js.map