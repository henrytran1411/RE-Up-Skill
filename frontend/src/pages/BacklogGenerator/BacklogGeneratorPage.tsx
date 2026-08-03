import { useState } from 'react';
import { Card, Space, Typography, Form, Input, Button, Alert, Row, Col, Statistic, Tag } from 'antd';
import axios from 'axios';
import { FileTextOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { generateBacklog } from '../../services/backlogGeneratorService';
import { BacklogGeneratorResult } from '../../types/backlogGenerator';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function BacklogGeneratorPage() {
  const [form] = Form.useForm();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BacklogGeneratorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    const values = await form.validateFields();
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const generated = await generateBacklog({ projectName: values.projectName, description: values.description });
      setResult(generated);
    } catch (err) {
      setError(errorMessage(err, 'Failed to generate the backlog'));
    } finally {
      setGenerating(false);
    }
  };

  const downloadDocument = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.document], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.projectName.replace(/\s+/g, '-').toLowerCase()}-backlog.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            Backlog Generator
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          Describe a project in plain text and Gemini breaks it down into a full Agile backlog — Epics, each with
          User Stories, each with concrete Tasks. Every item is saved as a real task record in this system (under an
          "Unassigned (Generated)" placeholder owner — reassign to real owners afterward), and a Markdown document is
          produced alongside it. Each line's summary follows this system's existing code convention, e.g.{' '}
          <code>[Epic-1] Access management</code>, <code>[US-1.1] Login system</code>.
        </Typography.Paragraph>

        <Form form={form} layout="vertical">
          <Form.Item
            name="projectName"
            label="Project name"
            rules={[{ required: true, message: 'Required' }]}
            extra="Created if it doesn't already exist; the generated items are added to it if it does."
          >
            <Input placeholder="e.g. Nimbus CRM" />
          </Form.Item>
          <Form.Item
            name="description"
            label="Project description"
            rules={[{ required: true, min: 20, message: 'Give at least a couple of sentences to work from' }]}
          >
            <Input.TextArea rows={8} placeholder="Describe what the project does, its main features, users, and any known constraints..." />
          </Form.Item>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={handleGenerate}>
            Generate Backlog
          </Button>
        </Form>

        {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}
      </Card>

      {result && (
        <Card
          title={
            <Space>
              <FileTextOutlined />
              {result.projectName}
            </Space>
          }
          extra={
            <Button icon={<DownloadOutlined />} onClick={downloadDocument}>
              Download .md
            </Button>
          }
        >
          <Alert
            style={{ marginBottom: 16 }}
            type="success"
            showIcon
            message={
              result.projectCreated
                ? `Created project "${result.projectName}" and its backlog.`
                : `Added the generated backlog to the existing project "${result.projectName}".`
            }
          />
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Statistic title="Epics" value={result.epicsCreated} />
            </Col>
            <Col span={4}>
              <Statistic title="User Stories" value={result.storiesCreated} />
            </Col>
            <Col span={4}>
              <Statistic title="Tasks" value={result.tasksCreated} />
            </Col>
            <Col span={4}>
              <Statistic title="Total Points" value={result.totalPoints} />
            </Col>
            <Col span={6}>
              <Statistic title="Total Estimate" value={result.totalEstimateHours} suffix="h" />
            </Col>
          </Row>
          <Tag color="gold">Owner: Unassigned (Generated) — reassign on the Projects page</Tag>
          <pre
            style={{
              marginTop: 16,
              maxHeight: 500,
              overflow: 'auto',
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
              padding: 16,
              whiteSpace: 'pre-wrap',
              fontFamily: 'Consolas, Menlo, monospace',
              fontSize: 13,
            }}
          >
            {result.document}
          </pre>
        </Card>
      )}
    </Space>
  );
}
