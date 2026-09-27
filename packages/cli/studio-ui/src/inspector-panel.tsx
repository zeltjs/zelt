import type { JSX } from 'react';

import type { ViewMethod, ViewNode, ViewRoute } from './graph-view.lib';
import { formatMethodSignature } from './inspector.lib';

// 値が無いセクションは見出しごと出さない
const Section = (props: {
  readonly title: string;
  readonly children: JSX.Element;
}): JSX.Element => (
  <section>
    <h3>{props.title}</h3>
    {props.children}
  </section>
);

const DecoratorsSection = (props: { readonly decorators: readonly string[] }): JSX.Element => (
  <Section title="decorators">
    <ul>
      {props.decorators.map((name) => (
        <li key={name}>@{name}</li>
      ))}
    </ul>
  </Section>
);

const RouteItem = (props: { readonly route: ViewRoute }): JSX.Element => (
  <li>
    <code>
      {props.route.method} {props.route.path}
    </code>{' '}
    → {props.route.handler}
  </li>
);

const RoutesSection = (props: { readonly routes: readonly ViewRoute[] }): JSX.Element => (
  <Section title="routes">
    <ul>
      {props.routes.map((route) => (
        <RouteItem key={`${route.method} ${route.path}`} route={route} />
      ))}
    </ul>
  </Section>
);

const MethodsSection = (props: { readonly methods: readonly ViewMethod[] }): JSX.Element => (
  <Section title="methods">
    <ul>
      {props.methods.map((sig) => (
        <li key={formatMethodSignature(sig)}>
          <code>{formatMethodSignature(sig)}</code>
        </li>
      ))}
    </ul>
  </Section>
);

// undefined と空配列をまとめて弾く（decorators/routes/methods で共通の「セクション表示するか」判定）
const hasEntries = <T,>(arr: readonly T[]): boolean => arr.length > 0;

const InspectorFields = (props: { readonly node: ViewNode }): JSX.Element => (
  <dl>
    <dt>file</dt>
    <dd>{props.node.filePath}</dd>
  </dl>
);

export const InspectorPanel = (props: {
  readonly node: ViewNode;
  readonly onClose: () => void;
}): JSX.Element => {
  const { node, onClose } = props;
  const badge = node.external ? 'external' : (node.fileKind ?? 'unknown');
  return (
    <aside className="inspector">
      <header>
        <span className={`badge kind-${badge}`}>{badge}</span>
        <strong>{node.name}</strong>
        <button type="button" aria-label="close inspector" onClick={onClose}>
          ×
        </button>
      </header>
      <InspectorFields node={node} />
      {hasEntries(node.decorators) && <DecoratorsSection decorators={node.decorators} />}
      {hasEntries(node.routes) && <RoutesSection routes={node.routes} />}
      {hasEntries(node.methods) && <MethodsSection methods={node.methods} />}
    </aside>
  );
};
