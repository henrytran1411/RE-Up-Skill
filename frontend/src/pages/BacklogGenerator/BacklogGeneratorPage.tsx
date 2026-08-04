import { useEffect, useState } from 'react';
import { Card, Space, Typography, Form, Input, InputNumber, Button, Alert, Row, Col, Statistic, Tag, Tabs, Upload, Select, Table, Modal } from 'antd';
import axios from 'axios';
import { FileTextOutlined, DownloadOutlined, ThunderboltOutlined, UploadOutlined, CloudSyncOutlined, SearchOutlined, EditOutlined } from '@ant-design/icons';
import {
  generateBacklog,
  previewBacklogFromDocument,
  pushGeneratedBacklogToJira,
  suggestExistingMatches,
} from '../../services/backlogGeneratorService';
import { fetchJiraProjects, pushProjectToJira } from '../../services/jiraService';
import {
  BacklogGeneratorResult,
  EpicMatch,
  GeneratedBacklog,
  GeneratedBacklogPushRow,
  GeneratedBacklogPushSummary,
  GeneratedEpic,
  GeneratedStory,
  MatchSuggestionResult,
  StoryMatch,
} from '../../types/backlogGenerator';
import { JiraProjectPushRow, JiraProjectPushSummary, JiraProjectSummary } from '../../types/jira';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types/common';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

