import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Space,
  Modal,
  Form,
  DatePicker,
  InputNumber,
  Popconfirm,
  message,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  HistoryOutlined,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import {
  fetchSkillHistory,
  fetchAllSkills,
  declareSkillForEmployee,
  updateEmployeeSkill,
  deleteEmployeeSkill,
  verifyEmployeeSkill,
  confirmEmployeeSkill,
  setPrimarySkill,
  SkillHistoryFilters,
} from '../../services/skillService';
import { fetchAllEmployees } from '../../services/employeeService';
import { fetchAllSkillLevels } from '../../services/skillLevelService';
import { SkillStatusTag } from '../../components/SkillStatusTag';
import { EmployeeWorkStatusTag } from '../../components/EmployeeWorkStatusTag';
import { SkillLevelTimeline } from '../../components/SkillLevelTimeline';
import { useAuth } from '../../context/AuthContext';
import { EmployeeSkill, Skill } from '../../types/skill';
import { Employee } from '../../types/employee';
import { SkillLevel } from '../../types/skillLevel';
import { EmployeeStatus, Role, SkillStatus, SkillTrack } from '../../types/common';

export function SkillsManagementPage() {
  const { currentEmployee } = useAuth();
  // HR's role here is to check every employee's skills and their status for hiring/staffing
  // decisions — not to action them, so HR gets the same table and filters, read-only.
  const isReadOnly = currentEmployee?.role === Role.HR;
  const [history, setHistory] = useState<EmployeeSkill[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [skillLevels, setSkillLevels] = useState<SkillLevel[]>([]);
  const [filters, setFilters] = useState<SkillHistoryFilters>({});
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EmployeeSkill | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<EmployeeSkill | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<EmployeeSkill[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const addSelectedTrack = Form.useWatch('track', addForm);

  const loadHistory = async (nextFilters: SkillHistoryFilters = filters) => {
    setLoading(true);
    try {
      setHistory(await fetchSkillHistory(nextFilters));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    fetchAllEmployees().then(setEmployees);
    fetchAllSkills().then(setAllSkills);
    fetchAllSkillLevels().then(setSkillLevels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (patch: Partial<SkillHistoryFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    loadHistory(next);
  };

  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.fullName }));
  const skillOptions = allSkills.map((s) => ({ value: s.id, label: s.name }));

  const handleAdd = async () => {
    const values = await addForm.validateFields();
    const [startDate, endDate] = values.dateRange;
    await declareSkillForEmployee(values.employeeId, {
      skillId: values.skillId,
      track: values.track,
      proficiency: values.proficiency,
      progressPercent: values.progressPercent,
      level: values.track === SkillTrack.CURRENT ? values.level : undefined,
      startDate: startDate.format('YYYY-MM-DD'),
      endDate: endDate ? endDate.format('YYYY-MM-DD') : undefined,
    });
    message.success('Skill history added');
    setAddModalOpen(false);
    addForm.resetFields();
    loadHistory();
  };

  const openEditModal = (entry: EmployeeSkill) => {
    setEditingEntry(entry);
    editForm.setFieldsValue({
      proficiency: entry.proficiency,
      targetProficiency: entry.targetProficiency ?? undefined,
      progressPercent: entry.progressPercent ?? undefined,
      level: entry.level ?? undefined,
    });
  };

  const handleEdit = async () => {
    if (!editingEntry) return;
    const values = await editForm.validateFields();
    await updateEmployeeSkill(editingEntry.id, values);
    message.success('Skill history updated');
    setEditingEntry(null);
    loadHistory();
  };

  const handleDelete = async (id: string) => {
    await deleteEmployeeSkill(id);
    message.success('Skill history deleted');
    loadHistory();
  };

  const handleVerify = async (id: string) => {
    await verifyEmployeeSkill(id);
    message.success('Skill verified');
    loadHistory();
  };

  const handleConfirm = async (id: string) => {
    await confirmEmployeeSkill(id);
    message.success('Skill confirmed');
    loadHistory();
  };

  const handleSetPrimary = async (id: string) => {
    await setPrimarySkill(id);
    message.success('Set as primary skill');
    loadHistory();
  };

  const openTimeline = async (entry: EmployeeSkill) => {
    setTimelineTarget(entry);
    setTimelineLoading(true);
    try {
      setTimelineEntries(await fetchSkillHistory({ employeeId: entry.employeeId, skillId: entry.skillId }));
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <Card
      title="Skills"
      extra={
        !isReadOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            Add skill history
          </Button>
        )
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Employee"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 200 }}
          options={employeeOptions}
          onChange={(value) => applyFilters({ employeeId: value })}
        />
        <Input.Search
          placeholder="Search skill name"
          allowClear
          style={{ width: 200 }}
          prefix={<SearchOutlined />}
          onSearch={(value) => applyFilters({ search: value || undefined })}
        />
        <Select
          placeholder="Track"
          allowClear
          style={{ width: 140 }}
          options={Object.values(SkillTrack).map((v) => ({ value: v, label: v }))}
          onChange={(value) => applyFilters({ track: value })}
        />
        <Select
          placeholder="Status"
          allowClear
          style={{ width: 140 }}
          options={Object.values(SkillStatus).map((v) => ({ value: v, label: v }))}
          onChange={(value) => applyFilters({ status: value })}
        />
        <Select
          placeholder="Level"
          allowClear
          style={{ width: 140 }}
          options={skillLevels.map((l) => ({ value: l.name, label: l.name }))}
          onChange={(value) => applyFilters({ level: value })}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={history}
        columns={[
          { title: 'Employee', render: (_, record: EmployeeSkill) => record.employee?.fullName ?? record.employeeId },
          {
            title: 'Project',
            render: (_, record: EmployeeSkill) =>
              record.employee?.currentProject ? record.employee.currentProject : <Tag color="orange">On Bench</Tag>,
          },
          {
            title: 'Work Status',
            render: (_, record: EmployeeSkill) =>
              record.employee ? (
                <EmployeeWorkStatusTag
                  status={record.employee.currentProject ? EmployeeStatus.ON_PROJECT : EmployeeStatus.ON_BENCH}
                />
              ) : (
                '—'
              ),
          },
          {
            title: 'Available From',
            render: (_, record: EmployeeSkill) => {
              if (!record.employee) return '—';
              if (!record.employee.currentProject) return <Tag color="green">Available now</Tag>;
              return record.employee.availableFrom ?? <Tag>Not set</Tag>;
            },
          },
          {
            title: 'Skill',
            render: (_, record: EmployeeSkill) => (
              <Space>
                {record.skill.name}
                {record.isPrimary && (
                  <Tag icon={<StarFilled />} color="gold">
                    Primary
                  </Tag>
                )}
              </Space>
            ),
          },
          { title: 'Track', dataIndex: 'track' },
          { title: 'Level', dataIndex: 'level', render: (level: string | null) => level ?? '—' },
          { title: 'Proficiency', dataIndex: 'proficiency' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: SkillStatus) => <SkillStatusTag status={status} />,
          },
          {
            title: 'Period',
            render: (_, record: EmployeeSkill) => `${record.startDate} → ${record.endDate ?? 'ongoing'}`,
          },
          {
            title: 'Actions',
            render: (_, record: EmployeeSkill) => (
              <Space>
                <Button size="small" icon={<HistoryOutlined />} onClick={() => openTimeline(record)}>
                  Timeline
                </Button>
                {!isReadOnly && (record.status === SkillStatus.START || record.status === SkillStatus.LEARNING) && (
                  <Button size="small" type="primary" onClick={() => handleVerify(record.id)}>
                    Verify
                  </Button>
                )}
                {!isReadOnly && record.status === SkillStatus.VERIFIED && (
                  <Button size="small" type="primary" onClick={() => handleConfirm(record.id)}>
                    Confirm
                  </Button>
                )}
                {!isReadOnly && record.track === SkillTrack.CURRENT && !record.isPrimary && (
                  <Button size="small" icon={<StarOutlined />} onClick={() => handleSetPrimary(record.id)}>
                    Set Primary
                  </Button>
                )}
                {!isReadOnly && (
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                    Edit
                  </Button>
                )}
                {!isReadOnly && (
                  <Popconfirm title="Delete this skill history entry?" onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Add skill history"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => setAddModalOpen(false)}
      >
        <Form form={addForm} layout="vertical">
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
            <Select options={employeeOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="skillId" label="Skill" rules={[{ required: true }]}>
            <Select options={skillOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="track" label="Track" initialValue={SkillTrack.CURRENT} rules={[{ required: true }]}>
            <Select
              options={[
                { value: SkillTrack.CURRENT, label: 'Current skill' },
                { value: SkillTrack.LEARNING, label: 'Learning' },
              ]}
            />
          </Form.Item>
          <Form.Item name="proficiency" label="Proficiency (1-5)" rules={[{ required: true }]}>
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          {addSelectedTrack === SkillTrack.CURRENT && (
            <Form.Item name="level" label="Level at this skill" rules={[{ required: true }]}>
              <Select options={skillLevels.map((l) => ({ value: l.name, label: l.name }))} />
            </Form.Item>
          )}
          <Form.Item name="progressPercent" label="Progress % (learning only)">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="dateRange"
            label="Study period"
            rules={[{ required: true, message: 'Please select a start date' }]}
          >
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              allowEmpty={[false, true]}
              placeholder={['Start date', 'End date (optional)']}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit skill history"
        open={editingEntry !== null}
        onOk={handleEdit}
        onCancel={() => setEditingEntry(null)}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="proficiency" label="Proficiency (1-5)">
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="targetProficiency" label="Target proficiency (1-5)">
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="progressPercent" label="Progress %">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          {editingEntry?.track === SkillTrack.CURRENT && (
            <Form.Item name="level" label="Level at this skill">
              <Select options={skillLevels.map((l) => ({ value: l.name, label: l.name }))} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={`${timelineTarget?.skill.name ?? ''} timeline — ${timelineTarget?.employee?.fullName ?? ''}`}
        open={timelineTarget !== null}
        onCancel={() => setTimelineTarget(null)}
        footer={null}
      >
        {timelineLoading ? 'Loading…' : <SkillLevelTimeline entries={timelineEntries} />}
      </Modal>
    </Card>
  );
}
