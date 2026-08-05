import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Modal, Table, Tag, Row, Col, Statistic, Typography } from 'antd';
import { useState } from 'react';
import { ContributionSource } from '../types/common';
import { ContributionHalfYearSummary } from '../types/contribution';

const SOURCE_LABELS: Record<ContributionSource, string> = {
  [ContributionSource.PM_EVALUATION]: 'PM Evaluation',
  [ContributionSource.SKILL_VERIFICATION]: 'Skill Verification',
  [ContributionSource.TASK_COMPLETION]: 'Task Completion',
  [ContributionSource.COMPANY_CONTRIBUTION]: 'Company Contribution',
  [ContributionSource.COMPANY_REWARD]: 'Company Reward',
};

const SOURCE_COLORS: Record<ContributionSource, string> = {
  [ContributionSource.PM_EVALUATION]: '#1890ff',
  [ContributionSource.SKILL_VERIFICATION]: '#722ed1',
  [ContributionSource.TASK_COMPLETION]: '#52c41a',
  [ContributionSource.COMPANY_CONTRIBUTION]: '#faad14',
  [ContributionSource.COMPANY_REWARD]: '#eb2f96',
};

const SOURCES = Object.values(ContributionSource);

interface ChartRow extends ContributionHalfYearSummary {
  label: string;
}

function toChartRow(summary: ContributionHalfYearSummary): ChartRow {
  return { ...summary, label: `${summary.year} ${summary.half}` };
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  payload: ChartRow;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const entry = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
      <strong>{entry.label}</strong> — total {entry.totalPoints} points
      {SOURCES.map((source) => (
        <div key={source} style={{ color: SOURCE_COLORS[source], fontSize: 12 }}>
          {SOURCE_LABELS[source]}: {entry.bySource[source]}
        </div>
      ))}
      <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Click to see every record</div>
    </div>
  );
}

/** Contribution/performance points by half-year period, stacked by source. Click a bar for the full detail. */
export function ContributionHistoryChart({ summaries }: { readonly summaries: ContributionHalfYearSummary[] }) {
  const [selected, setSelected] = useState<ChartRow | null>(null);
  const rows = summaries.map(toChartRow);

  if (rows.length === 0) {
    return <div style={{ color: '#999' }}>No contribution records yet.</div>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={rows}
          margin={{ top: 8, left: 8, right: 8, bottom: 8 }}
          onClick={(e) => {
            const point = e?.activePayload?.[0]?.payload as ChartRow | undefined;
            if (point) {
              setSelected(point);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip content={<ChartTooltip />} />
          <Legend formatter={(value) => SOURCE_LABELS[value as ContributionSource] ?? value} />
          {SOURCES.map((source) => (
            <Bar
              key={source}
              dataKey={`bySource.${source}`}
              stackId="a"
              name={source}
              fill={SOURCE_COLORS[source]}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <Modal
        title={`${selected?.label ?? ''} contribution detail`}
        open={selected !== null}
        onCancel={() => setSelected(null)}
        footer={null}
        width={800}
      >
        {selected && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              {SOURCES.map((source) => (
                <Col span={4} key={source}>
                  <Statistic
                    title={SOURCE_LABELS[source]}
                    value={selected.bySource[source]}
                    valueStyle={{ color: SOURCE_COLORS[source], fontSize: 16 }}
                  />
                </Col>
              ))}
              <Col span={4}>
                <Statistic title="Total" value={selected.totalPoints} valueStyle={{ fontWeight: 700 }} />
              </Col>
            </Row>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={selected.records}
              columns={[
                {
                  title: 'Source',
                  dataIndex: 'source',
                  render: (source: ContributionSource) => (
                    <Tag color={SOURCE_COLORS[source]}>{SOURCE_LABELS[source]}</Tag>
                  ),
                },
                { title: 'Date', dataIndex: 'recordDate' },
                { title: 'Points', dataIndex: 'points' },
                { title: 'Description', dataIndex: 'description' },
              ]}
            />
            {selected.records.length === 0 && (
              <Typography.Text type="secondary">No records for this year.</Typography.Text>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
