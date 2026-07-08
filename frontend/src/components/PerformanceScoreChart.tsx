import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Col, Modal, Row, Statistic, Tag, Typography } from 'antd';
import { useState } from 'react';
import { PerformanceScorePeriod } from '../types/performance';

interface ChartRow extends PerformanceScorePeriod {
  label: string;
}

function toChartRow(period: PerformanceScorePeriod): ChartRow {
  return { ...period, label: `${period.year} ${period.half}${period.isFinal ? '' : '*'}` };
}

interface TooltipPayloadItem {
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
      <strong>{entry.label}</strong> ({entry.periodStart} → {entry.periodEnd}): {entry.totalScore}
      {!entry.isFinal && <div style={{ color: '#fa8c16', fontSize: 12 }}>Live estimate — not yet closed</div>}
      <div style={{ color: '#722ed1', fontSize: 12 }}>Technical Point: {entry.technicalPoint}</div>
      <div style={{ color: '#1890ff', fontSize: 12 }}>Contribution: {entry.contributionPoints}</div>
      <div style={{ color: '#13c2c2', fontSize: 12 }}>Certificates: {entry.certificatePoints}</div>
      <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Click to see the full breakdown</div>
    </div>
  );
}

/**
 * Performance Score by half-year period (Jan-Jun, Jul-Dec) — stacked bars for
 * Contribution + Certificate points, with Technical Point drawn both as part
 * of the stack and as its own trend line so its change over time (the point
 * of snapshotting periods rather than always showing today's live value) is
 * immediately visible rather than buried inside a stacked bar.
 */
export function PerformanceScoreChart({ periods }: { periods: PerformanceScorePeriod[] }) {
  const [selected, setSelected] = useState<ChartRow | null>(null);
  const rows = periods.map(toChartRow);

  if (rows.length === 0) {
    return <div style={{ color: '#999' }}>No performance data yet.</div>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
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
          <Legend />
          <Bar dataKey="technicalPoint" name="Technical Point" stackId="a" fill="#d3adf7" style={{ cursor: 'pointer' }} />
          <Bar dataKey="contributionPoints" name="Contribution" stackId="a" fill="#1890ff" style={{ cursor: 'pointer' }} />
          <Bar dataKey="certificatePoints" name="Certificates" stackId="a" fill="#13c2c2" style={{ cursor: 'pointer' }} />
          <Line
            type="monotone"
            dataKey="technicalPoint"
            name="Technical Point trend"
            stroke="#722ed1"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        * current period — live estimate, not yet closed/snapshotted.
      </Typography.Text>

      <Modal
        title={
          <>
            {selected?.label ?? ''} performance score detail{' '}
            {selected && (
              <Tag color={selected.isFinal ? 'green' : 'orange'}>{selected.isFinal ? 'Final' : 'Live estimate'}</Tag>
            )}
          </>
        }
        open={selected !== null}
        onCancel={() => setSelected(null)}
        footer={null}
      >
        {selected && (
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="Technical Point" value={selected.technicalPoint} valueStyle={{ color: '#722ed1' }} />
            </Col>
            <Col span={6}>
              <Statistic title="Contribution" value={selected.contributionPoints} valueStyle={{ color: '#1890ff' }} />
            </Col>
            <Col span={6}>
              <Statistic title="Certificates" value={selected.certificatePoints} valueStyle={{ color: '#13c2c2' }} />
            </Col>
            <Col span={6}>
              <Statistic title="Total Score" value={selected.totalScore} valueStyle={{ fontWeight: 700 }} />
            </Col>
          </Row>
        )}
      </Modal>
    </>
  );
}
