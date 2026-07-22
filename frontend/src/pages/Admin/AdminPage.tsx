import { useEffect, useState } from 'react';
import { Card, Space, Alert, Form, Input, Button, Checkbox, Switch, Typography, Table, Tag, message } from 'antd';
import axios from 'axios';
import { CloudSyncOutlined, LinkOutlined } from '@ant-design/icons';
import {
  fetchJiraConfig,
  upsertJiraConfig,
  fetchJiraProjects,
  runJiraSync,
  fetchJiraSyncLogs,
  JiraSyncSummary,
} from '../../services/jiraService';
import { JiraConfigSummary, JiraProjectSummary, JiraSyncLog } from '../../types/jira';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

const STATUS_COLOR: Record<JiraSyncLog['status'], string> = {
  success: 'success',
  partial: 'warning',
  failed: 'error',
  skipped: 'default',
};

export function AdminPage() {
  const [config, setConfig] = useState<JiraConfigSummary | null>(null);
  const [connectForm] = Form.useForm();
  const [connecting, setConnecting] = useState(false);
  const [projects, setProjects] = useState<JiraProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<string[]>([]);
  const [syncAllProjects, setSyncAllProjects] = useState(false);
  const [savingAndSyncing, setSavingAndSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<JiraSyncSummary | null>(null);
  const [logs, setLogs] = useState<JiraSyncLog[]>([]);

  const loadLogs = () => fetchJiraSyncLogs().then(setLogs);

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      setProjects(await fetchJiraProjects());
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load Jira projects'));
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchJiraConfig().then((summary) => {
      setConfig(summary);
      connectForm.setFieldsValue({ baseUrl: summary.baseUrl ?? undefined, email: summary.email ?? undefined });
      setSelectedProjectKeys(summary.projectKeys);
      setSyncAllProjects(summary.syncAllProjects);
      if (summary.configured) {
        loadProjects();
      }
    });
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    const values = await connectForm.validateFields(['baseUrl', 'email', 'apiToken']);
    setConnecting(true);
    try {
      await upsertJiraConfig({
        baseUrl: values.baseUrl,
        email: values.email,
        apiToken: values.apiToken || undefined,
      });
      const summary = await fetchJiraConfig();
      setConfig(summary);
      connectForm.setFieldsValue({ apiToken: undefined });
      message.success('Connected — loading your Jira projects…');
      await loadProjects();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to connect to Jira'));
    } finally {
      setConnecting(false);
    }
  };

  const handleSaveAndSync = async () => {
    const values = await connectForm.validateFields(['baseUrl', 'email']);
    setSavingAndSyncing(true);
    setSyncResult(null);
    try {
      await upsertJiraConfig({
        baseUrl: values.baseUrl,
        email: values.email,
        projectKeys: selectedProjectKeys,
        syncAllProjects,
      });
      const summary = await fetchJiraConfig();
      setConfig(summary);
      message.success('Project selection saved — syncing now…');
      const result = await runJiraSync();
      setSyncResult(result);
      if (result.status === 'failed') {
        message.error(`Jira sync failed: ${result.errorMessage}`);
      } else {
        message.success(
          `Jira sync ${result.status}: ${result.tasksCreated} created, ${result.tasksUpdated} updated, ${result.tasksSkipped} skipped`,
        );
      }
      loadLogs();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save selection and sync'));
    } finally {
      setSavingAndSyncing(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        title={
          <Space>
            <CloudSyncOutlined />
            Jira Integration
          </Space>
        }
      >
        {config?.configured && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Connected to ${config.baseUrl} as ${config.email}${
              config.updatedAt ? ` — saved ${new Date(config.updatedAt).toLocaleString()}` : ''
            }`}
          />
        )}
        {syncResult && (
          <Alert
            type={syncResult.status === 'failed' ? 'error' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
            message={`Last sync: ${syncResult.status} — ${syncResult.issuesFetched} fetched, ${syncResult.tasksCreated} created, ${syncResult.tasksUpdated} updated, ${syncResult.tasksSkipped} skipped`}
            description={syncResult.errorMessage ?? undefined}
          />
        )}

        <Form form={connectForm} layout="vertical">
          <Space style={{ width: '100%' }} wrap>
            <Form.Item
              name="baseUrl"
              label="Jira base URL"
              rules={[{ required: true, message: 'Required' }]}
              style={{ minWidth: 280 }}
            >
              <Input placeholder="https://yourcompany.atlassian.net" />
            </Form.Item>
            <Form.Item
              name="email"
              label="Your Jira account email"
              rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
              style={{ minWidth: 240 }}
            >
              <Input placeholder="you@company.com" />
            </Form.Item>
            <Form.Item
              name="apiToken"
              label="Your Jira API token"
              style={{ minWidth: 240 }}
              extra={config?.configured ? 'Leave blank to keep the saved token' : undefined}
            >
              <Input.Password placeholder={config?.configured ? '••••••••' : 'Atlassian API token'} />
            </Form.Item>
          </Space>
          <Button icon={<LinkOutlined />} loading={connecting} onClick={handleConnect}>
            {config?.configured ? 'Reconnect & Reload Projects' : 'Connect & Load Projects'}
          </Button>
        </Form>

        {(loadingProjects || projects.length > 0) && (
          <>
            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Projects to sync
            </Typography.Title>
            <Space align="center" style={{ marginBottom: 12 }}>
              <Switch checked={syncAllProjects} onChange={setSyncAllProjects} />
              <span>Sync ALL projects visible to this Jira account</span>
            </Space>

            {syncAllProjects ? (
              <Alert
                type="info"
                showIcon
                message={`Every sync will pull every project this account can see (currently ${projects.length}) — including any created later, with no need to update the selection.`}
              />
            ) : (
              <>
                <Typography.Paragraph type="secondary">
                  Pick the Jira project(s) to pull tasks from. Every task in a selected project is synced each time you
                  run Save &amp; Sync — existing tasks (matched by Jira issue key) are updated, not duplicated.
                </Typography.Paragraph>
                <div
                  style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}
                >
                  <Checkbox.Group
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                    value={selectedProjectKeys}
                    onChange={(values) => setSelectedProjectKeys(values as string[])}
                    options={projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }))}
                  />
                </div>
              </>
            )}

            <Button
              type="primary"
              icon={<CloudSyncOutlined />}
              style={{ marginTop: 16 }}
              loading={savingAndSyncing}
              onClick={handleSaveAndSync}
            >
              Save & Sync
            </Button>
          </>
        )}
      </Card>

      <Card title="Recent Sync Runs">
        <Table
          rowKey="id"
          size="small"
          dataSource={logs}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Started', render: (_, record: JiraSyncLog) => new Date(record.startedAt).toLocaleString() },
            {
              title: 'Status',
              render: (_, record: JiraSyncLog) => <Tag color={STATUS_COLOR[record.status]}>{record.status}</Tag>,
            },
            { title: 'Fetched', dataIndex: 'issuesFetched' },
            { title: 'Created', dataIndex: 'tasksCreated' },
            { title: 'Updated', dataIndex: 'tasksUpdated' },
            { title: 'Skipped', dataIndex: 'tasksSkipped' },
            { title: 'Error', render: (_, record: JiraSyncLog) => record.errorMessage ?? '—' },
          ]}
        />
      </Card>
    </Space>
  );
}
