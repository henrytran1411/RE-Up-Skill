import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Modal, Table, Typography, Image, Tag } from 'antd';
import { useState } from 'react';
import { CertificateYearSummary } from '../types/certificate';

interface TooltipPayloadItem {
  value: number;
  payload: CertificateYearSummary;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const entry = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
      <strong>{entry.year}</strong>: {entry.totalPoints} points ({entry.certificates.length} certificate
      {entry.certificates.length === 1 ? '' : 's'})
      <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Click to see every certificate</div>
    </div>
  );
}

/** Year-by-year verified-certificate points. Click a bar for the full detail. */
export function CertificateHistoryChart({ summaries }: { summaries: CertificateYearSummary[] }) {
  const [selected, setSelected] = useState<CertificateYearSummary | null>(null);

  if (summaries.length === 0) {
    return <div style={{ color: '#999' }}>No verified certificates yet.</div>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={summaries}
          margin={{ top: 8, left: 8, right: 8, bottom: 8 }}
          onClick={(e) => {
            const point = e?.activePayload?.[0]?.payload as CertificateYearSummary | undefined;
            if (point) {
              setSelected(point);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="totalPoints" fill="#13c2c2" style={{ cursor: 'pointer' }} />
        </BarChart>
      </ResponsiveContainer>

      <Modal
        title={`${selected?.year ?? ''} certificate detail`}
        open={selected !== null}
        onCancel={() => setSelected(null)}
        footer={null}
        width={800}
      >
        {selected && (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={selected.certificates}
            columns={[
              {
                title: 'Image',
                dataIndex: 'imageUrl',
                render: (url: string) => <Image src={url} width={48} height={48} style={{ objectFit: 'cover' }} />,
              },
              { title: 'Name', dataIndex: 'name' },
              { title: 'Description', dataIndex: 'description', render: (v: string | null) => v ?? '—' },
              { title: 'Expires', dataIndex: 'expiredDate' },
              { title: 'Verified', dataIndex: 'verifiedAt', render: (v: string) => v?.slice(0, 10) },
              {
                title: 'Points',
                dataIndex: 'points',
                render: (v: number) => <Tag color="cyan">{v}</Tag>,
              },
            ]}
          />
        )}
        {selected && selected.certificates.length === 0 && (
          <Typography.Text type="secondary">No certificates for this year.</Typography.Text>
        )}
      </Modal>
    </>
  );
}
