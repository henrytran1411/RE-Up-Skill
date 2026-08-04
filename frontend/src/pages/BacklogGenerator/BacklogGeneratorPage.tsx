import { useEffect, useState } from 'react';
import { Card, Space, Typography, Form, Input, InputNumber, Button, Alert, Tag, Tabs, Upload, Select, Table, Modal, Popconfirm } from 'antd';
import axios from 'axios';
import {
  ThunderboltOutlined,
  UploadOutlined,
  CloudSyncOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import {
  previewBacklogFromDocument,
  previewBacklogFromJiraLink,
  previewOverviewFromLink,
  previewOverviewFromPdf,
  pushGeneratedBacklogToJira,
  suggestExistingMatches,
} from '../../services/backlogGeneratorService';
import { fetchJiraEpicsAndStories, fetchJiraProjects } from '../../services/jiraService';
import {
  EpicMatch,
  GeneratedBacklog,
  GeneratedBacklogPushRow,
  GeneratedBacklogPushSummary,
  GeneratedEpic,
  GeneratedStory,
  MatchSuggestionResult,
  StoryMatch,
} from '../../types/backlogGenerator';
import { JiraEpicOrStory, JiraProjectSummary } from '../../types/jira';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types/common';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

/**
 * The review UI (both the Task-level and Epic/Story-only flows) supports
 * removing rows, which shifts array indices around — so every Epic/Story
 * gets a stable client-only `_id` (never sent to the backend, see
 * toPlainEpics) that all the tracking maps (mapped-to-existing tags, detail
 * modal targets) key off of instead of a position that can silently drift
 * after a removal.
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

function combinePrefixed(prefix: string, bareName: string): string {
  return prefix.trim() ? `${prefix.trim()} ${bareName.trim()}` : bareName.trim();
}

// ---------------------------------------------------------------------------
// Task-level flow (From Word Document / From Jira-Confluence Link): each
// User Story yields exactly one Task, persisted nowhere until Submit.
// ---------------------------------------------------------------------------

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

/** Splits a Task's stored name into its auto-derived [Task-x.x.x]-style prefix (if any) and the bare summary after it, so the modal can offer them as two separate fields — editing the prefix on its own is easy to get wrong when it's buried inside one longer string. */
function splitTaskName(taskName: string): { prefix: string; bareName: string } {
  const match = taskName.match(/^(\[Task-[\d.]+\])\s*(.*)$/);
  if (!match) {
    return { prefix: '', bareName: taskName };
  }
  return { prefix: match[1], bareName: match[2] };
}

interface DetailFormFields {
  epicName: string;
  epicDescription?: string;
  storyName: string;
  storyDescription?: string;
  taskPrefix: string;
  taskSummary: string;
  taskDescription?: string;
  points: number;
  estimateHours: number;
  complexity: number;
}

/**
 * Full detail of one generated row (its Epic + User Story + single Task) —
 * opened via the review table's "View / Edit" button. Editing here mutates
 * the in-memory backlog only; nothing is saved until Submit. The Task's
 * code prefix (e.g. "[Task-1.1.1]", auto-derived once its Story is mapped
 * onto an existing [US-x.x] Jira Story — see deriveTaskName) is broken out
 * into its own field so it can be edited or cleared without risking a typo
 * in the surrounding summary text; whatever is saved here is final and
 * won't be re-derived or overwritten afterward.
 */
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
  const [form] = Form.useForm<DetailFormFields>();
  const task = story.tasks[0];
  const { prefix, bareName } = splitTaskName(task?.name ?? '');

  const handleOk = () =>
    form.validateFields().then((values) => {
      const taskName = combinePrefixed(values.taskPrefix, values.taskSummary);
      onSave({ ...values, taskName });
      onClose();
    });

  return (
    <Modal title="Task Detail" open width={560} okText="Save" onCancel={onClose} onOk={handleOk}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          epicName: epic.name,
          epicDescription: epic.description,
          storyName: story.name,
          storyDescription: story.description,
          taskPrefix: prefix,
          taskSummary: bareName,
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
        <Space wrap align="start" style={{ width: '100%' }}>
          <Form.Item
            name="taskPrefix"
            label="Task code prefix"
            style={{ width: 180 }}
            extra="Auto-filled once the Story above is mapped onto an existing Jira Story — edit or clear freely."
          >
            <Input placeholder="[Task-1.1.1]" />
          </Form.Item>
          <Form.Item name="taskSummary" label="Task summary" style={{ width: 320 }} rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
        </Space>
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

// ---------------------------------------------------------------------------
// Shared import-step controls — a link (Jira issue or Confluence page) or a
// file upload, each parameterized by which preview endpoint to call, reused
// by both the Task-level flow and the Epic/Story-only overview flow below.
// ---------------------------------------------------------------------------

function LinkImportStep({
  placeholder,
  previewFn,
  errorFallback,
  onGenerated,
}: {
  readonly placeholder: string;
  readonly previewFn: (link: string) => Promise<GeneratedBacklog>;
  readonly errorFallback: string;
  readonly onGenerated: (backlog: GeneratedBacklog) => void;
}) {
  const [link, setLink] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!link.trim()) {
      setError('Paste a link first');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      onGenerated(await previewFn(link.trim()));
    } catch (err) {
      setError(errorMessage(err, errorFallback));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Space wrap align="start">
        <Input placeholder={placeholder} style={{ width: 460 }} value={link} onChange={(e) => setLink(e.target.value)} />
        <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} disabled={!link.trim()} onClick={handleGenerate}>
          Generate
        </Button>
      </Space>
      {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}
    </>
  );
}

