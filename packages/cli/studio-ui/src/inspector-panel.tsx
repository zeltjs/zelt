import type { JSX } from 'react';

import type { GraphNode, RouteInfo } from '../../src/studio/graph/graph.types';
import { formatMethodSignature } from './inspector.lib';

// 値が無いセクションは見出しごと出さない（unresolved ノードは filePath/kind のみになる）
const Section = (props: {
  readonly title: string;
  readonly children: JSX.Element;
}): JSX.Element => (
  <section>
    <h3>{props.title}</h3>
    {props.children}
  </section>
);

const DecoratorsSection = (props: {
  readonly decorators: readonly string[] | undefined;
}): JSX.Element => (
  <Section title="decorators">
    <ul>
      {(props.decorators ?? []).map((name) => (
        <li key={name}>@{name}</li>
      ))}
    </ul>
  </Section>
);

const RouteItem = (props: { readonly route: RouteInfo }): JSX.Element => (
  <li>
    <code>
      {props.route.method} {props.route.path}
    </code>{' '}
    → {props.route.handler}
  </li>
);

const RoutesSection = (props: {
  readonly routes: readonly RouteInfo[] | undefined;
}): JSX.Element => (
  <Section title="routes">
    <ul>
      {(props.routes ?? []).map((route) => (
        <RouteItem key={`${route.method} ${route.path}`} route={route} />
      ))}
    </ul>
  </Section>
);

const ContractSection = (props: { readonly contract: GraphNode['contract'] }): JSX.Element => (
  <Section title="contract">
    <ul>
      {(props.contract ?? []).map((sig) => (
        <li key={formatMethodSignature(sig)}>
          <code>{formatMethodSignature(sig)}</code>
        </li>
      ))}
    </ul>
  </Section>
);

// undefined と空配列をまとめて弾く（decorators/routes/contract で共通の「セクション表示するか」判定）
const hasEntries = <T,>(arr: readonly T[] | undefined): boolean =>
  arr !== undefined && arr.length > 0;

const InspectorFields = (props: { readonly node: GraphNode }): JSX.Element => {
  const { node } = props;
  return (
    <dl>
      <dt>file</dt>
      <dd>{node.filePath}</dd>
      {node.featureKey !== undefined && (
        <>
          <dt>feature</dt>
          <dd>{node.featureKey}</dd>
        </>
      )}
    </dl>
  );
};

export const InspectorPanel = (props: {
  readonly node: GraphNode;
  readonly onClose: () => void;
}): JSX.Element => {
  const { node, onClose } = props;
  return (
    <aside className="inspector">
      <header>
        <span className={`badge kind-${node.kind}`}>{node.kind}</span>
        <strong>{node.className}</strong>
        <button type="button" aria-label="close inspector" onClick={onClose}>
          ×
        </button>
      </header>
      <InspectorFields node={node} />
      {node.unresolved === true && <p className="unresolved-note">unresolved</p>}
      {hasEntries(node.decorators) && <DecoratorsSection decorators={node.decorators} />}
      {hasEntries(node.routes) && <RoutesSection routes={node.routes} />}
      {hasEntries(node.contract) && <ContractSection contract={node.contract} />}
    </aside>
  );
};
