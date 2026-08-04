import { useEffect, useState } from 'react';
import { Card, Space, Typography, Form, Input, InputNumber, Button, Alert, Row, Col, Statistic, Tag, Tabs, Upload, Select, Table, Modal } from 'antd';
import axios from 'axios';
import {
  FileTextOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  CloudSyncOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import {
  generateBacklog,
  previewBacklogFromDocument,
  previewBacklogFromJiraLink,
  pushGeneratedBacklogToJira,
  suggestExistingMatches,
} from '../../services/backlogGeneratorService';
import { fetchJiraEpicsAndStories, fetchJiraProjects, pushProjectToJira } from '../../services/jiraService';
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
import { JiraEpicOrStory, JiraProjectPushRow, JiraProjectPushSummary, JiraProjectSummary } from '../../types/jira';
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

/**
 * The doc-import review UI supports removing rows, which shifts array
 * indices around — so every Epic/Story gets a stable client-only `_id`
 * (never sent to the backend, see toPlainEpics) that all the tracking
 * maps (mapped-to-existing tags, the detail modal target) key off of
 * instead of a position that can silently drift after a removal.
 */
interface LocalStory extends GeneratedStory {
  _id: string;
}
interface LocalEpic extends GeneratedEpic {
  _id: string;
  userStories: LocalStory[];
}
interface LocalBacklog {
  epics: LocalEpic[];
}

function withLocalIds(backlog: GeneratedBacklog): LocalBacklog {
  return {
    epics: backlog.epics.map((epic) => ({
      ...epic,
      _id: crypto.randomUUID(),
      userStories: (epic.userStories ?? []).map((story) => ({ ...story, _id: crypto.randomUUID() })),
    })),
  };
}

function toPlainEpics(epics: LocalEpic[]): GeneratedEpic[] {
  return epics.map(({ _id, userStories, ...epicRest }) => ({
    ...epicRest,
    userStories: userStories.map(({ _id: storyId, ...storyRest }) => storyRest),
  }));
}

/** [US-1.1]-style prefix already used elsewhere in this system for taskCode — matched here to derive a matching [Task-1.1.1] prefix once a generated Story is mapped onto an existing Jira Story that already follows the convention. */
// Matches whatever dotted numbering a [US-...] prefix actually uses — e.g. this system's own two-part
// [US-1.1] (Epic 1, Story 1) convention, but real Jira projects have also been seen using a single-number
// [US-1] scheme instead. Either way the captured numbering is reused as-is, with a trailing task index appended.
const US_PREFIX_REGEX = /^\[US-([\d.]+)\]/;
const TASK_PREFIX_REGEX = /^\[Task-[\d.]+\]\s*/;

/** Re-derives (idempotently — strips any prior [Task-...] prefix first) a Task's prefix from its Story's current [US-...] numbering, so it self-corrects if the Story gets (re)mapped or edited. No prefix is invented for a Story with no such numbering. */
function deriveTaskName(storyName: string, taskName: string): string {
  const bareName = taskName.replace(TASK_PREFIX_REGEX, '');
  const match = storyName.match(US_PREFIX_REGEX);
  if (!match) {
    return bareName;
  }
  return `[Task-${match[1]}.1] ${bareName}`;
}

function syncTaskPrefixes(backlog: LocalBacklog): void {
  backlog.epics.forEach((epic) => {
    epic.userStories.forEach((story) => {
      const task = story.tasks[0];
      if (task) {
        task.name = deriveTaskName(story.name, task.name);
      }
    });
  });
}

interface FlatDocRow {
  key: string;
  epicId: string;
  storyId: string;
  epicName: string;
  storyName: string;
  taskName: string;
  points: number;
  estimateHours: number;
  complexity: number;
}

function flattenBacklog(backlog: LocalBacklog): FlatDocRow[] {
  const rows: FlatDocRow[] = [];
  backlog.epics.forEach((epic) => {
    epic.userStories.forEach((story) => {
      const task = (story.tasks ?? [])[0];
      if (!task) {
        return;
      }
      rows.push({
        key: story._id,
        epicId: epic._id,
        storyId: story._id,
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
        <Form.Item name="taskDescription" label="Task description" extra="Includes the generated Acceptance Criteria, if any — edit freely.">
          <Input.TextArea rows={8} />
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

/** Step 3 of BacklogImportFlow when sourceKind is "document" — a .docx upload. */
function DocumentImportStep({ onGenerated }: { readonly onGenerated: (backlog: GeneratedBacklog) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!file) {
      setError('Choose a .docx file first');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      onGenerated(await previewBacklogFromDocument(file));
    } catch (err) {
      setError(errorMessage(err, 'Failed to read Epics/User Stories from this document'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
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
    </>
  );
}

/** Step 3 of BacklogImportFlow when sourceKind is "jira-link" — a Jira issue (any URL shape, or a bare key) or a Confluence page link, both fetched live via the saved Jira connection (same token, same Atlassian site). */
function JiraLinkImportStep({ onGenerated }: { readonly onGenerated: (backlog: GeneratedBacklog) => void }) {
  const [link, setLink] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!link.trim()) {
      setError('Paste a Jira issue or Confluence page link (or a bare Jira key) first');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      onGenerated(await previewBacklogFromJiraLink(link.trim()));
    } catch (err) {
      setError(errorMessage(err, 'Failed to read Epics/User Stories from that link'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Space wrap align="start">
        <Input
          placeholder="Jira issue (.../browse/ABC-123, or just ABC-123) or Confluence page (.../wiki/spaces/.../pages/123456/...)"
          style={{ width: 460 }}
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} disabled={!link.trim()} onClick={handleGenerate}>
          Generate Tasks
        </Button>
      </Space>
      {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}
    </>
  );
}

function BacklogImportFlow({ sourceKind }: { readonly sourceKind: 'document' | 'jira-link' }) {
  const { currentEmployee } = useAuth();
  const isAdmin = currentEmployee?.role === Role.ADMIN;

  const [jiraProjects, setJiraProjects] = useState<JiraProjectSummary[]>([]);
  const [targetJiraKey, setTargetJiraKey] = useState<string | undefined>(undefined);
  const [existingItems, setExistingItems] = useState<JiraEpicOrStory[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existingError, setExistingError] = useState<string | null>(null);

  const [backlog, setBacklog] = useState<LocalBacklog | null>(null);

  const [checkingMatches, setCheckingMatches] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestionResult | null>(null);
  const [resolvedMatches, setResolvedMatches] = useState<Set<string>>(new Set());
  const [mappedEpicKeys, setMappedEpicKeys] = useState<Record<string, string>>({});
  const [mappedStoryKeys, setMappedStoryKeys] = useState<Record<string, string>>({});

  const [detailTarget, setDetailTarget] = useState<{ epicId: string; storyId: string } | null>(null);

  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<GeneratedBacklogPushSummary | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    fetchJiraProjects().catch(() => undefined).then((p) => p && setJiraProjects(p));
  }, []);

  useEffect(() => {
    if (!targetJiraKey) {
      setExistingItems([]);
      return;
    }
    setLoadingExisting(true);
    setExistingError(null);
    fetchJiraEpicsAndStories(targetJiraKey)
      .then(setExistingItems)
      .catch((err) => setExistingError(errorMessage(err, 'Failed to load existing Epics/User Stories from this project')))
      .finally(() => setLoadingExisting(false));
  }, [targetJiraKey]);

  const handleSelectProject = (value: string) => {
    setTargetJiraKey(value);
    setBacklog(null);
    setMatchSuggestions(null);
    setResolvedMatches(new Set());
    setMappedEpicKeys({});
    setMappedStoryKeys({});
    setPushResult(null);
  };

  const handleBacklogGenerated = (raw: GeneratedBacklog) => {
    const withIds = withLocalIds(raw);
    syncTaskPrefixes(withIds);
    setBacklog(withIds);
    setPushResult(null);
    setMatchSuggestions(null);
    setResolvedMatches(new Set());
    setMappedEpicKeys({});
    setMappedStoryKeys({});
  };

  const handleCheckMatches = async () => {
    if (!backlog || !targetJiraKey) return;
    setCheckingMatches(true);
    setMatchError(null);
    try {
      const result = await suggestExistingMatches(targetJiraKey, toPlainEpics(backlog.epics));
      setMatchSuggestions(result);
    } catch (err) {
      setMatchError(errorMessage(err, 'Failed to check for existing matches in Jira'));
    } finally {
      setCheckingMatches(false);
    }
  };

  const updateBacklog = (mutator: (draft: LocalBacklog) => void) => {
    setBacklog((prev) => {
      if (!prev) return prev;
      const next: LocalBacklog = JSON.parse(JSON.stringify(prev));
      mutator(next);
      syncTaskPrefixes(next);
      return next;
    });
  };

  const acceptEpicMatch = (match: EpicMatch) => {
    if (!backlog || !match.matchedExistingKey || !match.matchedExistingName) return;
    const epic = backlog.epics.find((e) => e.name === match.generatedEpicName);
    if (!epic) return;
    const epicId = epic._id;
    const existingKey = match.matchedExistingKey;
    const existingName = match.matchedExistingName;
    updateBacklog((draft) => {
      const target = draft.epics.find((e) => e._id === epicId);
      if (target) target.name = existingName;
    });
    setMappedEpicKeys((prev) => ({ ...prev, [epicId]: existingKey }));
    setResolvedMatches((prev) => new Set(prev).add(`epic:${match.generatedEpicName}`));
  };

  const dismissEpicMatch = (match: EpicMatch) => {
    setResolvedMatches((prev) => new Set(prev).add(`epic:${match.generatedEpicName}`));
  };

  const findStoryByName = (name: string): { epicId: string; storyId: string } | null => {
    if (!backlog) return null;
    for (const epic of backlog.epics) {
      const story = epic.userStories.find((s) => s.name === name);
      if (story) return { epicId: epic._id, storyId: story._id };
    }
    return null;
  };

  const acceptStoryMatch = (match: StoryMatch) => {
    if (!match.matchedExistingKey || !match.matchedExistingName) return;
    const location = findStoryByName(match.generatedStoryName);
    if (!location) return;
    const existingKey = match.matchedExistingKey;
    const existingName = match.matchedExistingName;
    updateBacklog((draft) => {
      const epic = draft.epics.find((e) => e._id === location.epicId);
      const story = epic?.userStories.find((s) => s._id === location.storyId);
      if (story) story.name = existingName;
    });
    setMappedStoryKeys((prev) => ({ ...prev, [location.storyId]: existingKey }));
    setResolvedMatches((prev) => new Set(prev).add(`story:${match.generatedStoryName}`));
  };

  const dismissStoryMatch = (match: StoryMatch) => {
    setResolvedMatches((prev) => new Set(prev).add(`story:${match.generatedStoryName}`));
  };

  const handleSaveDetail = (epicId: string, storyId: string, values: DetailFormValues) => {
    updateBacklog((draft) => {
      const epic = draft.epics.find((e) => e._id === epicId);
      const story = epic?.userStories.find((s) => s._id === storyId);
      if (!epic || !story) return;
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

  const removeRow = (epicId: string, storyId: string) => {
    updateBacklog((draft) => {
      const epic = draft.epics.find((e) => e._id === epicId);
      if (!epic) return;
      epic.userStories = epic.userStories.filter((s) => s._id !== storyId);
    });
  };

  const handleSubmit = async () => {
    if (!backlog || !targetJiraKey) return;
    setPushing(true);
    setPushError(null);
    setPushResult(null);
    try {
      const result = await pushGeneratedBacklogToJira(targetJiraKey, toPlainEpics(backlog.epics));
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
  const detailEpic = detailTarget ? backlog?.epics.find((e) => e._id === detailTarget.epicId) : undefined;
  const detailStory = detailTarget && detailEpic ? detailEpic.userStories.find((s) => s._id === detailTarget.storyId) : undefined;

  return (
    <>
      <Typography.Paragraph type="secondary">
        1) Pick the target Jira project. 2) Review what's already there. 3){' '}
        {sourceKind === 'document' ? 'Upload a .docx requirements document' : 'Paste a link to a Jira issue or Confluence page'} —
        Gemini extracts its Epics/User Stories, creating exactly <strong>one Task per User Story</strong>. 4) Check
        for existing Epics/Stories that mean the same thing and map onto them instead of duplicating. 5) Review, edit
        or remove any row. 6) Submit. Nothing is saved in this system at any point — only step 6 writes to Jira.
      </Typography.Paragraph>

      <Typography.Title level={5}>1. Target Jira project</Typography.Title>
      <Select
        showSearch
        placeholder="Target Jira project"
        style={{ width: 260 }}
        value={targetJiraKey}
        onChange={handleSelectProject}
        options={jiraProjects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
        optionFilterProp="label"
      />

      {targetJiraKey && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            2. Existing Epics &amp; User Stories in {targetJiraKey}
          </Typography.Title>
          {existingError && <Alert type="error" showIcon message={existingError} />}
          <Table
            size="small"
            loading={loadingExisting}
            pagination={{ pageSize: 5 }}
            dataSource={existingItems}
            rowKey="key"
            locale={{ emptyText: 'No Epics or User Stories found in this project yet.' }}
            columns={[
              { title: 'Key', dataIndex: 'key', width: 100 },
              { title: 'Type', dataIndex: 'issueType', width: 100 },
              { title: 'Name', dataIndex: 'name' },
            ]}
          />

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            3. {sourceKind === 'document' ? 'Import Word document' : 'Import from a Jira or Confluence link'}
          </Typography.Title>
          {sourceKind === 'document' ? (
            <DocumentImportStep onGenerated={handleBacklogGenerated} />
          ) : (
            <JiraLinkImportStep onGenerated={handleBacklogGenerated} />
          )}
        </>
      )}

      {backlog && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            4. Check for existing matches
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            Compares the Epics/User Stories above against the list from step 2 by meaning, not just exact text.
          </Typography.Paragraph>
          <Button icon={<SearchOutlined />} loading={checkingMatches} onClick={handleCheckMatches}>
            Check for Existing Matches in Jira
          </Button>
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
            5. Review, edit or remove ({flatRows.length} task{flatRows.length === 1 ? '' : 's'})
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            A Task's Summary gets a matching <code>[Task-x.x.x]</code> prefix automatically once its User Story is
            mapped onto an existing <code>[US-x.x]</code>-style Jira Story — visible below and editable like anything
            else.
          </Typography.Paragraph>
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
                    {mappedEpicKeys[r.epicId] && <Tag color="blue">Mapped: {mappedEpicKeys[r.epicId]}</Tag>}
                  </Space>
                ),
              },
              {
                title: 'User Story',
                render: (_, r: FlatDocRow) => (
                  <Space>
                    {r.storyName}
                    {mappedStoryKeys[r.storyId] && <Tag color="blue">Mapped: {mappedStoryKeys[r.storyId]}</Tag>}
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
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setDetailTarget({ epicId: r.epicId, storyId: r.storyId })}>
                      View / Edit
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeRow(r.epicId, r.storyId)}>
                      Remove
                    </Button>
                  </Space>
                ),
              },
            ]}
          />

          {isAdmin ? (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                6. Submit
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                Pushes every Epic/User Story/Task above directly into {targetJiraKey}, preserving the hierarchy. This
                is a live, visible write to your team's Jira.
              </Typography.Paragraph>
              <Button type="primary" icon={<CloudSyncOutlined />} loading={pushing} disabled={flatRows.length === 0} onClick={handleSubmit}>
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
          key={`${detailTarget.epicId}-${detailTarget.storyId}`}
          epic={detailEpic}
          story={detailStory}
          onClose={() => setDetailTarget(null)}
          onSave={(values) => handleSaveDetail(detailTarget.epicId, detailTarget.storyId, values)}
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
              children: <BacklogImportFlow sourceKind="document" />,
            },
            {
              key: 'jira-link',
              label: 'From Jira / Confluence Link',
              children: <BacklogImportFlow sourceKind="jira-link" />,
            },
          ]}
        />
      </Card>

      {result && <ResultCard result={result} />}
    </Space>
  );
}
