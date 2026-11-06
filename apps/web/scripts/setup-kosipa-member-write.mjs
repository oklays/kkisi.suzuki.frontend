/**
 * Installs (or refreshes) the least-privilege KOSIPA member writer account `kosipa_member_w` on the ISOLATED synthetic FA-01 stack only
 * (FA-03B T04). It applies apps/web/db/kosipa/006_member_writer_grants.sql.tpl through the stack's own sentinel-checked root connection, so it
 * refuses any other server. It does not reset or recreate anything and never touches production: the production grants are the review-only
 * docs/migration/sql/kosipa-member-writer-production.sql, run manually by the operator.
 *
 *   node apps/web/scripts/setup-kosipa-member-write.mjs
 */
import { applyMemberWriter } from '../../../integration/kosipa-full-access/local-stack.mjs';

try { console.log(JSON.stringify(await applyMemberWriter())); } catch (error) {
  console.error(/^KFA_/.test(error.message) ? error.message : 'KFA_MEMBER_WRITER_SETUP_FAILED');
  process.exitCode = 1;
}
