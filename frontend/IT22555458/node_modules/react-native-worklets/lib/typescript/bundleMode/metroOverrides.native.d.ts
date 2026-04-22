/**
 * Evaluating HMR updates on Worklet Runtimes leads to verbose warnings which
 * don't affect runtime. This function silences those warnings by providing a
 * dummy Refresh module to the global scope.
 *
 * Use only in dev builds.
 */
export declare function silenceHMRWarnings(): void;
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
export declare function disallowRNImports(): void;
/**
 * To use code from React Native that obtains TurboModules we need to mock the
 * registry even if the TurboModules aren't actually used.
 *
 * This is needed for example for the XHR setup code that is imported from React
 * Native.
 */
export declare function mockTurboModuleRegistry(): void;
//# sourceMappingURL=metroOverrides.native.d.ts.map