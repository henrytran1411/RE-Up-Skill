import { Tag } from 'antd';
import { EmployeeStatus } from '../types/common';

export function EmployeeWorkStatusTag({ status }: { status: EmployeeStatus }) {
  return status === EmployeeStatus.ON_PROJECT ? (
    <Tag color="blue">On Project</Tag>
  ) : (
    <Tag color="orange">On Bench</Tag>
  );
}
