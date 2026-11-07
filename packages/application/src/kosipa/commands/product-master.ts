import { KosipaError } from '@koperasi/domain/kosipa';
import { parseReason } from '@koperasi/domain/kosipa/command';
import { parseMasterId } from '@koperasi/domain/kosipa/master';
import { parseProductMasterType, parseProductValues, type ProductMasterDefinition, type ProductValues } from '@koperasi/domain/kosipa/product-master';
import type { CapabilitySet } from '@koperasi/domain/console/capabilities';
import { hasWriteCapability, onlyFields, runKosipaCommand, type CommandActor, type CommandEnvelope, type CommandOutcome, type CommandPorts, type CommandSpec } from './pipeline.ts';
import type { LegacyFenceState } from './master.ts';

/**
 * Product-master commands (FA-03B T06; FD-32/FD-34): create, update, deactivate/reactivate for Jenis Simpanan / Pinjaman / Pembiayaan and Suku Bunga.
 * Same pipeline, capability (kosipa.master.manage), ownership feature naming (`master.<key>`) and audit actions as the reference masters. The legacy
 * hard delete is not offered. A financial edit needs a reason (FD-32), enforced by the domain planner on the LOCKED row inside the repository.
 */
export const productFeature = (def: ProductMasterDefinition) => `master.${def.key}`;
const subject = (def: ProductMasterDefinition) => `master.${def.key}`;

export type ProductResult = { id: number; values: ProductValues; active: boolean; version: string };
/** Options the form needs; product parameters only, no personal data. */
export type ProductFormFacts = { coa: { code: string; desc: string; group: boolean }[]; financing: { code: string; name: string; active: boolean }[]; parents: { id: number; code: string; name: string }[] };

export interface ProductMasterRepository {
  list(def: ProductMasterDefinition): Promise<{ rows: ProductResult[]; facts: ProductFormFacts }>;
  fenceState(def: ProductMasterDefinition): Promise<LegacyFenceState>;
  create(def: ProductMasterDefinition, envelope: CommandEnvelope, values: ProductValues): Promise<CommandOutcome<ProductResult>>;
  update(def: ProductMasterDefinition, envelope: CommandEnvelope, id: number, values: ProductValues, expectedVersion: string, reason: string | undefined): Promise<CommandOutcome<ProductResult>>;
  setStatus(def: ProductMasterDefinition, envelope: CommandEnvelope, id: number, active: boolean, expectedVersion: string, reason: string): Promise<CommandOutcome<ProductResult>>;
}
export type ProductMasterPorts = CommandPorts & { products: ProductMasterRepository };

export function parseProductVersion(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[0-9a-f]{64}$/.test(raw)) throw new KosipaError('VERSION_INVALID');
  return raw;
}

export async function createProductMaster(ports: ProductMasterPorts, actor: CommandActor, rawType: string, body: unknown) {
  const def = parseProductMasterType(rawType);
  const spec: CommandSpec<ProductValues, ProductResult> = {
    command: `master.${def.key}.create`, feature: productFeature(def), capability: 'kosipa.master.manage', audit: 'kosipa.master.create',
    parse(raw) {
      onlyFields(raw, ['values']);
      const values = parseProductValues(def, raw.values);
      return { input: values, subject: { type: subject(def), ref: 'new' }, payload: values };
    },
    execute: (envelope, values) => ports.products.create(def, envelope, values),
  };
  return runKosipaCommand(ports, actor, spec, body, `${subject(def)}:new`);
}

export async function updateProductMaster(ports: ProductMasterPorts, actor: CommandActor, rawType: string, rawId: string, body: unknown) {
  const def = parseProductMasterType(rawType);
  type Input = { id: number; values: ProductValues; version: string; reason?: string };
  const spec: CommandSpec<Input, ProductResult> = {
    command: `master.${def.key}.update`, feature: productFeature(def), capability: 'kosipa.master.manage', audit: 'kosipa.master.update',
    parse(raw) {
      onlyFields(raw, ['values', 'expectedVersion', 'reason']);
      const id = parseMasterId(rawId); const values = parseProductValues(def, raw.values); const version = parseProductVersion(raw.expectedVersion);
      // A supplied reason is validated here; whether one is REQUIRED depends on what actually changes on the locked row (FD-32).
      const reason = raw.reason === undefined || raw.reason === '' ? undefined : parseReason(raw.reason);
      return { input: { id, values, version, ...(reason ? { reason } : {}) }, subject: { type: subject(def), ref: String(id) }, payload: { values, expectedVersion: version, reason: reason ?? null } };
    },
    execute: (envelope, i) => ports.products.update(def, envelope, i.id, i.values, i.version, i.reason),
  };
  return runKosipaCommand(ports, actor, spec, body, `${subject(def)}:route`);
}

export async function setProductMasterStatus(ports: ProductMasterPorts, actor: CommandActor, rawType: string, rawId: string, body: unknown, active: boolean) {
  const def = parseProductMasterType(rawType);
  const spec: CommandSpec<{ id: number; version: string; reason: string }, ProductResult> = {
    command: `master.${def.key}.${active ? 'reactivate' : 'deactivate'}`, feature: productFeature(def), capability: 'kosipa.master.manage',
    audit: active ? 'kosipa.master.reactivate' : 'kosipa.master.deactivate',
    parse(raw) {
      onlyFields(raw, ['expectedVersion', 'reason']);
      const id = parseMasterId(rawId); const version = parseProductVersion(raw.expectedVersion); const reason = parseReason(raw.reason);
      return { input: { id, version, reason }, subject: { type: subject(def), ref: String(id) }, payload: { expectedVersion: version, reason } };
    },
    execute: (envelope, i) => ports.products.setStatus(def, envelope, i.id, active, i.version, i.reason),
  };
  return runKosipaCommand(ports, actor, spec, body, `${subject(def)}:route`);
}

/** Read side: anyone with member view sees the list (product parameters are not personal data). `writable` = owned by Next.js AND legacy fenced. */
export async function listProductMaster(ports: Pick<ProductMasterPorts, 'products' | 'ownership'>, actor: { capabilities: CapabilitySet; kosipaUserId: number | null }, rawType: string) {
  const def = parseProductMasterType(rawType);
  if (!actor.capabilities.has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const [data, legacy] = await Promise.all([ports.products.list(def), ports.products.fenceState(def)]);
  return { definition: def, rows: data.rows, facts: data.facts, canManage: hasWriteCapability(actor, 'kosipa.master.manage'), writable: ports.ownership.owns(productFeature(def)) && legacy === 'fenced', legacy };
}