/** Admin-only — pushing to Jira uses /jira-sync routes, which are Admin-gated on the backend regardless of who can generate a backlog. */
function PushToJiraSection({ result }: { readonly result: BacklogGeneratorResult }) {
  const [jiraProjects, setJiraProjects] = useState<JiraProjectSummary[]>([]);
  const [targetJiraKey, setTargetJiraKey] = useState<string | undefined>(undefined);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<JiraProjectPushSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchJiraProjects()
      .then(setJiraProjects)
      .catch((err) => setLoadError(errorMessage(err, 'Failed to load Jira projects — is Jira configured on this Admin page?')));
  }, []);

  const handlePush = async () => {
    if (!targetJiraKey) return;
    setPushing(true);
    setPushResult(null);
    try {
      const pushed = await pushProjectToJira(result.projectName, targetJiraKey);
      setPushResult(pushed);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to push tasks to Jira'));
    } finally {
      setPushing(false);
    }
  };

  return (
    <Card style={{ marginTop: 16 }} title="Push to Jira">
      <Typography.Paragraph type="secondary">
        Pushes every Epic/User Story/Task just generated into a real Jira project, preserving the hierarchy. This is
        a live, visible write to your team's Jira — review the backlog above before pushing.
      </Typography.Paragraph>
      {loadError && <Alert style={{ marginBottom: 12 }} type="error" showIcon message={loadError} />}
      <Space wrap>
        <Select
          showSearch
          placeholder="Target Jira project"
          style={{ width: 260 }}
          value={targetJiraKey}
          onChange={setTargetJiraKey}
          options={jiraProjects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
          optionFilterProp="label"
        />
        <Button type="primary" icon={<CloudSyncOutlined />} loading={pushing} disabled={!targetJiraKey} onClick={handlePush}>
          Push to Jira
        </Button>
      </Space>
      {pushResult && (
        <>
          <Alert
            style={{ marginTop: 12 }}
            type={pushResult.failed > 0 ? 'warning' : 'success'}
            showIcon
            message={`${pushResult.pushed} pushed, ${pushResult.alreadyInJira} already in Jira, ${pushResult.failed} failed`}
          />
          <Table
            style={{ marginTop: 12 }}
            rowKey={(_r, i) => String(i)}
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={pushResult.rows}
            columns={[
              { title: 'Task', render: (_, r: JiraProjectPushRow) => r.taskCode ?? r.taskName },
              { title: 'Type', render: (_, r: JiraProjectPushRow) => r.issueType ?? '—' },
              {
                title: 'Result',
                render: (_, r: JiraProjectPushRow) => {
                  if (r.outcome === 'pushed') return <Tag color="green">Pushed: {r.jiraIssueKey}</Tag>;
                  if (r.outcome === 'already_in_jira') return <Tag color="blue">Already in Jira: {r.jiraIssueKey}</Tag>;
                  if (r.outcome === 'skipped_parent_failed') return <Tag>Skipped (parent failed)</Tag>;
                  return <Tag color="red">{r.errorMessage}</Tag>;
                },
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}

function ResultCard({ result }: { readonly result: BacklogGeneratorResult }) {
  const { currentEmployee } = useAuth();
  const isAdmin = currentEmployee?.role === Role.ADMIN;

  const downloadDocument = () => {
    const url = URL.createObjectURL(new Blob([result.document], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.projectName.replace(/\s+/g, '-').toLowerCase()}-backlog.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
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
      {isAdmin && <PushToJiraSection result={result} />}
    </>
  );
}

function FromDescriptionForm({ onGenerated }: { readonly onGenerated: (result: BacklogGeneratorResult) => void }) {
  const [form] = Form.useForm();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    const values = await form.validateFields();
    setGenerating(true);
    setError(null);
    try {
      const generated = await generateBacklog({ projectName: values.projectName, description: values.description });
      onGenerated(generated);
    } catch (err) {
      setError(errorMessage(err, 'Failed to generate the backlog'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Typography.Paragraph type="secondary">
        Describe a project in plain text and Gemini breaks it down into a full Agile backlog — Epics, each with User
        Stories, each with 2-6 concrete Tasks. Every item is saved as a real task record in this system (under an
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
    </>
  );
}

interface FlatDocRow {
  key: string;
  epicIndex: number;
  storyIndex: number;
  epicName: string;
  storyName: string;
  taskName: string;
  points: number;
  estimateHours: number;
  complexity: number;
}

function flattenBacklog(backlog: GeneratedBacklog): FlatDocRow[] {
  const rows: FlatDocRow[] = [];
  backlog.epics.forEach((epic, epicIndex) => {
    (epic.userStories ?? []).forEach((story, storyIndex) => {
      const task = (story.tasks ?? [])[0];
      if (!task) {
        return;
      }
      rows.push({
        key: `${epicIndex}-${storyIndex}`,
        epicIndex,
        storyIndex,
        epicName: epic.name,
        storyName: story.name,
        taskName: task.name,
        points: task.points,
        estimateHours: task.estimateHours,
        complexity: task.complexity,
      });
    });
  });
  return rows;
}

interface DetailFormValues {
  epicName: string;
  epicDescription?: string;
  storyName: string;
  storyDescription?: string;
  taskName: string;
  taskDescription?: string;
  points: number;
  estimateHours: number;
  complexity: number;
}

/** Full detail of one generated row (its Epic + User Story + single Task) — opened via the review table's "View / Edit" button. Editing here mutates the in-memory backlog only; nothing is saved until Submit. */
function GeneratedItemDetailModal({
  epic,
  story,
  onClose,
  onSave,
}: {
  readonly epic: GeneratedEpic;
  readonly story: GeneratedStory;
  readonly onClose: () => void;
  readonly onSave: (values: DetailFormValues) => void;
}) {
  const [form] = Form.useForm<DetailFormValues>();
  const task = story.tasks[0];

  return (
    <Modal
      title="Task Detail"
      open
      width={560}
      okText="Save"
      onCancel={onClose}
      onOk={() => form.validateFields().then((values) => { onSave(values); onClose(); })}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          epicName: epic.name,
          epicDescription: epic.description,
          storyName: story.name,
          storyDescription: story.description,
          taskName: task?.name,
          taskDescription: task?.description,
          points: task?.points,
          estimateHours: task?.estimateHours,
          complexity: task?.complexity,
        }}
      >
        <Form.Item name="epicName" label="Epic name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="epicDescription" label="Epic description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="storyName" label="User Story name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="storyDescription" label="User Story description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="taskName" label="Task name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="taskDescription" label="Task description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Space wrap>
          <Form.Item name="points" label="Points" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item name="estimateHours" label="Estimate hrs" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={0} step={0.5} />
          </Form.Item>
          <Form.Item name="complexity" label="Complexity (1-5)" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={1} max={5} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}

function FromDocumentForm() {
  const { currentEmployee } = useAuth();
  const isAdmin = currentEmployee?.role === Role.ADMIN;

  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backlog, setBacklog] = useState<GeneratedBacklog | null>(null);

  const [jiraProjects, setJiraProjects] = useState<JiraProjectSummary[]>([]);
  const [targetJiraKey, setTargetJiraKey] = useState<string | undefined>(undefined);

  const [checkingMatches, setCheckingMatches] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestionResult | null>(null);
  const [resolvedMatches, setResolvedMatches] = useState<Set<string>>(new Set());
  const [mappedEpicKeys, setMappedEpicKeys] = useState<Record<number, string>>({});
  const [mappedStoryKeys, setMappedStoryKeys] = useState<Record<string, string>>({});

  const [detailTarget, setDetailTarget] = useState<{ epicIndex: number; storyIndex: number } | null>(null);

  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<GeneratedBacklogPushSummary | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    fetchJiraProjects().catch(() => undefined).then((p) => p && setJiraProjects(p));
  }, []);

  const handleGenerate = async () => {
    if (!file) {
      setError('Choose a .docx file first');
      return;
    }
    setGenerating(true);
    setError(null);
    setBacklog(null);
    setPushResult(null);
    setMatchSuggestions(null);
    setResolvedMatches(new Set());
    setMappedEpicKeys({});
    setMappedStoryKeys({});
    try {
      const preview = await previewBacklogFromDocument(file);
      setBacklog(preview);
    } catch (err) {
      setError(errorMessage(err, 'Failed to read Epics/User Stories from this document'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCheckMatches = async () => {
    if (!backlog || !targetJiraKey) return;
    setCheckingMatches(true);
    setMatchError(null);
    try {
      const result = await suggestExistingMatches(targetJiraKey, backlog.epics);
      setMatchSuggestions(result);
    } catch (err) {
      setMatchError(errorMessage(err, 'Failed to check for existing matches in Jira'));
    } finally {
      setCheckingMatches(false);
    }
  };

  const updateBacklog = (mutator: (draft: GeneratedBacklog) => void) => {
    setBacklog((prev) => {
      if (!prev) return prev;
      const next: GeneratedBacklog = JSON.parse(JSON.stringify(prev));
      mutator(next);
      return next;
    });
  };

  const acceptEpicMatch = (match: EpicMatch) => {
    if (!backlog || !match.matchedExistingKey || !match.matchedExistingName) return;
    const epicIndex = backlog.epics.findIndex((e) => e.name === match.generatedEpicName);
    if (epicIndex === -1) return;
    const existingKey = match.matchedExistingKey;
    updateBacklog((draft) => {
      draft.epics[epicIndex].name = match.matchedExistingName as string;
    });
    setMappedEpicKeys((prev) => ({ ...prev, [epicIndex]: existingKey }));
    setResolvedMatches((prev) => new Set(prev).add(`epic:${match.generatedEpicName}`));
  };

  const dismissEpicMatch = (match: EpicMatch) => {
    setResolvedMatches((prev) => new Set(prev).add(`epic:${match.generatedEpicName}`));
  };

  const findStoryLocation = (name: string): { epicIndex: number; storyIndex: number } | null => {
    if (!backlog) return null;
    for (let epicIndex = 0; epicIndex < backlog.epics.length; epicIndex++) {
      const storyIndex = backlog.epics[epicIndex].userStories.findIndex((s) => s.name === name);
      if (storyIndex !== -1) return { epicIndex, storyIndex };
    }
    return null;
  };

  const acceptStoryMatch = (match: StoryMatch) => {
    if (!match.matchedExistingKey || !match.matchedExistingName) return;
    const location = findStoryLocation(match.generatedStoryName);
    if (!location) return;
    const existingKey = match.matchedExistingKey;
    updateBacklog((draft) => {
      draft.epics[location.epicIndex].userStories[location.storyIndex].name = match.matchedExistingName as string;
    });
    setMappedStoryKeys((prev) => ({ ...prev, [`${location.epicIndex}-${location.storyIndex}`]: existingKey }));
    setResolvedMatches((prev) => new Set(prev).add(`story:${match.generatedStoryName}`));
  };

  const dismissStoryMatch = (match: StoryMatch) => {
    setResolvedMatches((prev) => new Set(prev).add(`story:${match.generatedStoryName}`));
  };

  const handleSaveDetail = (epicIndex: number, storyIndex: number, values: DetailFormValues) => {
    updateBacklog((draft) => {
      const epic = draft.epics[epicIndex];
      const story = epic.userStories[storyIndex];
      epic.name = values.epicName;
      epic.description = values.epicDescription;
      story.name = values.storyName;
      story.description = values.storyDescription;
      const task = story.tasks[0];
      if (task) {
        task.name = values.taskName;
        task.description = values.taskDescription;
        task.points = values.points;
        task.estimateHours = values.estimateHours;
        task.complexity = values.complexity;
      }
    });
  };

  const handleSubmit = async () => {
    if (!backlog || !targetJiraKey) return;
    setPushing(true);
    setPushError(null);
    setPushResult(null);
    try {
      const result = await pushGeneratedBacklogToJira(targetJiraKey, backlog.epics);
      setPushResult(result);
    } catch (err) {
      setPushError(errorMessage(err, 'Failed to push the reviewed tasks to Jira'));
    } finally {
      setPushing(false);
    }
  };

  const flatRows = backlog ? flattenBacklog(backlog) : [];
  const pendingEpicMatches = (matchSuggestions?.epicMatches ?? []).filter(
    (m) => m.matchedExistingKey && !resolvedMatches.has(`epic:${m.generatedEpicName}`),
  );
  const pendingStoryMatches = (matchSuggestions?.storyMatches ?? []).filter(
    (m) => m.matchedExistingKey && !resolvedMatches.has(`story:${m.generatedStoryName}`),
  );
  const detailEpic = detailTarget ? backlog?.epics[detailTarget.epicIndex] : undefined;
  const detailStory = detailTarget && detailEpic ? detailEpic.userStories[detailTarget.storyIndex] : undefined;

  return (
    <>
      <Typography.Paragraph type="secondary">
        Upload a .docx requirements document that already describes Epics and User Stories. Gemini extracts them and
        creates exactly <strong>one Task per User Story</strong> — its single concrete deliverable, not a further
        breakdown. Nothing is saved in this system — review the generated tasks below, then submit to push them
        straight into a Jira project.
      </Typography.Paragraph>

      <Space wrap align="start">
        <Upload
          accept=".docx"
          maxCount={1}
          fileList={file ? [{ uid: '1', name: file.name }] : []}
          beforeUpload={(f) => {
            setFile(f);
            return false;
          }}
          onRemove={() => setFile(null)}
        >
          <Button icon={<UploadOutlined />}>Choose .docx file</Button>
        </Upload>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} disabled={!file} onClick={handleGenerate}>
          Generate Tasks
        </Button>
      </Space>
      {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}

      {backlog && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            Target Jira project
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            Pick the Jira project this backlog is headed for — used both to check for existing Epics/User Stories to
            reuse below, and, once you're ready, to submit.
          </Typography.Paragraph>
          <Space wrap>
            <Select
              showSearch
              placeholder="Target Jira project"
              style={{ width: 260 }}
              value={targetJiraKey}
              onChange={(value) => {
                setTargetJiraKey(value);
                setMatchSuggestions(null);
                setResolvedMatches(new Set());
              }}
              options={jiraProjects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
              optionFilterProp="label"
            />
            <Button icon={<SearchOutlined />} loading={checkingMatches} disabled={!targetJiraKey} onClick={handleCheckMatches}>
              Check for Existing Matches in Jira
            </Button>
          </Space>
          {matchError && <Alert style={{ marginTop: 12 }} type="error" showIcon message={matchError} />}

          {(pendingEpicMatches.length > 0 || pendingStoryMatches.length > 0) && (
            <Card size="small" style={{ marginTop: 12 }} title="Possible existing matches">
              <Space direction="vertical" style={{ width: '100%' }}>
                {pendingEpicMatches.map((m) => (
                  <Space key={`epic:${m.generatedEpicName}`} wrap>
                    <Tag color="purple">Epic</Tag>
                    <span>
                      "{m.generatedEpicName}" looks like existing <strong>{m.matchedExistingKey}</strong> — "
                      {m.matchedExistingName}"
                    </span>
                    <Button size="small" type="primary" onClick={() => acceptEpicMatch(m)}>
                      Use existing
                    </Button>
                    <Button size="small" onClick={() => dismissEpicMatch(m)}>
                      Keep new
                    </Button>
                  </Space>
                ))}
                {pendingStoryMatches.map((m) => (
                  <Space key={`story:${m.generatedStoryName}`} wrap>
                    <Tag color="green">Story</Tag>
                    <span>
                      "{m.generatedStoryName}" looks like existing <strong>{m.matchedExistingKey}</strong> — "
                      {m.matchedExistingName}"
                    </span>
                    <Button size="small" type="primary" onClick={() => acceptStoryMatch(m)}>
                      Use existing
                    </Button>
                    <Button size="small" onClick={() => dismissStoryMatch(m)}>
                      Keep new
                    </Button>
                  </Space>
                ))}
              </Space>
            </Card>
          )}
          {matchSuggestions && pendingEpicMatches.length === 0 && pendingStoryMatches.length === 0 && (
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="No confident matches found in this Jira project — every Epic/User Story here will be created as new."
            />
          )}

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            Review ({flatRows.length} task{flatRows.length === 1 ? '' : 's'})
          </Typography.Title>
          <Table
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={flatRows}
            columns={[
              {
                title: 'Epic',
                render: (_, r: FlatDocRow) => (
                  <Space>
                    {r.epicName}
                    {mappedEpicKeys[r.epicIndex] && <Tag color="blue">Mapped: {mappedEpicKeys[r.epicIndex]}</Tag>}
                  </Space>
                ),
              },
              {
                title: 'User Story',
                render: (_, r: FlatDocRow) => (
                  <Space>
                    {r.storyName}
                    {mappedStoryKeys[`${r.epicIndex}-${r.storyIndex}`] && (
                      <Tag color="blue">Mapped: {mappedStoryKeys[`${r.epicIndex}-${r.storyIndex}`]}</Tag>
                    )}
                  </Space>
                ),
              },
              { title: 'Task', dataIndex: 'taskName' },
              { title: 'Points', dataIndex: 'points' },
              { title: 'Est. hrs', dataIndex: 'estimateHours' },
              { title: 'Complexity', dataIndex: 'complexity' },
              {
                title: 'Actions',
                render: (_, r: FlatDocRow) => (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setDetailTarget({ epicIndex: r.epicIndex, storyIndex: r.storyIndex })}
                  >
                    View / Edit
                  </Button>
                ),
              },
            ]}
          />

          {isAdmin ? (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                Submit
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                Pushes every Epic/User Story/Task above directly into the selected Jira project (picked above),
                preserving the hierarchy. This is a live, visible write to your team's Jira.
              </Typography.Paragraph>
              <Button type="primary" icon={<CloudSyncOutlined />} loading={pushing} disabled={!targetJiraKey} onClick={handleSubmit}>
                Submit to Jira
              </Button>
              {pushError && <Alert style={{ marginTop: 12 }} type="error" showIcon message={pushError} />}
              {pushResult && (
                <>
                  <Alert
                    style={{ marginTop: 12 }}
                    type={pushResult.failed > 0 ? 'warning' : 'success'}
                    showIcon
                    message={`${pushResult.pushed} pushed, ${pushResult.failed} failed (${pushResult.totalItems} Epic/Story/Task items total)`}
                  />
                  <Table
                    style={{ marginTop: 12 }}
                    rowKey={(_r, i) => String(i)}
                    size="small"
                    pagination={{ pageSize: 10 }}
                    dataSource={pushResult.rows}
                    columns={[
                      { title: 'Item', dataIndex: 'name' },
                      { title: 'Type', dataIndex: 'issueType' },
                      {
                        title: 'Result',
                        render: (_, r: GeneratedBacklogPushRow) => (
                          <Space>
                            {r.outcome === 'pushed' && <Tag color="green">Pushed: {r.jiraIssueKey}</Tag>}
                            {r.outcome === 'already_exists' && <Tag color="blue">Already exists: {r.jiraIssueKey}</Tag>}
                            {r.outcome === 'skipped_parent_failed' && <Tag>Skipped (parent failed)</Tag>}
                            {r.outcome === 'failed' && <Tag color="red">{r.errorMessage}</Tag>}
                            {r.droppedFields && <Tag color="gold">Dropped: {r.droppedFields.join(', ')}</Tag>}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              )}
            </>
          ) : (
            <Alert style={{ marginTop: 16 }} type="info" showIcon message="Submitting to Jira requires an Admin account." />
          )}
        </>
      )}

      {detailTarget && detailEpic && detailStory && (
        <GeneratedItemDetailModal
          key={`${detailTarget.epicIndex}-${detailTarget.storyIndex}`}
          epic={detailEpic}
          story={detailStory}
          onClose={() => setDetailTarget(null)}
          onSave={(values) => handleSaveDetail(detailTarget.epicIndex, detailTarget.storyIndex, values)}
        />
      )}
    </>
  );
}

export function BacklogGeneratorPage() {
  const [result, setResult] = useState<BacklogGeneratorResult | null>(null);

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
        <Tabs
          items={[
            {
              key: 'description',
              label: 'From Description',
              children: <FromDescriptionForm onGenerated={setResult} />,
            },
            {
              key: 'document',
              label: 'From Word Document',
              children: <FromDocumentForm />,
            },
          ]}
        />
      </Card>

      {result && <ResultCard result={result} />}
    </Space>
  );
}
