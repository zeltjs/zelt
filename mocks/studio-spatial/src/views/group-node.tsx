import type { DeclarationModel, GroupModel, TagModel } from '../display.types';
import type { EventSink } from '../events.types';
import { useBoundary } from './use-boundary';

export function DeclarationNode({
  model,
  emit,
}: {
  readonly model: DeclarationModel;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  const className = [
    'declaration',
    model.callable ? 'function-node' : 'data-node',
    model.selected && 'selected',
    model.dimmed && 'dimmed',
    model.changed && 'changed',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      data-declaration={model.id}
      data-node={model.callable ? model.id : undefined}
      data-select={model.id}
      style={{ top: model.top }}
      title={model.id}
      aria-pressed={model.selected}
      onClick={() => send({ type: 'subject.select', id: model.id })}
    >
      <span className="member-line">
        <small className="kind">{model.kind}</small>
        <strong>{model.label}</strong>
      </span>
      <span className="member-hint">{model.hint}</span>
    </button>
  );
}

export function RelationTag({
  model,
  emit,
}: {
  readonly model: TagModel;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <button
      type="button"
      className={`reference-tag ref-${model.kind}${model.dimmed ? ' dimmed' : ''}`}
      data-reference={model.key}
      title={model.title}
      onClick={() => send({ type: 'tag.activate', key: model.key })}
    >
      {model.label}
    </button>
  );
}

export function GroupNode({
  model,
  emit,
}: {
  readonly model: GroupModel;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  const className = [
    'class-group',
    !model.expanded && 'collapsed',
    model.dimmed && 'dimmed-group',
    model.selected && 'selected-group',
    model.changed && 'changed-group',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      className={className}
      data-group={model.id}
      style={{
        left: model.rect.x,
        top: model.rect.y,
        width: model.rect.width,
        height: model.rect.height,
      }}
    >
      <GroupHeading model={model} emit={send} />
      {model.members.map((member) => (
        <DeclarationNode key={member.id} model={member} emit={send} />
      ))}
      {model.tags.length > 0 && (
        <fieldset className="group-references" aria-label={`${model.id}の適用・接続先`}>
          {model.tags.map((tag) => (
            <RelationTag key={tag.key} model={tag} emit={send} />
          ))}
        </fieldset>
      )}
    </section>
  );
}

function GroupHeading({ model, emit }: { readonly model: GroupModel; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <>
      {' '}
      <button
        type="button"
        className="group-heading"
        data-select={model.id}
        onClick={() => send({ type: 'subject.select', id: model.id })}
      >
        <span>{model.kind}</span>
        <strong>{model.id}</strong>
      </button>
      <button
        type="button"
        className="group-toggle"
        data-toggle={model.id}
        aria-expanded={model.expanded}
        aria-label={`${model.id}を${model.expanded ? '折りたたむ' : '展開'}`}
        onClick={() => send({ type: 'group.toggle', id: model.id })}
      >
        {model.expanded ? '−' : '＋'}
      </button>
    </>
  );
}
