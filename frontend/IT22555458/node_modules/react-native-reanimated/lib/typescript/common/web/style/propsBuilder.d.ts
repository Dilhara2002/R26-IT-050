import type { PlainStyle, UnknownRecord } from '../../types';
import type { PropsBuilderConfig } from './types';
type WebPropsBuilderConfig<P extends UnknownRecord = UnknownRecord> = PropsBuilderConfig<P>;
export declare function createWebPropsBuilder<TProps extends UnknownRecord>(config: WebPropsBuilderConfig<TProps>): {
    build(props: Partial<TProps>): string | null;
};
export declare const webPropsBuilder: {
    build(props: Partial<PlainStyle>): string | null;
};
export {};
//# sourceMappingURL=propsBuilder.d.ts.map