function FileImportStep({
  accept,
  buttonLabel,
  previewFn,
  errorFallback,
  onGenerated,
}: {
  readonly accept: string;
  readonly buttonLabel: string;
  readonly previewFn: (file: File) => Promise<GeneratedBacklog>;
  readonly errorFallback: string;
  readonly onGenerated: (backlog: GeneratedBacklog) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!file) {
      setError(`Choose a ${accept} file first`);
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      onGenerated(await previewFn(file));
    } catch (err) {
      setError(errorMessage(err, errorFallback));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Space wrap align="start">
        <Upload
          accept={accept}
          maxCount={1}
          fileList={file ? [{ uid: '1', name: file.name }] : []}
          beforeUpload={(f) => {
            setFile(f);
            return false;
          }}
          onRemove={() => setFile(null)}
        >
          <Button icon={<UploadOutlined />}>{buttonLabel}</Button>
        </Upload>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} disabled={!file} onClick={handleGenerate}>
          Generate
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
    withIds.epics.forEach((epic) => epic.userStories.forEach((story) => {
      const task = story.tasks[0];
      if (task) task.name = deriveTaskName(story.name, task.name);
    }));
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

  // Deliberately does NOT run any prefix re-derivation here — this is also how a manual edit from the
  // detail modal gets saved, and re-deriving on every mutation would immediately overwrite whatever
  // prefix the user just typed. Auto-derivation only runs once, right where a Story's [US-x.x] mapping
  // actually changes (acceptStoryMatch below) and on the initial preview — never as a blanket side effect.
  const updateBacklog = (mutator: (draft: LocalBacklog) => void) => {
    setBacklog((prev) => {
      if (!prev) return prev;
      const next: LocalBacklog = JSON.parse(JSON.stringify(prev));
      mutator(next);
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
      if (!story) return;
      story.name = existingName;
      // Auto-derive this one Story's Task prefix from its new [US-x.x] mapping — scoped to just this
      // story, not every task in the backlog, so an unrelated task's manually-edited prefix is never touched.
      const task = story.tasks[0];
      if (task) {
        task.name = deriveTaskName(existingName, task.name);
      }
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
            <FileImportStep
              accept=".docx"
              buttonLabel="Choose .docx file"
              previewFn={previewBacklogFromDocument}
              errorFallback="Failed to read Epics/User Stories from this document"
              onGenerated={handleBacklogGenerated}
            />
          ) : (
            <LinkImportStep
              placeholder="Jira issue (.../browse/ABC-123, or just ABC-123) or Confluence page (.../wiki/spaces/.../pages/123456/...)"
              previewFn={previewBacklogFromJiraLink}
              errorFallback="Failed to read Epics/User Stories from that link"
              onGenerated={handleBacklogGenerated}
            />
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

// ---------------------------------------------------------------------------
// Overview flow (From Description): a project-level description — from a
// Jira/Confluence link or a PDF — becomes Epics and User Stories only, no
// Tasks. Numbering ([Epic-x] / [US-x.x]) is a distinct, explicit step run
// after matching, not an automatic side effect.
// ---------------------------------------------------------------------------

function hasEpicPrefix(name: string): boolean {
  return /^\[Epic-\d+\]/.test(name);
}
function hasStoryPrefix(name: string): boolean {
  return /^\[US-[\d.]+\]/.test(name);
}
function splitEpicName(name: string): { prefix: string; bareName: string } {
  const match = name.match(/^(\[Epic-\d+\])\s*(.*)$/);
  return match ? { prefix: match[1], bareName: match[2] } : { prefix: '', bareName: name };
}
function splitStoryName(name: string): { prefix: string; bareName: string } {
  const match = name.match(/^(\[US-[\d.]+\])\s*(.*)$/);
  return match ? { prefix: match[1], bareName: match[2] } : { prefix: '', bareName: name };
}

/** Assigns [Epic-N] / [US-N.M] to whichever Epics/Stories don't already have a prefix (from a Jira mapping, or a previous run of this) — never touches one that already has any prefix, so manual edits and mapped-in prefixes are preserved. */
function finalizeOverviewNumbering(backlog: LocalBacklog): void {
  backlog.epics.forEach((epic, epicIndex) => {
    if (!hasEpicPrefix(epic.name)) {
      epic.name = `[Epic-${epicIndex + 1}] ${epic.name}`;
    }
    const epicNum = epic.name.match(/^\[Epic-(\d+)\]/)?.[1] ?? String(epicIndex + 1);
    epic.userStories.forEach((story, storyIndex) => {
      if (!hasStoryPrefix(story.name)) {
        story.name = `[US-${epicNum}.${storyIndex + 1}] ${story.name}`;
      }
    });
  });
}

interface EpicDetailFields {
  epicPrefix: string;
  epicSummary: string;
  epicDescription?: string;
}

function EpicDetailModal({
  epic,
  onClose,
  onSave,
}: {
  readonly epic: LocalEpic;
  readonly onClose: () => void;
  readonly onSave: (name: string, description?: string) => void;
}) {
  const [form] = Form.useForm<EpicDetailFields>();
  const { prefix, bareName } = splitEpicName(epic.name);

  const handleOk = () =>
    form.validateFields().then((values) => {
      onSave(combinePrefixed(values.epicPrefix, values.epicSummary), values.epicDescription);
      onClose();
    });

  return (
    <Modal title="Epic Detail" open width={480} okText="Save" onCancel={onClose} onOk={handleOk}>
      <Form form={form} layout="vertical" initialValues={{ epicPrefix: prefix, epicSummary: bareName, epicDescription: epic.description }}>
        <Space wrap align="start" style={{ width: '100%' }}>
          <Form.Item
            name="epicPrefix"
            label="Epic code prefix"
            style={{ width: 160 }}
            extra="Auto-filled by 'Generate Epic/User Story Data' — edit or clear freely."
          >
            <Input placeholder="[Epic-1]" />
          </Form.Item>
          <Form.Item name="epicSummary" label="Epic summary" style={{ width: 260 }} rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
        </Space>
        <Form.Item name="epicDescription" label="Epic description">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface StoryDetailFields {
  storyPrefix: string;
  storySummary: string;
  storyDescription?: string;
}

function StoryDetailModal({
  story,
  onClose,
  onSave,
}: {
  readonly story: LocalStory;
  readonly onClose: () => void;
  readonly onSave: (name: string, description?: string) => void;
}) {
  const [form] = Form.useForm<StoryDetailFields>();
  const { prefix, bareName } = splitStoryName(story.name);

  const handleOk = () =>
    form.validateFields().then((values) => {
      onSave(combinePrefixed(values.storyPrefix, values.storySummary), values.storyDescription);
      onClose();
    });

  return (
    <Modal title="User Story Detail" open width={480} okText="Save" onCancel={onClose} onOk={handleOk}>
      <Form form={form} layout="vertical" initialValues={{ storyPrefix: prefix, storySummary: bareName, storyDescription: story.description }}>
        <Space wrap align="start" style={{ width: '100%' }}>
          <Form.Item
            name="storyPrefix"
            label="User Story code prefix"
            style={{ width: 160 }}
            extra="Auto-filled by 'Generate Epic/User Story Data', or by mapping onto an existing Jira Story — edit or clear freely."
          >
            <Input placeholder="[US-1.1]" />
          </Form.Item>
          <Form.Item name="storySummary" label="User Story summary" style={{ width: 260 }} rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
        </Space>
        <Form.Item name="storyDescription" label="User Story description">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface OverviewEpicRow {
  key: string;
  rowType: 'epic';
  epicId: string;
  name: string;
  description?: string;
  mappedKey?: string;
  children?: OverviewStoryRow[];
}
interface OverviewStoryRow {
  key: string;
  rowType: 'story';
  epicId: string;
  storyId: string;
  name: string;
  description?: string;
  mappedKey?: string;
}
type OverviewTableRow = OverviewEpicRow | OverviewStoryRow;

function buildOverviewRows(
  backlog: LocalBacklog,
  mappedEpicKeys: Record<string, string>,
  mappedStoryKeys: Record<string, string>,
): OverviewEpicRow[] {
  return backlog.epics.map((epic) => ({
    key: epic._id,
    rowType: 'epic',
    epicId: epic._id,
    name: epic.name,
    description: epic.description,
    mappedKey: mappedEpicKeys[epic._id],
    children:
      epic.userStories.length > 0
        ? epic.userStories.map((story) => ({
            key: story._id,
            rowType: 'story',
            epicId: epic._id,
            storyId: story._id,
            name: story.name,
            description: story.description,
            mappedKey: mappedStoryKeys[story._id],
          }))
        : undefined,
  }));
}

function OverviewGenerationFlow() {
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

  const [epicDetailTarget, setEpicDetailTarget] = useState<string | null>(null);
  const [storyDetailTarget, setStoryDetailTarget] = useState<{ epicId: string; storyId: string } | null>(null);

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
    setBacklog(withLocalIds(raw));
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

  // Same rule as the Task-level flow: never auto-resync as a side effect of an unrelated mutation —
  // only the explicit "Generate Epic/User Story Data" button (below) assigns numbering, and it skips
  // anything that already has a prefix, so a manual edit or an adopted mapping is never clobbered.
  const updateBacklog = (mutator: (draft: LocalBacklog) => void) => {
    setBacklog((prev) => {
      if (!prev) return prev;
      const next: LocalBacklog = JSON.parse(JSON.stringify(prev));
      mutator(next);
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

  const handleGenerateNumbering = () => {
    updateBacklog((draft) => finalizeOverviewNumbering(draft));
  };

  const handleSaveEpicDetail = (epicId: string, name: string, description?: string) => {
    updateBacklog((draft) => {
      const epic = draft.epics.find((e) => e._id === epicId);
      if (!epic) return;
      epic.name = name;
      epic.description = description;
    });
  };

  const handleSaveStoryDetail = (epicId: string, storyId: string, name: string, description?: string) => {
    updateBacklog((draft) => {
      const epic = draft.epics.find((e) => e._id === epicId);
      const story = epic?.userStories.find((s) => s._id === storyId);
      if (!story) return;
      story.name = name;
      story.description = description;
    });
  };

  const removeEpic = (epicId: string) => {
    updateBacklog((draft) => {
      draft.epics = draft.epics.filter((e) => e._id !== epicId);
    });
  };

  const removeStory = (epicId: string, storyId: string) => {
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
      setPushError(errorMessage(err, 'Failed to push the reviewed Epics/User Stories to Jira'));
    } finally {
      setPushing(false);
    }
  };

  const pendingEpicMatches = (matchSuggestions?.epicMatches ?? []).filter(
    (m) => m.matchedExistingKey && !resolvedMatches.has(`epic:${m.generatedEpicName}`),
  );
  const pendingStoryMatches = (matchSuggestions?.storyMatches ?? []).filter(
    (m) => m.matchedExistingKey && !resolvedMatches.has(`story:${m.generatedStoryName}`),
  );
  const totalEpics = backlog?.epics.length ?? 0;
  const totalStories = backlog?.epics.reduce((sum, e) => sum + e.userStories.length, 0) ?? 0;
  const overviewRows = backlog ? buildOverviewRows(backlog, mappedEpicKeys, mappedStoryKeys) : [];
  const epicDetail = epicDetailTarget ? backlog?.epics.find((e) => e._id === epicDetailTarget) : undefined;
  const storyDetailEpic = storyDetailTarget ? backlog?.epics.find((e) => e._id === storyDetailTarget.epicId) : undefined;
  const storyDetail = storyDetailEpic && storyDetailTarget ? storyDetailEpic.userStories.find((s) => s._id === storyDetailTarget.storyId) : undefined;

  return (
    <>
      <Typography.Paragraph type="secondary">
        1) Pick the target Jira project. 2) Review what's already there. 3) Paste a link to a Jira issue/Confluence
        page, or upload a PDF, describing the project — Gemini produces an overview: Epics and User Stories only, no
        Tasks. 4) Check for existing Epics/Stories that mean the same thing and map onto them instead of duplicating.
        5) Generate the final Epic/User Story data — assigns <code>[Epic-x]</code>/<code>[US-x.x]</code> codes to
        anything not already mapped onto an existing prefixed item. 6) Review, edit or remove any row. 7) Submit.
        Nothing is saved in this system at any point — only step 7 writes to Jira.
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
            3. Import the project description
          </Typography.Title>
          <Typography.Paragraph type="secondary">Use either a link or a PDF — whichever you have.</Typography.Paragraph>
          <Typography.Text strong>Jira issue or Confluence page link</Typography.Text>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <LinkImportStep
              placeholder="Jira issue (.../browse/ABC-123, or just ABC-123) or Confluence page (.../wiki/spaces/.../pages/123456/...)"
              previewFn={previewOverviewFromLink}
              errorFallback="Failed to read Epics/User Stories from that link"
              onGenerated={handleBacklogGenerated}
            />
          </div>
          <Typography.Text strong>PDF file</Typography.Text>
          <div style={{ marginTop: 8 }}>
            <FileImportStep
              accept=".pdf"
              buttonLabel="Choose .pdf file"
              previewFn={previewOverviewFromPdf}
              errorFallback="Failed to read Epics/User Stories from this PDF"
              onGenerated={handleBacklogGenerated}
            />
          </div>
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
            5. Generate Epic/User Story data
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            Assigns <code>[Epic-x]</code>/<code>[US-x.x]</code> codes to anything that doesn't already have one from
            a mapping above — safe to click more than once, it never renumbers something already prefixed.
          </Typography.Paragraph>
          <Button icon={<ThunderboltOutlined />} onClick={handleGenerateNumbering}>
            Generate Epic/User Story Data
          </Button>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            6. Review, edit or remove ({totalEpics} Epic{totalEpics === 1 ? '' : 's'}, {totalStories} User Stor
            {totalStories === 1 ? 'y' : 'ies'})
          </Typography.Title>
          <Table<OverviewTableRow>
            size="small"
            pagination={false}
            dataSource={overviewRows}
            rowKey="key"
            columns={[
              {
                title: 'Epic / User Story',
                render: (_, r: OverviewTableRow) => (
                  <Space>
                    <Tag color={r.rowType === 'epic' ? 'purple' : 'green'}>{r.rowType === 'epic' ? 'Epic' : 'Story'}</Tag>
                    {r.name}
                    {r.mappedKey && <Tag color="blue">Mapped: {r.mappedKey}</Tag>}
                  </Space>
                ),
              },
              { title: 'Description', render: (_, r: OverviewTableRow) => r.description ?? '—' },
              {
                title: 'Actions',
                render: (_, r: OverviewTableRow) =>
                  r.rowType === 'epic' ? (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => setEpicDetailTarget(r.epicId)}>
                        View / Edit
                      </Button>
                      <Popconfirm
                        title={`Remove this Epic and all ${r.children?.length ?? 0} of its User Stories?`}
                        onConfirm={() => removeEpic(r.epicId)}
                        okText="Remove"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />}>
                          Remove
                        </Button>
                      </Popconfirm>
                    </Space>
                  ) : (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => setStoryDetailTarget({ epicId: r.epicId, storyId: r.storyId })}>
                        View / Edit
                      </Button>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeStory(r.epicId, r.storyId)}>
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
                7. Submit
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                Pushes every Epic/User Story above directly into {targetJiraKey}, preserving the hierarchy (no Tasks
                are created by this flow). This is a live, visible write to your team's Jira.
              </Typography.Paragraph>
              <Button type="primary" icon={<CloudSyncOutlined />} loading={pushing} disabled={totalEpics === 0} onClick={handleSubmit}>
                Submit to Jira
              </Button>
              {pushError && <Alert style={{ marginTop: 12 }} type="error" showIcon message={pushError} />}
              {pushResult && (
                <>
                  <Alert
                    style={{ marginTop: 12 }}
                    type={pushResult.failed > 0 ? 'warning' : 'success'}
                    showIcon
                    message={`${pushResult.pushed} pushed, ${pushResult.failed} failed (${pushResult.totalItems} Epic/User Story items total)`}
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

      {epicDetail && (
        <EpicDetailModal
          key={epicDetail._id}
          epic={epicDetail}
          onClose={() => setEpicDetailTarget(null)}
          onSave={(name, description) => handleSaveEpicDetail(epicDetail._id, name, description)}
        />
      )}
      {storyDetail && storyDetailTarget && (
        <StoryDetailModal
          key={storyDetail._id}
          story={storyDetail}
          onClose={() => setStoryDetailTarget(null)}
          onSave={(name, description) => handleSaveStoryDetail(storyDetailTarget.epicId, storyDetailTarget.storyId, name, description)}
        />
      )}
    </>
  );
}

export function BacklogGeneratorPage() {
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
              children: <OverviewGenerationFlow />,
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
    </Space>
  );
}
