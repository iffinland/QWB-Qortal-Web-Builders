/**
 * Inline owner affordances.
 *
 * Controls are created as DOM nodes (never injected into the public markup) and
 * are appended to the containers the Phase 1 renderers already produce. Visitor
 * DOM is therefore byte-identical to the Phase 1 baseline: with a non-owner
 * session this module adds nothing and the shell does not even mount it.
 *
 * Fail-closed rule: for every entity group the number of matching DOM nodes must
 * equal the number of entities the view rendered. A mismatch means the renderer
 * changed under the owner layer, so that group gets no controls at all and one
 * diagnostic is recorded — attaching a control to the wrong entity would be
 * worse than showing none.
 */

import type { OwnerTargetMap, OwnerItemTarget } from './targets';
import type { OwnerFlows } from './flows';
import type { DraftStore } from './drafts';

export interface OwnerControlDeps {
  readonly flows: OwnerFlows;
  readonly drafts: DraftStore;
}

export interface OwnerControlsResult {
  readonly teardown: () => void;
  readonly diagnostics: readonly string[];
}

function button(options: {
  readonly label: string;
  readonly ariaLabel: string;
  readonly title: string;
  readonly className: string;
  readonly onClick: () => void;
}): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `qwb-ctl ${options.className}`;
  element.textContent = options.label;
  element.setAttribute('aria-label', options.ariaLabel);
  element.title = options.title;
  element.addEventListener('click', () => {
    options.onClick();
  });
  return element;
}

function controlsRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'qwb-owner-controls';
  row.setAttribute('data-qwb-owner', 'controls');
  return row;
}

function addButtonRow(label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'qwb-owner-add-row';
  row.setAttribute('data-qwb-owner', 'add');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'qwb-ctl qwb-ctl-add';
  button.textContent = `+ ${label}`;
  button.setAttribute('aria-label', label);
  row.append(button);
  return row;
}

/** Resolves the element a reorder moves, and whether it can move at all. */
export function resolveMoveElement(host: HTMLElement, target: OwnerItemTarget): HTMLElement {
  if (target.moveUnit === 'self') return host;
  const parent = host.parentElement;
  if (parent !== null && /\bcol-/.test(parent.className)) return parent;
  return host;
}

export function mountOwnerControls(
  root: HTMLElement,
  targets: OwnerTargetMap,
  deps: OwnerControlDeps,
): OwnerControlsResult {
  const added: HTMLElement[] = [];
  const diagnostics: string[] = [];

  const hostsFor = (selector: string): readonly HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(selector));

  const renderItemControls = (host: HTMLElement, target: OwnerItemTarget, label: string): void => {
    const row = controlsRow();
    for (const control of target.controls) {
      switch (control) {
        case 'edit':
          row.append(
            button({
              label: '✎',
              ariaLabel: `Edit ${label}`,
              title: `Edit ${label}`,
              className: 'qwb-ctl-edit',
              onClick: () => deps.flows.openEditEntity(target),
            }),
          );
          break;
        case 'delete':
          row.append(
            button({
              label: '🗑',
              ariaLabel: `Delete ${label}`,
              title: `Delete ${label}`,
              className: 'qwb-ctl-delete',
              onClick: () => deps.flows.openDeleteEntity(target),
            }),
          );
          break;
        case 'up':
          row.append(
            button({
              label: '↑',
              ariaLabel: `Move ${label} earlier`,
              title: `Move ${label} earlier`,
              className: 'qwb-ctl-move',
              onClick: () => {
                deps.flows.reorderEntity(target, 'up', resolveMoveElement(host, target));
              },
            }),
          );
          break;
        case 'down':
          row.append(
            button({
              label: '↓',
              ariaLabel: `Move ${label} later`,
              title: `Move ${label} later`,
              className: 'qwb-ctl-move',
              onClick: () => {
                deps.flows.reorderEntity(target, 'down', resolveMoveElement(host, target));
              },
            }),
          );
          break;
      }
    }
    host.append(row);
    added.push(row);
  };

  // Group count check: skip a whole group when the DOM does not match content.
  const groups = new Map<string, OwnerItemTarget[]>();
  for (const target of targets.items) {
    const list = groups.get(target.groupKey) ?? [];
    list.push(target);
    groups.set(target.groupKey, list);
  }

  for (const [groupKey, groupTargets] of groups) {
    const first = groupTargets[0];
    if (first === undefined) continue;
    const expected = targets.expectedCounts[groupKey] ?? groupTargets.length;
    const hosts = hostsFor(first.hostSelector);

    if (hosts.length !== expected) {
      diagnostics.push(
        `owner controls skipped for "${groupKey}": the page has ${String(hosts.length)} matching element(s) but ${String(expected)} ${groupKey} entit${expected === 1 ? 'y' : 'ies'} (renderer drift)`,
      );
      continue;
    }

    for (const target of groupTargets) {
      const host = hosts[target.hostIndex];
      if (host === undefined) {
        diagnostics.push(
          `owner controls skipped for "${target.key}": no element at index ${String(target.hostIndex)}`,
        );
        continue;
      }
      renderItemControls(
        host,
        target,
        `${target.groupKey.replace(/-/g, ' ')}: ${target.entityTitle}`,
      );
    }
  }

  for (const singleton of targets.singletons) {
    const host = hostsFor(singleton.hostSelector)[singleton.hostIndex];
    if (host === undefined) {
      diagnostics.push(`owner control skipped for "${singleton.key}": element not found`);
      continue;
    }
    const row = controlsRow();
    for (const control of singleton.controls) {
      if (control !== 'edit') continue;
      row.append(
        button({
          label: '✎',
          ariaLabel: `Edit ${singleton.label}`,
          title: `Edit ${singleton.label}`,
          className: 'qwb-ctl-edit',
          onClick: () => deps.flows.openEditSiteSlice(singleton.siteSlice, singleton.label),
        }),
      );
    }
    host.append(row);
    added.push(row);
  }

  for (const add of targets.adds) {
    const host = hostsFor(add.hostSelector)[add.hostIndex];
    if (host === undefined) {
      diagnostics.push(`owner add control skipped for "${add.key}": container not found`);
      continue;
    }
    const row = addButtonRow(add.label);
    const trigger = row.querySelector<HTMLElement>('button');
    trigger?.addEventListener('click', () => deps.flows.openAddEntity(add.kind));
    if (add.hostRole === 'row') row.classList.add('col-12');
    host.append(row);
    added.push(row);
  }

  return {
    diagnostics,
    teardown: () => {
      for (const element of added) element.remove();
      added.length = 0;
    },
  };
}
