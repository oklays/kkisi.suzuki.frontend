import { KosipaError } from '@koperasi/domain/kosipa';
import { parseReason } from '@koperasi/domain/kosipa/command';
import { masterVersion, parseMasterId, parseMasterType, parseMasterValues, parseVersion, type MasterDefinition, type MasterRecord, type MasterValues } from '@koperasi/domain/kosipa/master';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import { hasWriteCapability, onlyFields, runKosipaCommand, type CommandActor, type CommandEnvelope, type CommandOutcome, type CommandPorts, type CommandSpec } from './pipeline.ts';

/**
 * KOSIPA reference-master commands (F52; FA-01 Lokasi, FA-02 Bagian / Jenis Dokumen / Rekening Bank / Periode Angsuran), one generic
 * implementation driven by the domain definitions: create + update + deactivate/reactivate. The legacy hard delete is NOT offered
 * (no reference check in legacy, WP-27); removal is deactivation with a reason (05 §4).
 */
export const masterFeature = (def: MasterDefinition) => `master.${def.key}`;
const subject = (def: MasterDefinition) => `master.${def.key}`;

export type MasterResult = { id: number; values: MasterValues; active: boolean; version: string };
export type LegacyFenceState = 'fenced' | 'legacy-active';

/** Writer repository: each command is ONE transaction that checks the legacy fence, locks, re-checks with the domain rules, writes, and appends the ledger row. */
export interface MasterRepository {
  list(def: MasterDefinition): Promise<MasterRecord[]>;
  /** Whether the legacy controller of this master is switched off (ref_menu); read for display, enforced again inside every command. */
  fenceState(def: MasterDefinition): Promise<LegacyFenceState>;
  create(def: MasterDefinition, envelope: CommandEnvelope, values: MasterValues): Promise<CommandOutcome<MasterResult>>;
  update(def: MasterDefinition, envelope: CommandEnvelope, id: number, values: MasterValues, expectedVersion: string): Promise<CommandOutcome<MasterResult>>;
  setStatus(def: MasterDefinition, envelope: CommandEnvelope, id: number, active: boolean, expectedVersion: string, reason: string): Promise<CommandOutcome<MasterResult>>;
}
export type MasterPorts = CommandPorts & { masters: MasterRepository };

export const toMasterResult = (def: MasterDefinition, r: MasterRecord): MasterResult => ({ ...r, version: masterVersion(def, r) });
const fieldKeys = (def: MasterDefinition) => def.fields.map((f) => f.key);

export function createMaster(ports: MasterPorts, actor: CommandActor, rawType: string, body: unknown) {
  const def = parseMasterType(rawType);
  const spec: CommandSpec<MasterValues, MasterResult> = {
    command: `master.${def.key}.create`, feature: masterFeature(def), capability: 'kosipa.master.manage', audit: 'kosipa.master.create',
    parse(raw) {
      onlyFields(raw, fieldKeys(def));
      const values = parseMasterValues(def, raw);
      return { input: values, subject: { type: subject(def), ref: 'new' }, payload: values };
    },
    execute: (envelope, values) => ports.masters.create(def, envelope, values),
  };
  return runKosipaCommand(ports, actor, spec, body, `${subject(def)}:new`);
}

export function updateMaster(ports: MasterPorts, actor: CommandActor, rawType: string, rawId: string, body: unknown) {
  const def = parseMasterType(rawType);
  const spec: CommandSpec<{ id: number; values: MasterValues; version: string }, MasterResult> = {
    command: `master.${def.key}.update`, feature: masterFeature(def), capability: 'kosipa.master.manage', audit: 'kosipa.master.update',
    parse(raw) {
      onlyFields(raw, [...fieldKeys(def), 'expectedVersion']);
      const id = parseMasterId(rawId); const values = parseMasterValues(def, raw); const version = parseVersion(raw.expectedVersion);
      return { input: { id, values, version }, subject: { type: subject(def), ref: String(id) }, payload: { ...values, expectedVersion: version } };
    },
    execute: (envelope, i) => ports.masters.update(def, envelope, i.id, i.values, i.version),
  };
  return runKosipaCommand(ports, actor, spec, body, `${subject(def)}:route`);
}

export function setMasterStatus(ports: MasterPorts, actor: CommandActor, rawType: string, rawId: string, body: unknown, active: boolean) {
  const def = parseMasterType(rawType);
  const spec: CommandSpec<{ id: number; version: string; reason: string }, MasterResult> = {
    command: `master.${def.key}.${active ? 'reactivate' : 'deactivate'}`, feature: masterFeature(def), capability: 'kosipa.master.manage',
    audit: active ? 'kosipa.master.reactivate' : 'kosipa.master.deactivate',
    parse(raw) {
      onlyFields(raw, ['expectedVersion', 'reason']);
      const id = parseMasterId(rawId); const version = parseVersion(raw.expectedVersion); const reason = parseReason(raw.reason);
      return { input: { id, version, reason }, subject: { type: subject(def), ref: String(id) }, payload: { expectedVersion: version, reason } };
    },
    execute: (envelope, i) => ports.masters.setStatus(def, envelope, i.id, active, i.version, i.reason),
  };
  return runKosipaCommand(ports, actor, spec, body, `${subject(def)}:route`);
}

/**
 * Read side of a master page: anyone with member view sees the reference list. `canManage` reflects the server gate; `writable` = the
 * feature is owned by Next.js AND the legacy controller is fenced (both are enforced again by every command).
 */
export async function listMaster(ports: Pick<MasterPorts, 'masters' | 'ownership'>, actor: { capabilities: CapabilitySet; kosipaUserId: number | null }, rawType: string): Promise<{ definition: MasterDefinition; rows: MasterResult[]; canManage: boolean; writable: boolean; legacy: LegacyFenceState }> {
  const def = parseMasterType(rawType);
  if (!actor.capabilities.has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const [records, legacy] = await Promise.all([ports.masters.list(def), ports.masters.fenceState(def)]);
  return { definition: def, rows: records.map((r) => toMasterResult(def, r)), canManage: hasWriteCapability(actor, 'kosipa.master.manage'), writable: ports.ownership.owns(masterFeature(def)) && legacy === 'fenced', legacy };
}
