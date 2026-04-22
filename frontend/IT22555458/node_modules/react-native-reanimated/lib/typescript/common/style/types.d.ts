import type { AnyRecord, ConfigPropertyAlias, ValueProcessor } from '../types';
type PropertyValueConfigBase<P extends AnyRecord> = boolean | ConfigPropertyAlias<P>;
type PropsBuilderPropertyConfig<P extends AnyRecord, K extends keyof P = keyof P> = PropertyValueConfigBase<P> | {
    process: ValueProcessor<Required<P>[K], any>;
};
export type PropsBuilderConfig<P extends AnyRecord = AnyRecord> = {
    [K in keyof Required<P>]: PropsBuilderPropertyConfig<P, K>;
};
export {};
//# sourceMappingURL=types.d.ts.map