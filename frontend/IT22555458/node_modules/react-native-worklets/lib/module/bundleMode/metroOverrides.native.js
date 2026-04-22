'use strict';

import { WorkletsError } from '../debug/WorkletsError';
import { isWorkletRuntime } from '../runtimeKind';

/**
 * Evaluating HMR updates on Worklet Runtimes leads to verbose warnings which
 * don't affect runtime. This function silences those warnings by providing a
 * dummy Refresh module to the global scope.
 *
 * Use only in dev builds.
 */
export function silenceHMRWarnings() {
  assertWorkletRuntime('silenceHMRWarnings');
  const Refresh = new Proxy({}, {
    get() {
      return () => {};
    }
  });
  globalThis.__r.Refresh = Refresh;
}

/**
 * Importing `react-native` on Worklet Runtimes will result in a crash due to
 * the fact that React Native will try to set itself up as on the React Native
 * runtime. To provide better developer experience we override the main React
 * Native module with a proxy that puts an actionable warning.
 *
 * Note that this doesn't affect deep imports.
 *
 * Use only in dev builds.
 */
export function disallowRNImports() {
  assertWorkletRuntime('disallowRNImports');
  const modules = require.getModules();
  const ReactNativeModuleId = require.resolveWeak('react-native');
  const moduleFactory = makeModuleFactory(module => {
    module.exports = new Proxy({}, {
      get: function get(_target, prop) {
        globalThis.console.warn(`You tried to import '${String(prop)}' from 'react-native' module on a Worklet Runtime. Using 'react-native' module on a Worklet Runtime is not allowed.`,
        // eslint-disable-next-line reanimated/use-worklets-error
        new Error().stack);
        return {
          get() {
            return undefined;
          }
        };
      }
    });
  });
  const mockModule = {
    dependencyMap: [],
    moduleFactory,
    hasError: false,
    importedAll: {},
    importedDefault: {},
    isInitialized: false,
    publicModule: {
      exports: {}
    }
  };
  modules.set(ReactNativeModuleId, mockModule);
}

/**
 * To use code from React Native that obtains TurboModules we need to mock the
 * registry even if the TurboModules aren't actually used.
 *
 * This is needed for example for the XHR setup code that is imported from React
 * Native.
 */
export function mockTurboModuleRegistry() {
  const modules = require.getModules();
  const TurboModuleRegistryId = require.resolveWeak('react-native/Libraries/TurboModule/TurboModuleRegistry');
  const TurboModules = new Map();
  TurboModules.set('Networking', {});
  globalThis.TurboModules = TurboModules;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleFactory = makeModuleFactory(module => {
    function get(name) {
      return globalThis.TurboModules.get(name);
    }
    function getEnforcing(name) {
      return globalThis.TurboModules.get(name);
    }
    module.exports.get = get;
    module.exports.getEnforcing = getEnforcing;
  });
  const metroModule = {
    dependencyMap: [],
    factory: moduleFactory,
    hasError: false,
    importedAll: {},
    importedDefault: {},
    isInitialized: false,
    publicModule: {
      exports: {}
    }
  };
  modules.set(TurboModuleRegistryId, metroModule);
}
function assertWorkletRuntime(functionName) {
  if (!isWorkletRuntime()) {
    throw new WorkletsError(`${functionName} can be used only on Worklet Runtimes.`);
  }
}

/** Module factory mimicking the one used by Metro bundler. */
function makeModuleFactory(moduleImpl) {
  return function (_global, _require, _importDefault, _importAll, module, _exports, _dependencyMap) {
    moduleImpl(module);
  };
}
//# sourceMappingURL=metroOverrides.native.js.map