import type { Container } from '@needle-di/core';
import { isClassConstructor } from '@zeltjs/unsafe-type-lib';
import { overrideLeaf, registerAsLeaf, resolveLeaf, ZeltAppConfigurationError } from '../../kernel';

type AnyConfigClass = abstract new (...args: never[]) => object;

const abstractConfigClasses = new WeakSet<AnyConfigClass>();

const toConfigClass = (proto: unknown): AnyConfigClass | null => {
  if (proto === null || proto === Function.prototype) return null;
  return isClassConstructor<object>(proto) ? proto : null;
};

const isAbstractConfigClass = (config: AnyConfigClass): boolean =>
  abstractConfigClasses.has(config);

const findAbstractConfigAncestors = (config: AnyConfigClass): AnyConfigClass[] => {
  const ancestors: AnyConfigClass[] = [];
  let current = toConfigClass(Object.getPrototypeOf(config));

  while (current) {
    if (isAbstractConfigClass(current)) ancestors.push(current);
    current = toConfigClass(Object.getPrototypeOf(current));
  }

  return ancestors;
};

const bindResolvedConfig = (
  resolvedConfigs: Map<AnyConfigClass, AnyConfigClass>,
  abstractConfig: AnyConfigClass,
  resolvedConfig: AnyConfigClass,
  fallback: boolean,
): void => {
  if (fallback && resolvedConfigs.has(abstractConfig)) return;
  resolvedConfigs.set(abstractConfig, resolvedConfig);
};

const bindConfigResolution = (
  resolvedConfigs: Map<AnyConfigClass, AnyConfigClass>,
  config: AnyConfigClass,
  fallback = false,
): void => {
  if (isAbstractConfigClass(config)) {
    bindResolvedConfig(resolvedConfigs, config, config, fallback);
  }

  for (const abstractConfig of findAbstractConfigAncestors(config)) {
    bindResolvedConfig(resolvedConfigs, abstractConfig, config, fallback);
  }
};

export const registerConfigClass = (
  config: AnyConfigClass,
  options?: { readonly abstract?: boolean },
): void => {
  registerAsLeaf(config, { abstract: options?.abstract === true });
  if (options?.abstract === true) abstractConfigClasses.add(config);
};

/** @throws {ZeltAppConfigurationError} */
export const assertNoUnresolvedAbstractConfigs = (
  configs: readonly AnyConfigClass[],
  fallbackConfigs: readonly AnyConfigClass[],
): void => {
  const resolvedConfigs = new Map<AnyConfigClass, AnyConfigClass>();

  for (const config of configs) {
    bindConfigResolution(resolvedConfigs, config);
  }
  for (const config of fallbackConfigs) {
    bindConfigResolution(resolvedConfigs, config, true);
  }

  for (const [abstractConfig, resolvedConfig] of resolvedConfigs) {
    if (abstractConfig === resolvedConfig) {
      throw new ZeltAppConfigurationError({
        reason: 'abstract_leaf_without_concrete',
        details: abstractConfig.name,
      });
    }
  }
};

/** @throws {ZeltLifecycleStateError} */
export const overrideConfig = (
  container: Container,
  config: AnyConfigClass,
  options?: { readonly fallback?: boolean },
): void => {
  overrideLeaf(container, config, options);
};

/** @throws {ZeltLifecycleStateError | ZeltAppConfigurationError} */
export const resolveConfig = (container: Container, config: AnyConfigClass): void => {
  resolveLeaf(container, config);
};
