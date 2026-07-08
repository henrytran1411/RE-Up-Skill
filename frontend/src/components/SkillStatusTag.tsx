import { Tag } from 'antd';
import { SkillStatus } from '../types/common';

const STATUS_COLOR: Record<SkillStatus, string> = {
  [SkillStatus.START]: 'default',
  [SkillStatus.LEARNING]: 'blue',
  [SkillStatus.VERIFIED]: 'gold',
  [SkillStatus.CONFIRMED]: 'green',
};

const STATUS_LABEL: Record<SkillStatus, string> = {
  [SkillStatus.START]: 'Start',
  [SkillStatus.LEARNING]: 'Learning',
  [SkillStatus.VERIFIED]: 'Verified',
  [SkillStatus.CONFIRMED]: 'Confirmed',
};

export function SkillStatusTag({ status }: { status: SkillStatus }) {
  return <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>;
}
