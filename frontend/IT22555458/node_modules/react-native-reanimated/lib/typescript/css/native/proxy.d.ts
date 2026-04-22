import type { ShadowNodeWrapper, StyleProps } from '../../commonTypes';
import type { CSSAnimationUpdates, CSSTransitionConfig, NormalizedCSSAnimationKeyframesConfig } from './types';
export declare function setViewStyle(viewTag: number, style: StyleProps): void;
export declare function markNodeAsRemovable(shadowNodeWrapper: ShadowNodeWrapper): void;
export declare function unmarkNodeAsRemovable(viewTag: number): void;
export declare function registerCSSKeyframes(animationName: string, compoundComponentName: string, keyframesConfig: NormalizedCSSAnimationKeyframesConfig): void;
export declare function unregisterCSSKeyframes(animationName: string, compoundComponentName: string): void;
export declare function applyCSSAnimations(shadowNodeWrapper: ShadowNodeWrapper, compoundComponentName: string, animationUpdates: CSSAnimationUpdates): void;
export declare function unregisterCSSAnimations(viewTag: number): void;
export declare function runCSSTransition(shadowNodeWrapper: ShadowNodeWrapper, transitionConfig: CSSTransitionConfig): void;
export declare function unregisterCSSTransition(viewTag: number): void;
//# sourceMappingURL=proxy.d.ts.map