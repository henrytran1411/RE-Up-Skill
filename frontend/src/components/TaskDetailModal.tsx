import { Modal, Progress, Tag, Space, Typography, Alert, Divider } from 'antd';
import { CriticalPathBlocker, CriticalPathTaskNode } from '../types/projectHealth';

/** One blocker and the actual chain of tasks behind it — a task shared with another blocker's chain is highlighted, since it's only counted once in the total above. */
function BlockerChain({ blocker }: { readonly blocker: CriticalPathBlocker }) {
  const hasSharedTask = blocker.chain.some((c) => c.sharedWithOtherBlockers);
  return (
    <div>
      <Space>
        <Tag color="red">Blocked by</Tag>
        <strong>{blocker.taskCode ?? blocker.taskName}</strong>
        <span style={{ color: '#999' }}>
          {blocker.chainCompletedPoints} / {blocker.chainPoints} pts done
        </span>
        {hasSharedTask && (
          <Tag color="gold">Shares a task with another blocker below</Tag>
        )}
      </Space>
      <div style={{ marginTop: 4, marginLeft: 24, fontSize: 12, color: '#666' }}>
        Chain:{' '}
        {blocker.chain.map((c, i) => (
          <span key={c.id}>
            {i > 0 && ' → '}
            <span
              style={{
                color: c.completedAt ? '#52c41a' : '#1890ff',
                ...(c.sharedWithOtherBlockers
                  ? { background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 3, padding: '0 4px' }
                  : {}),
              }}
            >
              {c.taskCode ?? c.taskName} ({c.points}pts{c.completedAt ? ', done' : ''})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One task's overview, plus every blocking branch's own chain and how much
 * of it is done — opened from either the critical-path chart (clicking a
 * dot) or the critical-path table (a "Details" button), so this lives here
 * once rather than duplicated in both.
 */
export function TaskDetailModal({ node, onClose }: { readonly node: CriticalPathTaskNode | null; readonly onClose: () => void }) {
  return (
    <Modal title={node ? node.taskCode ?? node.taskName : ''} open={node !== null} onCancel={onClose} footer={null}>
      {node && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space direction="vertical" size={2}>
            {node.taskCode && <div style={{ color: '#999' }}>{node.taskName}</div>}
            <div>Epic: {node.epicName ?? '—'}</div>
            <div>Points: {node.points}</div>
            <div>
              Status:{' '}
              {node.completedAt ? <Tag color="green">Completed {node.completedAt}</Tag> : <Tag>Not completed</Tag>}
            </div>
          </Space>

          <Divider style={{ margin: 0 }} />

          <div>
            <Typography.Text strong>Chain % Done</Typography.Text>
            <div style={{ color: '#999', fontSize: 12 }}>
              How much of the work blocking this task (every branch, not just the longest one) is actually done.
            </div>
            <Progress percent={node.blockersChainPercentDone} />
            <div style={{ color: '#999', fontSize: 12 }}>
              {node.blockersCompletedChainPoints} / {node.blockersTotalChainPoints} pts
            </div>
          </div>

          {node.blockers.length === 0 ? (
            <Alert type="success" showIcon message="No blockers — ready to start." />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {/* Blockers sharing an upstream task with another blocker surface first, so the overlap they
                  cause in the total above (each shared task only counted once) is easy to spot. */}
              {[...node.blockers]
                .sort((a, b) => {
                  const aShared = a.chain.some((c) => c.sharedWithOtherBlockers) ? 1 : 0;
                  const bShared = b.chain.some((c) => c.sharedWithOtherBlockers) ? 1 : 0;
                  return bShared - aShared;
                })
                .map((b) => (
                  <BlockerChain key={b.id} blocker={b} />
                ))}
            </Space>
          )}
        </Space>
      )}
    </Modal>
  );
}
